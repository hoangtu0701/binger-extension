// ============================================================================
// MESSAGE ROUTER
// Routes incoming messages from content scripts and popup to handlers
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // HELPER: CHECK IF HANDLER EXISTS
    // ========================================================================

    /**
     * Check if a handler module and method exist
     * @param {string} moduleName - Name of the module (e.g., "BingerBGChat")
     * @param {string} methodName - Name of the method (e.g., "handlePost")
     * @returns {function|null} - The handler function or null
     */
    function getHandler(moduleName, methodName) {
        const module = self[moduleName];
        if (!module) {
            console.error(`[Binger] Module not loaded: ${moduleName}`);
            return null;
        }
        const handler = module[methodName];
        if (typeof handler !== "function") {
            console.error(`[Binger] Handler not found: ${moduleName}.${methodName}`);
            return null;
        }
        return handler;
    }

    // ========================================================================
    // HELPER: EXECUTE HANDLER SAFELY
    // ========================================================================

    /**
     * Execute a handler with error handling
     * @param {string} moduleName - Module name
     * @param {string} methodName - Method name
     * @param {array} args - Arguments to pass to handler
     * @param {function} sendResponse - Response callback
     * @returns {boolean} - True if handler was called (async), false otherwise
     */
    function executeHandler(moduleName, methodName, args, sendResponse) {
        const handler = getHandler(moduleName, methodName);
        if (!handler) {
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: `Handler unavailable: ${moduleName}.${methodName}` });
            return false;
        }

        try {
            handler.apply(null, args);
            return true;
        } catch (err) {
            console.error(`[Binger] Handler error in ${moduleName}.${methodName}:`, err);
            BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: err.message || "Handler threw an exception" });
            return false;
        }
    }

    // ========================================================================
    // MESSAGE LISTENER
    // ========================================================================

    /**
     * Initialize the message router
     */
    function init() {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            // Validate msg exists
            if (!msg || typeof msg !== "object") {
                console.warn("[Binger] Invalid message received:", typeof msg);
                BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: "Invalid message format" });
                return false;
            }

            // Log command name only (not full message - may contain sensitive data)
            console.log("[Binger] Message received:", msg.command || "unknown");

            // Route message to appropriate handler
            const handled = routeMessage(msg, sender, sendResponse);

            // Return true if handler is async (keeps message channel open)
            return handled;
        });

        console.log("[Binger] Message router initialized");
    }

    // ========================================================================
    // MESSAGE ROUTING
    // ========================================================================

    /**
     * Route a message to the appropriate handler
     * @param {object} msg - The message object
     * @param {object} sender - Message sender info
     * @param {function} sendResponse - Response callback
     * @returns {boolean} True if handler is async
     */
    function routeMessage(msg, sender, sendResponse) {
        switch (msg.command) {
            // ----------------------------------------------------------------
            // CHAT
            // ----------------------------------------------------------------
            case "post":
                return executeHandler("BingerBGChat", "handlePost", [msg, sendResponse], sendResponse);

            case "subscribeToMessages":
                return executeHandler("BingerBGChat", "handleSubscribeToMessages", [msg, sendResponse], sendResponse);

            case "unsubscribeFromMessages":
                return executeHandler("BingerBGChat", "handleUnsubscribeFromMessages", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // AUTH
            // ----------------------------------------------------------------
            case "signup":
                return executeHandler("BingerBGAuth", "handleSignup", [msg, sendResponse], sendResponse);

            case "signin":
                return executeHandler("BingerBGAuth", "handleSignin", [msg, sendResponse], sendResponse);

            case "checkAuth":
                return executeHandler("BingerBGAuth", "handleCheckAuth", [sendResponse], sendResponse);

            case "signOut":
                return executeHandler("BingerBGAuth", "handleSignOut", [sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // ROOMS
            // ----------------------------------------------------------------
            case "createRoom":
                return executeHandler("BingerBGRooms", "handleCreateRoom", [sendResponse], sendResponse);

            case "joinRoom":
                return executeHandler("BingerBGRooms", "handleJoinRoom", [msg, sendResponse], sendResponse);

            case "leaveRoom":
                return executeHandler("BingerBGRooms", "handleLeaveRoom", [msg, sendResponse], sendResponse);

            case "rejoinIfRecentlyKicked":
                return executeHandler("BingerBGRooms", "handleRejoinIfRecentlyKicked", [msg, sendResponse], sendResponse);

            case "refreshUserList":
                return executeHandler("BingerBGRooms", "handleRefreshUserList", [msg], sendResponse);

            // ----------------------------------------------------------------
            // USERS
            // ----------------------------------------------------------------
            case "subscribeToUsers":
                return executeHandler("BingerBGUsers", "handleSubscribeToUsers", [msg, sendResponse], sendResponse);

            case "unsubscribeFromUsers":
                return executeHandler("BingerBGUsers", "handleUnsubscribeFromUsers", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // INVITES
            // ----------------------------------------------------------------
            case "sendInviteAndBroadcast":
                return executeHandler("BingerBGInvites", "handleSendInviteAndBroadcast", [msg, sendResponse], sendResponse);

            case "subscribeToActiveInvite":
                return executeHandler("BingerBGInvites", "handleSubscribeToActiveInvite", [msg, sendResponse], sendResponse);

            case "unsubscribeFromActiveInvite":
                return executeHandler("BingerBGInvites", "handleUnsubscribeFromActiveInvite", [msg, sendResponse], sendResponse);

            case "cancelActiveInvite":
                return executeHandler("BingerBGInvites", "handleCancelActiveInvite", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // SESSION
            // ----------------------------------------------------------------
            case "startInSessionListener":
                return executeHandler("BingerBGSession", "handleStartInSessionListener", [msg, sendResponse], sendResponse);

            case "stopInSessionListener":
                return executeHandler("BingerBGSession", "handleStopInSessionListener", [msg, sendResponse], sendResponse);

            case "userReady":
                return executeHandler("BingerBGSession", "handleUserReady", [msg, sendResponse], sendResponse);

            case "syncPlayerState":
                return executeHandler("BingerBGSession", "handleSyncPlayerState", [msg], sendResponse);

            case "startPlayerListener":
                return executeHandler("BingerBGSession", "handleStartPlayerListener", [msg, sendResponse], sendResponse);

            case "stopPlayerListener":
                return executeHandler("BingerBGSession", "handleStopPlayerListener", [msg, sendResponse], sendResponse);

            case "reportBufferStatus":
                return executeHandler("BingerBGSession", "handleReportBufferStatus", [msg], sendResponse);

            case "startBufferStatusListener":
                return executeHandler("BingerBGSession", "handleStartBufferStatusListener", [msg, sendResponse], sendResponse);

            case "stopBufferStatusListener":
                return executeHandler("BingerBGSession", "handleStopBufferStatusListener", [msg, sendResponse], sendResponse);

            case "broadcastCallReset":
                return executeHandler("BingerBGSession", "handleBroadcastCallReset", [msg], sendResponse);

            case "startResetIframeListener":
                return executeHandler("BingerBGSession", "handleStartResetIframeListener", [msg, sendResponse], sendResponse);

            case "stopResetIframeListener":
                return executeHandler("BingerBGSession", "handleStopResetIframeListener", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // TYPING
            // ----------------------------------------------------------------
            case "iAmTyping":
                return executeHandler("BingerBGTyping", "handleIAmTyping", [msg], sendResponse);

            case "iStoppedTyping":
                return executeHandler("BingerBGTyping", "handleIStoppedTyping", [msg], sendResponse);

            case "subscribeToTyping":
                return executeHandler("BingerBGTyping", "handleSubscribeToTyping", [msg, sendResponse], sendResponse);

            case "unsubscribeFromTyping":
                return executeHandler("BingerBGTyping", "handleUnsubscribeFromTyping", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // SOUNDBOARD
            // ----------------------------------------------------------------
            case "toggleSoundboard":
                return executeHandler("BingerBGSoundboard", "handleToggleSoundboard", [msg], sendResponse);

            case "requestSoundEffect":
                return executeHandler("BingerBGSoundboard", "handleRequestSoundEffect", [msg], sendResponse);

            case "startSoundboardListener":
                return executeHandler("BingerBGSoundboard", "handleStartSoundboardListener", [msg, sendResponse], sendResponse);

            case "stopSoundboardListener":
                return executeHandler("BingerBGSoundboard", "handleStopSoundboardListener", [msg, sendResponse], sendResponse);

            case "requestVisualEffect":
                return executeHandler("BingerBGSoundboard", "handleRequestVisualEffect", [msg], sendResponse);

            case "startVisualboardListener":
                return executeHandler("BingerBGSoundboard", "handleStartVisualboardListener", [msg, sendResponse], sendResponse);

            case "stopVisualboardListener":
                return executeHandler("BingerBGSoundboard", "handleStopVisualboardListener", [msg, sendResponse], sendResponse);

            case "requestPin":
                return executeHandler("BingerBGSoundboard", "handleRequestPin", [msg], sendResponse);

            case "startPinListener":
                return executeHandler("BingerBGSoundboard", "handleStartPinListener", [msg, sendResponse], sendResponse);

            case "stopPinListener":
                return executeHandler("BingerBGSoundboard", "handleStopPinListener", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // THEME
            // ----------------------------------------------------------------
            case "subscribeToTheme":
                return executeHandler("BingerBGTheme", "handleSubscribeToTheme", [msg, sendResponse], sendResponse);

            case "unsubscribeFromTheme":
                return executeHandler("BingerBGTheme", "handleUnsubscribeFromTheme", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // BOT
            // ----------------------------------------------------------------
            case "botQuery":
                return executeHandler("BingerBGBot", "handleBotQuery", [msg, sendResponse], sendResponse);

            // ----------------------------------------------------------------
            // UNKNOWN
            // ----------------------------------------------------------------
            default:
                console.warn(`[Binger] Unknown command: ${msg.command}`);
                BingerBGUtils.safeSendResponse(sendResponse, { status: "error", error: `Unknown command: ${msg.command}` });
                return false;
        }
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGMessageRouter = {
        init
    };

})();