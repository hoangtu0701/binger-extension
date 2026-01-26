// ============================================================================
// BINGER MAIN CONTENT SCRIPT
// Entry point - orchestrates all modules
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // FULLSCREEN HOOK
    // ========================================================================

    /**
     * Ensure fullscreen hook is attached only once
     */
    function ensureFullscreenHook() {
        if (window.__bingerFullscreenHooked) return;
        window.__bingerFullscreenHooked = true;
        BingerFullscreen.init("#bingerOverlay");
    }

    /**
     * Attach fullscreen listener if on watch page
     */
    function setupFullscreenIfNeeded() {
        if (BingerHelpers.isOnWatchPage()) {
            ensureFullscreenHook();
        }
    }

    // ========================================================================
    // AUTH CHECK & INITIALIZATION
    // ========================================================================

    /**
     * Check auth status and initialize overlay
     */
    function checkAuthAndInitialize() {
        BingerConnection.sendMessage({ command: "checkAuth" }).then((response) => {
            if (!response?.user) {
                console.log("[Binger] User not signed in - overlay remains hidden.");
                return;
            }

            // Store current user in state
            BingerState.setCurrentUser(response.user);
            BingerRoom.checkWatchTogetherEligibility();

            // Show overlay
            BingerOverlayDOM.showOverlay();

            // Set username display
            const username = response.user.email.split("@")[0];
            BingerOverlayDOM.setUsername(username);

            // Attempt to rejoin room if we have one stored
            BingerConnection.getCurrentRoomId().then((roomId) => {
                if (roomId) {
                    console.log(`[Binger] Attempting to rejoin active room: ${roomId}`);
                    BingerRoom.attemptRejoin(roomId);
                } else {
                    BingerChatbox.deactivateChatbox();
                }
            });
        });
    }

    // ========================================================================
    // MAIN INITIALIZATION
    // ========================================================================

    /**
     * Initialize all Binger modules and functionality
     */
    function init() {
        console.log("[Binger] Initializing content script...");

        // 1. Initialize connection to background
        BingerConnection.initConnection();

        // 2. Initialize navigation (URL change detection, reload handling)
        BingerNavigation.initNavigation();

        // 3. Create overlay DOM
        BingerOverlayDOM.initOverlayDOM();

        // 4. Initialize theme
        BingerTheme.initTheme();

        // 5. Setup room buttons
        BingerRoom.setupRoomButtons();

        // 6. Setup watch together button
        BingerInvite.setupWatchTogetherButton();

        // 7. Initialize message router
        BingerMessageRouter.initMessageRouter();

        // 8. Setup fullscreen if on watch page
        setupFullscreenIfNeeded();

        // 9. Check auth and show overlay if signed in
        checkAuthAndInitialize();

        console.log("[Binger] Content script initialized.");
    }

    // ========================================================================
    // START
    // ========================================================================

    init();

})();