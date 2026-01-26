// ============================================================================
// BACKGROUND UTILITIES
// Shared utility functions for background service worker
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // TAB BROADCASTING
    // ========================================================================

    /**
     * Broadcast a message to all phimbro.com tabs
     * @param {object} message - The message object to send
     * @param {function} [callback] - Optional callback after sending
     */
    function broadcastToTabs(message, callback) {
        chrome.tabs.query({ url: "*://phimbro.com/*" }, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, message);
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
        const usersRef = BingerBGFirebase.ref(`rooms/${roomId}/users`);
        const hostRef = BingerBGFirebase.ref(`rooms/${roomId}/host`);

        Promise.all([usersRef.once("value"), hostRef.once("value")])
            .then(([userSnap, hostSnap]) => {
                const usersData = userSnap.val();
                const hostUid = hostSnap.val();

                if (!usersData) return;

                const finalDisplay = Object.entries(usersData).map(([uid, user]) => {
                    const name = user.email.split("@")[0];
                    return uid === hostUid ? `${name} (host)` : name;
                });

                broadcastToTabs({
                    command: "updateUserList",
                    users: finalDisplay
                });
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
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    // ========================================================================
    // VECTOR MATH
    // ========================================================================

    /**
     * Calculate cosine similarity between two vectors
     * Used for scene-seeking embedding comparison
     * @param {number[]} vecA - First vector
     * @param {number[]} vecB - Second vector
     * @returns {number} Similarity score between -1 and 1
     */
    function cosineSimilarity(vecA, vecB) {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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