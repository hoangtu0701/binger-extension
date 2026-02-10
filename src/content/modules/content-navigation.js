(function() {
    "use strict";

    const POLL_INTERVAL_MS = 500;

    let navigationInitialized = false;
    let pollingIntervalId = null;
    let historyPatched = false;
    let originalPushState = null;
    let originalReplaceState = null;

    function clearReloadFlag() {
        BingerConnection.getLocal("bingerIsReloading")
            .then((isReloading) => {
                if (isReloading) {
                    return BingerConnection.removeLocal("bingerIsReloading");
                }
            })
            .catch((err) => {
                console.warn("[Binger] Failed to clear reload flag:", err);
            });
    }

    function reloadWithFlag() {
        BingerConnection.setLocal("bingerIsReloading", true)
            .then(() => {
                location.reload();
            })
            .catch(() => {
                location.reload();
            });
    }

    function navigateWithFlag(url) {
        if (!url || typeof url !== "string") {
            console.error("[Binger] navigateWithFlag called with invalid URL");
            return;
        }

        BingerConnection.setLocal("bingerIsReloading", true)
            .then(() => {
                location.href = url;
            })
            .catch(() => {
                location.href = url;
            });
    }

    function checkPendingMovieUrl() {
        Promise.all([
            BingerConnection.getLocal("pendingMovieUrl"),
            BingerConnection.getCurrentRoomId()
        ])
            .then(([pendingMovieUrl, roomId]) => {
                if (!pendingMovieUrl || !roomId) return;

                const pendingCode = BingerHelpers.extractMovieCode(pendingMovieUrl);
                const currentCode = BingerHelpers.extractMovieCode(window.location.href);

                if (pendingCode && pendingCode === currentCode) {
                    BingerConnection.sendMessage({
                        command: "userReady",
                        roomId: roomId
                    })
                        .then(() => {
                            return BingerConnection.removeLocal("pendingMovieUrl");
                        })
                        .catch((err) => {
                            console.error("[Binger] userReady failed:", err);
                            BingerConnection.removeLocal("pendingMovieUrl");
                        });
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to check pending movie URL:", err);
            });
    }

    function patchHistoryNavigation() {
        if (historyPatched) return;

        originalPushState = history.pushState;
        originalReplaceState = history.replaceState;

        function createWrapper(originalFn) {
            return function(...args) {
                const prevUrl = location.href;
                const result = originalFn.apply(this, args);
                const newUrl = location.href;

                if (BingerHelpers.isOnSearchPage()) return result;

                if (prevUrl !== newUrl && newUrl.startsWith(location.origin)) {
                    reloadWithFlag();
                }

                return result;
            };
        }

        history.pushState = createWrapper(originalPushState);
        history.replaceState = createWrapper(originalReplaceState);
        historyPatched = true;
    }

    function setupPopstateListener() {
        window.addEventListener("popstate", () => {
            if (BingerHelpers.isOnSearchPage()) return;
            reloadWithFlag();
        });
    }

    function setupPageshowListener() {
        window.addEventListener("pageshow", (event) => {
            if (event.persisted) {
                BingerConnection.getCurrentRoomId()
                    .then((roomId) => {
                        if (roomId) {
                            BingerConnection.sendMessageAsync({
                                command: "refreshUserList",
                                roomId
                            });
                        }
                    })
                    .catch((err) => {
                        console.warn("[Binger] Failed to refresh user list on bfcache:", err);
                    });

                reloadWithFlag();
            }
        });
    }

    function setupLinkInterception() {
        document.addEventListener("click", (e) => {
            if (!BingerHelpers.isOnWatchPage()) return;

            const anchor = e.target.closest("a");
            if (!anchor) return;

            const href = anchor.href;
            const current = location.href;

            if (
                href &&
                href.startsWith(location.origin) &&
                href !== current
            ) {
                e.preventDefault();
                navigateWithFlag(href);
            }
        });
    }

    function setupUrlPolling() {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
        }

        let lastUrl = location.href;

        pollingIntervalId = setInterval(() => {
            const currentUrl = location.href;

            if (
                currentUrl !== lastUrl &&
                currentUrl.startsWith(location.origin) &&
                !BingerHelpers.isOnSearchPage()
            ) {
                reloadWithFlag();
            }

            lastUrl = currentUrl;
        }, POLL_INTERVAL_MS);
    }

    function stopUrlPolling() {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
    }

    function initNavigation() {
        if (navigationInitialized) return;

        clearReloadFlag();
        checkPendingMovieUrl();
        patchHistoryNavigation();
        setupPopstateListener();
        setupPageshowListener();
        setupLinkInterception();
        setupUrlPolling();

        navigationInitialized = true;
    }

    window.BingerNavigation = {
        initNavigation,
        reloadWithFlag,
        navigateWithFlag,
        stopUrlPolling
    };

})();