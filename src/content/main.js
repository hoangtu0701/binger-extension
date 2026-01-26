// ============================================================================
// BINGER MAIN CONTENT SCRIPT
// Entry point - orchestrates all modules
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // STATE
    // ========================================================================

    // Track if main script has been initialized (prevents duplicate init)
    let mainInitialized = false;

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
     * Extract username from user object safely
     * @param {object} user - User object from auth
     * @returns {string} Username or fallback
     */
    function extractUsername(user) {
        if (!user) return "Unknown";

        const email = user.email;
        if (!email || typeof email !== "string") {
            return user.displayName || "Unknown";
        }

        return email.split("@")[0] || "Unknown";
    }

    /**
     * Check auth status and initialize overlay
     */
    function checkAuthAndInitialize() {
        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((response) => {
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
                const username = extractUsername(response.user);
                BingerOverlayDOM.setUsername(username);

                // Attempt to rejoin room if we have one stored
                return BingerConnection.getCurrentRoomId();
            })
            .then((roomId) => {
                // roomId will be undefined if user not signed in (early return above)
                if (!roomId) {
                    BingerChatbox.deactivateChatbox();
                    return;
                }

                console.log(`[Binger] Attempting to rejoin active room: ${roomId}`);
                return BingerRoom.attemptRejoin(roomId);
            })
            .then((rejoined) => {
                if (rejoined === true) {
                    console.log("[Binger] Successfully rejoined room");
                } else if (rejoined === false) {
                    console.log("[Binger] Could not rejoin room - starting fresh");
                }
                // rejoined is undefined if user not signed in - that's fine
            })
            .catch((err) => {
                console.error("[Binger] Error during auth/initialization:", err);
                // Ensure chatbox is deactivated on error
                BingerChatbox.deactivateChatbox();
            });
    }

    // ========================================================================
    // MODULE INITIALIZATION
    // ========================================================================

    /**
     * Safely initialize a module with error handling
     * @param {string} name - Module name for logging
     * @param {Function} initFn - Initialization function to call
     */
    function safeInit(name, initFn) {
        try {
            initFn();
        } catch (err) {
            console.error(`[Binger] Failed to initialize ${name}:`, err);
        }
    }

    // ========================================================================
    // MAIN INITIALIZATION
    // ========================================================================

    /**
     * Initialize all Binger modules and functionality
     */
    function init() {
        // Prevent duplicate initialization
        if (mainInitialized) {
            console.log("[Binger] Main script already initialized - skipping");
            return;
        }

        console.log("[Binger] Initializing content script...");

        // 1. Initialize connection to background (critical - must succeed)
        safeInit("Connection", () => {
            BingerConnection.initConnection();
        });

        // 2. Initialize navigation (URL change detection, reload handling)
        safeInit("Navigation", () => {
            BingerNavigation.initNavigation();
        });

        // 3. Create overlay DOM (needed before buttons)
        safeInit("OverlayDOM", () => {
            BingerOverlayDOM.initOverlayDOM();
        });

        // 4. Initialize theme
        safeInit("Theme", () => {
            BingerTheme.initTheme();
        });

        // 5. Setup room buttons (needs overlay DOM)
        safeInit("RoomButtons", () => {
            BingerRoom.setupRoomButtons();
        });

        // 6. Setup watch together button (needs overlay DOM)
        safeInit("WatchTogetherButton", () => {
            BingerInvite.setupWatchTogetherButton();
        });

        // 7. Initialize message router
        safeInit("MessageRouter", () => {
            BingerMessageRouter.initMessageRouter();
        });

        // 8. Initialize soundboard (preloads audio, attaches message listener)
        safeInit("Soundboard", () => {
            BingerSoundboard.init();
        });

        // 9. Setup fullscreen if on watch page
        safeInit("Fullscreen", () => {
            setupFullscreenIfNeeded();
        });

        // 10. Check auth and show overlay if signed in (async - errors handled internally)
        checkAuthAndInitialize();

        mainInitialized = true;
        console.log("[Binger] Content script initialized.");
    }

    // ========================================================================
    // START
    // ========================================================================

    init();

})();