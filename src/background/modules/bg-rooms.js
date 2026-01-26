// ============================================================================
// ROOM HANDLERS
// Handle room creation, joining, leaving, and rejoin after kick
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Maximum users per room
    const MAX_USERS_PER_ROOM = 2;

    // Time window for rejoin after disconnect (in milliseconds)
    const REJOIN_WINDOW_MS = 60000; // 1 minute

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-rooms missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // HELPER: LEAVE CURRENT ROOM (SILENT)
    // Used before creating or joining a new room
    // ========================================================================

    /**
     * Leave the user's current room silently (no response needed)
     * @param {firebase.User} user - The current user
     * @returns {Promise<void>}
     */
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

                console.log(`[Binger] Auto-leaving room ${currentRoomId} before joining new room`);

                try {
                    // Remove typing status
                    const typingRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/typing/${user.uid}`);
                    if (typingRef) {
                        await typingRef.remove().catch(() => {});
                    }

                    // Unsubscribe from typing using shared helper
                    BingerBGHelpers.unsubscribeFromTyping(currentRoomId);

                    // Remove user from room
                    const userRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/users/${user.uid}`);
                    if (userRef) {
                        await userRef.remove();
                    }

                    // Record leave time
                    const leaveRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/lastLeaves/${user.uid}`);
                    if (leaveRef) {
                        await leaveRef.set(Date.now()).catch(() => {});
                    }

                    // Delete active invite
                    const inviteRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/activeInvite`);
                    if (inviteRef) {
                        await inviteRef.remove().catch(() => {});
                    }

                    // Reset inSession
                    const sessionRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/inSession`);
                    if (sessionRef) {
                        await sessionRef.set(false).catch(() => {});
                    }

                    // Check if room is now empty
                    const usersRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/users`);
                    if (usersRef) {
                        const snap = await usersRef.once("value");
                        if (!snap.exists()) {
                            const lastLeftRef = BingerBGFirebase.ref(`rooms/${currentRoomId}/lastUserLeftAt`);
                            if (lastLeftRef) {
                                await lastLeftRef.set(Date.now()).catch(() => {});
                            }
                        }
                    }

                    // Broadcast updated user list for old room
                    BingerBGHelpers.broadcastUpdatedUserList(currentRoomId);

                    console.log(`[Binger] Silently left room ${currentRoomId}`);
                } catch (err) {
                    console.warn("[Binger] Error during silent leave:", err);
                }

                resolve();
            });
        });
    }

    // ========================================================================
    // CREATE ROOM
    // ========================================================================

    /**
     * Handle room creation
     * @param {function} sendResponse - Response callback
     */
    async function handleCreateRoom(sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        const user = BingerBGFirebase.getCurrentUser();
        if (!user) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        // Auto-leave any previous room first
        await leaveCurrentRoomSilently(user);

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
                    // Room ID already exists, try again
                    tryCreateRoom(attempts + 1, user, sendResponse);
                } else {
                    // Fetch host's local theme and save with room
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
                                console.log(`[Binger] Room ${roomId} created by ${user.email} with theme ${hostTheme}`);
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

    // ========================================================================
    // JOIN ROOM
    // ========================================================================

    /**
     * Handle joining an existing room
     * Uses transaction to prevent race condition where 3+ users join simultaneously
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    async function handleJoinRoom(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
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

        // Auto-leave any previous room first (unless it's the same room)
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

        // Use transaction to atomically check and add user
        // This prevents race condition where multiple users join simultaneously
        const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
        if (!usersRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create users reference" });
            return;
        }

        // First check if room exists
        roomRef.once("value")
            .then((snapshot) => {
                if (!snapshot.exists()) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Room not found" });
                    return;
                }

                // Use transaction for atomic join
                usersRef.transaction((currentUsers) => {
                    // If no users object yet, create it
                    if (currentUsers === null) {
                        currentUsers = {};
                    }

                    const userIds = Object.keys(currentUsers);

                    // Already in room - no change needed
                    if (userIds.includes(user.uid)) {
                        return currentUsers;
                    }

                    // Room is full - abort transaction by returning undefined
                    if (userIds.length >= MAX_USERS_PER_ROOM) {
                        return; // Abort
                    }

                    // Add user
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
                        // Transaction aborted - room was full
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Room is full" });
                        return;
                    }

                    // Check if user is now in the room
                    const users = snapshot.val() || {};
                    if (users[user.uid]) {
                        console.log(`[Binger] User ${user.email} joined room ${roomId}`);
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "success", roomId });
                        BingerBGHelpers.broadcastUpdatedUserList(roomId);
                    } else {
                        // Shouldn't happen, but handle it
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to join room" });
                    }
                });
            })
            .catch((err) => {
                console.error("[Binger] Firebase read error:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
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
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
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

        // Remove typing status
        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${user.uid}`);
        if (typingRef) {
            typingRef.remove()
                .catch((err) => console.warn("[Binger] Failed to remove typing status:", err));
        }

        // Unsubscribe from typing using shared helper
        BingerBGHelpers.unsubscribeFromTyping(roomId);

        const userRef = BingerBGFirebase.ref(`rooms/${roomId}/users/${user.uid}`);
        if (!userRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create user reference" });
            return;
        }

        userRef.remove()
            .then(() => {
                console.log(`[Binger] User ${user.email} left room ${roomId}`);

                // Delete the active invite
                const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);
                if (inviteRef) {
                    inviteRef.once("value")
                        .then((snapshot) => {
                            const invite = snapshot.val();
                            if (!invite) return;

                            inviteRef.remove()
                                .then(() => {
                                    console.log("[Binger] Active invite deleted because someone left the room");
                                })
                                .catch((err) => {
                                    console.error("[Binger] Failed to delete active invite on leave:", err);
                                });
                        })
                        .catch((err) => {
                            console.warn("[Binger] Failed to check active invite:", err);
                        });
                }

                // Reset inSession flag to false
                const sessionRef = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);
                if (sessionRef) {
                    sessionRef.set(false)
                        .then(() => console.log("[Binger] inSession set to false on manual leave"))
                        .catch((err) => console.error("[Binger] Failed to reset inSession:", err));
                }

                // Record personal leave time
                const leaveRef = BingerBGFirebase.ref(`rooms/${roomId}/lastLeaves/${user.uid}`);
                if (leaveRef) {
                    leaveRef.set(Date.now())
                        .catch((err) => console.error("[Binger] leave-write error:", err));
                }

                // Check if room is now empty
                const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
                if (usersRef) {
                    usersRef.once("value")
                        .then((snap) => {
                            if (!snap.exists()) {
                                const lastLeftRef = BingerBGFirebase.ref(`rooms/${roomId}/lastUserLeftAt`);
                                if (lastLeftRef) {
                                    lastLeftRef.set(Date.now())
                                        .catch((err) => console.warn("[Binger] Failed to set lastUserLeftAt:", err));
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

    // ========================================================================
    // REJOIN IF RECENTLY KICKED
    // ========================================================================

    /**
     * Handle auto-rejoin for users recently disconnected from a room
     * @param {object} msg - Message containing roomId
     * @param {function} sendResponse - Response callback
     */
    function handleRejoinIfRecentlyKicked(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
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
                    // User still in room
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "rejoined" });
                } else if (lastLeave >= cutoffTime) {
                    // Was recently in room - check if room is full before re-adding
                    const currentUsers = Object.keys(roomData.users || {});
                    if (currentUsers.length >= MAX_USERS_PER_ROOM) {
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Room is full" });
                        return;
                    }

                    // Re-add user
                    const updates = {};
                    updates[`users/${user.uid}`] = {
                        email: user.email,
                        joinedAt: BingerBGFirebase.ServerValue.TIMESTAMP
                    };

                    roomRef.update(updates)
                        .then(() => {
                            console.log(`[Binger] Re-added user ${user.email} to room ${roomId} after reload`);
                            BingerBGHelpers.safeSendResponse(sendResponse, { status: "rejoined" });
                        })
                        .catch((err) => {
                            console.error("[Binger] Rejoin update error:", err);
                            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
                        });
                } else {
                    // Too late - no rejoin
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "stale" });
                }
            })
            .catch((err) => {
                console.error("[Binger] Firebase error on rejoin check:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
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
        // Validate dependencies
        if (!validateDependencies()) {
            return;
        }

        // Validate input
        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            console.warn("[Binger] refreshUserList called with invalid roomId");
            return;
        }

        BingerBGHelpers.broadcastUpdatedUserList(msg.roomId.trim());
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