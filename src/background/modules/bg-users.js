(function() {
    "use strict";

    const LEAVE_DEBOUNCE_MS = 3000;

    const roomState = {};

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-users missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function getState(roomId) {
        if (!roomState[roomId]) {
            roomState[roomId] = {
                listener: null,
                previousUsers: {},
                pendingLeaves: {},
                hasFirstSnapshot: false
            };
        }
        return roomState[roomId];
    }

    function cleanupState(roomId) {
        const state = roomState[roomId];
        if (!state) return;

        Object.values(state.pendingLeaves).forEach((pending) => {
            if (pending.timeoutId) {
                clearTimeout(pending.timeoutId);
            }
        });

        delete roomState[roomId];
    }

    function getUsername(email) {
        if (!email || typeof email !== "string") return "unknown";
        return email.split("@")[0];
    }

    function broadcastNotification(type, username) {
        BingerBGHelpers.broadcastToTabs({
            command: "userNotification",
            notificationType: type,
            username: username
        });
    }

    function broadcastUserList(roomId, hostUid) {
        const state = roomState[roomId];
        if (!state) return;

        const combinedUsers = { ...state.previousUsers };

        Object.entries(state.pendingLeaves).forEach(([uid, pending]) => {
            if (!combinedUsers[uid] && pending.userData) {
                combinedUsers[uid] = pending.userData;
            }
        });

        const userList = Object.entries(combinedUsers).map(([uid, user]) => {
            const name = getUsername(user.email);
            return { uid, name, isHost: uid === hostUid };
        });

        userList.sort((a, b) => {
            if (a.isHost) return -1;
            if (b.isHost) return 1;
            return a.name.localeCompare(b.name);
        });

        BingerBGHelpers.broadcastToTabs({
            command: "updateUserList",
            users: userList.map(u => ({ name: u.name, isHost: u.isHost }))
        });
    }

    function handleSubscribeToUsers(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const roomUsersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);

        if (!roomUsersRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const state = getState(roomId);

        if (state.listener) {
            roomUsersRef.off("value", state.listener);
        }

        state.listener = (snapshot) => {
            const usersData = snapshot.val() || {};
            const currentUids = Object.keys(usersData);
            const previousUids = Object.keys(state.previousUsers);

            const joinedUids = currentUids.filter(uid => !previousUids.includes(uid));
            const leftUids = previousUids.filter(uid => !currentUids.includes(uid));

            const hostRef = BingerBGFirebase.ref(`rooms/${roomId}/host`);
            if (!hostRef) return;

            hostRef.once("value")
                .then((hostSnap) => {
                    const hostUid = hostSnap.val();

                    const previousUsersForDetection = { ...state.previousUsers };
                    state.previousUsers = { ...usersData };

                    if (!state.hasFirstSnapshot) {
                        state.hasFirstSnapshot = true;
                        broadcastUserList(roomId, hostUid);
                        return;
                    }

                    const currentUser = BingerBGFirebase.getCurrentUser();
                    const currentUid = currentUser?.uid;

                    joinedUids.forEach((uid) => {
                        if (uid === currentUid) return;

                        const user = usersData[uid];
                        if (!user?.email) return;

                        const username = getUsername(user.email);

                        if (state.pendingLeaves[uid]) {
                            clearTimeout(state.pendingLeaves[uid].timeoutId);
                            delete state.pendingLeaves[uid];
                        } else {
                            broadcastNotification("join", username);
                        }
                    });

                    leftUids.forEach((uid) => {
                        if (uid === currentUid) return;

                        const previousUser = previousUsersForDetection[uid];
                        if (!previousUser?.email) return;

                        const username = getUsername(previousUser.email);

                        state.pendingLeaves[uid] = {
                            timeoutId: setTimeout(() => {
                                broadcastNotification("leave", username);
                                delete state.pendingLeaves[uid];
                                broadcastUserList(roomId, hostUid);
                            }, LEAVE_DEBOUNCE_MS),
                            username: username,
                            userData: previousUser
                        };
                    });

                    broadcastUserList(roomId, hostUid);
                })
                .catch((err) => {
                    console.error("[Binger] Error fetching host for user list:", err);
                });
        };

        roomUsersRef.on("value", state.listener);

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
    }

    function handleUnsubscribeFromUsers(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const state = roomState[roomId];

        if (state?.listener) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/users`);
            if (ref) {
                ref.off("value", state.listener);
            }
        }

        cleanupState(roomId);

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
    }

    self.BingerBGUsers = {
        handleSubscribeToUsers,
        handleUnsubscribeFromUsers
    };

})();