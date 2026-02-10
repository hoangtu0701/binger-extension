(function() {
    "use strict";

    const MAX_USERS_PER_ROOM = 2;
    const REJOIN_WINDOW_MS = 60000;

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-rooms missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    async function leaveCurrentRoomSilently(user) {
        return new Promise((resolve) => {
            chrome.storage.local.get("bingerCurrentRoomId", async (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] Error getting current room:", chrome.runtime.lastError.message);
                    resolve();
                    return;
                }

                const currentRoomId = result.bingerCurrentRoomId;
                if (!currentRoomId) {
                    resolve();
                    return;
                }

                try {
                    const typingRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/typing/${user.uid}`);
                    if (typingRef) {
                        await typingRef.remove().catch(() => {});
                    }

                    BingerBGHelpers.unsubscribeFromTyping(currentRoomId);

                    const userRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/users/${user.uid}`);
                    if (userRef) {
                        await userRef.remove();
                    }

                    const leaveRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/lastLeaves/${user.uid}`);
                    if (leaveRef) {
                        await leaveRef.set(Date.now()).catch(() => {});
                    }

                    const inviteRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/activeInvite`);
                    if (inviteRef) {
                        await inviteRef.remove().catch(() => {});
                    }

                    const sessionRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/inSession`);
                    if (sessionRef) {
                        await sessionRef.set(false).catch(() => {});
                    }

                    const usersRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/users`);
                    if (usersRef) {
                        const snap = await usersRef.once("value");
                        if (!snap.exists()) {
                            const roomRef = BingerBGFirebase.ref(`rooms/${currentRoomId}`);
                            if (roomRef) {
                                await roomRef.remove().catch((err) => {
                                    console.warn("[Binger] Failed to delete empty room:", err);
                                });
                            }
                        }
                    }

                    BingerBGHelpers.broadcastUpdatedUserList(currentRoomId);
                } catch (err) {
                    console.warn("[Binger] Error during silent leave:", err);
                }

                resolve();
            });
        });
    }

    async function handleCreateRoom(sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        const user = BingerBGFirebase.getCurrentUser();
        if (!user) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        await leaveCurrentRoomSilently(user);

        tryCreateRoom(0, user, sendResponse);
    }

    function tryCreateRoom(attempts, user, sendResponse) {
        if (attempts > 5) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to generate unique room ID" });
            return;
        }

        const roomId = BingerBGHelpers.generateRoomId();
        const roomRef = BingerBGFirebase.ref(`rooms/${roomId}`);

        if (!roomRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create room reference" });
            return;
        }

        roomRef.once("value")
            .then((snapshot) => {
                if (snapshot.exists()) {
                    tryCreateRoom(attempts + 1, user, sendResponse);
                } else {
                    chrome.storage.sync.get("theme", (result) => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Error getting theme:", chrome.runtime.lastError.message);
                        }

                        const hostTheme = result?.theme || "burgundy";

                        const roomData = {
                            host: user.uid,
                            theme: hostTheme,
                            createdAt: BingerBGFirebase.ServerValue.TIMESTAMP,
                            inSession: false,
                            users: {
                                [user.uid]: {
                                    email: user.email,
                                    joinedAt: BingerBGFirebase.ServerValue.TIMESTAMP
                                }
                            }
                        };

                        roomRef.set(roomData)
                            .then(() => {
                                BingerBGHelpers.safeSendResponse(sendResponse, { status: "success", roomId });
                            })
                            .catch((err) => {
                                console.error("[Binger] Error creating room:", err);
                                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
                            });
                    });
                }
            })
            .catch((err) => {
                console.error("[Binger] Error checking room existence:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    async function handleJoinRoom(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        const currentRoom = await new Promise((resolve) => {
            chrome.storage.local.get("bingerCurrentRoomId", (result) => {
                resolve(result?.bingerCurrentRoomId || null);
            });
        });

        if (currentRoom && currentRoom !== roomId) {
            await leaveCurrentRoomSilently(user);
        }

        const roomRef = BingerBGFirebase.ref(`rooms/${roomId}`);
        if (!roomRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create room reference" });
            return;
        }

        const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
        if (!usersRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create users reference" });
            return;
        }

        roomRef.once("value")
            .then((snapshot) => {
                if (!snapshot.exists()) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Room not found" });
                    return;
                }

                usersRef.transaction((currentUsers) => {
                    if (currentUsers === null) {
                        currentUsers = {};
                    }

                    const userIds = Object.keys(currentUsers);

                    if (userIds.includes(user.uid)) {
                        return currentUsers;
                    }

                    if (userIds.length >= MAX_USERS_PER_ROOM) {
                        return;
                    }

                    currentUsers[user.uid] = {
                        email: user.email,
                        joinedAt: Date.now()
                    };

                    return currentUsers;
                }, (error, committed, snapshot) => {
                    if (error) {
                        console.error("[Binger] Join room transaction error:", error);
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: error.message });
                        return;
                    }

                    if (!committed) {
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Room is full" });
                        return;
                    }

                    const users = snapshot.val() || {};
                    if (users[user.uid]) {
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "success", roomId });
                        BingerBGHelpers.broadcastUpdatedUserList(roomId);
                    } else {
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to join room" });
                    }
                });
            })
            .catch((err) => {
                console.error("[Binger] Firebase read error:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleLeaveRoom(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${user.uid}`);
        if (typingRef) {
            typingRef.remove()
                .catch((err) => console.warn("[Binger] Failed to remove typing status:", err));
        }

        BingerBGHelpers.unsubscribeFromTyping(roomId);

        const userRef = BingerBGFirebase.ref(`rooms/${roomId}/users/${user.uid}`);
        if (!userRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create user reference" });
            return;
        }

        userRef.remove()
            .then(() => {
                const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
                if (inviteRef) {
                    inviteRef.once("value")
                        .then((snapshot) => {
                            const invite = snapshot.val();
                            if (!invite) return;

                            inviteRef.remove()
                                .catch((err) => console.error("[Binger] Failed to delete active invite on leave:", err));
                        })
                        .catch((err) => console.warn("[Binger] Failed to check active invite:", err));
                }

                const sessionRef = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);
                if (sessionRef) {
                    sessionRef.set(false)
                        .catch((err) => console.error("[Binger] Failed to reset inSession:", err));
                }

                const leaveRef = BingerBGFirebase.ref(`rooms/${roomId}/lastLeaves/${user.uid}`);
                if (leaveRef) {
                    leaveRef.set(Date.now())
                        .catch((err) => console.error("[Binger] leave-write error:", err));
                }

                const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
                if (usersRef) {
                    usersRef.once("value")
                        .then((snap) => {
                            if (!snap.exists()) {
                                const roomRef = BingerBGFirebase.ref(`rooms/${roomId}`);
                                if (roomRef) {
                                    roomRef.remove()
                                        .catch((err) => console.warn("[Binger] Failed to delete empty room:", err));
                                }
                            }
                        })
                        .catch((err) => console.warn("[Binger] Failed to check room users:", err));
                }

                BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
                BingerBGHelpers.broadcastUpdatedUserList(roomId);
            })
            .catch((err) => {
                console.error("[Binger] Leave room error:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleRejoinIfRecentlyKicked(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        const roomRef = BingerBGFirebase.ref(`rooms/${roomId}`);
        if (!roomRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create room reference" });
            return;
        }

        roomRef.once("value")
            .then((snapshot) => {
                if (!snapshot.exists()) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Room not found" });
                    return;
                }

                const roomData = snapshot.val();
                const userInRoom = roomData.users?.[user.uid];
                const lastLeave = roomData.lastLeaves?.[user.uid] || 0;

                const now = Date.now();
                const cutoffTime = now - REJOIN_WINDOW_MS;

                if (userInRoom) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "rejoined" });
                } else if (lastLeave >= cutoffTime) {
                    const currentUsers = Object.keys(roomData.users || {});
                    if (currentUsers.length >= MAX_USERS_PER_ROOM) {
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Room is full" });
                        return;
                    }

                    const updates = {};
                    updates[`users/${user.uid}`] = {
                        email: user.email,
                        joinedAt: BingerBGFirebase.ServerValue.TIMESTAMP
                    };

                    roomRef.update(updates)
                        .then(() => {
                            BingerBGHelpers.safeSendResponse(sendResponse, { status: "rejoined" });
                        })
                        .catch((err) => {
                            console.error("[Binger] Rejoin update error:", err);
                            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
                        });
                } else {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "stale" });
                }
            })
            .catch((err) => {
                console.error("[Binger] Firebase error on rejoin check:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleRefreshUserList(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") return;

        BingerBGHelpers.broadcastUpdatedUserList(msg.roomId.trim());
    }

    self.BingerBGRooms = {
        handleCreateRoom,
        handleJoinRoom,
        handleLeaveRoom,
        handleRejoinIfRecentlyKicked,
        handleRefreshUserList
    };

})();