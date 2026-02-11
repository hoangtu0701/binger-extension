(function() {
    "use strict";

    let typingTimeout = null;
    let isInitialLoad = true;
    let chatObserver = null;
    let listenersAttached = false;
    let cachedUid = null;

    function escapeHtml(text) {
        if (typeof text !== "string") return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    function toggleBotMode() {
        const isActive = !BingerState.getIsBotMode();
        BingerState.setIsBotMode(isActive);

        const botToggle = BingerOverlayDOM.getElement("botToggle");
        const chatInput = BingerOverlayDOM.getElement("chatInput");

        if (botToggle) {
            botToggle.classList.toggle("active", isActive);
        }

        if (chatInput) {
            chatInput.placeholder = isActive ? "Ask Binger..." : "Type a message...";
            chatInput.focus();
        }

        BingerConnection.setLocal("bingerBotMode", isActive).catch(() => {});
    }

    function applyBotModeUI(isActive) {
        const botToggle = BingerOverlayDOM.getElement("botToggle");
        const chatInput = BingerOverlayDOM.getElement("chatInput");

        if (botToggle) {
            botToggle.classList.toggle("active", isActive);
        }

        if (chatInput) {
            chatInput.placeholder = isActive ? "Ask Binger..." : "Type a message...";
        }
    }

    function resetBotMode() {
        BingerState.setIsBotMode(false);
        applyBotModeUI(false);
        BingerConnection.removeLocal("bingerBotMode").catch(() => {});
    }

    function restoreBotMode() {
        BingerConnection.getLocal("bingerBotMode")
            .then((isActive) => {
                if (isActive) {
                    BingerState.setIsBotMode(true);
                    applyBotModeUI(true);
                }
            })
            .catch(() => {});
    }

    function handleTypingInput(roomId) {
        if (cachedUid) {
            sendTypingWithUid(roomId, cachedUid);
            return;
        }

        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((res) => {
                if (!res?.user) return;

                cachedUid = res.user.uid;
                sendTypingWithUid(roomId, cachedUid);
            })
            .catch((err) => {
                console.error("[Binger] Auth check failed in typing handler:", err);
            });
    }

    function sendTypingWithUid(roomId, uid) {
        BingerConnection.sendMessageAsync({
            command: "iAmTyping",
            roomId,
            uid
        });

        if (typingTimeout) clearTimeout(typingTimeout);

        typingTimeout = setTimeout(() => {
            BingerConnection.sendMessageAsync({
                command: "iStoppedTyping",
                roomId,
                uid
            });
        }, 1200);
    }

    function renderTypingBubbles(users) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        if (!Array.isArray(users)) {
            users = [];
        }

        const currentUid = BingerState.getCurrentUserUid();
        const incomingUids = new Set(users.map(u => u?.uid).filter(Boolean));

        document.querySelectorAll(".bingerTypingBubble").forEach((el) => {
            const uid = el.id.replace("typing-", "");
            if (!incomingUids.has(uid)) {
                el.classList.add("fade-out");
                setTimeout(() => el.remove(), 300);
            }
        });

        users.forEach((user) => {
            if (!user || typeof user !== "object") return;

            const { uid, username } = user;
            if (!uid) return;

            if (currentUid === uid) return;

            const existing = document.getElementById(`typing-${uid}`);
            if (!existing) {
                const bubble = document.createElement("div");
                bubble.className = "bingerTypingBubble";
                bubble.id = `typing-${uid}`;

                const safeUsername = escapeHtml(username || "Someone");

                if (uid === "BINGER_BOT_SEEK") {
                    const variants = [
                        `${safeUsername} is seeking...`,
                        `${safeUsername} is moving to the scene...`,
                        `${safeUsername} is finding the moment...`,
                        `${safeUsername} is scrubbing the timeline...`,
                        `${safeUsername} is skipping the boring parts...`,
                        `${safeUsername} is teleporting to the scene...`,
                        `${safeUsername} is spinning the film wheel...`,
                        `${safeUsername} is loading up the drama...`,
                        `${safeUsername} is shuffling scenes...`
                    ];
                    bubble.textContent = variants[Math.floor(Math.random() * variants.length)];
                } else {
                    bubble.textContent = `${safeUsername} is typing...`;
                }

                const overlay = BingerOverlayDOM.getElement("overlay");
                if (overlay?.classList.contains("in-session")) {
                    bubble.classList.add("session-mode");
                }

                chatLog.appendChild(bubble);
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        });
    }

    function sendMessage(roomId, messageText) {
        if (typeof messageText !== "string" || !messageText.trim()) return;

        const trimmedText = messageText.trim();
        const chatInput = BingerOverlayDOM.getElement("chatInput");

        const isBotQuery = BingerState.getIsBotMode();

        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((response) => {
                if (!response?.user) {
                    alert("Not signed in.");
                    return;
                }

                const email = response.user.email || "";
                const sender = email.split("@")[0] || "anonymous";

                const msgData = {
                    sender: sender,
                    text: trimmedText,
                    timestamp: Date.now()
                };

                if (isBotQuery) {
                    msgData.type = "botQuery";
                }

                BingerConnection.sendMessage({
                    command: "post",
                    path: `rooms/${roomId}/messages`,
                    data: msgData
                })
                    .then((res) => {
                        if (res?.status === "success") {
                            if (chatInput) chatInput.value = "";
                            updateSendBtnState();

                            if (isBotQuery) {
                                const movieContext = BingerHelpers.scrapeMovieContext();

                                BingerConnection.sendMessageAsync({
                                    command: "botQuery",
                                    prompt: trimmedText,
                                    movieContext
                                });
                            }
                        } else {
                            console.error("[Binger] Failed to send message:", res?.error);
                        }
                    })
                    .catch((err) => {
                        console.error("[Binger] Message send error:", err);
                    });

                BingerConnection.sendMessageAsync({
                    command: "iStoppedTyping",
                    roomId,
                    uid: response.user.uid
                });
            })
            .catch((err) => {
                console.error("[Binger] Auth check failed in sendMessage:", err);
            });
    }

    function renderMessage(message) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        if (!message || typeof message !== "object") {
            console.warn("[Binger] Invalid message object received");
            return;
        }

        const { sender, text, timestamp, type, movieUrl } = message;

        if (type === "invite" && movieUrl) {
            return;
        }

        if (typeof text !== "string") {
            console.warn("[Binger] Message missing text field");
            return;
        }

        const time = BingerHelpers.formatTime(timestamp);
        const safeSender = sender || "anonymous";

        const messageEl = document.createElement("div");
        messageEl.className = "bingerChatMsg";

        const currentUsername = BingerState.getCurrentUsername();
        if (currentUsername && safeSender === currentUsername) {
            messageEl.classList.add("msg-own");
        } else {
            messageEl.classList.add("msg-other");
        }

        if (type === "botQuery") {
            messageEl.classList.add("bot-query");
        } else if (type === "bot") {
            messageEl.classList.add("bot-reply");
        }

        if (isInitialLoad) {
            messageEl.classList.add("no-entrance");
        }

        messageEl.classList.add("paused");

        const senderEl = document.createElement("strong");
        senderEl.textContent = safeSender;

        const timeEl = document.createElement("span");
        timeEl.textContent = ` [${time}]: `;

        const textEl = document.createElement("span");
        textEl.textContent = text;

        messageEl.appendChild(senderEl);
        messageEl.appendChild(timeEl);
        messageEl.appendChild(textEl);

        chatLog.appendChild(messageEl);
        chatLog.scrollTop = chatLog.scrollHeight;

        if (chatObserver) {
            chatObserver.observe(messageEl);
        }

        if (!isInitialLoad) {
            BingerTheme.spawnLeaves(messageEl);
        }
    }

    function setupChatObserver() {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        if (chatObserver) {
            chatObserver.disconnect();
        }

        chatObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.remove("paused");
                } else {
                    entry.target.classList.add("paused");
                }
            });
        }, {
            root: chatLog,
            threshold: 0
        });
    }

    function cleanupChatObserver() {
        if (chatObserver) {
            chatObserver.disconnect();
            chatObserver = null;
        }
    }

    function renderSystemNotification(notificationType, username) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        if (typeof notificationType !== "string" || typeof username !== "string") {
            return;
        }

        let text = "";
        if (notificationType === "join") {
            text = `${escapeHtml(username)} joined the room`;
        } else if (notificationType === "leave") {
            text = `${escapeHtml(username)} left the room`;
        } else {
            return;
        }

        const notificationEl = document.createElement("div");
        notificationEl.className = "bingerSystemNotification";
        notificationEl.textContent = text;

        chatLog.appendChild(notificationEl);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    let boundKeydownHandler = null;
    let boundInputHandler = null;
    let boundClickHandler = null;
    let boundBotToggleHandler = null;

    function updateSendBtnState() {
        const chatInput = BingerOverlayDOM.getElement("chatInput");
        const sendBtn = BingerOverlayDOM.getElement("sendBtn");
        if (!chatInput || !sendBtn) return;
        sendBtn.disabled = !chatInput.value.trim();
    }

    function setupChatInputListeners(roomId) {
        const chatInput = BingerOverlayDOM.getElement("chatInput");
        const sendBtn = BingerOverlayDOM.getElement("sendBtn");

        if (!chatInput || !sendBtn) return;

        removeInputListeners();

        sendBtn.disabled = true;

        boundKeydownHandler = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendBtn.click();
            }
        };

        boundInputHandler = () => {
            handleTypingInput(roomId);
            updateSendBtnState();
        };

        boundClickHandler = () => {
            const messageText = chatInput.value.trim();
            sendMessage(roomId, messageText);
        };

        const botToggle = BingerOverlayDOM.getElement("botToggle");
        boundBotToggleHandler = () => toggleBotMode();

        chatInput.addEventListener("keydown", boundKeydownHandler);
        chatInput.addEventListener("input", boundInputHandler);
        sendBtn.addEventListener("click", boundClickHandler);
        if (botToggle) {
            botToggle.addEventListener("click", boundBotToggleHandler);
        }

        listenersAttached = true;
    }

    function removeInputListeners() {
        const chatInput = BingerOverlayDOM.getElement("chatInput");
        const sendBtn = BingerOverlayDOM.getElement("sendBtn");
        const botToggle = BingerOverlayDOM.getElement("botToggle");

        if (chatInput && boundKeydownHandler) {
            chatInput.removeEventListener("keydown", boundKeydownHandler);
        }
        if (chatInput && boundInputHandler) {
            chatInput.removeEventListener("input", boundInputHandler);
        }
        if (sendBtn && boundClickHandler) {
            sendBtn.removeEventListener("click", boundClickHandler);
        }
        if (botToggle && boundBotToggleHandler) {
            botToggle.removeEventListener("click", boundBotToggleHandler);
        }

        boundKeydownHandler = null;
        boundInputHandler = null;
        boundClickHandler = null;
        boundBotToggleHandler = null;
        listenersAttached = false;
    }

    function activateChatbox(roomId) {
        const elements = BingerOverlayDOM.getElements();

        if (!elements.chatWrapper || !elements.chatInput || !elements.sendBtn) {
            console.error("[Binger] Chatbox elements not found");
            return;
        }

        const botToggle = BingerOverlayDOM.getElement("botToggle");
        if (botToggle) {
            botToggle.disabled = false;
        }

        elements.chatWrapper.classList.remove("disabled");
        elements.chatInput.disabled = false;
        elements.sendBtn.disabled = false;
        elements.leaveRoomBtn.disabled = false;

        BingerOverlayDOM.setRoomIdDisplay(roomId);

        elements.chatLog.innerHTML = "";
        BingerOverlayDOM.setUserListDisplay(null);

        isInitialLoad = true;
        setupChatObserver();

        setTimeout(() => {
            isInitialLoad = false;
        }, 1500);

        BingerConnection.sendMessageAsync({
            command: "subscribeToUsers",
            roomId
        });

        setupChatInputListeners(roomId);

        if (!BingerState.getIsChatSubscribed()) {
            BingerConnection.sendMessageAsync({
                command: "subscribeToMessages",
                roomId
            });
            BingerState.setIsChatSubscribed(true);
        }

        BingerTheme.activateThemeListener(roomId);

        BingerConnection.sendMessageAsync({
            command: "subscribeToTyping",
            roomId
        });

        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((res) => {
                if (res?.user?.uid) {
                    cachedUid = res.user.uid;
                }
            })
            .catch(() => {});

        restoreBotMode();
    }

    function deactivateChatbox() {
        const elements = BingerOverlayDOM.getElements();

        if (!elements.chatWrapper || !elements.chatInput || !elements.sendBtn) {
            return;
        }

        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (roomId) {
                    BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId });
                    BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId });
                    BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId });
                    BingerConnection.sendMessageAsync({ command: "unsubscribeFromTheme", roomId });
                    BingerTheme.deactivateThemeListener();
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to get room ID for cleanup:", err);
            });

        elements.chatWrapper.classList.add("disabled");
        elements.chatInput.disabled = true;
        elements.sendBtn.disabled = true;
        elements.leaveRoomBtn.disabled = true;

        BingerOverlayDOM.setRoomIdDisplay(null);
        BingerOverlayDOM.setUserListDisplay(null);
        elements.chatLog.innerHTML = "Chat log will appear here";

        BingerState.setIsChatSubscribed(false);

        cleanupChatObserver();
        removeInputListeners();
        resetBotMode();
        isInitialLoad = true;
        cachedUid = null;

        const botToggle = BingerOverlayDOM.getElement("botToggle");
        if (botToggle) {
            botToggle.disabled = true;
        }

        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
        }
    }

    window.BingerChatbox = {
        activateChatbox,
        deactivateChatbox,

        sendMessage,
        renderMessage,

        renderSystemNotification,

        renderTypingBubbles,

        resetBotMode
    };

})();