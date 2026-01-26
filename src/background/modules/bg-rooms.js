// ============================================================================
// ROOM HANDLERS
// Handle room creation, joining, leaving, and rejoin after kick
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CREATE ROOM
    // ========================================================================

    /**
     * Handle room creation
     * @param {function} sendResponse - Response callback
     */
    function handleCreateRoom(sendResponse) {
        const user = BingerBGFirebase.getCurrentUser();
        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return;
        }

        tryCreateRoom(0, user, sendResponse);
    }

    /**
     * Attempt to create a room with a unique ID (recursive with retry)
     * @param {number} attempts - Number of attempts so far
     * @param {firebase.User} user - Current user
     * @param {function} sendResponse - Response callback
     */
    function tryCreateRoom(attempts, user, sendResponse) {
        if (attempts > 5) {
            sendResponse({ status: "error", error: "Failed to generate unique room ID" });
            return;
        }

        const roomId = BingerBGUtils.generateRoomId();
        const roomRef = BingerBGFirebase.ref(`rooms/${roomId}`);

        roomRef.once("value").then((snapshot) => {
            if (snapshot.exists()) {
                // Room ID already exists, try again
                tryCreateRoom(attempts + 1, user, sendResponse);
            } else {
                // Fetch host's local theme and save with room
                chrome.storage.sync.get("theme", ({ theme }) => {
                    const hostTheme = theme || "burgundy";

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
                            console.log(`[Binger] Room ${roomId} created by ${user.email} with theme ${hostTheme}`);
                            sendResponse({ status: "success", roomId });
                        })
                        .catch((err) => {
                            console.error("[Binger] Error creating room:", err);
                            sendResponse({ status: "error", error: err.message });
                        });
                });
            }
        }).catch((err) => {
            console.error("[Binger] Error checking room existence:", err);
            sendResponse({ status: "error", error: err.message });
        });
    }

    // ========================================================================
    // JOIN ROOM
    // ========================================================================

    /**
     * Handle joining an existing room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleJoinRoom(msg, sendResponse) {
        const user = BingerBGFirebase.getCurrentUser();
        const roomId = msg.roomId;

        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return;
        }

        const roomRef = BingerBGFirebase.ref(`rooms/${roomId}`);

        roomRef.once("value")
            .then((snapshot) => {
                if (!snapshot.exists()) {
                    sendResponse({ status: "error", error: "Room not found" });
                    return;
                }

                const roomData = snapshot.val();
                const currentUsers = Object.keys(roomData.users || {});

                // Already in room
                if (currentUsers.includes(user.uid)) {
                    sendResponse({ status: "success", roomId });
                    return;
                }

                // Room is full
                if (currentUsers.length >= 2) {
                    sendResponse({ status: "error", error: "Room is full" });
                    return;
                }

                // Add user to room
                const updates = {};
                updates[`users/${user.uid}`] = {
                    email: user.email,
                    joinedAt: BingerBGFirebase.ServerValue.TIMESTAMP
                };

                roomRef.update(updates)
                    .then(() => {
                        console.log(`[Binger] User ${user.email} joined room ${roomId}`);
                        sendResponse({ status: "success", roomId });
                        // Immediately broadcast updated user list
                        BingerBGUtils.broadcastUpdatedUserList(roomId);
                    })
                    .catch((err) => {
                        console.error("[Binger] Join room error:", err);
                        sendResponse({ status: "error", error: err.message });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Firebase read error:", err);
                sendResponse({ status: "error", error: err.message });
            });
    }

    // ========================================================================
    // LEAVE ROOM
    // ========================================================================

    /**
     * Handle leaving a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleLeaveRoom(msg, sendResponse) {
        const user = BingerBGFirebase.getCurrentUser();
        const { roomId } = msg;

        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return;
        }

        // Remove typing status
        BingerBGFirebase.ref(`rooms/${roomId}/typing/${user.uid}`).remove();
        chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId });

        const userRef = BingerBGFirebase.ref(`rooms/${roomId}/users/${user.uid}`);
        
        userRef.remove()
            .then(() => {
                console.log(`[Binger] User ${user.email} left room ${roomId}`);

                // Delete the active invite
                const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
                inviteRef.once("value").then((snapshot) => {
                    const invite = snapshot.val();
                    if (!invite) return;

                    // If ANYONE leaves while an invite exists - delete it
                    inviteRef.remove()
                        .then(() => {
                            console.log("[Binger] Active invite deleted because someone left the room");
                        })
                        .catch((err) => {
                            console.error("[Binger] Failed to delete active invite on leave:", err);
                        });
                });

                // Reset inSession flag to false
                BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(false)
                    .then(() => console.log(`[Binger] inSession set to false on tab close`))
                    .catch((err) => console.error(`[Binger] Failed to reset inSession:`, err));

                // Record personal leave time on manual leave
                BingerBGFirebase.ref(`rooms/${roomId}/lastLeaves/${user.uid}`)
                    .set(Date.now())
                    .catch(err => console.error("[Binger] leave-write error:", err));

                // Check if room is now empty
                const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
                usersRef.once("value").then((snap) => {
                    if (!snap.exists()) {
                        BingerBGFirebase.ref(`rooms/${roomId}/lastUserLeftAt`).set(Date.now());
                    }
                });

                sendResponse({ status: "success" });
                BingerBGUtils.broadcastUpdatedUserList(roomId);
            })
            .catch((err) => {
                console.error("[Binger] Leave room error:", err);
                sendResponse({ status: "error", error: err.message });
            });
    }

    // ========================================================================
    // REJOIN IF RECENTLY KICKED
    // ========================================================================

    /**
     * Handle auto-rejoin for users recently disconnected from a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleRejoinIfRecentlyKicked(msg, sendResponse) {
        const user = BingerBGFirebase.getCurrentUser();
        const { roomId } = msg;

        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return;
        }

        const roomRef = BingerBGFirebase.ref(`rooms/${roomId}`);

        roomRef.once("value")
            .then((snapshot) => {
                if (!snapshot.exists()) {
                    sendResponse({ status: "error", error: "Room not found" });
                    return;
                }

                const roomData = snapshot.val();
                const userInRoom = roomData.users?.[user.uid];
                const lastLeave = roomData.lastLeaves?.[user.uid] || 0;

                const now = Date.now();
                const oneMinuteAgo = now - 60 * 1000;

                if (userInRoom) {
                    // User still in room
                    sendResponse({ status: "rejoined" });
                } else if (lastLeave >= oneMinuteAgo) {
                    // Was recently in room - re-add
                    const updates = {};
                    updates[`users/${user.uid}`] = {
                        email: user.email,
                        joinedAt: BingerBGFirebase.ServerValue.TIMESTAMP
                    };

                    roomRef.update(updates)
                        .then(() => {
                            console.log(`[Binger] Re-added user ${user.email} to room ${roomId} after reload`);
                            sendResponse({ status: "rejoined" });
                        })
                        .catch((err) => {
                            console.error("[Binger] Rejoin update error:", err);
                            sendResponse({ status: "error", error: err.message });
                        });
                } else {
                    // Too late - no rejoin
                    sendResponse({ status: "stale" });
                }
            })
            .catch((err) => {
                console.error("[Binger] Firebase error on rejoin check:", err);
                sendResponse({ status: "error", error: err.message });
            });
    }

    // ========================================================================
    // REFRESH USER LIST
    // ========================================================================

    /**
     * Handle request to refresh and broadcast user list
     * @param {object} msg - Message containing roomId
     */
    function handleRefreshUserList(msg) {
        if (msg.roomId) {
            BingerBGUtils.broadcastUpdatedUserList(msg.roomId);
        }
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGRooms = {
        handleCreateRoom,
        handleJoinRoom,
        handleLeaveRoom,
        handleRejoinIfRecentlyKicked,
        handleRefreshUserList
    };

})();