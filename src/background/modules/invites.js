// ============================================================================
// INVITE HANDLERS
// Handle sending, cancelling, and subscribing to watch-together invites
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // INVITE EXPIRY CHECKER
    // ========================================================================

    /**
     * Start a checker that auto-deletes expired invites every 5 seconds
     * @param {string} roomId - The room to monitor
     */
    function startInviteExpiryCheckerForRoom(roomId) {
        console.log(`[Binger] Invite expiry checker started for room ${roomId}`);

        const intervalId = setInterval(() => {
            const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

            inviteRef.once("value").then((snapshot) => {
                const invite = snapshot.val();

                // No invite? Nothing to check
                if (!invite || !invite.expiresAt) return;

                const now = Date.now();
                if (now > invite.expiresAt) {
                    // Invite expired - delete it
                    inviteRef.remove()
                        .then(() => console.log(`[Binger] Auto-deleted expired invite in room ${roomId}`))
                        .catch((err) => console.error(`[Binger] Failed to delete expired invite in ${roomId}`, err));
                }
            }).catch((err) => {
                console.error(`[Binger] Error reading invite for room ${roomId}`, err);
            });
        }, 5000); // Check every 5 seconds
    }

    // ========================================================================
    // SEND INVITE AND BROADCAST
    // ========================================================================

    /**
     * Handle sending an invite and broadcasting to chat
     * @param {object} msg - Message containing roomId, inviteData, chatMessage
     * @param {function} sendResponse - Response callback
     */
    function handleSendInviteAndBroadcast(msg, sendResponse) {
        const { roomId, inviteData, chatMessage } = msg;
        const now = Date.now();
        const expiresInMs = 120000; // 2 minutes until it expires
        
        inviteData.createdAt = now;
        inviteData.expiresAt = now + expiresInMs;

        const invitePath = `rooms/${roomId}/activeInvite`;
        const chatPath = `rooms/${roomId}/messages`;

        // Store the invite data
        BingerBGFirebase.ref(invitePath).set(inviteData)
            .then(() => {
                console.log(`[Binger] Stored active invite in ${invitePath}`);
                startInviteExpiryCheckerForRoom(roomId);

                // Push the chat message
                return BingerBGFirebase.ref(chatPath).push(chatMessage);
            })
            .then(() => {
                console.log("[Binger] Invite message pushed to chat");
                sendResponse({ status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Failed to handle invite broadcast:", err);
                sendResponse({ status: "error", error: err.message });
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
        const { roomId } = msg;
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
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
    }

    /**
     * Check if all invitees have accepted and start session if so
     * @param {string} roomId - The room ID
     * @param {object} invite - The invite object
     */
    function checkAllAccepted(roomId, invite) {
        const accepted = invite.acceptedInvitees;
        const acceptedUserIds = Object.keys(accepted).filter(uid => accepted[uid] === true);

        // Load current room users (excluding inviter)
        BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value").then((snapshot) => {
            const usersInRoom = snapshot.val() || {};
            const userIdsInRoom = Object.keys(usersInRoom).filter(uid => uid !== invite.createdBy);

            console.log("AcceptedInvitees:", acceptedUserIds);
            console.log("Users in room (excluding inviter):", userIdsInRoom);

            const allAccepted = userIdsInRoom.every(uid => acceptedUserIds.includes(uid));

            if (allAccepted && userIdsInRoom.length > 0) {
                console.log("[Binger] All invitees accepted - starting session");

                // Clean up the active invite
                BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`).remove().then(() => {
                    console.log("[Binger] Deleted active invite after full acceptance");

                    // Broadcast to all tabs that session is starting
                    BingerBGUtils.broadcastToTabs({
                        command: "startSession",
                        movieUrl: invite.movieUrl
                    });
                });
            }
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
        const { roomId } = msg;
        const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        inviteRef.remove()
            .then(() => {
                console.log("[Binger] Active invite cancelled by sender");
                sendResponse({ status: "success" });
            })
            .catch((error) => {
                console.error("[Binger] Failed to cancel invite:", error);
                sendResponse({ status: "error", error: error.message });
            });
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGInvites = {
        handleSendInviteAndBroadcast,
        handleSubscribeToActiveInvite,
        handleCancelActiveInvite,
        startInviteExpiryCheckerForRoom
    };

})();