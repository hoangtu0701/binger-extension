(function() {
    "use strict";

    const INVITE_EXPIRY_MS = 120000;
    const EXPIRY_CHECK_INTERVAL_MS = 5000;

    const expiryIntervals = {};

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-invites missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function startInviteExpiryCheckerForRoom(roomId) {
        if (!roomId || typeof roomId !== "string") return;

        stopInviteExpiryCheckerForRoom(roomId);

        const intervalId = setInterval(() => {
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

                    if (!invite) {
                        stopInviteExpiryCheckerForRoom(roomId);
                        return;
                    }

                    if (invite.expiresAt && Date.now() > invite.expiresAt) {
                        inviteRef.remove()
                            .then(() => {
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

        expiryIntervals[roomId] = intervalId;
    }

    function stopInviteExpiryCheckerForRoom(roomId) {
        if (expiryIntervals[roomId]) {
            clearInterval(expiryIntervals[roomId]);
            delete expiryIntervals[roomId];
        }
    }

    function handleSendInviteAndBroadcast(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }
        if (!msg.inviteData || typeof msg.inviteData !== "object") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid inviteData" });
            return;
        }

        const roomId = msg.roomId.trim();
        const inviteData = msg.inviteData;

        let chatMessage = msg.chatMessage;
        if (!chatMessage || typeof chatMessage !== "object") {
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

        const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
        const chatRef = BingerBGFirebase.ref(`rooms/${roomId}/messages`);

        if (!inviteRef || !chatRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase refs" });
            return;
        }

        inviteRef.set(inviteData)
            .then(() => {
                startInviteExpiryCheckerForRoom(roomId);
                return chatRef.push(chatMessage);
            })
            .then(() => {
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Failed to handle invite broadcast:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleSubscribeToActiveInvite(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getActiveInviteListeners();

        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
        }

        const callback = (snapshot) => {
            const invite = snapshot.val();

            BingerBGHelpers.broadcastToTabs({
                command: "activeInviteUpdated",
                invite
            });

            if (invite && invite.acceptedInvitees && invite.createdBy) {
                checkAllAccepted(roomId, invite);
            }
        };

        ref.on("value", callback);
        listeners[roomId] = callback;

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
    }

    function handleUnsubscribeFromActiveInvite(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
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
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }

        stopInviteExpiryCheckerForRoom(roomId);
    }

    function checkAllAccepted(roomId, invite) {
        if (!roomId || !invite || !invite.acceptedInvitees || !invite.createdBy) return;

        const accepted = invite.acceptedInvitees;
        const acceptedUserIds = Object.keys(accepted).filter(uid => accepted[uid] === true);

        const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
        if (!usersRef) return;

        usersRef.once("value")
            .then((snapshot) => {
                const usersInRoom = snapshot.val() || {};
                const userIdsInRoom = Object.keys(usersInRoom).filter(uid => uid !== invite.createdBy);

                const allAccepted = userIdsInRoom.every(uid => acceptedUserIds.includes(uid));

                if (allAccepted && userIdsInRoom.length > 0) {
                    stopInviteExpiryCheckerForRoom(roomId);

                    const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
                    if (!inviteRef) return;

                    inviteRef.remove()
                        .then(() => {
                            BingerBGHelpers.broadcastToTabs({
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

    function handleCancelActiveInvite(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        if (!inviteRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        stopInviteExpiryCheckerForRoom(roomId);

        inviteRef.remove()
            .then(() => {
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((error) => {
                console.error("[Binger] Failed to cancel invite:", error);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: error.message });
            });
    }

    self.BingerBGInvites = {
        handleSendInviteAndBroadcast,
        handleSubscribeToActiveInvite,
        handleUnsubscribeFromActiveInvite,
        handleCancelActiveInvite,
        startInviteExpiryCheckerForRoom,
        stopInviteExpiryCheckerForRoom
    };

})();