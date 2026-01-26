// ============================================================================
// THEME MODULE
// Handles theme application and synchronization
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Valid theme names
    const VALID_THEMES = ["burgundy", "pink", "blackwhite", "ocean", "volcano", "forest"];

    // List of all available theme CSS classes (excluding default burgundy)
    const THEME_CLASSES = [
        "theme-pink",
        "theme-blackwhite",
        "theme-ocean",
        "theme-volcano",
        "theme-forest"
    ];

    const DEFAULT_THEME = "burgundy";

    // ========================================================================
    // STATE
    // ========================================================================

    // Track if module is initialized (prevents duplicate listeners)
    let themeInitialized = false;

    // ========================================================================
    // VALIDATION
    // ========================================================================

    /**
     * Check if a theme name is valid
     * @param {string} theme - Theme name to validate
     * @returns {boolean}
     */
    function isValidTheme(theme) {
        return typeof theme === "string" && VALID_THEMES.includes(theme);
    }

    // ========================================================================
    // THEME APPLICATION
    // ========================================================================

    /**
     * Apply a theme to the page
     * @param {string} theme - The theme name to apply
     */
    function applyTheme(theme) {
        // Validate and default to burgundy if invalid
        const currentTheme = isValidTheme(theme) ? theme : DEFAULT_THEME;

        // Remove all theme classes first
        THEME_CLASSES.forEach((cls) => {
            document.body.classList.remove(cls);
        });

        // Add theme class if not default burgundy
        if (currentTheme !== DEFAULT_THEME) {
            document.body.classList.add(`theme-${currentTheme}`);
        }
    }

    /**
     * Load and apply theme from storage
     */
    function loadTheme() {
        BingerConnection.getSync("theme")
            .then((theme) => {
                applyTheme(theme);
            })
            .catch((err) => {
                console.warn("[Binger] Failed to load theme:", err);
                applyTheme(DEFAULT_THEME);
            });
    }

    // ========================================================================
    // THEME LISTENER (ROOM SYNC)
    // ========================================================================

    /**
     * Activate theme listener for a room
     * @param {string} roomId - The room ID to listen to
     */
    function activateThemeListener(roomId) {
        // Validate roomId
        if (!roomId || typeof roomId !== "string") {
            console.warn("[Binger] activateThemeListener called without valid roomId");
            return;
        }

        if (!BingerState.getIsThemeSubscribed()) {
            BingerConnection.sendMessageAsync({
                command: "subscribeToTheme",
                roomId
            });
            BingerState.setIsThemeSubscribed(true);
            console.log("[Binger] Theme listener activated for room:", roomId);
        }
    }

    /**
     * Deactivate theme listener
     */
    function deactivateThemeListener() {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (roomId) {
                    BingerConnection.sendMessageAsync({
                        command: "unsubscribeFromTheme",
                        roomId
                    });
                }
            })
            .catch((err) => {
                console.warn("[Binger] Error getting roomId for theme unsubscribe:", err);
            });

        BingerState.setIsThemeSubscribed(false);
    }

    // ========================================================================
    // THEME CHANGE HANDLER
    // ========================================================================

    /**
     * Handle theme change from storage
     * Updates local theme and syncs to room if in one
     * @param {string} newTheme - The new theme name
     */
    function handleThemeChange(newTheme) {
        // Validate theme
        if (!isValidTheme(newTheme)) {
            console.warn("[Binger] Invalid theme received:", newTheme);
            return;
        }

        // Apply locally
        applyTheme(newTheme);

        // Sync to room if currently in one
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (roomId) {
                    return BingerConnection.sendMessage({
                        command: "post",
                        path: `rooms/${roomId}/theme`,
                        data: newTheme
                    }).then((res) => {
                        if (res?.status === "success") {
                            console.log("[Binger] Room theme updated to", newTheme);
                        } else {
                            console.error("[Binger] Failed to update room theme:", res?.error);
                        }
                    });
                }
            })
            .catch((err) => {
                console.error("[Binger] Error syncing theme to room:", err);
            });
    }

    /**
     * Handle theme update from room (received via message)
     * @param {string} theme - The theme from the room
     */
    function handleRoomThemeUpdate(theme) {
        // Validate theme
        if (!isValidTheme(theme)) {
            console.warn("[Binger] Invalid room theme received:", theme);
            return;
        }

        console.log("[Binger] Theme updated from room:", theme);

        // Apply locally first for immediate feedback
        applyTheme(theme);

        // Force local storage to match the room theme
        BingerConnection.setSync("theme", theme)
            .catch((err) => {
                console.warn("[Binger] Failed to save room theme locally:", err);
            });
    }

    // ========================================================================
    // STORAGE CHANGE LISTENER
    // ========================================================================

    /**
     * Setup listener for theme changes in chrome.storage
     * Only sets up once to prevent duplicate listeners
     */
    function setupThemeChangeListener() {
        // Prevent duplicate listeners
        if (themeInitialized) {
            return;
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync" && changes.theme?.newValue) {
                handleThemeChange(changes.theme.newValue);
            }
        });
    }

    // ========================================================================
    // FOREST THEME EFFECT
    // ========================================================================

    /**
     * Spawn falling leaves effect for forest theme
     * @param {HTMLElement} msgEl - The message element to spawn leaves from
     */
    function spawnLeaves(msgEl) {
        // Validate msgEl is a valid element
        if (!msgEl || !(msgEl instanceof HTMLElement)) {
            return;
        }

        BingerConnection.getSync("theme")
            .then((theme) => {
                if (theme !== "forest") return;

                // Double-check msgEl is still in DOM
                if (!document.contains(msgEl)) return;

                const total = 4 + Math.floor(Math.random() * 5);

                for (let i = 0; i < total; i++) {
                    const leaf = document.createElement("span");
                    leaf.className = "leaf";

                    // Random leaf emoji
                    const r = Math.random();
                    if (r < 0.7) {
                        leaf.textContent = String.fromCodePoint(0x1F343); // wind leaf
                    } else if (r < 0.9) {
                        leaf.textContent = String.fromCodePoint(0x1F342); // fallen leaf
                    } else {
                        leaf.textContent = String.fromCodePoint(0x1F341); // maple leaf
                    }

                    // Random position and animation
                    leaf.style.left = Math.random() * 80 + 10 + "%";
                    leaf.style.bottom = "-20px";
                    leaf.style.fontSize = (14 + Math.random() * 10) + "px";

                    const x = (Math.random() - 0.5) * 300;
                    const y = -80 - Math.random() * 200;
                    leaf.style.setProperty("--tx", x + "px");
                    leaf.style.setProperty("--ty", y + "px");
                    leaf.style.setProperty("--dur", (4 + Math.random() * 4) + "s");
                    leaf.style.setProperty("--delay", (Math.random() * 0.5) + "s");

                    msgEl.appendChild(leaf);

                    // Remove after animation
                    setTimeout(() => leaf.remove(), 10000);
                }
            })
            .catch((err) => {
                console.warn("[Binger] Failed to check theme for leaves:", err);
            });
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize theme module
     * Only initializes once to prevent duplicate listeners
     */
    function initTheme() {
        // Prevent duplicate initialization
        if (themeInitialized) {
            console.log("[Binger] Theme module already initialized - skipping");
            return;
        }

        // Load and apply current theme
        loadTheme();

        // Setup storage change listener
        setupThemeChangeListener();

        themeInitialized = true;
        console.log("[Binger] Theme module initialized");
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerTheme = {
        // Initialization
        initTheme,

        // Theme application
        applyTheme,
        loadTheme,

        // Room sync
        activateThemeListener,
        deactivateThemeListener,
        handleRoomThemeUpdate,

        // Effects
        spawnLeaves,

        // Validation (exposed for potential external use)
        isValidTheme
    };

})();