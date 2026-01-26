// ============================================================================
// THEME HANDLERS
// Handle subscribing to and broadcasting theme changes
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // SUBSCRIBE TO THEME
    // ========================================================================

    /**
     * Subscribe to theme updates in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToTheme(msg, sendResponse) {
        const { roomId } = msg;
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/theme`);
        const listeners = BingerBGState.getThemeListeners();

        // If already have a listener, detach it first
        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
            delete listeners[roomId];
            console.log(`[Binger] Removed old theme listener for ${roomId}`);
        }

        const cb = (snapshot) => {
            const theme = snapshot.val();

            BingerBGUtils.broadcastToTabs({
                command: "themeUpdated",
                theme,
                roomId
            });
        };

        ref.on("value", cb);
        listeners[roomId] = cb;

        console.log(`[Binger] Subscribed to theme in room ${roomId}`);
        sendResponse({ status: "subscribed" });
    }

    // ========================================================================
    // UNSUBSCRIBE FROM THEME
    // ========================================================================

    /**
     * Unsubscribe from theme updates in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleUnsubscribeFromTheme(msg, sendResponse) {
        const { roomId } = msg;
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/theme`);
        const listeners = BingerBGState.getThemeListeners();

        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
            delete listeners[roomId];
            console.log(`[Binger] Unsubscribed from theme in room ${roomId}`);
        }

        sendResponse({ status: "unsubscribed" });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGTheme = {
        handleSubscribeToTheme,
        handleUnsubscribeFromTheme
    };

})();