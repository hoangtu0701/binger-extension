// ============================================================================
// SESSION HANDLERS
// Handle session state, player sync, buffer status, and iframe reset
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Delay before sending resumePlay after all users are ready (in milliseconds)
    // Prevents rapid on/off if users briefly buffer
    const RESUME_PLAY_DELAY_MS = 300;

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
            console.error("[Binger] bg-session missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // IN-SESSION LISTENER
    // ========================================================================

    /**
     * Start listening to inSession flag changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartInSessionListener(msg, sendResponse) {
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
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);

        if (!ref) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getInSessionListeners();

        // Detach old one if it exists
        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
            console.log(`[Binger] Replacing existing inSession listener for room ${roomId}`);
        }

        const callback = (snapshot) => {
            const isInSession = snapshot.val();
            console.log(`[Binger] inSession changed: ${isInSession} for room ${roomId}`);

            // Broadcast update to all tabs
            BingerBGUtils.broadcastToTabs({
                command: "inSessionUpdated",
                isInSession
            });
        };

        ref.on("value", callback);
        listeners[roomId] = callback;

        console.log(`[Binger] Started inSession listener for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "attached", roomId: roomId });
    }

    /**
     * Stop listening to inSession flag changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopInSessionListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getInSessionListeners();

        if (listeners[roomId]) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);
            if (ref) {
                ref.off("value", listeners[roomId]);
            }
            delete listeners[roomId];
            console.log(`[Binger] Stopped inSession listener for room ${roomId}`);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "detached", roomId: roomId });
        } else {
            console.log(`[Binger] No active inSession listener for room ${roomId}`);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    // ========================================================================
    // USER READY
    // ========================================================================

    /**
     * Handle user marking themselves as ready (navigated to movie)
     * Checks if all users are ready and sets inSession to true
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleUserReady(msg, sendResponse) {
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
        const user = BingerBGFirebase.getCurrentUser();

        if (!user || !user.uid) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        const userId = user.uid;

        // Mark this user as ready in Firebase
        const readyRef = BingerBGFirebase.ref(`rooms/${roomId}/readyUsers/${userId}`);

        if (!readyRef) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create ready ref" });
            return;
        }

        readyRef.set(true)
            .then(() => {
                console.log(`[Binger] ${userId} marked as ready`);

                // Check if all users are ready
                return Promise.all([
                    BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value"),
                    BingerBGFirebase.ref(`rooms/${roomId}/readyUsers`).once("value"),
                ]);
            })
            .then(([usersSnap, readySnap]) => {
                const users = usersSnap.val() || {};
                const readyUsers = readySnap.val() || {};

                const allUserIds = Object.keys(users);
                const readyUserIds = Object.keys(readyUsers);

                const allReady = allUserIds.every(uid => readyUserIds.includes(uid));

                if (allReady && allUserIds.length > 0) {
                    console.log("[Binger] All users are ready - setting inSession");

                    // Set inSession = true
                    return BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(true)
                        .then(() => {
                            // Clean up readyUsers list
                            return BingerBGFirebase.ref(`rooms/${roomId}/readyUsers`).remove();
                        })
                        .then(() => {
                            console.log("[Binger] Cleaned up readyUsers");
                        });
                }
            })
            .then(() => {
                BingerBGUtils.safeSendResponse(sendResponse, { status: "ready acknowledged" });
            })
            .catch((err) => {
                console.error("[Binger] Error in userReady:", err);
                BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    // ========================================================================
    // PLAYER STATE SYNC
    // ========================================================================

    /**
     * Sync player state (play/pause/seek) to Firebase
     * @param {object} msg - Message containing roomId, action, time
     */
    function handleSyncPlayerState(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot sync player state - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            console.error("[Binger] syncPlayerState called with invalid roomId");
            return;
        }

        const roomId = msg.roomId.trim();
        const action = msg.action;
        const time = msg.time;

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/playerState`);
        if (!ref) {
            console.error("[Binger] Failed to create playerState ref");
            return;
        }

        ref.set({ action, time })
            .then(() => {
                console.log(`[Binger] Player state synced: ${action} at ${time}`);
            })
            .catch((err) => {
                console.error("[Binger] Failed to sync player state:", err);
            });
    }

    /**
     * Start listening to player state changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartPlayerListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getPlayerListeners();

        // Always clear previous listener if exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/playerState`);

        if (!ref) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const onPlayerStateChange = (snap) => {
            const data = snap.val();
            if (!data) return;

            // Relay to all tabs in that room
            BingerBGUtils.broadcastToTabs({
                command: "playerStateUpdated",
                roomId,
                data
            });
        };

        ref.on("value", onPlayerStateChange);
        listeners[roomId] = () => ref.off("value", onPlayerStateChange);

        console.log(`[Binger] Started player listener for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "listening", roomId: roomId });
    }

    /**
     * Stop listening to player state changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopPlayerListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getPlayerListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            console.log(`[Binger] Stopped player listener for room ${roomId}`);
        }

        BingerBGUtils.safeSendResponse(sendResponse, { status: "playerState listener removed", roomId: roomId });
    }

    // ========================================================================
    // BUFFER STATUS
    // ========================================================================

    /**
     * Report buffer status for a user
     * @param {object} msg - Message containing roomId, userId, status
     */
    function handleReportBufferStatus(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot report buffer status - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            console.error("[Binger] reportBufferStatus called with invalid roomId");
            return;
        }
        if (!msg.userId || typeof msg.userId !== "string") {
            console.error("[Binger] reportBufferStatus called with invalid userId");
            return;
        }

        const roomId = msg.roomId.trim();
        const userId = msg.userId;
        const status = msg.status;

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/bufferStatus/${userId}`);
        if (!ref) {
            console.error("[Binger] Failed to create bufferStatus ref");
            return;
        }

        ref.set(status)
            .then(() => console.log(`[Binger] Buffer status for ${userId} = ${status}`))
            .catch((err) => console.error("[Binger] Failed to update bufferStatus:", err));
    }

    /**
     * Start listening to buffer status changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartBufferStatusListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getBufferListeners();

        // Always destroy any prior listener for this room
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/bufferStatus`);

        if (!ref) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        let resumeTimeout = null;

        const onValue = (snap) => {
            const data = snap.val();
            if (!data) return;

            const allReady = Object.values(data).every(status => status === "ready");
            console.log("[Binger] Buffer status update:", data, "-> allReady =", allReady);

            if (allReady) {
                // Wait before sending resumePlay
                if (!resumeTimeout) {
                    resumeTimeout = setTimeout(() => {
                        BingerBGUtils.broadcastToTabs({
                            command: "resumePlay",
                            roomId
                        });
                        resumeTimeout = null;
                    }, RESUME_PLAY_DELAY_MS);
                }
            } else {
                // If even one person is not ready, cancel the pending resumePlay
                if (resumeTimeout) {
                    clearTimeout(resumeTimeout);
                    resumeTimeout = null;
                }

                BingerBGUtils.broadcastToTabs({
                    command: "blockPlay",
                    roomId
                });
            }
        };

        ref.on("value", onValue);

        listeners[roomId] = () => {
            ref.off("value", onValue);
            if (resumeTimeout) {
                clearTimeout(resumeTimeout);
                resumeTimeout = null;
            }
        };

        console.log(`[Binger] Started buffer status listener for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "bufferStatus listener attached", roomId: roomId });
    }

    /**
     * Stop listening to buffer status changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopBufferStatusListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getBufferListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            console.log(`[Binger] Stopped buffer status listener for room ${roomId}`);
        }

        BingerBGUtils.safeSendResponse(sendResponse, { status: "bufferStatus listener removed", roomId: roomId });
    }

    // ========================================================================
    // IFRAME RESET
    // ========================================================================

    /**
     * Broadcast a call iframe reset request
     * @param {object} msg - Message containing roomId
     */
    function handleBroadcastCallReset(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot broadcast call reset - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            console.error("[Binger] broadcastCallReset called with invalid roomId");
            return;
        }

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) {
            console.error("[Binger] Cannot broadcast call reset - not signed in");
            return;
        }

        const flagRef = BingerBGFirebase.ref(`rooms/${roomId}/resetIframeFlag`);

        if (!flagRef) {
            console.error("[Binger] Failed to create resetIframeFlag ref");
            return;
        }

        flagRef.set({
            by: user.uid,
            at: Date.now()
        })
            .then(() => {
                console.log(`[Binger] Set resetIframeFlag for room ${roomId}`);
            })
            .catch((err) => {
                console.error("[Binger] Failed to write resetIframeFlag:", err);
            });
    }

    /**
     * Start listening to iframe reset flag changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartResetIframeListener(msg, sendResponse) {
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
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        const listeners = BingerBGState.getResetIframeListeners();

        // Always destroy any prior listener
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/resetIframeFlag`);

        if (!ref) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const cb = (snap) => {
            const data = snap.val();
            if (!data) return;

            const senderUid = data.by;
            if (senderUid === user.uid) {
                console.log("[Binger] Ignoring self-triggered resetIframeFlag");
                return;
            }

            console.log("[Binger] Detected external resetIframeFlag - triggering local reset");

            // Dispatch to local content script
            BingerBGUtils.broadcastToTabs({
                command: "resetCallIframe",
                roomId
            });

            // Cleanup the flag
            ref.remove()
                .then(() => {
                    console.log("[Binger] resetIframeFlag removed after broadcast");
                })
                .catch((err) => {
                    console.warn("[Binger] Failed to remove resetIframeFlag:", err);
                });
        };

        ref.on("value", cb);
        listeners[roomId] = () => ref.off("value", cb);

        console.log(`[Binger] Started resetIframe listener for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "attached", roomId: roomId });
    }

    /**
     * Stop listening to iframe reset flag changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopResetIframeListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getResetIframeListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            console.log(`[Binger] Stopped resetIframe listener for room ${roomId}`);
        }

        BingerBGUtils.safeSendResponse(sendResponse, { status: "detached", roomId: roomId });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGSession = {
        // inSession
        handleStartInSessionListener,
        handleStopInSessionListener,
        handleUserReady,

        // Player state
        handleSyncPlayerState,
        handleStartPlayerListener,
        handleStopPlayerListener,

        // Buffer status
        handleReportBufferStatus,
        handleStartBufferStatusListener,
        handleStopBufferStatusListener,

        // Iframe reset
        handleBroadcastCallReset,
        handleStartResetIframeListener,
        handleStopResetIframeListener
    };

})();