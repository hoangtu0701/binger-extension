// ============================================================================
// TYPING HANDLERS
// Handle typing indicator state and subscriptions
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // TYPING STATE UPDATES
    // ========================================================================

    /**
     * Handle user starting to type
     * @param {object} msg - Message containing roomId and uid
     */
    function handleIAmTyping(msg) {
        const ref = BingerBGFirebase.ref(`rooms/${msg.roomId}/typing/${msg.uid}`);
        ref.set("")
            .then(() => console.log(`[Binger] ${msg.uid} is typing (path added)`));
    }

    /**
     * Handle user stopping typing
     * @param {object} msg - Message containing roomId and uid
     */
    function handleIStoppedTyping(msg) {
        const ref = BingerBGFirebase.ref(`rooms/${msg.roomId}/typing/${msg.uid}`);
        ref.remove()
            .then(() => console.log(`[Binger] ${msg.uid} stopped typing (path removed)`));
    }

    // ========================================================================
    // TYPING SUBSCRIPTION
    // ========================================================================

    /**
     * Subscribe to typing status updates in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToTyping(msg, sendResponse) {
        const { roomId } = msg;
        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing`);

        // Remove old listeners
        typingRef.off();

        typingRef.on("value", (snapshot) => {
            const typingData = snapshot.val() || {};
            const typingUids = Object.keys(typingData);

            // Fetch usernames
            BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value").then((snap) => {
                const users = snap.val() || {};
                const typingUsers = typingUids.map((uid) => ({
                    uid,
                    username: (uid === "BINGER_BOT" || uid === "BINGER_BOT_SEEK")
                        ? "Binger Bot"
                        : (users[uid]?.email?.split("@")[0] || "unknown")
                }));

                // Broadcast to all tabs
                BingerBGUtils.broadcastToTabs({
                    command: "typingStatusUpdated",
                    users: typingUsers
                });
            });
        });

        console.log(`[Binger] Subscribed to typing changes for room ${roomId}`);
        sendResponse({ status: "typing listener attached" });
    }

    /**
     * Unsubscribe from typing status updates
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleUnsubscribeFromTyping(msg, sendResponse) {
        const { roomId } = msg;
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/typing`);
        
        // Unsub from all typing listeners
        ref.off();
        
        sendResponse({ status: "unsubscribed from typing" });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGTyping = {
        handleIAmTyping,
        handleIStoppedTyping,
        handleSubscribeToTyping,
        handleUnsubscribeFromTyping
    };

})();