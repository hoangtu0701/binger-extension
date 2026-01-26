// ============================================================================
// BACKGROUND UTILITIES
// Shared utility functions for background service worker
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Room ID range (6 digits: 100000 to 999999)
    const ROOM_ID_MIN = 100000;
    const ROOM_ID_RANGE = 900000;

    // URL pattern for phimbro tabs
    const PHIMBRO_URL_PATTERN = "*://phimbro.com/*";

    // ========================================================================
    // TAB BROADCASTING
    // ========================================================================

    /**
     * Broadcast a message to all phimbro.com tabs
     * @param {object} message - The message object to send
     * @param {function} [callback] - Optional callback after sending
     */
    function broadcastToTabs(message, callback) {
        chrome.tabs.query({ url: PHIMBRO_URL_PATTERN }, (tabs) => {
            // Check for query errors
            if (chrome.runtime.lastError) {
                console.warn("[Binger] Tab query error:", chrome.runtime.lastError.message);
                if (callback) callback([]);
                return;
            }

            // Validate tabs array
            if (!tabs || !Array.isArray(tabs)) {
                if (callback) callback([]);
                return;
            }

            tabs.forEach((tab) => {
                if (tab.id && tab.id > 0) {
                    chrome.tabs.sendMessage(tab.id, message, () => {
                        // Check for send errors (tab closed, no content script, etc.)
                        if (chrome.runtime.lastError) {
                            // Silently ignore - this is expected for tabs without content script
                        }
                    });
                }
            });

            if (callback) callback(tabs);
        });
    }

    /**
     * Fetch and broadcast updated user list for a room to all tabs
     * @param {string} roomId - The room ID
     */
    function broadcastUpdatedUserList(roomId) {
        // Validate input
        if (!roomId || typeof roomId !== "string" || roomId.trim() === "") {
            console.warn("[Binger] broadcastUpdatedUserList called with invalid roomId");
            return;
        }

        // Check BingerBGFirebase exists
        if (typeof BingerBGFirebase === "undefined") {
            console.error("[Binger] broadcastUpdatedUserList - BingerBGFirebase not available");
            return;
        }

        const cleanRoomId = roomId.trim();
        const usersRef = BingerBGFirebase.ref(`rooms/${cleanRoomId}/users`);
        const hostRef = BingerBGFirebase.ref(`rooms/${cleanRoomId}/host`);

        // Check refs are valid
        if (!usersRef || !hostRef) {
            console.error("[Binger] broadcastUpdatedUserList - failed to create Firebase refs");
            return;
        }

        Promise.all([usersRef.once("value"), hostRef.once("value")])
            .then(([userSnap, hostSnap]) => {
                const usersData = userSnap.val();
                const hostUid = hostSnap.val();

                if (!usersData) {
                    // No users in room - broadcast empty list
                    broadcastToTabs({
                        command: "updateUserList",
                        users: []
                    });
                    return;
                }

                const finalDisplay = Object.entries(usersData).map(([uid, user]) => {
                    // Safe email extraction
                    const email = user?.email || "";
                    const name = email.split("@")[0] || "unknown";
                    return uid === hostUid ? `${name} (host)` : name;
                });

                broadcastToTabs({
                    command: "updateUserList",
                    users: finalDisplay
                });
            })
            .catch((err) => {
                console.error("[Binger] Failed to fetch user list:", err);
            });
    }

    // ========================================================================
    // ROOM HELPERS
    // ========================================================================

    /**
     * Generate a random 6-digit room ID
     * @returns {string} A 6-digit room ID
     */
    function generateRoomId() {
        return Math.floor(ROOM_ID_MIN + Math.random() * ROOM_ID_RANGE).toString();
    }

    // ========================================================================
    // VECTOR MATH
    // ========================================================================

    /**
     * Calculate cosine similarity between two vectors
     * Used for scene-seeking embedding comparison
     * @param {number[]} vecA - First vector
     * @param {number[]} vecB - Second vector
     * @returns {number} Similarity score between -1 and 1, or 0 on error
     */
    function cosineSimilarity(vecA, vecB) {
        // Validate inputs
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

            // Validate each element is a number
            if (typeof a !== "number" || typeof b !== "number") {
                continue;
            }

            dot += a * b;
            normA += a * a;
            normB += b * b;
        }

        // Handle division by zero (zero vectors)
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) {
            return 0;
        }

        return dot / denominator;
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGUtils = {
        broadcastToTabs,
        broadcastUpdatedUserList,
        generateRoomId,
        cosineSimilarity
    };

})();