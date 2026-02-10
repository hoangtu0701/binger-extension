(function() {
    "use strict";

    let port = null;
    let keepAliveTimeoutId = null;
    const KEEP_ALIVE_INTERVAL = 15000;

    function initConnection() {
        if (keepAliveTimeoutId) {
            clearTimeout(keepAliveTimeoutId);
            keepAliveTimeoutId = null;
        }

        if (port) {
            try {
                port.disconnect();
            } catch {
            }
            port = null;
        }

        try {
            port = chrome.runtime.connect({ name: "binger-connection" });
            startKeepAlive();
        } catch {
        }
    }

    function startKeepAlive() {
        if (!port) return;

        function ping() {
            try {
                port.postMessage({ type: "ping" });
                keepAliveTimeoutId = setTimeout(ping, KEEP_ALIVE_INTERVAL);
            } catch {
                initConnection();
            }
        }

        ping();
    }

    function getPort() {
        return port;
    }

    function sendMessage(message) {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }
                    resolve(response);
                });
            } catch {
                resolve(null);
            }
        });
    }

    function sendMessageAsync(message) {
        try {
            chrome.runtime.sendMessage(message, () => {
                if (chrome.runtime.lastError) {
                }
            });
        } catch {
        }
    }

    function getLocal(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                resolve(result[key] ?? null);
            });
        });
    }

    function setLocal(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                }
                resolve();
            });
        });
    }

    function removeLocal(key) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(key, () => {
                if (chrome.runtime.lastError) {
                }
                resolve();
            });
        });
    }

    function getSync(key) {
        return new Promise((resolve) => {
            chrome.storage.sync.get(key, (result) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                resolve(result[key] ?? null);
            });
        });
    }

    function setSync(key, value) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [key]: value }, () => {
                if (chrome.runtime.lastError) {
                }
                resolve();
            });
        });
    }

    function getCurrentRoomId() {
        return getLocal("bingerCurrentRoomId");
    }

    function setCurrentRoomId(roomId) {
        return setLocal("bingerCurrentRoomId", roomId);
    }

    function clearCurrentRoomId() {
        return removeLocal("bingerCurrentRoomId");
    }

    window.BingerConnection = {
        initConnection,
        getPort,

        sendMessage,
        sendMessageAsync,

        getLocal,
        setLocal,
        removeLocal,

        getSync,
        setSync,

        getCurrentRoomId,
        setCurrentRoomId,
        clearCurrentRoomId
    };

})();