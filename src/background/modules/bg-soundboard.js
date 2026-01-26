// ============================================================================
// SOUNDBOARD HANDLERS
// Handle sound effects, visual effects, and pin requests/listeners
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
            console.error("[Binger] bg-soundboard missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // HELPER: GET CURRENT ROOM ID
    // ========================================================================

    /**
     * Get current room ID from storage with error handling
     * @returns {Promise<string|null>}
     */
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

    // ========================================================================
    // TOGGLE SOUNDBOARD
    // ========================================================================

    /**
     * Toggle soundboard visibility on all tabs
     * @param {object} msg - Message containing inSession flag
     */
    function handleToggleSoundboard(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot toggle soundboard - missing dependencies");
            return;
        }

        BingerBGUtils.broadcastToTabs({
            command: "toggleSoundboard",
            inSession: msg?.inSession
        });
    }

    // ========================================================================
    // SOUND EFFECTS
    // ========================================================================

    /**
     * Request a sound effect to be played in the room
     * @param {object} msg - Message containing soundId
     */
    async function handleRequestSoundEffect(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot request sound effect - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.soundId !== "string" || msg.soundId.trim() === "") {
            console.error("[Binger] requestSoundEffect called with invalid soundId");
            return;
        }

        const soundId = msg.soundId.trim();
        const roomId = await getCurrentRoomId();

        if (!roomId) {
            console.warn("[Binger] Cannot request sound effect - not in a room");
            return;
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/soundboard/${soundId}`);
        if (!ref) {
            console.error("[Binger] Failed to create soundboard ref");
            return;
        }

        ref.set(Date.now())
            .then(() => {
                console.log(`[Binger] Sound effect requested: ${soundId}`);
            })
            .catch((err) => {
                console.error("[Binger] Failed to request sound effect:", err);
            });
    }

    /**
     * Start listening to sound effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartSoundboardListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getSoundboardListeners();

        // Remove old listener if it exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/soundboard`);

        if (!ref) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const onSoundTrigger = (snap) => {
            const soundId = snap.key;
            if (!soundId) return;

            BingerBGUtils.broadcastToTabs({
                command: "playSoundEffect",
                soundId
            });
        };

        // Listen to both child_added AND child_changed
        // child_added: first time a specific sound is played
        // child_changed: subsequent plays of same sound
        ref.on("child_added", onSoundTrigger);
        ref.on("child_changed", onSoundTrigger);

        // Store unsubscribe function
        listeners[roomId] = () => {
            ref.off("child_added", onSoundTrigger);
            ref.off("child_changed", onSoundTrigger);
        };

        console.log(`[Binger] Started soundboard listener for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "soundboard listener attached", roomId: roomId });
    }

    /**
     * Stop listening to sound effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopSoundboardListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getSoundboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            console.log(`[Binger] Stopped soundboard listener for room ${roomId}`);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "soundboard listener removed", roomId: roomId });
        } else {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    // ========================================================================
    // VISUAL EFFECTS
    // ========================================================================

    /**
     * Request a visual effect to be played in the room
     * @param {object} msg - Message containing visualId
     */
    async function handleRequestVisualEffect(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot request visual effect - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.visualId !== "string" || msg.visualId.trim() === "") {
            console.error("[Binger] requestVisualEffect called with invalid visualId");
            return;
        }

        const visualId = msg.visualId.trim();
        const roomId = await getCurrentRoomId();

        if (!roomId) {
            console.warn("[Binger] Cannot request visual effect - not in a room");
            return;
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/visualboard/${visualId}`);
        if (!ref) {
            console.error("[Binger] Failed to create visualboard ref");
            return;
        }

        ref.set(Date.now())
            .then(() => {
                console.log(`[Binger] Visual effect requested: ${visualId}`);
            })
            .catch((err) => {
                console.error("[Binger] Failed to request visual effect:", err);
            });
    }

    /**
     * Start listening to visual effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartVisualboardListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getVisualboardListeners();

        // Remove old listener if it exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/visualboard`);

        if (!ref) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const onVisualTrigger = (snap) => {
            const visualId = snap.key;
            if (!visualId) return;

            BingerBGUtils.broadcastToTabs({
                command: "playVisualEffect",
                visualId
            });
        };

        // Listen to both child_added AND child_changed
        ref.on("child_added", onVisualTrigger);
        ref.on("child_changed", onVisualTrigger);

        // Store unsubscribe function
        listeners[roomId] = () => {
            ref.off("child_added", onVisualTrigger);
            ref.off("child_changed", onVisualTrigger);
        };

        console.log(`[Binger] Started visualboard listener for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "visualboard listener attached", roomId: roomId });
    }

    /**
     * Stop listening to visual effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopVisualboardListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getVisualboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            console.log(`[Binger] Stopped visualboard listener for room ${roomId}`);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "visualboard listener removed", roomId: roomId });
        } else {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    // ========================================================================
    // PINS
    // ========================================================================

    /**
     * Request a pin to be placed on the video
     * @param {object} msg - Message containing visualId, relX, relY
     */
    async function handleRequestPin(msg) {
        // Validate dependencies
        if (!validateDependencies()) {
            console.error("[Binger] Cannot request pin - missing dependencies");
            return;
        }

        // Validate input
        if (!msg || typeof msg.visualId !== "string" || msg.visualId.trim() === "") {
            console.error("[Binger] requestPin called with invalid visualId");
            return;
        }
        if (typeof msg.relX !== "number" || typeof msg.relY !== "number") {
            console.error("[Binger] requestPin called with invalid coordinates");
            return;
        }

        const visualId = msg.visualId.trim();
        const roomId = await getCurrentRoomId();

        if (!roomId) {
            console.warn("[Binger] Cannot request pin - not in a room");
            return;
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activePins/${visualId}`);
        if (!ref) {
            console.error("[Binger] Failed to create activePins ref");
            return;
        }

        ref.set({
            timestamp: Date.now(),
            relX: msg.relX,
            relY: msg.relY
        })
            .then(() => {
                console.log(`[Binger] Pin requested: ${visualId} at (${msg.relX}, ${msg.relY})`);
            })
            .catch((err) => {
                console.error("[Binger] Failed to request pin:", err);
            });
    }

    /**
     * Start listening to pin updates
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartPinListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getPinListeners();

        // Remove old listener if it exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activePins`);

        if (!ref) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const onPinTrigger = (snap) => {
            const visualId = snap.key;
            const data = snap.val();
            if (!visualId || !data) return;

            BingerBGUtils.broadcastToTabs({
                command: "updatePin",
                visualId,
                ...data
            });
        };

        // Listen to both child_added AND child_changed
        ref.on("child_added", onPinTrigger);
        ref.on("child_changed", onPinTrigger);

        listeners[roomId] = () => {
            ref.off("child_added", onPinTrigger);
            ref.off("child_changed", onPinTrigger);
        };

        console.log(`[Binger] Started pin listener for room ${roomId}`);
        BingerBGUtils.safeSendResponse(sendResponse, { status: "pin listener attached", roomId: roomId });
    }

    /**
     * Stop listening to pin updates
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopPinListener(msg, sendResponse) {
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
        const listeners = BingerBGState.getPinListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            console.log(`[Binger] Stopped pin listener for room ${roomId}`);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "pin listener removed", roomId: roomId });
        } else {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGSoundboard = {
        // Toggle
        handleToggleSoundboard,

        // Sound effects
        handleRequestSoundEffect,
        handleStartSoundboardListener,
        handleStopSoundboardListener,

        // Visual effects
        handleRequestVisualEffect,
        handleStartVisualboardListener,
        handleStopVisualboardListener,

        // Pins
        handleRequestPin,
        handleStartPinListener,
        handleStopPinListener
    };

})();