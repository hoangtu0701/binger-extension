// ============================================================================
// CONNECTION HANDLER
// Manages persistent connections with content scripts, keep-alive alarm,
// and critical cleanup logic when tabs close or reload
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // KEEP-ALIVE ALARM
    // ========================================================================

    /**
     * Handle alarm events - keeps service worker alive
     */
    function initAlarmListener() {
        chrome.alarms.onAlarm.addListener(alarm => {
            if (alarm.name === "binger_keepAlive") {
                // No-op; this event just wakes the worker
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

            // Register the port
            const portCount = BingerBGState.incrementActivePorts();
            console.log(`Port connected - activePorts = ${portCount}`);

            // On the first port, start the keep-alive alarm
            if (portCount === 1) {
                chrome.alarms.create("binger_keepAlive", { periodInMinutes: 1 });
                console.log("keepAlive alarm STARTED");
            }

            const tabId = port.sender.tab.id;
            console.log("[Binger] Persistent connection established with tab", tabId);

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
        // Track the removed port
        const portCount = BingerBGState.decrementActivePorts();
        console.log(`Port disconnected - activePorts = ${portCount}`);

        // Once all ports are gone, clear the alarm so the worker can unload
        if (portCount === 0) {
            chrome.alarms.clear("binger_keepAlive", wasCleared => {
                if (wasCleared) {
                    console.log("keepAlive alarm CLEARED - SW can sleep now");
                }
            });
        }

        console.log("[Binger] Tab closed or reloaded - cleaning up");

        // Perform room cleanup
        chrome.storage.local.get(
            ["bingerCurrentRoomId", "bingerSwitchingFromRoom", "bingerIsReloading"],
            (result) => {
                const roomId = result.bingerCurrentRoomId;
                
                // Unsubscribe from typing
                chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId });

                // Skip cleanup if we're just reloading (only for forced reload, not browser refresh)
                if (result.bingerIsReloading) {
                    chrome.storage.local.remove("bingerIsReloading");
                    console.log("[Binger] Reload detected - skipping cleanup");

                    // Reset inSession flag to false
                    BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(false)
                        .then(() => console.log(`[Binger] inSession set to false on tab close`))
                        .catch((err) => console.error(`[Binger] Failed to reset inSession:`, err));
                    
                    return;
                }

                const switchingFromRoom = result.bingerSwitchingFromRoom;
                const user = BingerBGFirebase.getCurrentUser();
                if (!user) return;

                // If switching rooms - clean only OLD room, not current
                if (switchingFromRoom && switchingFromRoom !== roomId) {
                    cleanupRoom(switchingFromRoom, user, true);
                    chrome.storage.local.remove("bingerSwitchingFromRoom");
                    return;
                }

                // Normal case: user closed tab while in room
                if (roomId) {
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
        const userRef = BingerBGFirebase.ref(`rooms/${roomId}/users/${user.uid}`);
        const leaveRef = BingerBGFirebase.ref(`rooms/${roomId}/lastLeaves/${user.uid}`);
        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${user.uid}`);

        // Mark the leaving time of this specific user
        leaveRef.set(Date.now()).catch(err => console.error("[Binger] leave-write error:", err));

        // Remove typing status
        typingRef.remove();
        chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId });

        userRef.remove()
            .then(() => {
                const logPrefix = isSwitching ? "OLD room" : "room";
                console.log(`[Binger] Removed user from ${logPrefix} ${roomId}`);

                // Handle active invite deletion
                handleInviteDeletion(roomId, isSwitching);

                // Reset inSession flag to false
                BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(false)
                    .then(() => console.log(`[Binger] inSession set to false on tab close`))
                    .catch((err) => console.error(`[Binger] Failed to reset inSession:`, err));
            })
            .catch((err) => {
                const errorType = isSwitching ? "(switching)" : "(normal)";
                console.error(`[Binger] Cleanup error ${errorType}:`, err);
            });

        // Check if room is now empty and mark lastUserLeftAt
        BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value")
            .then((snap) => {
                if (!snap.exists()) {
                    BingerBGFirebase.ref(`rooms/${roomId}/lastUserLeftAt`).set(Date.now());
                }
            });
    }

    /**
     * Handle invite deletion when user leaves
     * @param {string} roomId - The room ID
     * @param {boolean} immediate - Whether to delete immediately (switching) or with delay (normal)
     */
    function handleInviteDeletion(roomId, immediate) {
        const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        inviteRef.once("value").then((snapshot) => {
            const invite = snapshot.val();
            if (!invite) return;

            if (immediate) {
                // Switching rooms - delete immediately
                inviteRef.remove()
                    .then(() => {
                        console.log("[Binger] Active invite deleted due to user leaving OLD room while switching");
                    })
                    .catch((err) => {
                        console.error("[Binger] Failed to remove invite on room switch:", err);
                    });
            } else {
                // Normal leave - wait 1.5s and check room state
                setTimeout(() => {
                    BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value").then((userSnap) => {
                        const users = userSnap.val();
                        const numUsers = users ? Object.keys(users).length : 0;

                        if (numUsers < 2) {
                            inviteRef.remove()
                                .then(() => {
                                    console.log("[Binger] Active invite deleted after 1.5s of low user count");
                                })
                                .catch((err) => {
                                    console.error("[Binger] Failed to remove invite after delay:", err);
                                });
                        } else {
                            console.log("[Binger] Kept invite - user count recovered in time");
                        }
                    }).catch((err) => {
                        console.error("[Binger] Failed to check user count for delayed invite deletion:", err);
                    });
                }, 1500);
            }
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