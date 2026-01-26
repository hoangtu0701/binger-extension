// ============================================================================
// NAVIGATION MODULE
// Handles URL change detection and page reload logic
// ============================================================================

(function() {
    "use strict";

    const POLL_INTERVAL = 500; // 0.5 seconds

    // ========================================================================
    // RELOAD FLAG MANAGEMENT
    // ========================================================================

    /**
     * Clear the reload flag to prevent infinite loops
     */
    function clearReloadFlag() {
        BingerConnection.getLocal("bingerIsReloading").then((isReloading) => {
            if (isReloading) {
                console.log("[Binger] Clearing reload flag to prevent loop");
                BingerConnection.removeLocal("bingerIsReloading");
            }
        });
    }

    /**
     * Set reload flag and reload the page
     */
    function reloadWithFlag() {
        BingerConnection.setLocal("bingerIsReloading", true).then(() => {
            location.reload();
        });
    }

    /**
     * Set reload flag and navigate to URL
     * @param {string} url - The URL to navigate to
     */
    function navigateWithFlag(url) {
        BingerConnection.setLocal("bingerIsReloading", true).then(() => {
            location.href = url;
        });
    }

    // ========================================================================
    // PENDING MOVIE URL CHECK
    // ========================================================================

    /**
     * Check if user successfully navigated to the shared movie link
     * Sends userReady to background.js to check and set room inSession
     */
    function checkPendingMovieUrl() {
        Promise.all([
            BingerConnection.getLocal("pendingMovieUrl"),
            BingerConnection.getCurrentRoomId()
        ]).then(([pendingMovieUrl, roomId]) => {
            if (!pendingMovieUrl || !roomId) return;

            if (window.location.href === pendingMovieUrl) {
                console.log("[Binger] Arrived at correct movie page, sending userReady");

                BingerConnection.sendMessage({
                    command: "userReady",
                    roomId: roomId
                }).then((response) => {
                    console.log("[Binger] userReady confirmed:", response);
                    BingerConnection.removeLocal("pendingMovieUrl");
                });
            }
        });
    }

    // ========================================================================
    // HISTORY API PATCHES
    // ========================================================================

    /**
     * Patch pushState and replaceState to force reload on URL change
     */
    function patchHistoryNavigation() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

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

                // Skip reloads on search page
                if (location.pathname === "/search") return result;

                if (prevUrl !== newUrl && newUrl.startsWith(location.origin)) {
                    console.log("[Binger] push/replaceState - URL changed - forcing reload");
                    reloadWithFlag();
                }

                return result;
            };
        }

        history.pushState = createWrapper(originalPushState);
        history.replaceState = createWrapper(originalReplaceState);
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
                BingerConnection.getCurrentRoomId().then((roomId) => {
                    if (roomId) {
                        BingerConnection.sendMessageAsync({
                            command: "refreshUserList",
                            roomId
                        });
                    }
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
     */
    function setupLinkInterception() {
        document.addEventListener("click", (e) => {
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
     */
    function setupUrlPolling() {
        let lastUrl = location.href;

        setInterval(() => {
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
        }, POLL_INTERVAL);
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize all navigation handling
     */
    function initNavigation() {
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
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerNavigation = {
        initNavigation,
        reloadWithFlag,
        navigateWithFlag
    };

})();