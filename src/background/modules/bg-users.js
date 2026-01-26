// ============================================================================
// USER LIST HANDLERS
// Handle subscribing to and broadcasting room user list updates
// ============================================================================

(function() {
    "use strict";

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

        roomUsersRef.on("value", (snapshot) => {
            const usersData = snapshot.val();
            if (!usersData) return;

            // Get host to mark with "(host)" label
            BingerBGFirebase.ref(`rooms/${roomId}/host`).once("value").then((hostSnap) => {
                const hostUid = hostSnap.val();
                const finalDisplay = Object.entries(usersData).map(([uid, user]) => {
                    const name = user.email.split("@")[0];
                    return uid === hostUid ? `${name} (host)` : name;
                });

                BingerBGUtils.broadcastToTabs({
                    command: "updateUserList",
                    users: finalDisplay
                });
            });
        });

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
        const roomUsersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
        
        // Turn off all 'value' listeners
        roomUsersRef.off();
        
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