// ============================================================================
// BINGER BACKGROUND SERVICE WORKER
// Entry point - loads all modules and initializes the service worker
// ============================================================================

try {
    console.log("[Binger] background.js starting");

    // ========================================================================
    // LOAD MODULES
    // Order matters - dependencies must load first
    // ========================================================================

    // 1. Firebase initialization (loads SDKs, initializes app)
    self.importScripts("./modules/bg-firebase-init.js");

    // 2. State management (listener maps, caches, port tracking)
    self.importScripts("./modules/bg-state.js");

    // 3. Utilities (broadcast helpers, room ID generation, vector math)
    self.importScripts("./modules/bg-utils.js");

    // 4. Tab monitor (multi-tab overlay detection)
    self.importScripts("./modules/bg-tab-monitor.js");

    // 5. Connection handler (port management, keep-alive, cleanup)
    self.importScripts("./modules/bg-connection.js");

    // 6. Auth handlers
    self.importScripts("./modules/bg-auth.js");

    // 7. Room handlers
    self.importScripts("./modules/bg-rooms.js");

    // 8. Chat handlers
    self.importScripts("./modules/bg-chat.js");

    // 9. User list handlers
    self.importScripts("./modules/bg-users.js");

    // 10. Invite handlers
    self.importScripts("./modules/bg-invites.js");

    // 11. Session handlers (player sync, buffer, iframe reset)
    self.importScripts("./modules/bg-session.js");

    // 12. Typing handlers
    self.importScripts("./modules/bg-typing.js");

    // 13. Soundboard handlers (sound, visual, pins)
    self.importScripts("./modules/bg-soundboard.js");

    // 14. Theme handlers
    self.importScripts("./modules/bg-theme.js");

    // 15. Subtitle handlers (embedding generation)
    self.importScripts("./modules/bg-subtitles.js");

    // 16. Bot handlers (LLM queries, scene seeking)
    self.importScripts("./modules/bg-bot.js");

    // 17. Message router (routes messages to handlers)
    self.importScripts("./modules/bg-message-router.js");

    console.log("[Binger] All modules loaded");

    // ========================================================================
    // INITIALIZE
    // ========================================================================

    // Validate critical modules before initialization
    const criticalModules = [
        { name: "BingerBGFirebase", module: self.BingerBGFirebase },
        { name: "BingerBGState", module: self.BingerBGState },
        { name: "BingerBGUtils", module: self.BingerBGUtils },
        { name: "BingerBGTabMonitor", module: self.BingerBGTabMonitor },
        { name: "BingerBGConnection", module: self.BingerBGConnection },
        { name: "BingerBGMessageRouter", module: self.BingerBGMessageRouter }
    ];

    const missingModules = criticalModules.filter(m => !m.module);
    if (missingModules.length > 0) {
        throw new Error(`Critical modules failed to load: ${missingModules.map(m => m.name).join(", ")}`);
    }

    // Initialize tab monitor (listens for tab events)
    BingerBGTabMonitor.init();

    // Initialize connection handler (listens for port connections)
    BingerBGConnection.init();

    // Initialize message router (listens for runtime messages)
    BingerBGMessageRouter.init();

    console.log("[Binger] Background service worker initialized");

} catch (err) {
    console.error("[Binger] Fatal error in background.js:", err);
}