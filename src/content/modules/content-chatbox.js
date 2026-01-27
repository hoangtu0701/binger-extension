// ============================================================================
// CHATBOX MODULE
// Handles chat activation, messages, typing indicators
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // MODULE STATE
    // ========================================================================

    // Typing timeout reference
    let typingTimeout = null;

    // Track if initial message load is complete
    let isInitialLoad = true;

    // Intersection observer for chat messages
    let chatObserver = null;

    // Track if event listeners are attached (prevents accumulation)
    let listenersAttached = false;

    // Cached user ID to avoid repeated auth checks on every keystroke
    let cachedUid = null;

    // ========================================================================
    // TEXT SANITIZATION
    // ========================================================================

    /**
     * Escape HTML special characters to prevent XSS
     * @param {string} text - Raw text to escape
     * @returns {string} Escaped text safe for display
     */
    function escapeHtml(text) {
        if (typeof text !== "string") return "";
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

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
            const shouldShow = typeof inputValue === "string" && /^@binger/.test(inputValue);
            pill.style.display = shouldShow ? "inline-flex" : "none";
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
     * Handle input change for typing indicator
     * Uses cached UID to avoid auth check on every keystroke
     * @param {string} roomId - The room ID
     */
    function handleTypingInput(roomId) {
        // If we have cached UID, use it directly
        if (cachedUid) {
            sendTypingWithUid(roomId, cachedUid);
            return;
        }

        // Otherwise fetch and cache
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

    /**
     * Send typing status with known UID
     * @param {string} roomId - The room ID
     * @param {string} uid - The user ID
     */
    function sendTypingWithUid(roomId, uid) {
        BingerConnection.sendMessageAsync({
            command: "iAmTyping",
            roomId,
            uid
        });

        // Clear existing timeout
        if (typingTimeout) clearTimeout(typingTimeout);

        // Set timeout to stop typing after 1.2 seconds of no input
        typingTimeout = setTimeout(() => {
            BingerConnection.sendMessageAsync({
                command: "iStoppedTyping",
                roomId,
                uid
            });
        }, 1200);
    }

    /**
     * Render typing bubbles in chat log
     * @param {Array} users - Array of {uid, username} objects
     */
    function renderTypingBubbles(users) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        // Validate input - default to empty array
        if (!Array.isArray(users)) {
            users = [];
        }

        const currentUid = BingerState.getCurrentUserUid();
        const incomingUids = new Set(users.map(u => u?.uid).filter(Boolean));

        // Remove bubbles for users who stopped typing
        document.querySelectorAll(".bingerTypingBubble").forEach((el) => {
            const uid = el.id.replace("typing-", "");
            if (!incomingUids.has(uid)) {
                el.classList.add("fade-out");
                setTimeout(() => el.remove(), 300);
            }
        });

        // Add bubbles for users who are typing
        users.forEach((user) => {
            // Validate user object
            if (!user || typeof user !== "object") return;

            const { uid, username } = user;
            if (!uid) return;

            // Don't show own typing bubble
            if (currentUid === uid) return;

            const existing = document.getElementById(`typing-${uid}`);
            if (!existing) {
                const bubble = document.createElement("div");
                bubble.className = "bingerTypingBubble";
                bubble.id = `typing-${uid}`;

                // Sanitize username for display
                const safeUsername = escapeHtml(username || "Someone");

                // Special messages for Binger Bot seek
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
        // Validate input
        if (typeof messageText !== "string" || !messageText.trim()) return;

        const trimmedText = messageText.trim();
        const chatInput = BingerOverlayDOM.getElement("chatInput");

        // Check if this is a bot query (will trigger AFTER message posts)
        const isBotQuery = trimmedText.startsWith("@binger");

        // Get current user and send message
        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((response) => {
                if (!response?.user) {
                    alert("Not signed in.");
                    return;
                }

                // Extract username safely
                const email = response.user.email || "";
                const sender = email.split("@")[0] || "anonymous";

                const msgData = {
                    sender: sender,
                    text: trimmedText,
                    timestamp: Date.now()
                };

                BingerConnection.sendMessage({
                    command: "post",
                    path: `rooms/${roomId}/messages`,
                    data: msgData
                })
                    .then((res) => {
                        if (res?.status === "success") {
                            console.log("[Binger] Message sent");
                            if (chatInput) chatInput.value = "";
                            hideMentionPill();

                            // Trigger bot query AFTER message is posted
                            // This ensures user message appears before typing indicator
                            if (isBotQuery) {
                                const question = trimmedText.replace("@binger", "").trim();
                                const movieContext = BingerHelpers.scrapeMovieContext();

                                BingerConnection.sendMessageAsync({
                                    command: "botQuery",
                                    prompt: question,
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

                // Immediately clear typing state
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

    // ========================================================================
    // MESSAGE RENDERING
    // ========================================================================

    /**
     * Render a new chat message
     * Uses textContent to prevent XSS attacks
     * @param {object} message - The message object {sender, text, timestamp, type, movieUrl}
     */
    function renderMessage(message) {
        const chatLog = BingerOverlayDOM.getElement("chatLog");
        if (!chatLog) return;

        // Validate message object
        if (!message || typeof message !== "object") {
            console.warn("[Binger] Invalid message object received");
            return;
        }

        const { sender, text, timestamp, type, movieUrl } = message;

        // Skip invite-type messages (handled elsewhere)
        if (type === "invite" && movieUrl) {
            return;
        }

        // Validate required fields
        if (typeof text !== "string") {
            console.warn("[Binger] Message missing text field");
            return;
        }

        const time = BingerHelpers.formatTime(timestamp);
        const safeSender = sender || "anonymous";

        // Build message element safely (no innerHTML with user content)
        const messageEl = document.createElement("div");
        messageEl.className = "bingerChatMsg";

        // Old messages (from initial load) skip entrance animation
        if (isInitialLoad) {
            messageEl.classList.add("no-entrance");
        }

        // Start paused until observed as visible
        messageEl.classList.add("paused");

        // Create child elements with textContent (XSS-safe)
        const senderEl = document.createElement("strong");
        senderEl.textContent = safeSender;

        const timeEl = document.createElement("span");
        timeEl.textContent = ` [${time}]: `;

        const textEl = document.createElement("span");
        textEl.textContent = text;

        // Assemble message
        messageEl.appendChild(senderEl);
        messageEl.appendChild(timeEl);
        messageEl.appendChild(textEl);

        chatLog.appendChild(messageEl);
        chatLog.scrollTop = chatLog.scrollHeight;

        // Observe for visibility (animation control)
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
     * Only visible messages get animations (performance optimization)
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

        // Validate inputs
        if (typeof notificationType !== "string" || typeof username !== "string") {
            return;
        }

        // Build notification text
        let text = "";
        if (notificationType === "join") {
            text = `${escapeHtml(username)} joined the room`;
        } else if (notificationType === "leave") {
            text = `${escapeHtml(username)} left the room`;
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

    // Store bound event handlers so we can remove them later
    let boundKeydownHandler = null;
    let boundInputHandler = null;
    let boundClickHandler = null;

    /**
     * Setup chat input event listeners
     * Only attaches once to prevent listener accumulation
     * @param {string} roomId - The room ID
     */
    function setupChatInputListeners(roomId) {
        const chatInput = BingerOverlayDOM.getElement("chatInput");
        const sendBtn = BingerOverlayDOM.getElement("sendBtn");

        if (!chatInput || !sendBtn) return;

        // Remove old listeners first if they exist
        removeInputListeners();

        // Create bound handlers
        boundKeydownHandler = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendBtn.click();
            }
        };

        boundInputHandler = () => {
            updateMentionPill(chatInput.value);
            handleTypingInput(roomId);
        };

        boundClickHandler = () => {
            const messageText = chatInput.value.trim();
            sendMessage(roomId, messageText);
        };

        // Attach listeners
        chatInput.addEventListener("keydown", boundKeydownHandler);
        chatInput.addEventListener("input", boundInputHandler);
        sendBtn.addEventListener("click", boundClickHandler);

        listenersAttached = true;
    }

    /**
     * Remove chat input event listeners
     */
    function removeInputListeners() {
        const chatInput = BingerOverlayDOM.getElement("chatInput");
        const sendBtn = BingerOverlayDOM.getElement("sendBtn");

        if (chatInput && boundKeydownHandler) {
            chatInput.removeEventListener("keydown", boundKeydownHandler);
        }
        if (chatInput && boundInputHandler) {
            chatInput.removeEventListener("input", boundInputHandler);
        }
        if (sendBtn && boundClickHandler) {
            sendBtn.removeEventListener("click", boundClickHandler);
        }

        boundKeydownHandler = null;
        boundInputHandler = null;
        boundClickHandler = null;
        listenersAttached = false;
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

        // Mark initial load complete after messages have time to load
        setTimeout(() => {
            isInitialLoad = false;
        }, 1500);

        // Subscribe to users
        BingerConnection.sendMessageAsync({
            command: "subscribeToUsers",
            roomId
        });

        // Setup input listeners (removes old ones first)
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

        // Cache the current user's UID for typing indicators
        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((res) => {
                if (res?.user?.uid) {
                    cachedUid = res.user.uid;
                }
            })
            .catch(() => {
                // Silently fail - will fetch on first keystroke
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
        removeInputListeners();
        isInitialLoad = true;
        cachedUid = null;

        // Clear any pending typing timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
        }
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