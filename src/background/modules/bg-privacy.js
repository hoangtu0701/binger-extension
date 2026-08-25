(function() {
    "use strict";

    const PASSWORD_LENGTH = 4;

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-privacy missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function generatePassword() {
        let out = "";
        for (let i = 0; i < PASSWORD_LENGTH; i++) {
            out += Math.floor(Math.random() * 10).toString();
        }
        return out;
    }

    function isValidPassword(value) {
        return typeof value === "string" && /^\d{4}$/.test(value);
    }

    function normalizePrivacy(raw) {
        const source = raw && typeof raw === "object" ? raw : {};
        return {
            isPrivate: source.isPrivate === true,
            password: isValidPassword(String(source.password || "")) ? String(source.password) : ""
        };
    }

    function isRoomHost(roomId, uid) {
        const hostRef = BingerBGFirebase.ref(`rooms/${roomId}/host`);
        if (!hostRef) return Promise.resolve(false);

        return hostRef.once("value")
            .then((snap) => snap.val() === uid)
            .catch((err) => {
                console.error("[Binger] Failed to read room host:", err);
                return false;
            });
    }

    function handleCheckRoomPrivacy(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
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

                const roomData = snapshot.val() || {};
                const user = BingerBGFirebase.getCurrentUser();
                const alreadyInRoom = Boolean(user && roomData.users && roomData.users[user.uid]);
                const privacy = normalizePrivacy(roomData.privacy);

                BingerBGHelpers.safeSendResponse(sendResponse, {
                    status: "success",
                    isPrivate: privacy.isPrivate && !alreadyInRoom
                });
            })
            .catch((err) => {
                console.error("[Binger] Privacy check failed:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleSetRoomPrivacy(msg, sendResponse) {
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

        isRoomHost(roomId, user.uid)
            .then((isHost) => {
                if (!isHost) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not the host" });
                    return null;
                }

                const privacyRef = BingerBGFirebase.ref(`rooms/${roomId}/privacy`);
                if (!privacyRef) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create privacy reference" });
                    return null;
                }

                return privacyRef.once("value").then((snap) => {
                    const current = normalizePrivacy(snap.val());
                    const password = current.password || generatePassword();

                    return privacyRef.set({
                        isPrivate: msg.isPrivate === true,
                        password
                    });
                });
            })
            .then((result) => {
                if (result === null) return;
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Failed to set room privacy:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleSetRoomPassword(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        if (!isValidPassword(msg.password)) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid password" });
            return;
        }

        const roomId = msg.roomId.trim();
        const user = BingerBGFirebase.getCurrentUser();

        if (!user) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not signed in" });
            return;
        }

        isRoomHost(roomId, user.uid)
            .then((isHost) => {
                if (!isHost) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Not the host" });
                    return null;
                }

                const passwordRef = BingerBGFirebase.ref(`rooms/${roomId}/privacy/password`);
                if (!passwordRef) {
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create password reference" });
                    return null;
                }

                return passwordRef.set(msg.password);
            })
            .then((result) => {
                if (result === null) return;
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Failed to set room password:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleSubscribeToPrivacy(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/privacy`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getPrivacyListeners();

        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
            delete listeners[roomId];
        }

        const callback = (snapshot) => {
            const privacy = normalizePrivacy(snapshot.val());

            BingerBGHelpers.broadcastToTabs({
                command: "privacyUpdated",
                roomId,
                isPrivate: privacy.isPrivate,
                password: privacy.password
            });
        };

        ref.on("value", callback);
        listeners[roomId] = callback;

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
    }

    function handleUnsubscribeFromPrivacy(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getPrivacyListeners();

        if (listeners[roomId]) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/privacy`);
            if (ref) {
                ref.off("value", listeners[roomId]);
            }
            delete listeners[roomId];
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    self.BingerBGPrivacy = {
        generatePassword,
        isValidPassword,
        normalizePrivacy,

        handleCheckRoomPrivacy,
        handleSetRoomPrivacy,
        handleSetRoomPassword,
        handleSubscribeToPrivacy,
        handleUnsubscribeFromPrivacy
    };

})();