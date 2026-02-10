(function() {
    "use strict";

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-typing missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function handleIAmTyping(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") return;
        if (!msg.uid || typeof msg.uid !== "string") return;

        const ref = BingerBGFirebase.ref(`rooms/${msg.roomId.trim()}/typing/${msg.uid}`);
        if (!ref) return;

        ref.set(true)
            .catch((err) => console.error("[Binger] Failed to set typing status:", err));
    }

    function handleIStoppedTyping(msg) {
        if (!validateDependencies()) return;

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") return;
        if (!msg.uid || typeof msg.uid !== "string") return;

        const ref = BingerBGFirebase.ref(`rooms/${msg.roomId.trim()}/typing/${msg.uid}`);
        if (!ref) return;

        ref.remove()
            .catch((err) => console.error("[Binger] Failed to remove typing status:", err));
    }

    function handleSubscribeToTyping(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing`);

        if (!typingRef) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getTypingListeners();

        if (listeners[roomId]) {
            typingRef.off("value", listeners[roomId]);
        }

        const callback = (snapshot) => {
            const typingData = snapshot.val() || {};
            const typingUids = Object.keys(typingData);

            const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
            if (!usersRef) return;

            usersRef.once("value")
                .then((snap) => {
                    const users = snap.val() || {};
                    const typingUsers = typingUids.map((uid) => ({
                        uid,
                        username: (uid === "BINGER_BOT" || uid === "BINGER_BOT_SEEK")
                            ? "Binger Bot"
                            : (users[uid]?.email?.split("@")[0] || "unknown")
                    }));

                    BingerBGHelpers.broadcastToTabs({
                        command: "typingStatusUpdated",
                        users: typingUsers
                    });
                })
                .catch((err) => {
                    console.error("[Binger] Error fetching users for typing lookup:", err);
                });
        };

        typingRef.on("value", callback);
        listeners[roomId] = callback;

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "typing listener attached", roomId: roomId });
    }

    function handleUnsubscribeFromTyping(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getTypingListeners();

        if (listeners[roomId]) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/typing`);
            if (ref) {
                ref.off("value", listeners[roomId]);
            }
            delete listeners[roomId];
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "unsubscribed from typing", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    self.BingerBGTyping = {
        handleIAmTyping,
        handleIStoppedTyping,
        handleSubscribeToTyping,
        handleUnsubscribeFromTyping
    };

})();