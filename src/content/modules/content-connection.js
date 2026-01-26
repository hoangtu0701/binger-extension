// ============================================================================
// CONNECTION MODULE
// Handles communication with background script
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // PRIVATE STATE
    // ========================================================================

    let port = null;
    let keepAliveTimeoutId = null;
    const KEEP_ALIVE_INTERVAL = 15000; // 15 seconds

    // ========================================================================
    // PORT CONNECTION
    // ========================================================================

    /**
     * Initialize connection to background script
     */
    function initConnection() {
        // Clear any pending keep-alive timeout to prevent duplicate loops
        if (keepAliveTimeoutId) {
            clearTimeout(keepAliveTimeoutId);
            keepAliveTimeoutId = null;
        }

        // Disconnect existing port if any
        if (port) {
            try {
                port.disconnect();
            } catch (e) {
                // Already disconnected - ignore
            }
            port = null;
        }

        try {
            port = chrome.runtime.connect({ name: "binger-connection" });
            startKeepAlive();
        } catch (error) {
            console.error("[Binger] Failed to connect to background:", error);
        }
    }

    /**
     * Start keep-alive ping to prevent service worker from sleeping
     */
    function startKeepAlive() {
        if (!port) return;

        function ping() {
            try {
                port.postMessage({ type: "ping" });
                keepAliveTimeoutId = setTimeout(ping, KEEP_ALIVE_INTERVAL);
            } catch (error) {
                // Port disconnected, try to reconnect
                console.warn("[Binger] Keep-alive failed, reconnecting...");
                initConnection();
            }
        }

        ping();
    }

    /**
     * Get the current port connection
     * @returns {chrome.runtime.Port|null}
     */
    function getPort() {
        return port;
    }

    // ========================================================================
    // MESSAGE HELPERS
    // ========================================================================

    /**
     * Send a message to background script and get response
     * @param {object} message - The message to send
     * @returns {Promise<any>} The response
     */
    function sendMessage(message) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    // Check for errors (e.g., no receiver)
                    if (chrome.runtime.lastError) {
                        console.warn("[Binger] sendMessage error:", chrome.runtime.lastError.message);
                        resolve(null);
                        return;
                    }
                    resolve(response);
                });
            } catch (error) {
                console.error("[Binger] sendMessage failed:", error);
                resolve(null);
            }
        });
    }

    /**
     * Send a message without waiting for response
     * @param {object} message - The message to send
     */
    function sendMessageAsync(message) {
        try {
            chrome.runtime.sendMessage(message, () => {
                // Must check lastError to suppress Chrome warnings
                if (chrome.runtime.lastError) {
                    // Silently ignore - expected if no receiver
                }
            });
        } catch (error) {
            console.error("[Binger] sendMessageAsync failed:", error);
        }
    }

    // ========================================================================
    // STORAGE HELPERS
    // ========================================================================

    /**
     * Get value from chrome.storage.local
     * @param {string} key - The key to retrieve
     * @returns {Promise<any>} The stored value
     */
    function getLocal(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] getLocal error:", chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(result[key] ?? null);
            });
        });
    }

    /**
     * Set value in chrome.storage.local
     * @param {string} key - The key to set
     * @param {any} value - The value to store
     * @returns {Promise<void>}
     */
    function setLocal(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] setLocal error:", chrome.runtime.lastError.message);
                }
                resolve();
            });
        });
    }

    /**
     * Remove value from chrome.storage.local
     * @param {string} key - The key to remove
     * @returns {Promise<void>}
     */
    function removeLocal(key) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(key, () => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] removeLocal error:", chrome.runtime.lastError.message);
                }
                resolve();
            });
        });
    }

    /**
     * Get value from chrome.storage.sync
     * @param {string} key - The key to retrieve
     * @returns {Promise<any>} The stored value
     */
    function getSync(key) {
        return new Promise((resolve) => {
            chrome.storage.sync.get(key, (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] getSync error:", chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(result[key] ?? null);
            });
        });
    }

    /**
     * Set value in chrome.storage.sync
     * @param {string} key - The key to set
     * @param {any} value - The value to store
     * @returns {Promise<void>}
     */
    function setSync(key, value) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] setSync error:", chrome.runtime.lastError.message);
                }
                resolve();
            });
        });
    }

    // ========================================================================
    // ROOM ID HELPERS
    // ========================================================================

    /**
     * Get the current room ID from storage
     * @returns {Promise<string|null>}
     */
    function getCurrentRoomId() {
        return getLocal("bingerCurrentRoomId");
    }

    /**
     * Set the current room ID in storage
     * @param {string} roomId - The room ID to store
     * @returns {Promise<void>}
     */
    function setCurrentRoomId(roomId) {
        return setLocal("bingerCurrentRoomId", roomId);
    }

    /**
     * Clear the current room ID from storage
     * @returns {Promise<void>}
     */
    function clearCurrentRoomId() {
        return removeLocal("bingerCurrentRoomId");
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerConnection = {
        // Connection
        initConnection,
        getPort,

        // Messages
        sendMessage,
        sendMessageAsync,

        // Storage - Local
        getLocal,
        setLocal,
        removeLocal,

        // Storage - Sync
        getSync,
        setSync,

        // Room ID shortcuts
        getCurrentRoomId,
        setCurrentRoomId,
        clearCurrentRoomId
    };

})();