(function() {
    "use strict";

    const POLL_INTERVAL_MS = 500;

    let navigationInitialized = false;
    let pollingIntervalId = null;

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

    function isPlainLeftClick(e) {
        return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;
    }

    function isHashOnlyChange(href) {
        try {
            const target = new URL(href);
            return target.origin === location.origin &&
                   target.pathname === location.pathname &&
                   target.search === location.search &&
                   target.hash !== "";
        } catch {
            return false;
        }
    }

    function setupLinkInterception() {
        document.addEventListener("click", (e) => {
            if (e.defaultPrevented) return;
            if (!isPlainLeftClick(e)) return;

            const anchor = e.target.closest("a");
            if (!anchor) return;
            if (anchor.target === "_blank") return;
            if (anchor.hasAttribute("download")) return;

            const href = anchor.href;
            const current = location.href;

            if (
                href &&
                href.startsWith(location.origin) &&
                href !== current &&
                !isHashOnlyChange(href)
            ) {
                e.preventDefault();
                navigateWithFlag(href);
            }
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
        setupLinkInterception();
        setupPageshowListener();
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