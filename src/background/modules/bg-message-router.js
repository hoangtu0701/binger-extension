// ============================================================================
// MESSAGE ROUTER
// Routes incoming messages from content scripts and popup to handlers
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // MESSAGE LISTENER
    // ========================================================================

    /**
     * Initialize the message router
     */
    function init() {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            console.log("[Binger] Message received:", msg);

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
                BingerBGChat.handlePost(msg, sendResponse);
                return true;

            case "subscribeToMessages":
                BingerBGChat.handleSubscribeToMessages(msg, sendResponse);
                return true;

            case "unsubscribeFromMessages":
                BingerBGChat.handleUnsubscribeFromMessages(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // AUTH
            // ----------------------------------------------------------------
            case "signup":
                BingerBGAuth.handleSignup(msg, sendResponse);
                return true;

            case "signin":
                BingerBGAuth.handleSignin(msg, sendResponse);
                return true;

            case "checkAuth":
                BingerBGAuth.handleCheckAuth(sendResponse);
                return true;

            case "signOut":
                BingerBGAuth.handleSignOut(sendResponse);
                return true;

            // ----------------------------------------------------------------
            // ROOMS
            // ----------------------------------------------------------------
            case "createRoom":
                BingerBGRooms.handleCreateRoom(sendResponse);
                return true;

            case "joinRoom":
                BingerBGRooms.handleJoinRoom(msg, sendResponse);
                return true;

            case "leaveRoom":
                BingerBGRooms.handleLeaveRoom(msg, sendResponse);
                return true;

            case "rejoinIfRecentlyKicked":
                BingerBGRooms.handleRejoinIfRecentlyKicked(msg, sendResponse);
                return true;

            case "refreshUserList":
                BingerBGRooms.handleRefreshUserList(msg);
                return false;

            // ----------------------------------------------------------------
            // USERS
            // ----------------------------------------------------------------
            case "subscribeToUsers":
                BingerBGUsers.handleSubscribeToUsers(msg, sendResponse);
                return true;

            case "unsubscribeFromUsers":
                BingerBGUsers.handleUnsubscribeFromUsers(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // INVITES
            // ----------------------------------------------------------------
            case "sendInviteAndBroadcast":
                BingerBGInvites.handleSendInviteAndBroadcast(msg, sendResponse);
                return true;

            case "subscribeToActiveInvite":
                BingerBGInvites.handleSubscribeToActiveInvite(msg, sendResponse);
                return true;

            case "cancelActiveInvite":
                BingerBGInvites.handleCancelActiveInvite(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // SESSION
            // ----------------------------------------------------------------
            case "startInSessionListener":
                BingerBGSession.handleStartInSessionListener(msg, sendResponse);
                return true;

            case "userReady":
                BingerBGSession.handleUserReady(msg, sendResponse);
                return true;

            case "syncPlayerState":
                BingerBGSession.handleSyncPlayerState(msg);
                return false;

            case "startPlayerListener":
                BingerBGSession.handleStartPlayerListener(msg, sendResponse);
                return true;

            case "stopPlayerListener":
                BingerBGSession.handleStopPlayerListener(msg, sendResponse);
                return true;

            case "reportBufferStatus":
                BingerBGSession.handleReportBufferStatus(msg);
                return false;

            case "startBufferStatusListener":
                BingerBGSession.handleStartBufferStatusListener(msg, sendResponse);
                return true;

            case "stopBufferStatusListener":
                BingerBGSession.handleStopBufferStatusListener(msg, sendResponse);
                return true;

            case "broadcastCallReset":
                BingerBGSession.handleBroadcastCallReset(msg);
                return true;

            case "startResetIframeListener":
                BingerBGSession.handleStartResetIframeListener(msg, sendResponse);
                return true;

            case "stopResetIframeListener":
                BingerBGSession.handleStopResetIframeListener(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // TYPING
            // ----------------------------------------------------------------
            case "iAmTyping":
                BingerBGTyping.handleIAmTyping(msg);
                return false;

            case "iStoppedTyping":
                BingerBGTyping.handleIStoppedTyping(msg);
                return false;

            case "subscribeToTyping":
                BingerBGTyping.handleSubscribeToTyping(msg, sendResponse);
                return true;

            case "unsubscribeFromTyping":
                BingerBGTyping.handleUnsubscribeFromTyping(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // SOUNDBOARD
            // ----------------------------------------------------------------
            case "toggleSoundboard":
                BingerBGSoundboard.handleToggleSoundboard(msg);
                return false;

            case "requestSoundEffect":
                BingerBGSoundboard.handleRequestSoundEffect(msg);
                return false;

            case "startSoundboardListener":
                BingerBGSoundboard.handleStartSoundboardListener(msg, sendResponse);
                return true;

            case "stopSoundboardListener":
                BingerBGSoundboard.handleStopSoundboardListener(msg, sendResponse);
                return true;

            case "requestVisualEffect":
                BingerBGSoundboard.handleRequestVisualEffect(msg);
                return false;

            case "startVisualboardListener":
                BingerBGSoundboard.handleStartVisualboardListener(msg, sendResponse);
                return true;

            case "stopVisualboardListener":
                BingerBGSoundboard.handleStopVisualboardListener(msg, sendResponse);
                return true;

            case "requestPin":
                BingerBGSoundboard.handleRequestPin(msg);
                return false;

            case "startPinListener":
                BingerBGSoundboard.handleStartPinListener(msg, sendResponse);
                return true;

            case "stopPinListener":
                BingerBGSoundboard.handleStopPinListener(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // THEME
            // ----------------------------------------------------------------
            case "subscribeToTheme":
                BingerBGTheme.handleSubscribeToTheme(msg, sendResponse);
                return true;

            case "unsubscribeFromTheme":
                BingerBGTheme.handleUnsubscribeFromTheme(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // BOT
            // ----------------------------------------------------------------
            case "botQuery":
                BingerBGBot.handleBotQuery(msg, sendResponse);
                return true;

            // ----------------------------------------------------------------
            // UNKNOWN
            // ----------------------------------------------------------------
            default:
                console.log(`[Binger] Unknown command: ${msg.command}`);
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