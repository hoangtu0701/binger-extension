// ============================================================================
// BACKGROUND STATE
// Centralized state management for background service worker
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // LISTENER MAPS
    // Track active Firebase listeners by roomId for proper cleanup
    // ========================================================================

    const messageListeners = {};        // roomId -> callback (chat messages)
    const activeInviteListeners = {};   // roomId -> callback (active invite)
    const inSessionListeners = {};      // roomId -> callback (session flag)
    const playerListeners = {};         // roomId -> unsubscribe fn (player state)
    const bufferListeners = {};         // roomId -> unsubscribe fn (buffer status)
    const resetIframeListeners = {};    // roomId -> unsubscribe fn (iframe reset flag)
    const soundboardListeners = {};     // roomId -> unsubscribe fn (sound effects)
    const visualboardListeners = {};    // roomId -> unsubscribe fn (visual effects)
    const pinListeners = {};            // roomId -> unsubscribe fn (pinned visuals)
    const themeListeners = {};          // roomId -> callback (theme changes)

    // ========================================================================
    // CACHES
    // ========================================================================

    // In-memory cache for movie subtitle embeddings (used by bot scene seeking)
    let currentMovieEmbeddingCache = null;

    // ========================================================================
    // PORT TRACKING
    // ========================================================================

    // Track number of active content script connections
    let activePorts = 0;

    // ========================================================================
    // GETTERS
    // ========================================================================

    function getMessageListeners() {
        return messageListeners;
    }

    function getActiveInviteListeners() {
        return activeInviteListeners;
    }

    function getInSessionListeners() {
        return inSessionListeners;
    }

    function getPlayerListeners() {
        return playerListeners;
    }

    function getBufferListeners() {
        return bufferListeners;
    }

    function getResetIframeListeners() {
        return resetIframeListeners;
    }

    function getSoundboardListeners() {
        return soundboardListeners;
    }

    function getVisualboardListeners() {
        return visualboardListeners;
    }

    function getPinListeners() {
        return pinListeners;
    }

    function getThemeListeners() {
        return themeListeners;
    }

    // ========================================================================
    // EMBEDDING CACHE
    // ========================================================================

    function getMovieEmbeddingCache() {
        return currentMovieEmbeddingCache;
    }

    function setMovieEmbeddingCache(payload) {
        currentMovieEmbeddingCache = payload;
    }

    // ========================================================================
    // PORT MANAGEMENT
    // ========================================================================

    function getActivePorts() {
        return activePorts;
    }

    function incrementActivePorts() {
        activePorts++;
        return activePorts;
    }

    function decrementActivePorts() {
        activePorts--;
        return activePorts;
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGState = {
        // Listener maps (return references for direct manipulation)
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

        // Embedding cache
        getMovieEmbeddingCache,
        setMovieEmbeddingCache,

        // Port tracking
        getActivePorts,
        incrementActivePorts,
        decrementActivePorts
    };

})();