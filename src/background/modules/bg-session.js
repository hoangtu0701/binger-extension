// ============================================================================
// SESSION HANDLERS
// Handle session state, player sync, buffer status, and iframe reset
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // IN-SESSION LISTENER
    // ========================================================================

    /**
     * Start listening to inSession flag changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartInSessionListener(msg, sendResponse) {
        const { roomId } = msg;
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);
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
        sendResponse({ status: "attached" });
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
        const { roomId } = msg;
        const userId = BingerBGFirebase.getCurrentUser()?.uid;
        if (!roomId || !userId) return;

        // Mark this user as ready in Firebase
        const readyRef = BingerBGFirebase.ref(`rooms/${roomId}/readyUsers/${userId}`);
        
        readyRef.set(true).then(() => {
            console.log(`[Binger] ${userId} marked as ready`);

            // Check if all users are ready
            Promise.all([
                BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value"),
                BingerBGFirebase.ref(`rooms/${roomId}/readyUsers`).once("value"),
            ]).then(([usersSnap, readySnap]) => {
                const users = usersSnap.val() || {};
                const readyUsers = readySnap.val() || {};

                const allUserIds = Object.keys(users);
                const readyUserIds = Object.keys(readyUsers);

                const allReady = allUserIds.every(uid => readyUserIds.includes(uid));

                if (allReady && allUserIds.length > 0) {
                    console.log(`[Binger] All users are ready - setting inSession`);

                    // Set inSession = true
                    BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(true).then(() => {
                        // Clean up readyUsers list
                        BingerBGFirebase.ref(`rooms/${roomId}/readyUsers`).remove();
                        console.log(`[Binger] Cleaned up readyUsers`);
                    });
                }
            });
        });

        sendResponse({ status: "ready acknowledged" });
    }

    // ========================================================================
    // PLAYER STATE SYNC
    // ========================================================================

    /**
     * Sync player state (play/pause/seek) to Firebase
     * @param {object} msg - Message containing roomId, action, time
     */
    function handleSyncPlayerState(msg) {
        const { roomId, action, time } = msg;
        BingerBGFirebase.ref(`rooms/${roomId}/playerState`).set({ action, time });
    }

    /**
     * Start listening to player state changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartPlayerListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getPlayerListeners();

        // Always clear previous listener if exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/playerState`);
        
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
        
        sendResponse({ status: "listening" });
    }

    /**
     * Stop listening to player state changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopPlayerListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getPlayerListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }
        
        sendResponse({ status: "playerState listener removed" });
    }

    // ========================================================================
    // BUFFER STATUS
    // ========================================================================

    /**
     * Report buffer status for a user
     * @param {object} msg - Message containing roomId, userId, status
     */
    function handleReportBufferStatus(msg) {
        const { roomId, userId, status } = msg;
        BingerBGFirebase.ref(`rooms/${roomId}/bufferStatus/${userId}`)
            .set(status)
            .then(() => console.log(`[Binger] Buffer status for ${userId} = ${status}`))
            .catch(err => console.error("[Binger] Failed to update bufferStatus", err));
    }

    /**
     * Start listening to buffer status changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartBufferStatusListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getBufferListeners();

        // Always destroy any prior listener for this room
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/bufferStatus`);
        let resumeTimeout = null; // Delay before sending "resumePlay"

        const onValue = (snap) => {
            const data = snap.val();
            if (!data) return;

            const allReady = Object.values(data).every(status => status === "ready");
            console.log("[Binger] Buffer status update:", data, "-> allReady =", allReady);

            if (allReady) {
                // Wait 300ms before sending resumePlay
                if (!resumeTimeout) {
                    resumeTimeout = setTimeout(() => {
                        BingerBGUtils.broadcastToTabs({
                            command: "resumePlay",
                            roomId
                        });
                        resumeTimeout = null;
                    }, 300);
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

        sendResponse({ status: "bufferStatus listener attached" });
    }

    /**
     * Stop listening to buffer status changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopBufferStatusListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getBufferListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }
        
        sendResponse({ status: "bufferStatus listener removed" });
    }

    // ========================================================================
    // IFRAME RESET
    // ========================================================================

    /**
     * Broadcast a call iframe reset request
     * @param {object} msg - Message containing roomId
     */
    function handleBroadcastCallReset(msg) {
        const { roomId } = msg;
        const user = BingerBGFirebase.getCurrentUser();
        if (!user) return;

        const flagRef = BingerBGFirebase.ref(`rooms/${roomId}/resetIframeFlag`);
        flagRef.set({
            by: user.uid,
            at: Date.now()
        }).then(() => {
            console.log(`[Binger] Set resetIframeFlag for room ${roomId}`);
        }).catch(err => {
            console.error("[Binger] Failed to write resetIframeFlag:", err);
        });
    }

    /**
     * Start listening to iframe reset flag changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartResetIframeListener(msg, sendResponse) {
        const { roomId } = msg;
        const user = BingerBGFirebase.getCurrentUser();
        if (!user) {
            sendResponse({ status: "error", error: "not signed in" });
            return;
        }

        const listeners = BingerBGState.getResetIframeListeners();

        // Always destroy any prior listener
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/resetIframeFlag`);
        
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
            ref.remove().then(() => {
                console.log("[Binger] resetIframeFlag removed after broadcast");
            });
        };

        ref.on("value", cb);
        listeners[roomId] = () => ref.off("value", cb);
        
        sendResponse({ status: "attached" });
    }

    /**
     * Stop listening to iframe reset flag changes
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopResetIframeListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getResetIframeListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            console.log(`[Binger] resetIframeListener detached for room ${roomId}`);
        }
        
        sendResponse({ status: "detached" });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGSession = {
        // inSession
        handleStartInSessionListener,
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