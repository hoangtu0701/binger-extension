(function() {
    "use strict";

    let roomButtonsInitialized = false;
    let pendingJoinRoomId = null;

    const BUBBLE_ERROR_MS = 700;
    const BUBBLE_SWAP_MS = 190;

    function showRoomLoader() {
        const loader = BingerOverlayDOM.getElement("roomLoader");
        if (loader) loader.hidden = false;
    }

    function hideRoomLoader() {
        const loader = BingerOverlayDOM.getElement("roomLoader");
        if (loader) loader.hidden = true;
    }

    function unsubscribeFromAllListeners(roomId) {
        if (!roomId) return;

        BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromTheme", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromActiveInvite", roomId });
        BingerConnection.sendMessageAsync({ command: "stopInSessionListener", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromPrivacy", roomId });

        BingerTheme.deactivateThemeListener();
    }

    function leaveRoomAndCleanup(callback = () => {}) {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) {
                    callback();
                    return;
                }

                return BingerConnection.sendMessage({ command: "leaveRoom", roomId })
                    .then(() => {
                        unsubscribeFromAllListeners(roomId);
                        return BingerConnection.clearCurrentRoomId();
                    })
                    .then(() => {
                        callback();
                    });
            })
            .catch((err) => {
                console.error("[Binger] leaveRoomAndCleanup error:", err);
                callback();
            });
    }

    function leaveOldRoom(oldRoomId) {
        if (!oldRoomId) {
            return Promise.resolve();
        }

        return BingerConnection.sendMessage({ command: "leaveRoom", roomId: oldRoomId })
            .then(() => {
                unsubscribeFromAllListeners(oldRoomId);
                return BingerConnection.clearCurrentRoomId();
            })
            .catch((err) => {
                console.warn("[Binger] Error leaving old room:", err);
                return BingerConnection.clearCurrentRoomId();
            });
    }

    function createRoom() {
        showRoomLoader();

        BingerConnection.getCurrentRoomId()
            .then((oldRoomId) => {
                return leaveOldRoom(oldRoomId).then(() => oldRoomId);
            })
            .then((oldRoomId) => {
                return BingerConnection.sendMessage({ command: "createRoom" })
                    .then((response) => {
                        if (response?.status !== "success") {
                            console.error("[Binger] Failed to create room:", response?.error);
                            hideRoomLoader();
                            alert("Failed to create room: " + (response?.error || "Unknown error"));
                            return null;
                        }
                        return { roomId: response.roomId, oldRoomId };
                    });
            })
            .then((data) => {
                if (!data) return;

                const { roomId, oldRoomId } = data;

                return BingerConnection.sendMessage({ command: "joinRoom", roomId })
                    .then((joinResponse) => {
                        if (joinResponse?.status !== "success") {
                            hideRoomLoader();
                            alert("Failed to join new room: " + (joinResponse?.error || "Unknown error"));
                            return;
                        }

                        return Promise.all([
                            BingerConnection.setCurrentRoomId(roomId),
                            BingerConnection.setLocal("bingerSwitchingFromRoom", oldRoomId)
                        ]).then(() => {
                            BingerNavigation.reloadWithFlag();
                        });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error creating room:", err);
                hideRoomLoader();
                alert("Failed to create room. Please try again.");
            });
    }

    function joinRoom(newRoomId, password) {
        if (!BingerHelpers.isValidRoomCode(newRoomId)) {
            flashBubbleError();
            return;
        }

        showRoomLoader();

        BingerConnection.getCurrentRoomId()
            .then((oldRoomId) => {
                const payload = { command: "joinRoom", roomId: newRoomId };

                if (typeof password === "string" && password !== "") {
                    payload.password = password;
                }

                return BingerConnection.sendMessage(payload)
                    .then((response) => {
                        if (response?.status !== "success") {
                            hideRoomLoader();
                            flashBubbleError();
                            return;
                        }

                        closeJoinBubble();
                        unsubscribeFromAllListeners(oldRoomId);

                        return Promise.all([
                            BingerConnection.setCurrentRoomId(newRoomId),
                            BingerConnection.setLocal("bingerSwitchingFromRoom", oldRoomId)
                        ]).then(() => {
                            BingerNavigation.reloadWithFlag();
                        });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error joining room:", err);
                hideRoomLoader();
                flashBubbleError();
            });
    }

    function setBubbleCodeMode() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const input = BingerOverlayDOM.getElement("joinBubbleInput");

        pendingJoinRoomId = null;

        if (bubble) {
            bubble.classList.remove("binger-bubble-password", "binger-bubble-error", "binger-bubble-collapsing");
        }

        if (input) {
            input.value = "";
            input.maxLength = 6;
            input.placeholder = "Room No.";
        }
    }

    function setBubblePasswordMode(roomId) {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const input = BingerOverlayDOM.getElement("joinBubbleInput");
        if (!bubble || !input) return;

        pendingJoinRoomId = roomId;

        bubble.classList.add("binger-bubble-collapsing");

        setTimeout(() => {
            input.value = "";
            input.maxLength = 4;
            input.placeholder = "Password";
            bubble.classList.add("binger-bubble-password");
            bubble.classList.remove("binger-bubble-collapsing");
            requestAnimationFrame(() => input.focus());
        }, BUBBLE_SWAP_MS);
    }

    function flashBubbleError() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const input = BingerOverlayDOM.getElement("joinBubbleInput");

        if (!bubble || !input) return;

        input.value = "";

        bubble.classList.remove("binger-bubble-error");
        void input.offsetWidth;
        bubble.classList.add("binger-bubble-error");

        setTimeout(() => {
            bubble.classList.remove("binger-bubble-error");
        }, BUBBLE_ERROR_MS);

        input.focus();
    }

    function toggleJoinBubble() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        if (!bubble) return;

        const isVisible = bubble.style.display === "block";
        if (isVisible) {
            closeJoinBubble();
        } else {
            openJoinBubble();
        }
    }

    function openJoinBubble() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const input = BingerOverlayDOM.getElement("joinBubbleInput");
        if (!bubble || !input) return;

        setBubbleCodeMode();
        bubble.style.display = "block";

        requestAnimationFrame(() => input.focus());

        document.addEventListener("mousedown", handleBubbleOutsideClick, true);
    }

    function closeJoinBubble() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        if (!bubble) return;

        bubble.style.display = "none";
        setBubbleCodeMode();

        document.removeEventListener("mousedown", handleBubbleOutsideClick, true);
    }

    function handleBubbleOutsideClick(e) {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const joinBtn = BingerOverlayDOM.getElement("joinRoomBtn");

        if (!bubble) return;

        if (!bubble.contains(e.target) && e.target !== joinBtn) {
            closeJoinBubble();
        }
    }

    function handleBubbleKeydown(e) {
        if (e.key === "Escape") {
            closeJoinBubble();
            return;
        }

        if (e.key !== "Enter") return;

        const input = BingerOverlayDOM.getElement("joinBubbleInput");
        if (!input) return;

        const value = input.value.trim();
        if (!value) return;

        if (pendingJoinRoomId) {
            joinRoom(pendingJoinRoomId, value);
            return;
        }

        if (!BingerHelpers.isValidRoomCode(value)) {
            flashBubbleError();
            return;
        }

        BingerConnection.sendMessage({ command: "checkRoomPrivacy", roomId: value })
            .then((res) => {
                if (res?.status !== "success") {
                    flashBubbleError();
                    return;
                }

                if (res.isPrivate === true) {
                    setBubblePasswordMode(value);
                    return;
                }

                joinRoom(value);
            })
            .catch((err) => {
                console.error("[Binger] Error checking room privacy:", err);
                flashBubbleError();
            });
    }

    function leaveRoom() {
        showRoomLoader();

        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) return;

                return BingerConnection.sendMessage({ command: "leaveRoom", roomId })
                    .then((response) => {
                        if (response?.status !== "success") {
                            hideRoomLoader();
                            alert("Failed to leave room: " + (response?.error || "Unknown error"));
                            return;
                        }

                        unsubscribeFromAllListeners(roomId);

                        return BingerConnection.clearCurrentRoomId()
                            .then(() => {
                                BingerChatbox.deactivateChatbox();
                                BingerNavigation.reloadWithFlag();
                            });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error leaving room:", err);
                hideRoomLoader();
                alert("Failed to leave room. Please try again.");
            });
    }

    function attemptRejoin(roomId) {
        if (!roomId || typeof roomId !== "string") {
            return Promise.resolve(false);
        }

        return BingerConnection.sendMessage({
            command: "rejoinIfRecentlyKicked",
            roomId
        })
            .then((res) => {
                if (res?.status === "rejoined") {
                    BingerChatbox.activateChatbox(roomId);
                    BingerTheme.activateThemeListener(roomId);
                    checkWatchTogetherEligibility();

                    BingerConnection.sendMessageAsync({
                        command: "subscribeToActiveInvite",
                        roomId
                    });

                    BingerConnection.sendMessageAsync({
                        command: "startInSessionListener",
                        roomId
                    });

                    return true;
                } else {
                    return BingerConnection.clearCurrentRoomId()
                        .then(() => {
                            BingerChatbox.deactivateChatbox();
                            return false;
                        });
                }
            })
            .catch((err) => {
                console.error("[Binger] Error attempting rejoin:", err);
                return BingerConnection.clearCurrentRoomId()
                    .then(() => {
                        BingerChatbox.deactivateChatbox();
                        return false;
                    })
                    .catch(() => false);
            });
    }

    function checkWatchTogetherEligibility() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        const isInviteActive = watchTogetherBtn.classList.contains("binge-inviter-active")
            || watchTogetherBtn.classList.contains("binge-invitee-active")
            || watchTogetherBtn.classList.contains("binge-invitee-accepted");

        if (isInviteActive) return;

        const isSignedIn = BingerState.isSignedIn();
        const isInWatchPage = BingerHelpers.isOnWatchPage();
        const enoughPeople = BingerState.hasEnoughUsers();

        const shouldEnable = isSignedIn && isInWatchPage && enoughPeople;
        watchTogetherBtn.disabled = !shouldEnable;
    }

    function setupRoomButtons() {
        if (roomButtonsInitialized) return;

        const elements = BingerOverlayDOM.getElements();

        if (elements?.createRoomBtn) {
            elements.createRoomBtn.addEventListener("click", createRoom);
        }

        if (elements?.joinRoomBtn) {
            elements.joinRoomBtn.addEventListener("click", toggleJoinBubble);
        }

        if (elements?.joinBubbleInput) {
            elements.joinBubbleInput.addEventListener("keydown", handleBubbleKeydown);
        }

        if (elements?.leaveRoomBtn) {
            elements.leaveRoomBtn.addEventListener("click", leaveRoom);
        }

        roomButtonsInitialized = true;
    }

    window.BingerRoom = {
        createRoom,
        joinRoom,
        toggleJoinBubble,
        closeJoinBubble,
        leaveRoom,

        leaveRoomAndCleanup,
        leaveOldRoom,

        attemptRejoin,

        checkWatchTogetherEligibility,

        setupRoomButtons
    };

})();