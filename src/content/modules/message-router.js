// ============================================================================
// MESSAGE ROUTER MODULE
// Handles all incoming messages from background.js
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // MESSAGE HANDLER
    // ========================================================================

    /**
     * Main message handler for chrome.runtime.onMessage
     * @param {object} msg - The message object
     * @param {object} sender - The sender information
     * @param {Function} sendResponse - Function to send response
     * @returns {boolean|undefined} Return true if sendResponse will be called async
     */
    function handleMessage(msg, sender, sendResponse) {
        switch (msg.command) {
            // ================================================================
            // OVERLAY COMMANDS
            // ================================================================

            case "showOverlay":
                handleShowOverlay(msg);
                break;

            case "hideOverlay":
                handleHideOverlay(sendResponse);
                return true; // Async response

            case "isOverlayShown":
                sendResponse({ overlay: BingerOverlayDOM.isOverlayVisible() });
                return true;

            // ================================================================
            // USER LIST
            // ================================================================

            case "updateUserList":
                handleUpdateUserList(msg);
                break;

            // ================================================================
            // CHAT MESSAGES
            // ================================================================

            case "newChatMessage":
                BingerChatbox.renderMessage(msg.message);
                break;

            // ================================================================
            // TYPING STATUS
            // ================================================================

            case "typingStatusUpdated":
                BingerChatbox.renderTypingBubbles(msg.users);
                break;

            // ================================================================
            // INVITE SYSTEM
            // ================================================================

            case "activeInviteUpdated":
                BingerInvite.handleInviteUpdate(msg.invite);
                break;

            // ================================================================
            // SESSION MANAGEMENT
            // ================================================================

            case "startSession":
                handleStartSession(msg);
                break;

            case "inSessionUpdated":
                handleInSessionUpdated(msg);
                break;

            // ================================================================
            // THEME
            // ================================================================

            case "themeUpdated":
                BingerTheme.handleRoomThemeUpdate(msg.theme);
                break;

            // ================================================================
            // MULTI-TAB WARNING
            // ================================================================

            case "showMultiTabWarning":
                BingerOverlayDOM.showMultiTabWarning();
                break;

            case "hideMultiTabWarning":
                BingerOverlayDOM.hideMultiTabWarning();
                break;

            default:
                // Unknown command - ignore
                break;
        }
    }

    // ========================================================================
    // OVERLAY HANDLERS
    // ========================================================================

    /**
     * Handle showOverlay command
     * @param {object} msg - The message with username
     */
    function handleShowOverlay(msg) {
        BingerOverlayDOM.showOverlay();

        if (msg.username) {
            BingerOverlayDOM.setUsername(msg.username);
        }
    }

    /**
     * Handle hideOverlay command
     * @param {Function} sendResponse - Response callback
     */
    function handleHideOverlay(sendResponse) {
        BingerOverlayDOM.hideOverlay();
        BingerOverlayDOM.hideMultiTabWarning();

        BingerRoom.leaveRoomAndCleanup(() => {
            BingerChatbox.deactivateChatbox();
            BingerTheme.deactivateThemeListener();
            sendResponse();
        });
    }

    // ========================================================================
    // USER LIST HANDLER
    // ========================================================================

    /**
     * Handle updateUserList command
     * @param {object} msg - The message with users array
     */
    function handleUpdateUserList(msg) {
        BingerState.setCurrentUsersInRoom(msg.users);
        BingerRoom.checkWatchTogetherEligibility();
        BingerOverlayDOM.setUserListDisplay(msg.users);
    }

    // ========================================================================
    // SESSION HANDLERS
    // ========================================================================

    /**
     * Handle startSession command
     * @param {object} msg - The message with movieUrl
     */
    function handleStartSession(msg) {
        const movieUrl = msg.movieUrl;

        // Store pending URL and navigate
        BingerConnection.setLocal("pendingMovieUrl", movieUrl).then(() => {
            console.log("[Binger] Stored pendingMovieUrl, navigating...");
            BingerNavigation.navigateWithFlag(movieUrl);
        });

        // Attach inSession listener
        BingerConnection.getCurrentRoomId().then((roomId) => {
            if (!roomId) {
                console.error("[Binger] No room ID found, cannot attach inSession listener.");
                return;
            }

            BingerConnection.sendMessage({
                command: "startInSessionListener",
                roomId
            }).then((response) => {
                if (response?.status === "attached") {
                    console.log("[Binger] Listener attached successfully");
                } else {
                    console.warn("[Binger] Listener may not have attached correctly:", response);
                }
            });
        });
    }

    /**
     * Handle inSessionUpdated command
     * @param {object} msg - The message with isInSession boolean
     */
    function handleInSessionUpdated(msg) {
        const { isInSession } = msg;

        // Build context object for session mode functions
        const context = {
            chrome,
            watchTogetherBtn: BingerOverlayDOM.getElement("watchTogetherBtn"),
            cameraToggleBtn: BingerOverlayDOM.getElement("cameraToggleBtn"),
            createRoomBtn: BingerOverlayDOM.getElement("createRoomBtn"),
            joinRoomBtn: BingerOverlayDOM.getElement("joinRoomBtn"),
            currentUser: BingerState.getCurrentUser(),
            checkWatchTogetherEligibility: BingerRoom.checkWatchTogetherEligibility
        };

        if (isInSession === true) {
            console.log("[Binger] Session started - activating session UI");
            // Call external session mode function
            if (typeof window.inSessionMode === "function") {
                window.inSessionMode(context);
            }
        } else {
            console.log("[Binger] Session ended - restoring normal UI");
            // Call external out session mode function
            if (typeof window.outSessionMode === "function") {
                window.outSessionMode(context);
            }
        }
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the message router
     */
    function initMessageRouter() {
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerMessageRouter = {
        initMessageRouter
    };

})();