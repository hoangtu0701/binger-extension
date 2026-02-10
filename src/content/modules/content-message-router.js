(function() {
    "use strict";

    let messageRouterInitialized = false;

    function handleMessage(msg, sender, sendResponse) {
        if (!msg || typeof msg !== "object") {
            return;
        }

        switch (msg.command) {
            case "showOverlay":
                handleShowOverlay(msg);
                break;

            case "hideOverlay":
                handleHideOverlay(sendResponse);
                return true;

            case "isOverlayShown":
                sendResponse({ overlay: BingerOverlayDOM.isOverlayVisible() });
                return true;

            case "updateUserList":
                handleUpdateUserList(msg);
                break;

            case "newChatMessage":
                if (msg.message) {
                    BingerChatbox.renderMessage(msg.message);
                }
                break;

            case "userNotification":
                if (msg.notificationType && msg.username) {
                    BingerChatbox.renderSystemNotification(msg.notificationType, msg.username);
                }
                break;

            case "typingStatusUpdated":
                BingerChatbox.renderTypingBubbles(msg.users);
                break;

            case "activeInviteUpdated":
                BingerInvite.handleInviteUpdate(msg.invite);
                break;

            case "startSession":
                handleStartSession(msg);
                break;

            case "inSessionUpdated":
                handleInSessionUpdated(msg);
                break;

            case "themeUpdated":
                BingerTheme.handleRoomThemeUpdate(msg.theme);
                break;

            case "showMultiTabWarning":
                BingerOverlayDOM.showMultiTabWarning();
                break;

            case "hideMultiTabWarning":
                BingerOverlayDOM.hideMultiTabWarning();
                break;

            default:
                break;
        }
    }

    function handleShowOverlay(msg) {
        BingerOverlayDOM.showOverlay();

        if (msg.username) {
            BingerOverlayDOM.setUsername(msg.username);
        }
    }

    function handleHideOverlay(sendResponse) {
        BingerOverlayDOM.hideOverlay();
        BingerOverlayDOM.hideMultiTabWarning();

        BingerRoom.leaveRoomAndCleanup(() => {
            BingerChatbox.deactivateChatbox();
            BingerTheme.deactivateThemeListener();
            sendResponse();
        });
    }

    function handleUpdateUserList(msg) {
        BingerState.setCurrentUsersInRoom(msg.users);
        BingerRoom.checkWatchTogetherEligibility();
        BingerOverlayDOM.setUserListDisplay(msg.users);
    }

    function handleStartSession(msg) {
        const movieUrl = msg?.movieUrl;

        if (!movieUrl || typeof movieUrl !== "string") {
            console.error("[Binger] startSession missing valid movieUrl");
            return;
        }

        BingerConnection.setLocal("pendingMovieUrl", movieUrl)
            .then(() => {
                BingerNavigation.navigateWithFlag(movieUrl);
            })
            .catch((err) => {
                console.error("[Binger] Failed to store pendingMovieUrl:", err);
            });

        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) {
                    console.error("[Binger] No room ID found, cannot attach inSession listener.");
                    return;
                }

                return BingerConnection.sendMessage({
                    command: "startInSessionListener",
                    roomId
                });
            })
            .catch((err) => {
                console.error("[Binger] Failed to attach inSession listener:", err);
            });
    }

    function handleInSessionUpdated(msg) {
        const isInSession = msg?.isInSession;

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
            if (typeof BingerSession !== "undefined" && BingerSession.inSessionMode) {
                BingerSession.inSessionMode(context);
            }
        } else {
            if (typeof BingerSession !== "undefined" && BingerSession.outSessionMode) {
                BingerSession.outSessionMode(context);
            }
        }
    }

    function initMessageRouter() {
        if (messageRouterInitialized) return;

        chrome.runtime.onMessage.addListener(handleMessage);
        messageRouterInitialized = true;
    }

    window.BingerMessageRouter = {
        initMessageRouter
    };

})();