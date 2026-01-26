// ============================================================================
// CHAT HANDLERS
// Handle posting messages and subscribing to chat updates
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // POST DATA
    // ========================================================================

    /**
     * Handle posting data to Firebase
     * Uses .set() for specific paths, .push() for messages
     * @param {object} msg - Message containing path and data
     * @param {function} sendResponse - Response callback
     */
    function handlePost(msg, sendResponse) {
        const refPath = msg.path || "messages";
        const data = msg.data || {};
        const ref = BingerBGFirebase.ref(refPath);

        // Determine whether to use .set() or .push()
        // Use .set() when posting to an exact user-level field (like acceptedInvitees/UID)
        const shouldUseSet =
            refPath.includes("/acceptedInvitees/") ||
            refPath.includes("/inSession") ||
            refPath.includes("/theme");

        // Execute the appropriate Firebase write
        const write = shouldUseSet ? ref.set(data) : ref.push(data);

        write
            .then(() => {
                console.log(`[Binger] Data posted to /${refPath}`);
                sendResponse({ status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Firebase post error:", err);
                sendResponse({ status: "error", error: err.message });
            });
    }

    // ========================================================================
    // SUBSCRIBE TO MESSAGES
    // ========================================================================

    /**
     * Subscribe to real-time chat messages in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToMessages(msg, sendResponse) {
        const { roomId } = msg;
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/messages`);
        const listeners = BingerBGState.getMessageListeners();

        // If there's already a listener for this room, remove it
        if (listeners[roomId]) {
            ref.off("child_added", listeners[roomId]);
            console.log(`[Binger] Removed old message listener for room ${roomId}`);
            delete listeners[roomId];
        }

        // Create and store the new listener callback
        const callback = (snapshot) => {
            const newMessage = snapshot.val();
            BingerBGUtils.broadcastToTabs({
                command: "newChatMessage",
                message: newMessage
            });
        };

        ref.on("child_added", callback);
        listeners[roomId] = callback;

        console.log(`[Binger] Subscribed to messages in room ${roomId}`);
        sendResponse({ status: "subscribed" });
    }

    // ========================================================================
    // UNSUBSCRIBE FROM MESSAGES
    // ========================================================================

    /**
     * Unsubscribe from chat messages in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleUnsubscribeFromMessages(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getMessageListeners();

        if (listeners[roomId]) {
            BingerBGFirebase.ref(`rooms/${roomId}/messages`).off("child_added", listeners[roomId]);
            delete listeners[roomId];
            console.log(`[Binger] Unsubscribed from messages in room ${roomId}`);
        }

        sendResponse({ status: "unsubscribed" });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGChat = {
        handlePost,
        handleSubscribeToMessages,
        handleUnsubscribeFromMessages
    };

})();