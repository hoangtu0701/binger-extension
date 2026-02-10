(function() {
    "use strict";

    const messageListeners = {};
    const activeInviteListeners = {};
    const inSessionListeners = {};
    const playerListeners = {};
    const bufferListeners = {};
    const resetIframeListeners = {};
    const soundboardListeners = {};
    const visualboardListeners = {};
    const pinListeners = {};
    const themeListeners = {};
    const typingListeners = {};

    let currentMovieEmbeddingCache = null;

    let activePorts = 0;

    function getMessageListeners() { return messageListeners; }
    function getActiveInviteListeners() { return activeInviteListeners; }
    function getInSessionListeners() { return inSessionListeners; }
    function getPlayerListeners() { return playerListeners; }
    function getBufferListeners() { return bufferListeners; }
    function getResetIframeListeners() { return resetIframeListeners; }
    function getSoundboardListeners() { return soundboardListeners; }
    function getVisualboardListeners() { return visualboardListeners; }
    function getPinListeners() { return pinListeners; }
    function getThemeListeners() { return themeListeners; }
    function getTypingListeners() { return typingListeners; }

    function getMovieEmbeddingCache() {
        return currentMovieEmbeddingCache;
    }

    function setMovieEmbeddingCache(payload) {
        if (payload !== null && typeof payload !== "object") return;
        currentMovieEmbeddingCache = payload;
    }

    function clearMovieEmbeddingCache() {
        currentMovieEmbeddingCache = null;
    }

    function getActivePorts() {
        return activePorts;
    }

    function incrementActivePorts() {
        activePorts++;
        return activePorts;
    }

    function decrementActivePorts() {
        if (activePorts > 0) {
            activePorts--;
        }
        return activePorts;
    }

    function clearListenerMap(listenerMap) {
        const keys = Object.keys(listenerMap);
        keys.forEach((key) => {
            const listener = listenerMap[key];
            if (typeof listener === "function") {
                try {
                    listener();
                } catch {
                }
            }
            delete listenerMap[key];
        });
    }

    function resetAllState() {
        clearListenerMap(messageListeners);
        clearListenerMap(activeInviteListeners);
        clearListenerMap(inSessionListeners);
        clearListenerMap(playerListeners);
        clearListenerMap(bufferListeners);
        clearListenerMap(resetIframeListeners);
        clearListenerMap(soundboardListeners);
        clearListenerMap(visualboardListeners);
        clearListenerMap(pinListeners);
        clearListenerMap(themeListeners);
        clearListenerMap(typingListeners);

        currentMovieEmbeddingCache = null;
        activePorts = 0;
    }

    self.BingerBGState = {
        getMessageListeners,
        getActiveInviteListeners,
        getInSessionListeners,
        getPlayerListeners,
        getBufferListeners,
        getResetIframeListeners,
        getSoundboardListeners,
        getVisualboardListeners,
        getPinListeners,
        getThemeListeners,
        getTypingListeners,

        getMovieEmbeddingCache,
        setMovieEmbeddingCache,
        clearMovieEmbeddingCache,

        getActivePorts,
        incrementActivePorts,
        decrementActivePorts,

        resetAllState
    };

})();