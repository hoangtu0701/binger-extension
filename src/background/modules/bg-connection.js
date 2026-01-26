// ============================================================================
// CONNECTION HANDLER
// Manages persistent connections with content scripts, keep-alive alarm,
// and critical cleanup logic when tabs close or reload
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Alarm name for keep-alive
    const KEEP_ALIVE_ALARM = "binger_keepAlive";

    // How often the keep-alive alarm fires (in minutes)
    // Set to 20 seconds (0.33 min) to stay under the 30-second sleep threshold
    const KEEP_ALIVE_INTERVAL_MINUTES = 0.33;

    // Delay before checking if invite should be deleted after user leaves
    // Allows time for user to rejoin (e.g., page reload)
    const INVITE_DELETION_DELAY_MS = 1500;

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGState", "BingerBGFirebase", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-connection missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // KEEP-ALIVE ALARM
    // ========================================================================

    /**
     * Handle alarm events - keeps service worker alive
     */
    function initAlarmListener() {
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === KEEP_ALIVE_ALARM) {
                // This event wakes the service worker - log for debugging
                console.log("[Binger] Keep-alive alarm fired");
            }
        });
    }

    /**
     * Start the keep-alive alarm
     */
    function startKeepAliveAlarm() {
        chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: KEEP_ALIVE_INTERVAL_MINUTES });
        console.log("[Binger] Keep-alive alarm STARTED");
    }

    /**
     * Stop the keep-alive alarm
     */
    function stopKeepAliveAlarm() {
        chrome.alarms.clear(KEEP_ALIVE_ALARM, (wasCleared) => {
            if (chrome.runtime.lastError) {
                console.warn("[Binger] Error clearing alarm:", chrome.runtime.lastError.message);
                return;
            }
            if (wasCleared) {
                console.log("[Binger] Keep-alive alarm CLEARED - service worker can sleep");
            }
        });
    }

    // ========================================================================
    // PORT CONNECTION HANDLER
    // ========================================================================

    /**
     * Initialize the port connection listener
     * Handles content script connections and cleanup on disconnect
     */
    function initConnectionListener() {
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name !== "binger-connection") return;

            // Validate dependencies before proceeding
            if (!validateDependencies()) {
                console.error("[Binger] Cannot handle connection - missing dependencies");
                return;
            }

            // Register the port
            const portCount = BingerBGState.incrementActivePorts();
            console.log(`[Binger] Port connected - activePorts = ${portCount}`);

            // Safely get tab ID for logging
            const tabId = port.sender?.tab?.id;
            if (tabId !== undefined) {
                console.log("[Binger] Persistent connection established with tab", tabId);
            } else {
                console.log("[Binger] Persistent connection established (no tab ID)");
            }

            // On the first port, start the keep-alive alarm
            if (portCount === 1) {
                startKeepAliveAlarm();
            }

            // Handle port disconnect (tab closed or reloaded)
            port.onDisconnect.addListener(() => {
                handlePortDisconnect();
            });
        });
    }

    /**
     * Handle cleanup when a port disconnects (tab closed/reloaded)
     */
    function handlePortDisconnect() {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot handle disconnect - missing dependencies");
            return;
        }

        // Track the removed port
        const portCount = BingerBGState.decrementActivePorts();
        console.log(`[Binger] Port disconnected - activePorts = ${portCount}`);

        // Once all ports are gone, clear the alarm so the worker can unload
        if (portCount === 0) {
            stopKeepAliveAlarm();
        }

        console.log("[Binger] Tab closed or reloaded - cleaning up");

        // Perform room cleanup
        chrome.storage.local.get(
            ["bingerCurrentRoomId", "bingerSwitchingFromRoom", "bingerIsReloading"],
            (result) => {
                // Check for storage errors
                if (chrome.runtime.lastError) {
                    console.error("[Binger] Storage error during cleanup:", chrome.runtime.lastError.message);
                    return;
                }

                const roomId = result.bingerCurrentRoomId;

                // Unsubscribe from typing using shared helper
                BingerBGHelpers.unsubscribeFromTyping(roomId);

                // Skip cleanup if we're just reloading (only for forced reload, not browser refresh)
                if (result.bingerIsReloading) {
                    chrome.storage.local.remove("bingerIsReloading", () => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Error removing reload flag:", chrome.runtime.lastError.message);
                        }
                    });
                    console.log("[Binger] Reload detected - skipping cleanup");

                    // Reset inSession flag to false (if roomId is valid)
                    if (roomId && typeof roomId === "string") {
                        BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(false)
                            .then(() => console.log("[Binger] inSession set to false on reload"))
                            .catch((err) => console.error("[Binger] Failed to reset inSession:", err));
                    }

                    return;
                }

                const switchingFromRoom = result.bingerSwitchingFromRoom;
                const user = BingerBGFirebase.getCurrentUser();
                if (!user) {
                    console.log("[Binger] No user logged in - skipping room cleanup");
                    return;
                }

                // If switching rooms - clean only OLD room, not current
                if (switchingFromRoom && switchingFromRoom !== roomId) {
                    cleanupRoom(switchingFromRoom, user, true);
                    chrome.storage.local.remove("bingerSwitchingFromRoom", () => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Error removing switching flag:", chrome.runtime.lastError.message);
                        }
                    });
                    return;
                }

                // Normal case: user closed tab while in room
                if (roomId && typeof roomId === "string") {
                    cleanupRoom(roomId, user, false);
                }
            }
        );
    }

    /**
     * Clean up user from a room (remove from users, handle invite, reset session)
     * @param {string} roomId - The room to clean up
     * @param {firebase.User} user - The current user
     * @param {boolean} isSwitching - Whether user is switching rooms (affects logging)
     */
    function cleanupRoom(roomId, user, isSwitching) {
        // Validate inputs
        if (!roomId || typeof roomId !== "string") {
            console.error("[Binger] cleanupRoom called with invalid roomId:", roomId);
            return;
        }
        if (!user || !user.uid) {
            console.error("[Binger] cleanupRoom called with invalid user");
            return;
        }

        const userRef = BingerBGFirebase.ref(`rooms/${roomId}/users/${user.uid}`);
        const leaveRef = BingerBGFirebase.ref(`rooms/${roomId}/lastLeaves/${user.uid}`);
        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${user.uid}`);
        const sessionRef = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);

        const logPrefix = isSwitching ? "OLD room" : "room";

        // Mark the leaving time of this specific user
        leaveRef.set(Date.now())
            .catch((err) => console.error("[Binger] Failed to write leave timestamp:", err));

        // Remove typing status
        typingRef.remove()
            .catch((err) => console.warn("[Binger] Failed to remove typing status:", err));

        // Unsubscribe from typing updates using shared helper
        BingerBGHelpers.unsubscribeFromTyping(roomId);

        // Remove user from room
        userRef.remove()
            .then(() => {
                console.log(`[Binger] Removed user from ${logPrefix} ${roomId}`);

                // Handle active invite deletion
                handleInviteDeletion(roomId, isSwitching);

                // Reset inSession flag to false
                sessionRef.set(false)
                    .then(() => console.log("[Binger] inSession set to false on tab close"))
                    .catch((err) => console.error("[Binger] Failed to reset inSession:", err));
            })
            .catch((err) => {
                const errorType = isSwitching ? "(switching)" : "(normal)";
                console.error(`[Binger] Cleanup error ${errorType}:`, err);
            });

        // Check if room is now empty and mark lastUserLeftAt
        BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value")
            .then((snap) => {
                if (!snap.exists()) {
                    BingerBGFirebase.ref(`rooms/${roomId}/lastUserLeftAt`).set(Date.now())
                        .catch((err) => console.warn("[Binger] Failed to set lastUserLeftAt:", err));
                }
            })
            .catch((err) => console.warn("[Binger] Failed to check room users:", err));
    }

    /**
     * Handle invite deletion when user leaves
     * @param {string} roomId - The room ID
     * @param {boolean} immediate - Whether to delete immediately (switching) or with delay (normal)
     */
    function handleInviteDeletion(roomId, immediate) {
        // Validate roomId
        if (!roomId || typeof roomId !== "string") return;

        const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        inviteRef.once("value")
            .then((snapshot) => {
                const invite = snapshot.val();
                if (!invite) return;

                if (immediate) {
                    // Switching rooms - delete immediately
                    inviteRef.remove()
                        .then(() => {
                            console.log("[Binger] Active invite deleted (user switching rooms)");
                        })
                        .catch((err) => {
                            console.error("[Binger] Failed to remove invite on room switch:", err);
                        });
                } else {
                    // Normal leave - wait and check room state
                    // This delay allows the user to rejoin (e.g., page reload)
                    setTimeout(() => {
                        checkAndDeleteInvite(roomId, inviteRef);
                    }, INVITE_DELETION_DELAY_MS);
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to check active invite:", err);
            });
    }

    /**
     * Check user count and delete invite if below threshold
     * @param {string} roomId - The room ID
     * @param {firebase.database.Reference} inviteRef - Reference to activeInvite
     */
    function checkAndDeleteInvite(roomId, inviteRef) {
        BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value")
            .then((userSnap) => {
                const users = userSnap.val();
                const numUsers = users ? Object.keys(users).length : 0;

                if (numUsers < 2) {
                    inviteRef.remove()
                        .then(() => {
                            console.log("[Binger] Active invite deleted (user count < 2)");
                        })
                        .catch((err) => {
                            console.error("[Binger] Failed to remove invite after delay:", err);
                        });
                } else {
                    console.log("[Binger] Kept invite - user count recovered in time");
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to check user count for invite deletion:", err);
            });
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize connection handling
     */
    function init() {
        initAlarmListener();
        initConnectionListener();
        console.log("[Binger] Connection handler initialized");
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGConnection = {
        init
    };

})();