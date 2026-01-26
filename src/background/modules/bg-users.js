// ============================================================================
// USER LIST HANDLERS
// Handle subscribing to and broadcasting room user list updates
// ============================================================================

(function() {
    "use strict";

    // Consolidated state per room
    const roomState = {};
    
    // Debounce time in ms (how long to wait before showing leave notification)
    const LEAVE_DEBOUNCE_MS = 3000;

    // ========================================================================
    // HELPERS
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
            clearTimeout(pending.timeoutId);
        });
        
        delete roomState[roomId];
    }

    /**
     * Extract username from email
     * @param {string} email
     * @returns {string}
     */
    function getUsername(email) {
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

    // ========================================================================
    // SUBSCRIBE TO USERS
    // ========================================================================

    /**
     * Subscribe to real-time user list updates in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToUsers(msg, sendResponse) {
        const { roomId } = msg;
        const roomUsersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
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
            BingerBGFirebase.ref(`rooms/${roomId}/host`).once("value").then((hostSnap) => {
                const hostUid = hostSnap.val();
                
                // Build and broadcast display names
                const finalDisplay = Object.entries(usersData).map(([uid, user]) => {
                    const name = getUsername(user.email);
                    return uid === hostUid ? `${name} (host)` : name;
                });

                BingerBGUtils.broadcastToTabs({
                    command: "updateUserList",
                    users: finalDisplay
                });

                // On first snapshot, just establish baseline - no notifications
                if (!state.hasFirstSnapshot) {
                    state.hasFirstSnapshot = true;
                    state.previousUsers = { ...usersData };
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
                    
                    const previousUser = state.previousUsers[uid];
                    if (!previousUser?.email) return;
                    
                    const username = getUsername(previousUser.email);
                    
                    // Set pending leave with timeout
                    state.pendingLeaves[uid] = {
                        timeoutId: setTimeout(() => {
                            broadcastNotification("leave", username);
                            delete state.pendingLeaves[uid];
                        }, LEAVE_DEBOUNCE_MS),
                        username: username
                    };
                });

                // Update previous users for next comparison
                state.previousUsers = { ...usersData };
            });
        };

        // Attach listener
        roomUsersRef.on("value", state.listener);
        sendResponse({ status: "subscribed" });
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
        const { roomId } = msg;
        const state = roomState[roomId];
        
        if (state?.listener) {
            BingerBGFirebase.ref(`rooms/${roomId}/users`).off("value", state.listener);
        }
        
        cleanupState(roomId);
        
        console.log(`[Binger] Unsubscribed from users in room ${roomId}`);
        sendResponse({ status: "unsubscribed" });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGUsers = {
        handleSubscribeToUsers,
        handleUnsubscribeFromUsers
    };

})();