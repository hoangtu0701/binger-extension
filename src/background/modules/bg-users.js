// ============================================================================
// USER LIST HANDLERS
// Handle subscribing to and broadcasting room user list updates
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Debounce time in ms (how long to wait before showing leave notification)
    const LEAVE_DEBOUNCE_MS = 3000;

    // ========================================================================
    // STATE
    // Consolidated state per room - managed internally (not in bg-state)
    // ========================================================================

    const roomState = {};

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGUtils"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-users missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // STATE HELPERS
    // ========================================================================

    /**
     * Get or initialize state for a room
     * @param {string} roomId
     * @returns {object} Room state object
     */
    function getState(roomId) {
        if (!roomState[roomId]) {
            roomState[roomId] = {
                listener: null,
                previousUsers: {},
                pendingLeaves: {},
                hasFirstSnapshot: false
            };
        }
        return roomState[roomId];
    }

    /**
     * Clean up all state for a room
     * @param {string} roomId
     */
    function cleanupState(roomId) {
        const state = roomState[roomId];
        if (!state) return;

        // Clear pending leave timeouts
        Object.values(state.pendingLeaves).forEach((pending) => {
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
            }
        });

        delete roomState[roomId];
    }

    /**
     * Extract username from email
     * @param {string} email
     * @returns {string}
     */
    function getUsername(email) {
        if (!email || typeof email !== "string") return "unknown";
        return email.split("@")[0];
    }

    /**
     * Broadcast a user notification to all tabs
     * @param {string} type - "join" or "leave"
     * @param {string} username
     */
    function broadcastNotification(type, username) {
        BingerBGUtils.broadcastToTabs({
            command: "userNotification",
            notificationType: type,
            username: username
        });
    }

    /**
     * Broadcast current user list including pending leave users
     * @param {string} roomId
     * @param {string} hostUid
     */
    function broadcastUserList(roomId, hostUid) {
        const state = roomState[roomId];
        if (!state) return;

        // Combine current users with pending leave users
        const combinedUsers = { ...state.previousUsers };

        // Add pending leave users back (they haven't truly left yet)
        Object.entries(state.pendingLeaves).forEach(([uid, pending]) => {
            if (!combinedUsers[uid] && pending.userData) {
                combinedUsers[uid] = pending.userData;
            }
        });

        // Build display list with metadata for sorting
        const userList = Object.entries(combinedUsers).map(([uid, user]) => {
            const name = getUsername(user.email);
            return { uid, name, isHost: uid === hostUid };
        });

        // Sort: host first, then alphabetically
        userList.sort((a, b) => {
            if (a.isHost) return -1;
            if (b.isHost) return 1;
            return a.name.localeCompare(b.name);
        });

        // Convert to display strings
        const finalDisplay = userList.map(u => u.isHost ? `${u.name} (host)` : u.name);

        BingerBGUtils.broadcastToTabs({
            command: "updateUserList",
            users: finalDisplay
        });
    }

    // ========================================================================
    // SUBSCRIBE TO USERS
    // ========================================================================

    /**
     * Subscribe to real-time user list updates in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToUsers(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const roomUsersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);

        if (!roomUsersRef) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const state = getState(roomId);

        // Remove existing listener if there is one (prevents stacking)
        if (state.listener) {
            roomUsersRef.off("value", state.listener);
        }

        // Create the listener callback
        state.listener = (snapshot) => {
            const usersData = snapshot.val() || {};
            const currentUids = Object.keys(usersData);
            const previousUids = Object.keys(state.previousUsers);

            // Detect joins and leaves
            const joinedUids = currentUids.filter(uid => !previousUids.includes(uid));
            const leftUids = previousUids.filter(uid => !currentUids.includes(uid));

            // Get host to mark with "(host)" label
            const hostRef = BingerBGFirebase.ref(`rooms/${roomId}/host`);
            if (!hostRef) {
                console.error("[Binger] Failed to create host ref");
                return;
            }

            hostRef.once("value")
                .then((hostSnap) => {
                    const hostUid = hostSnap.val();

                    // Save old users for detection, then update to current
                    const previousUsersForDetection = { ...state.previousUsers };
                    state.previousUsers = { ...usersData };

                    // On first snapshot, just establish baseline - no notifications
                    if (!state.hasFirstSnapshot) {
                        state.hasFirstSnapshot = true;
                        broadcastUserList(roomId, hostUid);
                        return;
                    }

                    // Get current user to skip self-notifications
                    const currentUser = BingerBGFirebase.getCurrentUser();
                    const currentUid = currentUser?.uid;

                    // Handle join notifications
                    joinedUids.forEach((uid) => {
                        if (uid === currentUid) return;

                        const user = usersData[uid];
                        if (!user?.email) return;

                        const username = getUsername(user.email);

                        // Check if user has pending leave (meaning they just reloaded)
                        if (state.pendingLeaves[uid]) {
                            clearTimeout(state.pendingLeaves[uid].timeoutId);
                            delete state.pendingLeaves[uid];
                        } else {
                            broadcastNotification("join", username);
                        }
                    });

                    // Handle leave notifications with debounce
                    leftUids.forEach((uid) => {
                        if (uid === currentUid) return;

                        const previousUser = previousUsersForDetection[uid];
                        if (!previousUser?.email) return;

                        const username = getUsername(previousUser.email);

                        // Set pending leave with timeout
                        state.pendingLeaves[uid] = {
                            timeoutId: setTimeout(() => {
                                broadcastNotification("leave", username);
                                delete state.pendingLeaves[uid];
                                // Broadcast updated user list without this user
                                broadcastUserList(roomId, hostUid);
                            }, LEAVE_DEBOUNCE_MS),
                            username: username,
                            userData: previousUser
                        };
                    });

                    // Broadcast user list AFTER handling joins/leaves (so pendingLeaves is populated)
                    broadcastUserList(roomId, hostUid);
                })
                .catch((err) => {
                    console.error("[Binger] Error fetching host for user list:", err);
                });
        };

        // Attach listener
        roomUsersRef.on("value", state.listener);

        console.log(`[Binger] Subscribed to users in room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
    }

    // ========================================================================
    // UNSUBSCRIBE FROM USERS
    // ========================================================================

    /**
     * Unsubscribe from user list updates in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleUnsubscribeFromUsers(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const state = roomState[roomId];

        if (state?.listener) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/users`);
            if (ref) {
                ref.off("value", state.listener);
            }
        }

        cleanupState(roomId);

        console.log(`[Binger] Unsubscribed from users in room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGUsers = {
        handleSubscribeToUsers,
        handleUnsubscribeFromUsers
    };

})();