// ============================================================================
// THEME HANDLERS
// Handle subscribing to and broadcasting theme changes
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGUtils"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-theme missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // HELPER: SAFE SEND RESPONSE
    // ========================================================================

    /**
     * Safely send response - tab may have closed
     * @param {function} sendResponse - Response callback
     * @param {object} data - Data to send
     */
    function safeSendResponse(sendResponse, data) {
        try {
            if (typeof sendResponse === "function") {
                sendResponse(data);
            }
        } catch (err) {
            // Tab closed before response - ignore
        }
    }

    // ========================================================================
    // SUBSCRIBE TO THEME
    // ========================================================================

    /**
     * Subscribe to theme updates in a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToTheme(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/theme`);

        if (!ref) {
            safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

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
        safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
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
        // Validate dependencies
        if (!validateDependencies()) {
            safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getThemeListeners();

        if (listeners[roomId]) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/theme`);
            if (ref) {
                ref.off("value", listeners[roomId]);
            }
            delete listeners[roomId];
            console.log(`[Binger] Unsubscribed from theme in room ${roomId}`);
            safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
        } else {
            console.log(`[Binger] No active theme listener for room ${roomId}`);
            safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGTheme = {
        handleSubscribeToTheme,
        handleUnsubscribeFromTheme
    };

})();