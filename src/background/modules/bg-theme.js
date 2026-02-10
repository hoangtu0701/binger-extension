(function() {
    "use strict";

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGState", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-theme missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function handleSubscribeToTheme(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const ref = BingerBGFirebase.ref(`rooms/${roomId}/theme`);

        if (!ref) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Failed to create Firebase ref" });
            return;
        }

        const listeners = BingerBGState.getThemeListeners();

        if (listeners[roomId]) {
            ref.off("value", listeners[roomId]);
            delete listeners[roomId];
        }

        const cb = (snapshot) => {
            const theme = snapshot.val();

            BingerBGHelpers.broadcastToTabs({
                command: "themeUpdated",
                theme,
                roomId
            });
        };

        ref.on("value", cb);
        listeners[roomId] = cb;

        BingerBGHelpers.safeSendResponse(sendResponse, { status: "subscribed", roomId: roomId });
    }

    function handleUnsubscribeFromTheme(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        if (!msg || typeof msg.roomId !== "string" || msg.roomId.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Invalid roomId" });
            return;
        }

        const roomId = msg.roomId.trim();
        const listeners = BingerBGState.getThemeListeners();

        if (listeners[roomId]) {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/theme`);
            if (ref) {
                ref.off("value", listeners[roomId]);
            }
            delete listeners[roomId];
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "unsubscribed", roomId: roomId });
        } else {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "no-listener", roomId: roomId });
        }
    }

    self.BingerBGTheme = {
        handleSubscribeToTheme,
        handleUnsubscribeFromTheme
    };

})();