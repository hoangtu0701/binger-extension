(function() {
    "use strict";

    const ROOM_ID_MIN = 100000;
    const ROOM_ID_RANGE = 900000;

    const PHIMBRO_URL_PATTERN = "*://phimbro.com/*";

    function safeSendResponse(sendResponse, data) {
        try {
            if (typeof sendResponse === "function") {
                sendResponse(data);
            }
        } catch (err) {
        }
    }

    function unsubscribeFromTyping(roomId) {
        if (!roomId || typeof roomId !== "string") return;

        if (typeof self.BingerBGTyping !== "undefined" && self.BingerBGTyping.handleUnsubscribeFromTyping) {
            self.BingerBGTyping.handleUnsubscribeFromTyping({ roomId }, () => {});
        } else {
            chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId }, () => {
                if (chrome.runtime.lastError) {
                }
            });
        }
    }

    function broadcastToTabs(message, callback) {
        chrome.tabs.query({ url: PHIMBRO_URL_PATTERN }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.warn("[Binger] Tab query error:", chrome.runtime.lastError.message);
                if (callback) callback([]);
                return;
            }

            if (!tabs || !Array.isArray(tabs)) {
                if (callback) callback([]);
                return;
            }

            tabs.forEach((tab) => {
                if (tab.id && tab.id > 0) {
                    chrome.tabs.sendMessage(tab.id, message, () => {
                        if (chrome.runtime.lastError) {
                        }
                    });
                }
            });

            if (callback) callback(tabs);
        });
    }

    function broadcastUpdatedUserList(roomId) {
        if (!roomId || typeof roomId !== "string" || roomId.trim() === "") {
            console.warn("[Binger] broadcastUpdatedUserList called with invalid roomId");
            return;
        }

        if (typeof BingerBGFirebase === "undefined") {
            console.error("[Binger] broadcastUpdatedUserList - BingerBGFirebase not available");
            return;
        }

        const cleanRoomId = roomId.trim();
        const usersRef = BingerBGFirebase.ref(`rooms/${cleanRoomId}/users`);
        const hostRef = BingerBGFirebase.ref(`rooms/${cleanRoomId}/host`);

        if (!usersRef || !hostRef) {
            console.error("[Binger] broadcastUpdatedUserList - failed to create Firebase refs");
            return;
        }

        Promise.all([usersRef.once("value"), hostRef.once("value")])
            .then(([userSnap, hostSnap]) => {
                const usersData = userSnap.val();
                const hostUid = hostSnap.val();

                if (!usersData) {
                    broadcastToTabs({
                        command: "updateUserList",
                        users: []
                    });
                    return;
                }

                const userList = Object.entries(usersData).map(([uid, user]) => {
                    const email = user?.email || "";
                    const name = email.split("@")[0] || "unknown";
                    return { name, isHost: uid === hostUid };
                });

                broadcastToTabs({
                    command: "updateUserList",
                    users: userList
                });
            })
            .catch((err) => {
                console.error("[Binger] Failed to fetch user list:", err);
            });
    }

    function generateRoomId() {
        return Math.floor(ROOM_ID_MIN + Math.random() * ROOM_ID_RANGE).toString();
    }

    function cosineSimilarity(vecA, vecB) {
        if (!Array.isArray(vecA) || !Array.isArray(vecB)) {
            console.warn("[Binger] cosineSimilarity - invalid input: not arrays");
            return 0;
        }

        if (vecA.length !== vecB.length) {
            console.warn("[Binger] cosineSimilarity - vector length mismatch:", vecA.length, "vs", vecB.length);
            return 0;
        }

        if (vecA.length === 0) {
            return 0;
        }

        let dot = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            const a = vecA[i];
            const b = vecB[i];

            if (typeof a !== "number" || typeof b !== "number") {
                continue;
            }

            dot += a * b;
            normA += a * a;
            normB += b * b;
        }

        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0;
        }

        return dot / denominator;
    }

    self.BingerBGHelpers = {
        safeSendResponse,
        unsubscribeFromTyping,
        broadcastToTabs,
        broadcastUpdatedUserList,
        generateRoomId,
        cosineSimilarity
    };

})();