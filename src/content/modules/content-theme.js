(function() {
    "use strict";

    const VALID_THEMES = ["burgundy", "pink", "blackwhite", "ocean", "volcano", "forest"];

    const THEME_CLASSES = [
        "theme-pink",
        "theme-blackwhite",
        "theme-ocean",
        "theme-volcano",
        "theme-forest"
    ];

    const DEFAULT_THEME = "burgundy";

    let themeInitialized = false;

    function isValidTheme(theme) {
        return typeof theme === "string" && VALID_THEMES.includes(theme);
    }

    function applyTheme(theme) {
        const currentTheme = isValidTheme(theme) ? theme : DEFAULT_THEME;

        THEME_CLASSES.forEach((cls) => {
            document.body.classList.remove(cls);
        });

        if (currentTheme !== DEFAULT_THEME) {
            document.body.classList.add(`theme-${currentTheme}`);
        }
    }

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

    function activateThemeListener(roomId) {
        if (!roomId || typeof roomId !== "string") return;

        if (!BingerState.getIsThemeSubscribed()) {
            BingerConnection.sendMessageAsync({
                command: "subscribeToTheme",
                roomId
            });
            BingerState.setIsThemeSubscribed(true);
        }
    }

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

    function handleThemeChange(newTheme) {
        if (!isValidTheme(newTheme)) return;

        applyTheme(newTheme);

        if (window.BingerSession?.sendThemeToCallIframe) {
            window.BingerSession.sendThemeToCallIframe(newTheme);
        }

        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (roomId) {
                    return BingerConnection.sendMessage({
                        command: "post",
                        path: `rooms/${roomId}/theme`,
                        data: newTheme
                    }).then((res) => {
                        if (res?.status !== "success") {
                            console.error("[Binger] Failed to update room theme:", res?.error);
                        }
                    });
                }
            })
            .catch((err) => {
                console.error("[Binger] Error syncing theme to room:", err);
            });
    }

    function handleRoomThemeUpdate(theme) {
        if (!isValidTheme(theme)) return;

        applyTheme(theme);

        if (window.BingerSession?.sendThemeToCallIframe) {
            window.BingerSession.sendThemeToCallIframe(theme);
        }

        BingerConnection.setSync("theme", theme)
            .catch((err) => {
                console.warn("[Binger] Failed to save room theme locally:", err);
            });
    }

    function setupThemeChangeListener() {
        if (themeInitialized) return;

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync" && changes.theme?.newValue) {
                handleThemeChange(changes.theme.newValue);
            }
        });
    }

    function spawnLeaves(msgEl) {
        if (!msgEl || !(msgEl instanceof HTMLElement)) return;

        BingerConnection.getSync("theme")
            .then((theme) => {
                if (theme !== "forest") return;
                if (!document.contains(msgEl)) return;

                const total = 4 + Math.floor(Math.random() * 5);

                for (let i = 0; i < total; i++) {
                    const leaf = document.createElement("span");
                    leaf.className = "leaf";

                    const r = Math.random();
                    if (r < 0.7) {
                        leaf.textContent = String.fromCodePoint(0x1F343);
                    } else if (r < 0.9) {
                        leaf.textContent = String.fromCodePoint(0x1F342);
                    } else {
                        leaf.textContent = String.fromCodePoint(0x1F341);
                    }

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

                    setTimeout(() => leaf.remove(), 10000);
                }
            })
            .catch((err) => {
                console.warn("[Binger] Failed to check theme for leaves:", err);
            });
    }

    function initTheme() {
        if (themeInitialized) return;

        loadTheme();
        setupThemeChangeListener();

        themeInitialized = true;
    }

    window.BingerTheme = {
        initTheme,

        applyTheme,
        loadTheme,

        activateThemeListener,
        deactivateThemeListener,
        handleRoomThemeUpdate,

        spawnLeaves,

        isValidTheme
    };

})();