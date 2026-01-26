// ============================================================================
// SOUNDBOARD HANDLERS
// Handle sound effects, visual effects, and pin requests/listeners
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // TOGGLE SOUNDBOARD
    // ========================================================================

    /**
     * Toggle soundboard visibility on all tabs
     * @param {object} msg - Message containing inSession flag
     */
    function handleToggleSoundboard(msg) {
        BingerBGUtils.broadcastToTabs({
            command: "toggleSoundboard",
            inSession: msg.inSession
        });
    }

    // ========================================================================
    // SOUND EFFECTS
    // ========================================================================

    /**
     * Request a sound effect to be played in the room
     * @param {object} msg - Message containing soundId
     */
    function handleRequestSoundEffect(msg) {
        chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
            if (!bingerCurrentRoomId) return;

            BingerBGFirebase.ref(`rooms/${bingerCurrentRoomId}/soundboard/${msg.soundId}`)
                .set(Date.now());
        });
    }

    /**
     * Start listening to sound effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartSoundboardListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getSoundboardListeners();

        // Remove old listener if it exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/soundboard`);

        const onSoundChange = (snap) => {
            const soundId = snap.key;

            // Broadcast only this sound
            BingerBGUtils.broadcastToTabs({
                command: "playSoundEffect",
                soundId
            });
        };

        ref.on("child_changed", onSoundChange);

        // Store unsubscribe function
        listeners[roomId] = () => ref.off("child_changed", onSoundChange);

        sendResponse({ status: "soundboard listener attached" });
    }

    /**
     * Stop listening to sound effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopSoundboardListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getSoundboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            sendResponse({ status: "soundboard listener removed" });
        }
    }

    // ========================================================================
    // VISUAL EFFECTS
    // ========================================================================

    /**
     * Request a visual effect to be played in the room
     * @param {object} msg - Message containing visualId
     */
    function handleRequestVisualEffect(msg) {
        chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
            if (!bingerCurrentRoomId) return;

            BingerBGFirebase.ref(`rooms/${bingerCurrentRoomId}/visualboard/${msg.visualId}`)
                .set(Date.now());
        });
    }

    /**
     * Start listening to visual effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartVisualboardListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getVisualboardListeners();

        // Remove old listener if it exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/visualboard`);

        const onVisualChange = (snap) => {
            const visualId = snap.key;

            // Broadcast only this visual
            BingerBGUtils.broadcastToTabs({
                command: "playVisualEffect",
                visualId
            });
        };

        ref.on("child_changed", onVisualChange);

        // Store unsubscribe function
        listeners[roomId] = () => ref.off("child_changed", onVisualChange);

        sendResponse({ status: "visualboard listener attached" });
    }

    /**
     * Stop listening to visual effect triggers
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopVisualboardListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getVisualboardListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            sendResponse({ status: "visualboard listener removed" });
        }
    }

    // ========================================================================
    // PINS
    // ========================================================================

    /**
     * Request a pin to be placed on the video
     * @param {object} msg - Message containing visualId, relX, relY
     */
    function handleRequestPin(msg) {
        chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
            if (!bingerCurrentRoomId) return;

            const ts = Date.now();
            BingerBGFirebase.ref(`rooms/${bingerCurrentRoomId}/activePins/${msg.visualId}`)
                .set({
                    timestamp: ts,
                    relX: msg.relX,
                    relY: msg.relY
                });
        });
    }

    /**
     * Start listening to pin updates
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStartPinListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getPinListeners();

        // Remove old listener if it exists
        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
        }

        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activePins`);

        const onPinChange = (snap) => {
            const visualId = snap.key;
            const data = snap.val();
            if (!visualId || !data) return;

            BingerBGUtils.broadcastToTabs({
                command: "updatePin",
                visualId,
                ...data
            });
        };

        ref.on("child_changed", onPinChange);

        listeners[roomId] = () => ref.off("child_changed", onPinChange);

        sendResponse({ status: "pin listener attached" });
    }

    /**
     * Stop listening to pin updates
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleStopPinListener(msg, sendResponse) {
        const { roomId } = msg;
        const listeners = BingerBGState.getPinListeners();

        if (listeners[roomId]) {
            listeners[roomId]();
            delete listeners[roomId];
            sendResponse({ status: "pin listener removed" });
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