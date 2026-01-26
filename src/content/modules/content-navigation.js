// ============================================================================
// NAVIGATION MODULE
// Handles URL change detection and page reload logic
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const POLL_INTERVAL_MS = 500; // 0.5 seconds

    // ========================================================================
    // STATE
    // ========================================================================

    // Track if navigation module is initialized (prevents duplicate setup)
    let navigationInitialized = false;

    // Store interval ID for potential cleanup
    let pollingIntervalId = null;

    // Track if history API is already patched
    let historyPatched = false;

    // Store original history methods (only once)
    let originalPushState = null;
    let originalReplaceState = null;

    // ========================================================================
    // RELOAD FLAG MANAGEMENT
    // ========================================================================

    /**
     * Clear the reload flag to prevent infinite loops
     */
    function clearReloadFlag() {
        BingerConnection.getLocal("bingerIsReloading")
            .then((isReloading) => {
                if (isReloading) {
                    console.log("[Binger] Clearing reload flag to prevent loop");
                    return BingerConnection.removeLocal("bingerIsReloading");
                }
            })
            .catch((err) => {
                console.warn("[Binger] Failed to clear reload flag:", err);
            });
    }

    /**
     * Set reload flag and reload the page
     * Reloads even if flag setting fails to ensure navigation happens
     */
    function reloadWithFlag() {
        BingerConnection.setLocal("bingerIsReloading", true)
            .then(() => {
                location.reload();
            })
            .catch(() => {
                // Reload anyway even if flag couldn't be set
                console.warn("[Binger] Could not set reload flag, reloading anyway");
                location.reload();
            });
    }

    /**
     * Set reload flag and navigate to URL
     * Navigates even if flag setting fails to ensure navigation happens
     * @param {string} url - The URL to navigate to
     */
    function navigateWithFlag(url) {
        // Validate URL
        if (!url || typeof url !== "string") {
            console.error("[Binger] navigateWithFlag called with invalid URL");
            return;
        }

        BingerConnection.setLocal("bingerIsReloading", true)
            .then(() => {
                location.href = url;
            })
            .catch(() => {
                // Navigate anyway even if flag couldn't be set
                console.warn("[Binger] Could not set reload flag, navigating anyway");
                location.href = url;
            });
    }

    // ========================================================================
    // PENDING MOVIE URL CHECK
    // ========================================================================

    /**
     * Check if user successfully navigated to the shared movie link
     * Sends userReady to background.js to check and set room inSession
     * Uses movie code comparison for more robust matching
     */
    function checkPendingMovieUrl() {
        Promise.all([
            BingerConnection.getLocal("pendingMovieUrl"),
            BingerConnection.getCurrentRoomId()
        ])
            .then(([pendingMovieUrl, roomId]) => {
                if (!pendingMovieUrl || !roomId) return;

                // Compare movie codes instead of full URLs for robustness
                // This handles cases where URL has different query params
                const pendingCode = BingerHelpers.extractMovieCode(pendingMovieUrl);
                const currentCode = BingerHelpers.extractMovieCode(window.location.href);

                if (pendingCode && pendingCode === currentCode) {
                    console.log("[Binger] Arrived at correct movie page, sending userReady");

                    BingerConnection.sendMessage({
                        command: "userReady",
                        roomId: roomId
                    })
                        .then((response) => {
                            console.log("[Binger] userReady confirmed:", response);
                            return BingerConnection.removeLocal("pendingMovieUrl");
                        })
                        .catch((err) => {
                            console.error("[Binger] userReady failed:", err);
                            // Still clear pending URL to prevent repeated attempts
                            BingerConnection.removeLocal("pendingMovieUrl");
                        });
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to check pending movie URL:", err);
            });
    }

    // ========================================================================
    // HISTORY API PATCHES
    // ========================================================================

    /**
     * Patch pushState and replaceState to force reload on URL change
     * Only patches once to prevent wrapper stacking
     */
    function patchHistoryNavigation() {
        // Prevent double patching
        if (historyPatched) {
            console.log("[Binger] History API already patched - skipping");
            return;
        }

        // Store original methods only once
        originalPushState = history.pushState;
        originalReplaceState = history.replaceState;

        /**
         * Wrapper that triggers reload if URL changes
         * @param {Function} originalFn - The original history function
         * @returns {Function} Wrapped function
         */
        function createWrapper(originalFn) {
            return function(...args) {
                const prevUrl = location.href;
                const result = originalFn.apply(this, args);
                const newUrl = location.href;

                // Skip reloads on search page (use helper for consistency)
                if (BingerHelpers.isOnSearchPage()) return result;

                if (prevUrl !== newUrl && newUrl.startsWith(location.origin)) {
                    console.log("[Binger] push/replaceState - URL changed - forcing reload");
                    reloadWithFlag();
                }

                return result;
            };
        }

        history.pushState = createWrapper(originalPushState);
        history.replaceState = createWrapper(originalReplaceState);
        historyPatched = true;
    }

    /**
     * Setup popstate listener for back/forward navigation
     */
    function setupPopstateListener() {
        window.addEventListener("popstate", () => {
            if (BingerHelpers.isOnSearchPage()) return;

            console.log("[Binger] popstate - forcing reload");
            reloadWithFlag();
        });
    }

    /**
     * Setup pageshow listener for back-forward cache restore
     */
    function setupPageshowListener() {
        window.addEventListener("pageshow", (event) => {
            // pageshow with persisted=true means a back-forward cache restore
            if (event.persisted) {
                console.log("[Binger] pageshow (bfcache) - forcing reload");

                // Tell background to re-broadcast the user list
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

    // ========================================================================
    // LINK CLICK INTERCEPTION
    // ========================================================================

    /**
     * Intercept in-page link clicks to force reload
     * Only intercepts when on a watch page to avoid breaking normal navigation
     */
    function setupLinkInterception() {
        document.addEventListener("click", (e) => {
            // Only intercept if currently on a watch page
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
                console.log("[Binger] link click - URL changed - forcing reload");
                e.preventDefault();
                navigateWithFlag(href);
            }
        });
    }

    // ========================================================================
    // URL POLLING FALLBACK
    // ========================================================================

    /**
     * Fallback polling in case router does something weird
     * Stores interval ID for potential cleanup
     */
    function setupUrlPolling() {
        // Clear any existing polling interval
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
                console.log("[Binger] Fallback detected URL change - reloading...");
                reloadWithFlag();
            }

            lastUrl = currentUrl;
        }, POLL_INTERVAL_MS);
    }

    /**
     * Stop URL polling (for cleanup)
     */
    function stopUrlPolling() {
        if (pollingIntervalId) {
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize all navigation handling
     * Only initializes once to prevent duplicate listeners/patches
     */
    function initNavigation() {
        if (navigationInitialized) {
            console.log("[Binger] Navigation already initialized - skipping");
            return;
        }

        // Clear any existing reload flag
        clearReloadFlag();

        // Check if we arrived at pending movie URL
        checkPendingMovieUrl();

        // Patch history API
        patchHistoryNavigation();

        // Setup event listeners
        setupPopstateListener();
        setupPageshowListener();
        setupLinkInterception();

        // Start URL polling fallback
        setupUrlPolling();

        navigationInitialized = true;
        console.log("[Binger] Navigation module initialized");
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerNavigation = {
        initNavigation,
        reloadWithFlag,
        navigateWithFlag,
        stopUrlPolling
    };

})();