(function() {
    "use strict";

    const RESUME_PLAY_DELAY_MS = 300;

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-session missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function handleStartInSessionListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getInSessionListeners();

        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
        }

        const callback = (snapshot) => {
            const isInSession = snapshot.val();

            BingerBGHelpers.broadcastToTabs({
                command: "inSessionUpdated",
                isInSession
            });
        };

        ref.on("value", callback);
        listeners[roomId] = callback;

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "attached", roomId: roomId });
    }

    function handleStopInSessionListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
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
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "detached", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    function handleUserReady(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user || !user.uid) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        const userId = user.uid;

        const readyRef = BingerBGFirebase.ref(`rooms/${roomId}/readyUsers/${userId}`);

        if (!readyRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create ready ref" });
            return;
        }

        readyRef.set(true)
            .then(() => {
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
                    return BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(true)
                        .then(() => {
                            return BingerBGFirebase.ref(`rooms/${roomId}/readyUsers`).remove();
                        });
                }
            })
            .then(() => {
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "ready acknowledged" });
            })
            .catch((err) => {
                console.error("[Binger] Error in userReady:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleSyncPlayerState(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") return;

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/playerState`);
        if (!ref) return;

        ref.set({ action: msg.action, time: msg.time })
            .catch((err) => {
                console.error("[Binger] Failed to sync player state:", err);
            });
    }

    function handleStartPlayerListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getPlayerListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/playerState`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const onPlayerStateChange = (snap) => {
            const data = snap.val();
            if (!data) return;

            BingerBGHelpers.broadcastToTabs({
                command: "playerStateUpdated",
                roomId,
                data
            });
        };

        ref.on("value", onPlayerStateChange);
        listeners[roomId] = () => ref.off("value", onPlayerStateChange);

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "listening", roomId: roomId });
    }

    function handleStopPlayerListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getPlayerListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "playerState listener removed", roomId: roomId });
    }

    function handleReportBufferStatus(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") return;
        if (!msg.userId || typeof msg.userId !== "string") return;

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/bufferStatus/${msg.userId}`);
        if (!ref) return;

        ref.set(msg.status)
            .catch((err) => console.error("[Binger] Failed to update bufferStatus:", err));
    }

    function handleStartBufferStatusListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getBufferListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/bufferStatus`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        let resumeTimeout = null;

        const onValue = (snap) => {
            const data = snap.val();
            if (!data) return;

            const statuses = Object.values(data);
            const allReady = statuses.length > 0 && statuses.every(s => s === "ready");

            if (allReady) {
                if (!resumeTimeout) {
                    resumeTimeout = setTimeout(() => {
                        BingerBGHelpers.broadcastToTabs({
                            command: "resumePlay",
                            roomId
                        });
                        resumeTimeout = null;
                    }, RESUME_PLAY_DELAY_MS);
                }
            } else {
                if (resumeTimeout) {
                    clearTimeout(resumeTimeout);
                    resumeTimeout = null;
                }

                BingerBGHelpers.broadcastToTabs({
                    command: "blockPlay",
                    roomId
                });
            }
        };

        // Clears stale bufferStatus from previous session to prevent deadlock
        ref.remove()
            .catch((err) => {
                console.warn("[Binger] Failed to clear stale bufferStatus:", err);
            });

        ref.on("value", onValue);

        listeners[roomId] = () => {
            ref.off("value", onValue);
            if (resumeTimeout) {
                clearTimeout(resumeTimeout);
                resumeTimeout = null;
            }
        };

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "bufferStatus listener attached", roomId: roomId });
    }

    function handleStopBufferStatusListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getBufferListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "bufferStatus listener removed", roomId: roomId });
    }

    function handleBroadcastCallReset(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") return;

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) return;

        const flagRef = BingerBGFirebase.ref(`rooms/${roomId}/resetIframeFlag`);
        if (!flagRef) return;

        flagRef.set({
            by: user.uid,
            at: Date.now()
        })
            .catch((err) => {
                console.error("[Binger] Failed to write resetIframeFlag:", err);
            });
    }

    function handleStartResetIframeListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        const listeners = BingerBGState.getResetIframeListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/resetIframeFlag`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const cb = (snap) => {
            const data = snap.val();
            if (!data) return;

            if (data.by === user.uid) return;

            BingerBGHelpers.broadcastToTabs({
                command: "resetCallIframe",
                roomId
            });

            ref.remove()
                .catch((err) => {
                    console.warn("[Binger] Failed to remove resetIframeFlag:", err);
                });
        };

        ref.on("value", cb);
        listeners[roomId] = () => ref.off("value", cb);

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "attached", roomId: roomId });
    }

    function handleStopResetIframeListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getResetIframeListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "detached", roomId: roomId });
    }

    self.BingerBGSession = {
        handleStartInSessionListener,
        handleStopInSessionListener,
        handleUserReady,

        handleSyncPlayerState,
        handleStartPlayerListener,
        handleStopPlayerListener,

        handleReportBufferStatus,
        handleStartBufferStatusListener,
        handleStopBufferStatusListener,

        handleBroadcastCallReset,
        handleStartResetIframeListener,
        handleStopResetIframeListener
    };

})();