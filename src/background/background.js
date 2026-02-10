try {
    self.importScripts("./modules/bg-firebase-init.js");
    self.importScripts("./modules/bg-state.js");
    self.importScripts("./utils/bg-helpers.js");
    self.importScripts("./modules/bg-tab-monitor.js");
    self.importScripts("./modules/bg-connection.js");
    self.importScripts("./modules/bg-auth.js");
    self.importScripts("./modules/bg-rooms.js");
    self.importScripts("./modules/bg-chat.js");
    self.importScripts("./modules/bg-users.js");
    self.importScripts("./modules/bg-invites.js");
    self.importScripts("./modules/bg-session.js");
    self.importScripts("./modules/bg-typing.js");
    self.importScripts("./modules/bg-soundboard.js");
    self.importScripts("./modules/bg-theme.js");
    self.importScripts("./modules/bg-subtitles.js");
    self.importScripts("./modules/bg-bot.js");
    self.importScripts("./modules/bg-message-router.js");

    const criticalModules = [
        { name: "BingerBGFirebase", module: self.BingerBGFirebase },
        { name: "BingerBGState", module: self.BingerBGState },
        { name: "BingerBGHelpers", module: self.BingerBGHelpers },
        { name: "BingerBGTabMonitor", module: self.BingerBGTabMonitor },
        { name: "BingerBGConnection", module: self.BingerBGConnection },
        { name: "BingerBGMessageRouter", module: self.BingerBGMessageRouter }
    ];

    const missingModules = criticalModules.filter(m => !m.module);
    if (missingModules.length > 0) {
        throw new Error(`Critical modules failed to load: ${missingModules.map(m => m.name).join(", ")}`);
    }

    BingerBGTabMonitor.init();
    BingerBGConnection.init();
    BingerBGMessageRouter.init();

} catch (err) {
    console.error("[Binger] Fatal error in background.js:", err);
}