(function() {
    "use strict";

    let mainInitialized = false;

    function ensureFullscreenHook() {
        if (window.__bingerFullscreenHooked) return;
        window.__bingerFullscreenHooked = true;
        BingerFullscreen.init("#bingerOverlay");
    }

    function setupFullscreenIfNeeded() {
        if (BingerHelpers.isOnWatchPage()) {
            ensureFullscreenHook();
        }
    }

    function extractUsername(user) {
        if (!user) return "Unknown";

        const email = user.email;
        if (!email || typeof email !== "string") {
            return user.displayName || "Unknown";
        }

        return email.split("@")[0] || "Unknown";
    }

    function checkAuthAndInitialize() {
        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((response) => {
                if (!response?.user) return;

                BingerState.setCurrentUser(response.user);
                BingerRoom.checkWatchTogetherEligibility();

                BingerOverlayDOM.showOverlay();

                const username = extractUsername(response.user);
                BingerOverlayDOM.setUsername(username);

                return BingerConnection.getCurrentRoomId();
            })
            .then((roomId) => {
                if (!roomId) {
                    BingerChatbox.deactivateChatbox();
                    return;
                }

                return BingerRoom.attemptRejoin(roomId);
            })
            .then(() => {})
            .catch((err) => {
                console.error("[Binger] Error during auth/initialization:", err);
                BingerChatbox.deactivateChatbox();
            });
    }

    function safeInit(name, initFn) {
        try {
            initFn();
        } catch (err) {
            console.error(`[Binger] Failed to initialize ${name}:`, err);
        }
    }

    function init() {
        if (mainInitialized) return;

        safeInit("Connection", () => BingerConnection.initConnection());
        safeInit("Navigation", () => BingerNavigation.initNavigation());
        safeInit("OverlayDOM", () => BingerOverlayDOM.initOverlayDOM());
        safeInit("Theme", () => BingerTheme.initTheme());
        safeInit("RoomButtons", () => BingerRoom.setupRoomButtons());
        safeInit("WatchTogetherButton", () => BingerInvite.setupWatchTogetherButton());
        safeInit("MessageRouter", () => BingerMessageRouter.initMessageRouter());
        safeInit("Soundboard", () => BingerSoundboard.init());
        safeInit("Fullscreen", () => setupFullscreenIfNeeded());

        checkAuthAndInitialize();

        mainInitialized = true;
    }

    init();

})();