// ============================================================================
// CHAT HANDLERS
// Handle posting messages and subscribing to chat updates
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
            console.error("[Binger] bg-chat missing dependencies:", missing.join(", "));
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
            sendResponse(data);
        } catch (err) {
            // Tab closed before response - ignore
        }
    }

    // ========================================================================
    // HELPER: DETERMINE WRITE METHOD
    // ========================================================================

    /**
     * Determine whether to use .set() or .push() for a given path
     * Uses exact segment matching to avoid false positives
     * @param {string} refPath - The Firebase reference path
     * @returns {boolean} - True if should use .set(), false for .push()
     */
    function shouldUseSetForPath(refPath) {
        // Split path into segments for exact matching
        const segments = refPath.split("/");

        // Paths that should use .set() (exact segment matches)
        // - rooms/{id}/acceptedInvitees/{uid}
        // - rooms/{id}/inSession
        // - rooms/{id}/theme
        const setSegments = ["acceptedInvitees", "inSession", "theme", "typing", "playerState"];

        // Check if any segment exactly matches a set-path keyword
        // AND it's either the last segment or second-to-last (for acceptedInvitees/{uid})
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            if (setSegments.includes(segment)) {
                return true;
            }
        }

        return false;
    }

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
        // Validate dependencies
        if (!validateDependencies()) {
            safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.path !== "string" || msg.path.trim() === "") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid path" });
            return;
        }

        const refPath = msg.path.trim();
        const data = msg.data !== undefined ? msg.data : {};

        const ref = BingerBGFirebase.ref(refPath);
        const useSet = shouldUseSetForPath(refPath);
        const write = useSet ? ref.set(data) : ref.push(data);

        write
            .then(() => {
                console.log(`[Binger] Data posted to /${refPath}`);
                safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Firebase post error:", err);
                safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    // ========================================================================
    // SUBSCRIBE TO MESSAGES
    // ========================================================================

    /**
     * Subscribe to real-time chat messages in a room
     * Note: child_added fires for all existing messages on initial subscribe
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToMessages(msg, sendResponse) {
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
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/messages`);
        const listeners = BingerBGState.getMessageListeners();

        // Remove existing listener for this room if present
        if (listeners[roomId]) {
            ref.off("child_added", listeners[roomId]);
            console.log(`[Binger] Removed old message listener for room ${roomId}`);
            delete listeners[roomId];
        }

        // Create and store the new listener callback
        const callback = (snapshot) => {
            const newMessage = snapshot.val();
            if (newMessage) {
                BingerBGUtils.broadcastToTabs({
                    command: "newChatMessage",
                    message: newMessage
                });
            }
        };

        ref.on("child_added", callback);
        listeners[roomId] = callback;

        console.log(`[Binger] Subscribed to messages in room ${roomId}`);
        safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
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
        const listeners = BingerBGState.getMessageListeners();

        if (listeners[roomId]) {
            BingerBGFirebase.ref(`rooms/${roomId}/messages`).off("child_added", listeners[roomId]);
            delete listeners[roomId];
            console.log(`[Binger] Unsubscribed from messages in room ${roomId}`);
            safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
        } else {
            console.log(`[Binger] No active listener for room ${roomId}`);
            safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
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