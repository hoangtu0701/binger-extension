(function() {
    "use strict";

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-soundboard missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function getCurrentRoomId() {
        return new Promise((resolve) => {
            chrome.storage.local.get("bingerCurrentRoomId", (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] Error getting current room:", chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(result?.bingerCurrentRoomId || null);
            });
        });
    }

    function handleToggleSoundboard(msg) {
        if (!validateDependencies()) return;

        BingerBGHelpers.broadcastToTabs({
            command: "toggleSoundboard",
            inSession: msg?.inSession
        });
    }

    async function handleRequestSoundEffect(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.soundId !== "string" || msg.soundId.trim() === "") return;

        const soundId = msg.soundId.trim();
        const roomId = await getCurrentRoomId();
        if (!roomId) return;

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/soundboard/${soundId}`);
        if (!ref) return;

        ref.set(Date.now())
            .catch((err) => {
                console.error("[Binger] Failed to request sound effect:", err);
            });
    }

    function handleStartSoundboardListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getSoundboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/soundboard`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const joinedAt = Date.now();

        const onSoundTrigger = (snap) => {
            const soundId = snap.key;
            const timestamp = snap.val();
            if (!soundId) return;

            if (typeof timestamp === "number" && timestamp <= joinedAt) return;

            BingerBGHelpers.broadcastToTabs({
                command: "playSoundEffect",
                soundId
            });
        };

        ref.on("child_added", onSoundTrigger);
        ref.on("child_changed", onSoundTrigger);

        listeners[roomId] = () => {
            ref.off("child_added", onSoundTrigger);
            ref.off("child_changed", onSoundTrigger);
        };

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "soundboard listener attached", roomId: roomId });
    }

    function handleStopSoundboardListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getSoundboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "soundboard listener removed", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    async function handleRequestVisualEffect(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.visualId !== "string" || msg.visualId.trim() === "") return;

        const visualId = msg.visualId.trim();
        const roomId = await getCurrentRoomId();
        if (!roomId) return;

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/visualboard/${visualId}`);
        if (!ref) return;

        ref.set(Date.now())
            .catch((err) => {
                console.error("[Binger] Failed to request visual effect:", err);
            });
    }

    function handleStartVisualboardListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getVisualboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/visualboard`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const joinedAt = Date.now();

        const onVisualTrigger = (snap) => {
            const visualId = snap.key;
            const timestamp = snap.val();
            if (!visualId) return;

            if (typeof timestamp === "number" && timestamp <= joinedAt) return;

            BingerBGHelpers.broadcastToTabs({
                command: "playVisualEffect",
                visualId
            });
        };

        ref.on("child_added", onVisualTrigger);
        ref.on("child_changed", onVisualTrigger);

        listeners[roomId] = () => {
            ref.off("child_added", onVisualTrigger);
            ref.off("child_changed", onVisualTrigger);
        };

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "visualboard listener attached", roomId: roomId });
    }

    function handleStopVisualboardListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getVisualboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "visualboard listener removed", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    async function handleRequestPin(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.visualId !== "string" || msg.visualId.trim() === "") return;
        if (typeof msg.relX !== "number" || typeof msg.relY !== "number") return;

        const visualId = msg.visualId.trim();
        const roomId = await getCurrentRoomId();
        if (!roomId) return;

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activePins/${visualId}`);
        if (!ref) return;

        ref.set({
            timestamp: Date.now(),
            relX: msg.relX,
            relY: msg.relY
        })
            .catch((err) => {
                console.error("[Binger] Failed to request pin:", err);
            });
    }

    function handleStartPinListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getPinListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activePins`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const joinedAt = Date.now();

        const onPinTrigger = (snap) => {
            const visualId = snap.key;
            const data = snap.val();
            if (!visualId || !data) return;

            if (data.timestamp && data.timestamp <= joinedAt) return;

            BingerBGHelpers.broadcastToTabs({
                command: "updatePin",
                visualId,
                ...data
            });
        };

        ref.on("child_added", onPinTrigger);
        ref.on("child_changed", onPinTrigger);

        listeners[roomId] = () => {
            ref.off("child_added", onPinTrigger);
            ref.off("child_changed", onPinTrigger);
        };

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "pin listener attached", roomId: roomId });
    }

    function handleStopPinListener(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getPinListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "pin listener removed", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    self.BingerBGSoundboard = {
        handleToggleSoundboard,

        handleRequestSoundEffect,
        handleStartSoundboardListener,
        handleStopSoundboardListener,

        handleRequestVisualEffect,
        handleStartVisualboardListener,
        handleStopVisualboardListener,

        handleRequestPin,
        handleStartPinListener,
        handleStopPinListener
    };

})();