// ============================================================================
// TYPING HANDLERS
// Handle typing indicator state and subscriptions
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
            console.error("[Binger] bg-typing missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // TYPING STATE UPDATES
    // ========================================================================

    /**
     * Handle user starting to type
     * @param {object} msg - Message containing roomId and uid
     */
    function handleIAmTyping(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot set typing - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            console.error("[Binger] iAmTyping called with invalid roomId");
            return;
        }
        if (!msg.uid || typeof msg.uid !== "string") {
            console.error("[Binger] iAmTyping called with invalid uid");
            return;
        }

        const roomId = msg.roomId.trim();
        const uid = msg.uid;

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/typing/${uid}`);
        if (!ref) {
            console.error("[Binger] Failed to create typing ref");
            return;
        }

        // Use true instead of empty string for clearer semantics
        ref.set(true)
            .then(() => console.log(`[Binger] ${uid} is typing`))
            .catch((err) => console.error("[Binger] Failed to set typing status:", err));
    }

    /**
     * Handle user stopping typing
     * @param {object} msg - Message containing roomId and uid
     */
    function handleIStoppedTyping(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot clear typing - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            console.error("[Binger] iStoppedTyping called with invalid roomId");
            return;
        }
        if (!msg.uid || typeof msg.uid !== "string") {
            console.error("[Binger] iStoppedTyping called with invalid uid");
            return;
        }

        const roomId = msg.roomId.trim();
        const uid = msg.uid;

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/typing/${uid}`);
        if (!ref) {
            console.error("[Binger] Failed to create typing ref");
            return;
        }

        ref.remove()
            .then(() => console.log(`[Binger] ${uid} stopped typing`))
            .catch((err) => console.error("[Binger] Failed to remove typing status:", err));
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
        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing`);

        if (!typingRef) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getTypingListeners();

        // Remove existing listener if any (prevents stacking)
        if (listeners[roomId]) {
            typingRef.off("value", listeners[roomId]);
            console.log(`[Binger] Removed duplicate typing listener for room ${roomId}`);
        }

        // Create listener callback
        const callback = (snapshot) => {
            const typingData = snapshot.val() || {};
            const typingUids = Object.keys(typingData);

            // Fetch usernames
            const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
            if (!usersRef) {
                console.error("[Binger] Failed to create users ref for typing lookup");
                return;
            }

            usersRef.once("value")
                .then((snap) => {
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
                })
                .catch((err) => {
                    console.error("[Binger] Error fetching users for typing lookup:", err);
                });
        };

        // Attach listener
        typingRef.on("value", callback);
        listeners[roomId] = callback;

        console.log(`[Binger] Subscribed to typing changes for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "typing listener attached", roomId: roomId });
    }

    /**
     * Unsubscribe from typing status updates
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleUnsubscribeFromTyping(msg, sendResponse) {
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
        const listeners = BingerBGState.getTypingListeners();

        if (listeners[roomId]) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/typing`);
            if (ref) {
                ref.off("value", listeners[roomId]);
            }
            delete listeners[roomId];
            console.log(`[Binger] Unsubscribed from typing in room ${roomId}`);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "unsubscribed from typing", roomId: roomId });
        } else {
            console.log(`[Binger] No active typing listener for room ${roomId}`);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
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