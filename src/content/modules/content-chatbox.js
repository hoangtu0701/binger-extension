// ============================================================================
// CHATBOX MODULE
// Handles chat activation, messages, typing indicators
// ============================================================================

(function() {
    "use strict";

    // Typing timeout reference
    let typingTimeout = null;
    
    // Track if initial message load is complete
    let isInitialLoad = true;
    
    // Intersection observer for chat messages
    let chatObserver = null;

    // ========================================================================
    // MENTION PILL
    // ========================================================================

    /**
     * Create the @binger mention pill element
     * @returns {HTMLElement}
     */
    function createMentionPill() {
        const pill = document.createElement("span");
        pill.id = "bingerMentionPill";
        pill.textContent = "@binger";
        Object.assign(pill.style, {
            display: "none",
            alignSelf: "center",
            padding: "2px 8px",
            marginRight: "6px",
            borderRadius: "9999px",
            fontSize: "12px",
            fontWeight: "600",
            fontFamily: "Figtree, system-ui, sans-serif",
            background: "#ffe58f",
            color: "#7a4d00",
            border: "1px solid #ffd666",
            whiteSpace: "nowrap"
        });
        return pill;
    }

    /**
     * Setup mention pill in chat input bar
     */
    function setupMentionPill() {
        const inputBar = BingerOverlayDOM.getElement("chatInputBar");
        const chatInput = BingerOverlayDOM.getElement("chatInput");

        if (!inputBar || !chatInput) return;

        // Only create if doesn't exist
        let mentionPill = document.getElementById("bingerMentionPill");
        if (!mentionPill) {
            mentionPill = createMentionPill();
            inputBar.insertBefore(mentionPill, chatInput);
        }
    }

    /**
     * Update mention pill visibility based on input
     * @param {string} inputValue - Current input value
     */
    function updateMentionPill(inputValue) {
        const pill = document.getElementById("bingerMentionPill");
        if (pill) {
            pill.style.display = /^@binger/.test(inputValue) ? "inline-flex" : "none";
        }
    }

    /**
     * Hide the mention pill
     */
    function hideMentionPill() {
        const pill = document.getElementById("bingerMentionPill");
        if (pill) {
            pill.style.display = "none";
        }
    }

    // ========================================================================
    // TYPING INDICATORS
    // ========================================================================

    /**
     * Send typing status to background
     * @param {string} roomId - The room ID
     * @param {boolean} isTyping - Whether user is typing
     */
    function sendTypingStatus(roomId, isTyping) {
        BingerConnection.sendMessage({ command: "checkAuth" }).then((res) => {
            if (!res?.user) return;

            const uid = res.user.uid;
            const command = isTyping ? "iAmTyping" : "iStoppedTyping";

            BingerConnection.sendMessageAsync({
                command,
                roomId,
                uid
            });
        });
    }

    /**
     * Handle input change for typing indicator
     * @param {string} roomId - The room ID
     */
    function handleTypingInput(roomId) {
        // Send typing status
        BingerConnection.sendMessage({ command: "checkAuth" }).then((res) => {
            if (!res?.user) return;

            const uid = res.user.uid;

            BingerConnection.sendMessageAsync({
                command: "iAmTyping",
                roomId,
                uid
            });

            // Clear existing timeout
            if (typingTimeout) clearTimeout(typingTimeout);

            // Set timeout to stop typing
            typingTimeout = setTimeout(() => {
                BingerConnection.sendMessageAsync({
                    command: "iStoppedTyping",
                    roomId,
                    uid
                });
            }, 1200);
        });
    }

    /**
     * Render typing bubbles in chat log
     * @param {Array} users - Array of {uid, username} objects
     */
    function renderTypingBubbles(users) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        const currentUid = BingerState.getCurrentUserUid();
        const incomingUids = new Set(users.map(u => u.uid));

        // Remove bubbles for users who stopped typing
        document.querySelectorAll(".bingerTypingBubble").forEach((el) => {
            const uid = el.id.replace("typing-", "");
            if (!incomingUids.has(uid)) {
                el.classList.add("fade-out");
                setTimeout(() => el.remove(), 300);
            }
        });

        // Add bubbles for users who are typing
        users.forEach(({ uid, username }) => {
            // Don't show own typing bubble
            if (currentUid === uid) return;

            const existing = document.getElementById(`typing-${uid}`);
            if (!existing) {
                const bubble = document.createElement("div");
                bubble.className = "bingerTypingBubble";
                bubble.id = `typing-${uid}`;

                // Special messages for Binger Bot seek
                if (uid === "BINGER_BOT_SEEK") {
                    const variants = [
                        `${username} is seeking...`,
                        `${username} is moving to the scene...`,
                        `${username} is finding the moment...`,
                        `${username} is scrubbing the timeline...`,
                        `${username} is skipping the boring parts...`,
                        `${username} is teleporting to the scene...`,
                        `${username} is spinning the film wheel...`,
                        `${username} is loading up the drama...`,
                        `${username} is shuffling scenes...`
                    ];
                    bubble.textContent = variants[Math.floor(Math.random() * variants.length)];
                } else {
                    bubble.textContent = `${username} is typing...`;
                }

                // Add session mode class if in session
                const overlay = BingerOverlayDOM.getElement("overlay");
                if (overlay?.classList.contains("in-session")) {
                    bubble.classList.add("session-mode");
                }

                chatLog.appendChild(bubble);
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        });
    }

    // ========================================================================
    // MESSAGE SENDING
    // ========================================================================

    /**
     * Send a chat message
     * @param {string} roomId - The room ID
     * @param {string} messageText - The message text
     */
    function sendMessage(roomId, messageText) {
        if (!messageText) return;

        const chatInput = BingerOverlayDOM.getElement("chatInput");

        // Intercept @binger queries
        if (messageText.startsWith("@binger")) {
            const question = messageText.replace("@binger", "").trim();
            const movieContext = BingerHelpers.scrapeMovieContext();

            // Fire-and-forget to background
            BingerConnection.sendMessageAsync({
                command: "botQuery",
                prompt: question,
                movieContext
            });
        }

        // Get current user and send message
        BingerConnection.sendMessage({ command: "checkAuth" }).then((response) => {
            if (!response?.user) {
                alert("Not signed in.");
                return;
            }

            const msgData = {
                sender: response.user.email.split("@")[0],
                text: messageText,
                timestamp: Date.now()
            };

            BingerConnection.sendMessage({
                command: "post",
                path: `rooms/${roomId}/messages`,
                data: msgData
            }).then((res) => {
                if (res?.status === "success") {
                    console.log("[Binger] Message sent:", msgData);
                    if (chatInput) chatInput.value = "";
                    hideMentionPill();
                } else {
                    console.error("[Binger] Failed to send message:", res?.error);
                }
            });

            // Immediately clear typing state
            BingerConnection.sendMessageAsync({
                command: "iStoppedTyping",
                roomId,
                uid: response.user.uid
            });
        });
    }

    // ========================================================================
    // MESSAGE RENDERING
    // ========================================================================

    /**
     * Render a new chat message
     * @param {object} message - The message object {sender, text, timestamp, type, movieUrl}
     */
    function renderMessage(message) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        const { sender, text, timestamp, type, movieUrl } = message;

        // Skip invite-type messages (handled elsewhere)
        if (type === "invite" && movieUrl) {
            return;
        }

        const time = BingerHelpers.formatTime(timestamp);

        const messageEl = document.createElement("div");
        messageEl.className = "bingerChatMsg";
        
        // Old messages (from initial load) skip entrance animation
        if (isInitialLoad) {
            messageEl.classList.add("no-entrance");
        }
        
        // Start paused until observed as visible
        messageEl.classList.add("paused");
        
        messageEl.innerHTML = `<strong>${sender}</strong> [${time}]: ${text}`;

        chatLog.appendChild(messageEl);
        chatLog.scrollTop = chatLog.scrollHeight;

        // Observe for visibility
        if (chatObserver) {
            chatObserver.observe(messageEl);
        }

        // Spawn leaves if forest theme (only for new messages)
        if (!isInitialLoad) {
            BingerTheme.spawnLeaves(messageEl);
        }
    }

    // ========================================================================
    // VISIBILITY OBSERVER
    // ========================================================================

    /**
     * Setup intersection observer for chat messages
     * Only visible messages get animations
     */
    function setupChatObserver() {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;
        
        // Clean up old observer
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

    /**
     * Cleanup the chat observer
     */
    function cleanupChatObserver() {
        if (chatObserver) {
            chatObserver.disconnect();
            chatObserver = null;
        }
    }

    // ========================================================================
    // SYSTEM NOTIFICATION RENDERING
    // ========================================================================

    /**
     * Render a system notification (join/leave events)
     * @param {string} notificationType - "join" or "leave"
     * @param {string} username - The username involved
     */
    function renderSystemNotification(notificationType, username) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        // Build notification text
        let text = "";
        if (notificationType === "join") {
            text = `${username} joined the room`;
        } else if (notificationType === "leave") {
            text = `${username} left the room`;
        } else {
            return;
        }

        // Create notification element
        const notificationEl = document.createElement("div");
        notificationEl.className = "bingerSystemNotification";
        notificationEl.textContent = text;

        // Append to chat log and scroll
        chatLog.appendChild(notificationEl);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    // ========================================================================
    // CHATBOX ACTIVATION
    // ========================================================================

    /**
     * Setup chat input event listeners
     * @param {string} roomId - The room ID
     */
    function setupChatInputListeners(roomId) {
        const chatInput = BingerOverlayDOM.getElement("chatInput");
        const sendBtn = BingerOverlayDOM.getElement("sendBtn");

        if (!chatInput || !sendBtn) return;

        // Enter key sends message
        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendBtn.click();
            }
        });

        // Input change updates mention pill and typing status
        chatInput.addEventListener("input", () => {
            updateMentionPill(chatInput.value);
            handleTypingInput(roomId);
        });

        // Send button click
        sendBtn.addEventListener("click", () => {
            const messageText = chatInput.value.trim();
            sendMessage(roomId, messageText);
        });
    }

    /**
     * Activate the chatbox for a room
     * @param {string} roomId - The room ID to activate for
     */
    function activateChatbox(roomId) {
        const elements = BingerOverlayDOM.getElements();

        if (!elements.chatWrapper || !elements.chatInput || !elements.sendBtn) {
            console.error("[Binger] Chatbox elements not found");
            return;
        }

        // Setup mention pill
        setupMentionPill();

        // Enable UI
        elements.chatWrapper.classList.remove("disabled");
        elements.chatInput.disabled = false;
        elements.sendBtn.disabled = false;
        elements.leaveRoomBtn.disabled = false;

        // Show current room ID
        BingerOverlayDOM.setRoomIdDisplay(roomId);

        // Clear chat and user list
        elements.chatLog.innerHTML = "";
        BingerOverlayDOM.setUserListDisplay(null);
        
        // Reset initial load flag and setup observer
        isInitialLoad = true;
        setupChatObserver();
        setTimeout(() => { isInitialLoad = false; }, 1500);

        // Subscribe to users
        BingerConnection.sendMessageAsync({
            command: "subscribeToUsers",
            roomId
        });

        // Setup input listeners
        setupChatInputListeners(roomId);

        // Subscribe to messages if not already
        if (!BingerState.getIsChatSubscribed()) {
            BingerConnection.sendMessageAsync({
                command: "subscribeToMessages",
                roomId
            });
            BingerState.setIsChatSubscribed(true);
        }

        // Subscribe to room theme
        BingerTheme.activateThemeListener(roomId);

        // Subscribe to typing
        BingerConnection.sendMessageAsync({
            command: "subscribeToTyping",
            roomId
        });
    }

    /**
     * Deactivate the chatbox
     */
    function deactivateChatbox() {
        const elements = BingerOverlayDOM.getElements();

        if (!elements.chatWrapper || !elements.chatInput || !elements.sendBtn) {
            return;
        }

        // Unsubscribe from all listeners
        BingerConnection.getCurrentRoomId().then((roomId) => {
            if (roomId) {
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromTheme", roomId });
                BingerTheme.deactivateThemeListener();
            }
        });

        // Disable UI
        elements.chatWrapper.classList.add("disabled");
        elements.chatInput.disabled = true;
        elements.sendBtn.disabled = true;
        elements.leaveRoomBtn.disabled = true;

        // Reset displays
        BingerOverlayDOM.setRoomIdDisplay(null);
        BingerOverlayDOM.setUserListDisplay(null);
        elements.chatLog.innerHTML = "(Chat log will appear here)";

        // Reset subscription flag
        BingerState.setIsChatSubscribed(false);
        
        // Cleanup
        cleanupChatObserver();
        isInitialLoad = true;
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerChatbox = {
        // Activation
        activateChatbox,
        deactivateChatbox,

        // Messages
        sendMessage,
        renderMessage,

        // System notifications
        renderSystemNotification,

        // Typing
        renderTypingBubbles,

        // Mention pill
        hideMentionPill
    };

})();