// ============================================================================
// INVITE HANDLERS
// Handle sending, cancelling, and subscribing to watch-together invites
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // How long an invite lasts before expiring (in milliseconds)
    const INVITE_EXPIRY_MS = 120000; // 2 minutes

    // How often to check for expired invites (in milliseconds)
    const EXPIRY_CHECK_INTERVAL_MS = 5000; // 5 seconds

    // ========================================================================
    // STATE: EXPIRY CHECKER INTERVALS
    // Track active intervals by roomId so we can clear them
    // ========================================================================

    const expiryIntervals = {};

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGUtils"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-invites missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // HELPER: SAFE SEND RESPONSE
    // ========================================================================

    /**
     * Safely send response - tab may have closed
     * @param {function} sendResponse - Response callback
     * @param {object} data - Data to send
     */
    function safeSendResponse(sendResponse, data) {
        try {
            if (typeof sendResponse === "function") {
                sendResponse(data);
            }
        } catch (err) {
            // Tab closed before response - ignore
        }
    }

    // ========================================================================
    // INVITE EXPIRY CHECKER
    // ========================================================================

    /**
     * Start a checker that auto-deletes expired invites
     * @param {string} roomId - The room to monitor
     */
    function startInviteExpiryCheckerForRoom(roomId) {
        // Validate input
        if (!roomId || typeof roomId !== "string") {
            console.error("[Binger] Cannot start expiry checker - invalid roomId");
            return;
        }

        // Clear existing interval for this room if any
        stopInviteExpiryCheckerForRoom(roomId);

        console.log(`[Binger] Invite expiry checker started for room ${roomId}`);

        const intervalId = setInterval(() => {
            // Validate dependencies each tick (service worker may have restarted)
            if (!validateDependencies()) {
                stopInviteExpiryCheckerForRoom(roomId);
                return;
            }

            const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
            if (!inviteRef) {
                stopInviteExpiryCheckerForRoom(roomId);
                return;
            }

            inviteRef.once("value")
                .then((snapshot) => {
                    const invite = snapshot.val();

                    // No invite exists - stop checking
                    if (!invite) {
                        console.log(`[Binger] No active invite in room ${roomId} - stopping checker`);
                        stopInviteExpiryCheckerForRoom(roomId);
                        return;
                    }

                    // Check if expired
                    if (invite.expiresAt && Date.now() > invite.expiresAt) {
                        inviteRef.remove()
                            .then(() => {
                                console.log(`[Binger] Auto-deleted expired invite in room ${roomId}`);
                                stopInviteExpiryCheckerForRoom(roomId);
                            })
                            .catch((err) => {
                                console.error(`[Binger] Failed to delete expired invite in ${roomId}:`, err);
                            });
                    }
                })
                .catch((err) => {
                    console.error(`[Binger] Error reading invite for room ${roomId}:`, err);
                });
        }, EXPIRY_CHECK_INTERVAL_MS);

        // Store interval ID so we can clear it later
        expiryIntervals[roomId] = intervalId;
    }

    /**
     * Stop the expiry checker for a room
     * @param {string} roomId - The room to stop monitoring
     */
    function stopInviteExpiryCheckerForRoom(roomId) {
        if (expiryIntervals[roomId]) {
            clearInterval(expiryIntervals[roomId]);
            delete expiryIntervals[roomId];
            console.log(`[Binger] Invite expiry checker stopped for room ${roomId}`);
        }
    }

    // ========================================================================
    // SEND INVITE AND BROADCAST
    // ========================================================================

    /**
     * Handle sending an invite and broadcasting to chat
     * @param {object} msg - Message containing roomId, inviteData, chatMessage (optional)
     * @param {function} sendResponse - Response callback
     */
    function handleSendInviteAndBroadcast(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }
        if (!msg.inviteData || typeof msg.inviteData !== "object") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid inviteData" });
            return;
        }

        const roomId = msg.roomId.trim();
        const inviteData = msg.inviteData;

        // chatMessage is optional - generate default if not provided
        let chatMessage = msg.chatMessage;
        if (!chatMessage || typeof chatMessage !== "object") {
            // Extract movie code from URL (e.g., "the-matrix" from "/watch/the-matrix")
            const movieUrl = inviteData.movieUrl || "";
            const movieCode = movieUrl.split("/watch/")[1]?.split("?")[0] || "a movie";
            const senderName = inviteData.sender || "Someone";

            chatMessage = {
                sender: "Binger Bot",
                type: "bot",
                text: `${senderName} invited you to watch ${movieCode} together!`,
                timestamp: Date.now()
            };
        }

        const now = Date.now();
        inviteData.createdAt = now;
        inviteData.expiresAt = now + INVITE_EXPIRY_MS;

        const invitePath = `rooms/${roomId}/activeInvite`;
        const chatPath = `rooms/${roomId}/messages`;

        const inviteRef = BingerBGFirebase.ref(invitePath);
        const chatRef = BingerBGFirebase.ref(chatPath);

        if (!inviteRef || !chatRef) {
            safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase refs" });
            return;
        }

        // Store the invite data
        inviteRef.set(inviteData)
            .then(() => {
                console.log(`[Binger] Stored active invite in ${invitePath}`);
                startInviteExpiryCheckerForRoom(roomId);

                // Push the chat message
                return chatRef.push(chatMessage);
            })
            .then(() => {
                console.log("[Binger] Invite message pushed to chat");
                safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Failed to handle invite broadcast:", err);
                safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    // ========================================================================
    // SUBSCRIBE TO ACTIVE INVITE
    // ========================================================================

    /**
     * Subscribe to active invite updates and handle session start when all accept
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleSubscribeToActiveInvite(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        if (!ref) {
            safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getActiveInviteListeners();

        // If already listening, detach previous listener
        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
            console.log(`[Binger] Removed duplicate listener for activeInvite in room ${roomId}`);
        }

        // Define and store new callback
        const callback = (snapshot) => {
            const invite = snapshot.val();

            // Broadcast invite info to all tabs
            BingerBGUtils.broadcastToTabs({
                command: "activeInviteUpdated",
                invite
            });

            // After broadcasting, check if everyone has accepted
            if (invite && invite.acceptedInvitees && invite.createdBy) {
                checkAllAccepted(roomId, invite);
            }
        };

        ref.on("value", callback);
        listeners[roomId] = callback;

        console.log(`[Binger] Subscribed to activeInvite in room ${roomId}`);
        safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
    }

    /**
     * Unsubscribe from active invite updates
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleUnsubscribeFromActiveInvite(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getActiveInviteListeners();

        if (listeners[roomId]) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
            if (ref) {
                ref.off("value", listeners[roomId]);
            }
            delete listeners[roomId];
            console.log(`[Binger] Unsubscribed from activeInvite in room ${roomId}`);
            safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
        } else {
            console.log(`[Binger] No active listener for activeInvite in room ${roomId}`);
            safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }

        // Also stop the expiry checker
        stopInviteExpiryCheckerForRoom(roomId);
    }

    /**
     * Check if all invitees have accepted and start session if so
     * @param {string} roomId - The room ID
     * @param {object} invite - The invite object
     */
    function checkAllAccepted(roomId, invite) {
        // Validate inputs
        if (!roomId || !invite || !invite.acceptedInvitees || !invite.createdBy) {
            return;
        }

        const accepted = invite.acceptedInvitees;
        const acceptedUserIds = Object.keys(accepted).filter(uid => accepted[uid] === true);

        const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
        if (!usersRef) {
            console.error("[Binger] Failed to create users ref in checkAllAccepted");
            return;
        }

        // Load current room users (excluding inviter)
        usersRef.once("value")
            .then((snapshot) => {
                const usersInRoom = snapshot.val() || {};
                const userIdsInRoom = Object.keys(usersInRoom).filter(uid => uid !== invite.createdBy);

                console.log("[Binger] AcceptedInvitees:", acceptedUserIds);
                console.log("[Binger] Users in room (excluding inviter):", userIdsInRoom);

                const allAccepted = userIdsInRoom.every(uid => acceptedUserIds.includes(uid));

                if (allAccepted && userIdsInRoom.length > 0) {
                    console.log("[Binger] All invitees accepted - starting session");

                    // Stop the expiry checker since invite is being consumed
                    stopInviteExpiryCheckerForRoom(roomId);

                    // Clean up the active invite
                    const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
                    if (!inviteRef) {
                        console.error("[Binger] Failed to create invite ref for cleanup");
                        return;
                    }

                    inviteRef.remove()
                        .then(() => {
                            console.log("[Binger] Deleted active invite after full acceptance");

                            // Broadcast to all tabs that session is starting
                            BingerBGUtils.broadcastToTabs({
                                command: "startSession",
                                movieUrl: invite.movieUrl
                            });
                        })
                        .catch((err) => {
                            console.error("[Binger] Failed to delete invite after acceptance:", err);
                        });
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to check users for acceptance:", err);
            });
    }

    // ========================================================================
    // CANCEL ACTIVE INVITE
    // ========================================================================

    /**
     * Handle cancelling an active invite
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleCancelActiveInvite(msg, sendResponse) {
        console.log("[Binger] Cancel Invite clicked");

        // Validate dependencies
        if (!validateDependencies()) {
            safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        if (!inviteRef) {
            safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        // Stop the expiry checker
        stopInviteExpiryCheckerForRoom(roomId);

        inviteRef.remove()
            .then(() => {
                console.log("[Binger] Active invite cancelled by sender");
                safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((error) => {
                console.error("[Binger] Failed to cancel invite:", error);
                safeSendResponse(sendResponse, { status: "error", error: error.message });
            });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGInvites = {
        handleSendInviteAndBroadcast,
        handleSubscribeToActiveInvite,
        handleUnsubscribeFromActiveInvite,
        handleCancelActiveInvite,
        startInviteExpiryCheckerForRoom,
        stopInviteExpiryCheckerForRoom
    };

})();