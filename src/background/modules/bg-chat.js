(function() {
    "use strict";

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-chat missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function shouldUseSetForPath(refPath) {
        const segments = refPath.split("/");
        const setSegments = ["acceptedInvitees", "inSession", "theme", "typing", "playerState"];

        for (let i = 0; i < segments.length; i++) {
            if (setSegments.includes(segments[i])) {
                return true;
            }
        }

        return false;
    }

    function handlePost(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.path !== "string" || msg.path.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid path" });
            return;
        }

        const refPath = msg.path.trim();
        const data = msg.data !== undefined ? msg.data : {};

        const ref = BingerBGFirebase.ref(refPath);
        const useSet = shouldUseSetForPath(refPath);
        const write = useSet ? ref.set(data) : ref.push(data);

        write
            .then(() => {
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
            })
            .catch((err) => {
                console.error("[Binger] Firebase post error:", err);
                BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: err.message });
            });
    }

    function handleSubscribeToMessages(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/messages`);
        const listeners = BingerBGState.getMessageListeners();

        if (listeners[roomId]) {
            ref.off("child_added", listeners[roomId]);
            delete listeners[roomId];
        }

        const callback = (snapshot) => {
            const newMessage = snapshot.val();
            if (newMessage) {
                BingerBGHelpers.broadcastToTabs({
                    command: "newChatMessage",
                    message: newMessage
                });
            }
        };

        ref.on("child_added", callback);
        listeners[roomId] = callback;

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
    }

    function handleUnsubscribeFromMessages(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getMessageListeners();

        if (listeners[roomId]) {
            BingerBGFirebase.ref(`rooms/${roomId}/messages`).off("child_added", listeners[roomId]);
            delete listeners[roomId];
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    self.BingerBGChat = {
        handlePost,
        handleSubscribeToMessages,
        handleUnsubscribeFromMessages
    };

})();