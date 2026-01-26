// ============================================================================
// MESSAGE ROUTER MODULE
// Handles all incoming messages from background.js
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // STATE
    // ========================================================================

    // Track if message router is initialized (prevents duplicate listeners)
    let messageRouterInitialized = false;

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
        // Validate message object
        if (!msg || typeof msg !== "object") {
            return;
        }

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
                if (msg.message) {
                    BingerChatbox.renderMessage(msg.message);
                }
                break;

            // ================================================================
            // USER NOTIFICATIONS (join/leave)
            // ================================================================

            case "userNotification":
                if (msg.notificationType && msg.username) {
                    BingerChatbox.renderSystemNotification(msg.notificationType, msg.username);
                }
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
                // Log unknown commands for debugging
                if (msg.command) {
                    console.log("[Binger] Unknown content message command:", msg.command);
                }
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
        const movieUrl = msg?.movieUrl;

        // Validate movieUrl
        if (!movieUrl || typeof movieUrl !== "string") {
            console.error("[Binger] startSession missing valid movieUrl");
            return;
        }

        // Store pending URL and navigate
        BingerConnection.setLocal("pendingMovieUrl", movieUrl)
            .then(() => {
                console.log("[Binger] Stored pendingMovieUrl, navigating...");
                BingerNavigation.navigateWithFlag(movieUrl);
            })
            .catch((err) => {
                console.error("[Binger] Failed to store pendingMovieUrl:", err);
            });

        // Attach inSession listener
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) {
                    console.error("[Binger] No room ID found, cannot attach inSession listener.");
                    return;
                }

                return BingerConnection.sendMessage({
                    command: "startInSessionListener",
                    roomId
                }).then((response) => {
                    if (response?.status === "attached") {
                        console.log("[Binger] Listener attached successfully");
                    } else {
                        console.warn("[Binger] Listener may not have attached correctly:", response);
                    }
                });
            })
            .catch((err) => {
                console.error("[Binger] Failed to attach inSession listener:", err);
            });
    }

    /**
     * Handle inSessionUpdated command
     * @param {object} msg - The message with isInSession boolean
     */
    function handleInSessionUpdated(msg) {
        const isInSession = msg?.isInSession;

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
            // Call session module directly
            if (typeof BingerSession !== "undefined" && BingerSession.inSessionMode) {
                BingerSession.inSessionMode(context);
            }
        } else {
            console.log("[Binger] Session ended - restoring normal UI");
            // Call session module directly
            if (typeof BingerSession !== "undefined" && BingerSession.outSessionMode) {
                BingerSession.outSessionMode(context);
            }
        }
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the message router
     * Only attaches listener once to prevent duplicates
     */
    function initMessageRouter() {
        if (messageRouterInitialized) {
            console.log("[Binger] Message router already initialized - skipping");
            return;
        }

        chrome.runtime.onMessage.addListener(handleMessage);
        messageRouterInitialized = true;
        console.log("[Binger] Message router initialized");
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerMessageRouter = {
        initMessageRouter
    };

})();