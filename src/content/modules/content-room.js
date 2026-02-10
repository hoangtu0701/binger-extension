(function() {
    "use strict";

    let roomButtonsInitialized = false;

    function unsubscribeFromAllListeners(roomId) {
        if (!roomId) return;

        BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromTheme", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromActiveInvite", roomId });
        BingerConnection.sendMessageAsync({ command: "stopInSessionListener", roomId });

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
        BingerConnection.getCurrentRoomId()
            .then((oldRoomId) => {
                return leaveOldRoom(oldRoomId).then(() => oldRoomId);
            })
            .then((oldRoomId) => {
                return BingerConnection.sendMessage({ command: "createRoom" })
                    .then((response) => {
                        if (response?.status !== "success") {
                            console.error("[Binger] Failed to create room:", response?.error);
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
                alert("Failed to create room. Please try again.");
            });
    }

    function joinRoom(newRoomId) {
        if (!BingerHelpers.isValidRoomCode(newRoomId)) {
            alert("Please enter a valid 6-digit room code.");
            return;
        }

        BingerConnection.getCurrentRoomId()
            .then((oldRoomId) => {
                return leaveOldRoom(oldRoomId).then(() => oldRoomId);
            })
            .then((oldRoomId) => {
                return BingerConnection.sendMessage({ command: "joinRoom", roomId: newRoomId })
                    .then((response) => {
                        if (response?.status !== "success") {
                            alert(`Failed to join room: ${response?.error || "Unknown error"}`);
                            return;
                        }

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
                alert("Failed to join room. Please try again.");
            });
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

        input.value = "";
        bubble.style.display = "block";

        requestAnimationFrame(() => input.focus());

        document.addEventListener("mousedown", handleBubbleOutsideClick, true);
    }

    function closeJoinBubble() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const input = BingerOverlayDOM.getElement("joinBubbleInput");
        if (!bubble) return;

        bubble.style.display = "none";
        if (input) input.value = "";

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
        if (e.key === "Enter") {
            const input = BingerOverlayDOM.getElement("joinBubbleInput");
            if (!input) return;

            const code = input.value.trim();
            if (!code) return;

            closeJoinBubble();
            joinRoom(code);
        }

        if (e.key === "Escape") {
            closeJoinBubble();
        }
    }

    function leaveRoom() {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) return;

                return BingerConnection.sendMessage({ command: "leaveRoom", roomId })
                    .then((response) => {
                        if (response?.status !== "success") {
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