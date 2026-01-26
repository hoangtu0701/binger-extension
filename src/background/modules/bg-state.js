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
    const typingListeners = {};         // roomId -> callback (typing status)

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

    function getTypingListeners() {
        return typingListeners;
    }

    // ========================================================================
    // EMBEDDING CACHE
    // ========================================================================

    function getMovieEmbeddingCache() {
        return currentMovieEmbeddingCache;
    }

    function setMovieEmbeddingCache(payload) {
        // Basic validation - should be object with movieId and chunks, or null
        if (payload !== null && typeof payload !== "object") {
            console.warn("[Binger] Invalid embedding cache payload - ignoring");
            return;
        }
        currentMovieEmbeddingCache = payload;
    }

    function clearMovieEmbeddingCache() {
        currentMovieEmbeddingCache = null;
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
        // Guard against going negative
        if (activePorts > 0) {
            activePorts--;
        } else {
            console.warn("[Binger] Attempted to decrement activePorts below 0");
        }
        return activePorts;
    }

    // ========================================================================
    // RESET / CLEANUP
    // ========================================================================

    /**
     * Clear all listeners from a specific map
     * @param {object} listenerMap - The listener map to clear
     * @param {string} mapName - Name for logging
     */
    function clearListenerMap(listenerMap, mapName) {
        const keys = Object.keys(listenerMap);
        keys.forEach((key) => {
            const listener = listenerMap[key];
            // If it's a function (unsubscribe fn), call it
            if (typeof listener === "function") {
                try {
                    listener();
                } catch (err) {
                    console.warn(`[Binger] Error clearing ${mapName} listener for ${key}:`, err);
                }
            }
            delete listenerMap[key];
        });
    }

    /**
     * Reset all state - clears all listeners and caches
     * Use with caution - mainly for debugging or error recovery
     */
    function resetAllState() {
        console.log("[Binger] Resetting all background state");

        // Clear all listener maps
        clearListenerMap(messageListeners, "message");
        clearListenerMap(activeInviteListeners, "activeInvite");
        clearListenerMap(inSessionListeners, "inSession");
        clearListenerMap(playerListeners, "player");
        clearListenerMap(bufferListeners, "buffer");
        clearListenerMap(resetIframeListeners, "resetIframe");
        clearListenerMap(soundboardListeners, "soundboard");
        clearListenerMap(visualboardListeners, "visualboard");
        clearListenerMap(pinListeners, "pin");
        clearListenerMap(themeListeners, "theme");
        clearListenerMap(typingListeners, "typing");

        // Clear caches
        currentMovieEmbeddingCache = null;

        // Reset port count
        activePorts = 0;

        console.log("[Binger] Background state reset complete");
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
        getTypingListeners,

        // Embedding cache
        getMovieEmbeddingCache,
        setMovieEmbeddingCache,
        clearMovieEmbeddingCache,

        // Port tracking
        getActivePorts,
        incrementActivePorts,
        decrementActivePorts,

        // Reset
        resetAllState
    };

})();