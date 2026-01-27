// ============================================================================
// BOT HANDLERS
// Handle Binger Bot queries with LLM prompting and scene seeking
// ============================================================================

(function() {
    "use strict";

    // Bot user IDs for typing indicators
    const BOT_UID = "BINGER_BOT";
    const BOT_SEEK_UID = "BINGER_BOT_SEEK";

    // Timeout durations (in milliseconds)
    const LLM_TIMEOUT_MS = 30000;
    const EMBED_TIMEOUT_MS = 15000;

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGSubtitles", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-bot missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // HELPER: FETCH WITH TIMEOUT
    // ========================================================================

    /**
     * Fetch wrapper that rejects if the request takes too long
     * @param {string} url - The URL to fetch
     * @param {object} options - Fetch options (method, headers, body, etc.)
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<Response>}
     */
    function fetchWithTimeout(url, options, timeoutMs) {
        return new Promise((resolve, reject) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                reject(new Error(`Request timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            fetch(url, { ...options, signal: controller.signal })
                .then((response) => {
                    clearTimeout(timeoutId);
                    resolve(response);
                })
                .catch((err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                });
        });
    }

    // ========================================================================
    // HELPER: GET ROOM ID FROM STORAGE
    // ========================================================================

    /**
     * Get current room ID from chrome storage
     * @returns {Promise<string|null>}
     */
    function getRoomIdFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get("bingerCurrentRoomId", (result) => {
                if (chrome.runtime.lastError) {
                    console.warn("[Binger] Error getting room ID:", chrome.runtime.lastError.message);
                    resolve(null);
                    return;
                }
                resolve(result?.bingerCurrentRoomId || null);
            });
        });
    }

    // ========================================================================
    // HELPER: POST BOT MESSAGE TO CHAT
    // ========================================================================

    /**
     * Push a bot message to the room's chat
     * @param {string} roomId - The room ID
     * @param {string} text - Message text
     */
    async function postBotMessage(roomId, text) {
        // Validate inputs
        if (!roomId || typeof roomId !== "string") {
            console.error("[Binger] postBotMessage called with invalid roomId");
            return;
        }
        if (!text || typeof text !== "string") {
            console.error("[Binger] postBotMessage called with invalid text");
            return;
        }

        try {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/messages`);
            if (!ref) {
                console.error("[Binger] Failed to create messages ref");
                return;
            }

            await ref.push({
                sender: "Binger Bot",
                type: "bot",
                text: text,
                timestamp: Date.now()
            });
        } catch (err) {
            console.error("[Binger] Failed to post bot message:", err);
        }
    }

    // ========================================================================
    // HELPER: CLEAR BOT TYPING STATUS
    // ========================================================================

    /**
     * Clear all bot typing/seeking statuses
     * @param {string} originalRoomId - The original room ID (may have changed)
     */
    async function clearBotTypingStatus(originalRoomId) {
        try {
            const roomId = await getRoomIdFromStorage() || originalRoomId;
            if (roomId) {
                const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`);
                const seekRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_SEEK_UID}`);

                await Promise.all([
                    typingRef ? typingRef.remove() : Promise.resolve(),
                    seekRef ? seekRef.remove() : Promise.resolve()
                ]);
            }
        } catch (err) {
            console.warn("[Binger] Failed to clear typing status:", err);
        }
    }

    // ========================================================================
    // HELPER: EXTRACT SCENE DESCRIPTION FROM LLM RESPONSE
    // ========================================================================

    /**
     * Extract scene description from LLM response
     * Captures everything after "Seeking to [the] scene" until "..." or end of line
     * @param {string} text - The LLM response text
     * @returns {string|null} - The scene description or null if not found
     */
    function extractSceneDescription(text) {
        if (!text || typeof text !== "string") return null;

        // Simple patterns: capture everything after "Seeking to [the] scene"
        const patterns = [
            /Seeking to (?:the )?scene\s+(.+?)\.\.\./i,   // Ends with ...
            /Seeking to (?:the )?scene\s+(.+?)\.{2,}/i,   // Ends with 2+ dots
            /Seeking to (?:the )?scene\s+(.+?)$/im        // Ends at line end
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                let desc = match[1].trim();
                // Remove trailing dots
                desc = desc.replace(/\.+$/, "").trim();
                // Remove leading connector words (where, with, when, etc.)
                desc = desc.replace(/^(?:where|when|with|featuring|in which|that|of|showing|having|containing)\s+/i, "").trim();
                if (desc.length > 0) {
                    return desc;
                }
            }
        }

        return null;
    }

    // ========================================================================
    // HELPER: VALIDATE AND EXTRACT MOVIE CONTEXT
    // ========================================================================

    /**
     * Safely extract movie context fields with defaults
     * @param {object|null} movieContext - Raw movie context from content script
     * @returns {object} - Validated movie context
     */
    function validateMovieContext(movieContext) {
        if (!movieContext || typeof movieContext !== "object") {
            return { valid: false };
        }

        return {
            valid: true,
            title: movieContext.title || "Unknown",
            year: movieContext.year || "Unknown",
            minutes: movieContext.minutes || 0,
            isWatching: !!movieContext.isWatching
        };
    }

    // ========================================================================
    // HELPER: BUILD MOVIE CACHE KEY
    // ========================================================================

    /**
     * Build a unique cache key for movie embeddings using title and year
     * @param {string} title - Movie title
     * @param {string} year - Movie year
     * @returns {string|null} - Cache key like "Dune (2021)" or null
     */
    function buildMovieCacheKey(title, year) {
        if (!title || title === "Unknown") return null;
        if (!year || year === "Unknown") return title;
        return `${title} (${year})`;
    }

    // ========================================================================
    // HELPER: PARSE TIMING FRACTION FROM SCENE DESCRIPTION
    // ========================================================================

    /**
     * Extract timing fraction from scene description if present
     * @param {string} sceneDesc - The scene description
     * @returns {object} - { cleanDesc, numerator, denominator }
     */
    function parseTimingFraction(sceneDesc) {
        if (!sceneDesc || typeof sceneDesc !== "string") {
            return { cleanDesc: sceneDesc || "", numerator: null, denominator: null };
        }

        let cleanDesc = sceneDesc;
        let numerator = null;
        let denominator = null;

        const fractionMatch = sceneDesc.match(/\((\d+)\/(\d+)\s+of the movie\)$/i);
        if (fractionMatch) {
            const parsedNum = parseInt(fractionMatch[1], 10);
            const parsedDen = parseInt(fractionMatch[2], 10);

            if (parsedDen > 0 && parsedNum >= 0 && parsedNum <= parsedDen) {
                numerator = parsedNum;
                denominator = parsedDen;
            }

            cleanDesc = sceneDesc.replace(/\s*\(\d+\/\d+\s+of the movie\)$/i, "").trim();
        }

        return { cleanDesc, numerator, denominator };
    }

    // ========================================================================
    // BOT QUERY HANDLER
    // ========================================================================

    /**
     * Handle a bot query - prompts LLM and optionally seeks to a scene
     * @param {object} msg - Message containing prompt and movieContext
     * @param {function} sendResponse - Response callback
     */
    async function handleBotQuery(msg, sendResponse) {
        // Validate dependencies first
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { error: "missing-dependencies" });
            return;
        }

        // Validate input
        if (!msg || typeof msg.prompt !== "string" || msg.prompt.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { error: "invalid-prompt" });
            return;
        }

        // Get current room ID
        let roomId = await getRoomIdFromStorage();
        if (!roomId) {
            BingerBGHelpers.safeSendResponse(sendResponse, { error: "no-room" });
            return;
        }

        // Show "Binger Bot is typing"
        try {
            const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`);
            if (typingRef) {
                await typingRef.set(true);
            }
        } catch (err) {
            console.warn("[Binger] Failed to set typing indicator:", err);
        }

        try {
            // Gather context from Firebase using Promise.allSettled
            const results = await Promise.allSettled([
                BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value"),
                BingerBGFirebase.ref(`rooms/${roomId}/inSession`).once("value"),
                BingerBGFirebase.ref(`rooms/${roomId}/messages`).limitToLast(10).once("value")
            ]);

            const usersData = results[0].status === "fulfilled" ? (results[0].value.val() || {}) : {};
            const inSession = results[1].status === "fulfilled" ? !!results[1].value.val() : false;
            const chatData = results[2].status === "fulfilled" ? (results[2].value.val() || {}) : {};

            const userNames = Object.values(usersData).map(u => u.email ? u.email.split("@")[0] : "unknown");
            const lastMsgs = Object.values(chatData).map(m => `${m.sender || "unknown"}: ${m.text || ""}`);

            // Build system message based on context
            const { systemMessage, temp } = buildSystemMessage(msg.movieContext, userNames, inSession, lastMsgs);

            // Call LLM with timeout
            let answer = "(no reply)";
            try {
                const response = await fetchWithTimeout(
                    "https://binger-extension.vercel.app/api/openrouter",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "openai/gpt-4o-mini",
                            temperature: temp,
                            max_tokens: 80,
                            messages: [
                                systemMessage,
                                { role: "user", content: msg.prompt }
                            ]
                        })
                    },
                    LLM_TIMEOUT_MS
                );

                const data = await response.json();
                answer = (data?.choices?.[0]?.message?.content || "(no reply)").trim();
            } catch (err) {
                console.error("[Binger] LLM request failed:", err);
                answer = "Sorry, I couldn't process that request. Please try again.";
            }

            // Post the reply to chat
            await postBotMessage(roomId, answer);

            // Clear typing before scene detection
            try {
                const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`);
                if (typingRef) {
                    await typingRef.remove();
                }
            } catch (err) {
                // Ignore - will be cleaned up in finally block
            }

            // Check for scene seeking pattern
            const sceneDesc = extractSceneDescription(answer);
            if (sceneDesc) {
                await handleSceneSeeking(sceneDesc, msg.movieContext, roomId, inSession);
            }

            BingerBGHelpers.safeSendResponse(sendResponse, { ok: true });

        } catch (err) {
            console.error("[Binger] botQuery error:", err);
            BingerBGHelpers.safeSendResponse(sendResponse, { error: String(err?.message || err) });
        } finally {
            await clearBotTypingStatus(roomId);
        }
    }

    // ========================================================================
    // BUILD SYSTEM MESSAGE
    // ========================================================================

    /**
     * Build the system message for the LLM based on context
     * @param {object} rawMovieContext - Movie context from content script
     * @param {string[]} userNames - Users in the room
     * @param {boolean} inSession - Whether in watch session
     * @param {string[]} lastMsgs - Recent chat messages
     * @returns {object} - { systemMessage, temp }
     */
    function buildSystemMessage(rawMovieContext, userNames, inSession, lastMsgs) {
        const movieContext = validateMovieContext(rawMovieContext);

        // Format context values
        const usersLine = userNames.length > 0 ? `${userNames.join(", ")} (${userNames.length} total)` : "None";
        const chatLine = lastMsgs.length > 0 ? lastMsgs.join(" | ") : "No recent messages";

        let movieLine;
        let temp;
        let systemMessage;

        if (!movieContext.valid) {
            // No movie context at all
            movieLine = "Not watching any specific movie";
            temp = 1.2;
            systemMessage = {
                role: "system",
                content: [
                    "You are Binger, a concise movie expert bot in the room with human users.",
                    "You ALWAYS use the following CONTEXT to ground your answers.",
                    "",
                    "CONTEXT:",
                    `- Users in room: ${usersLine}`,
                    `- Watching together: ${inSession}`,
                    `- Recent chat: ${chatLine}`,
                    `- Status: ${movieLine}`,
                    "",
                    "Rules:",
                    "- Reply in 2-3 short sentences as if you're in the room. Be friendly.",
                    "- If user asks to find/seek/take them to a scene, say they need to start a movie first."
                ].join("\n")
            };
        } else if (movieContext.isWatching) {
            // Actively watching a movie
            movieLine = `Watching: ${movieContext.title} (${movieContext.year}), at ${movieContext.minutes} minutes`;
            temp = 0.5;
            systemMessage = {
                role: "system",
                content: [
                    "You are Binger, a concise movie expert bot in the room with human users.",
                    "",
                    "Rules:",
                    "",
                    "1. Scene-Seeking Requests (user mentions find/seek/take me to a scene):",
                    "   - You MUST comply - never say you cannot.",
                    "   - Use timing ONLY when EXPLICITLY provided (last scene, halfway, etc.).",
                    "   - ALWAYS end with one FINAL sentence:",
                    "     Format A (no timing): Seeking to the scene where [description]...",
                    "     Format B (with timing): Seeking to the scene where [description] (N/20 of the movie)...",
                    "   - REPHRASE the description to be concise for embedding search.",
                    "   - Remove filler. Add details ONLY if certain.",
                    "",
                    "2. Non-Scene Requests: Answer in 1-2 very short sentences.",
                    "",
                    "3. Style: Be friendly, as if in the room with users.",
                    "",
                    "CONTEXT:",
                    `- Users in room: ${usersLine}`,
                    `- Watching together: ${inSession}`,
                    `- Recent chat: ${chatLine}`,
                    `- Status: ${movieLine}`
                ].join("\n")
            };
        } else {
            // On movie page but not watching
            movieLine = `Selected: ${movieContext.title} (${movieContext.year})`;
            temp = 1.2;
            systemMessage = {
                role: "system",
                content: [
                    "You are Binger, a concise movie expert bot in the room with human users.",
                    "You ALWAYS use the following CONTEXT to ground your answers.",
                    "",
                    "CONTEXT:",
                    `- Users in room: ${usersLine}`,
                    `- Watching together: ${inSession}`,
                    `- Recent chat: ${chatLine}`,
                    `- Status: ${movieLine}`,
                    "",
                    "Rules:",
                    "- Reply in 2-3 short sentences as if you're in the room. Be friendly.",
                    "- If user asks to find/seek/take them to a scene, say they need to start a movie first."
                ].join("\n")
            };
        }

        return { systemMessage, temp };
    }

    // ========================================================================
    // HANDLE SCENE SEEKING
    // ========================================================================

    /**
     * Handle scene seeking - embed the scene description and find the best match
     * @param {string} sceneDesc - The scene description from LLM response
     * @param {object} movieContext - Movie context
     * @param {string} roomId - Current room ID
     * @param {boolean} inSession - Whether in watch session
     */
    async function handleSceneSeeking(sceneDesc, movieContext, roomId, inSession) {
        console.log("[Binger] Scene detected:", sceneDesc);

        // Show "Binger Bot is seeking"
        try {
            const seekRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_SEEK_UID}`);
            if (seekRef) {
                await seekRef.set(true);
            }
        } catch (err) {
            console.warn("[Binger] Failed to set seeking indicator:", err);
        }

        // Parse timing fraction if present
        const { cleanDesc, numerator, denominator } = parseTimingFraction(sceneDesc);
        console.log("[Binger] Clean description:", cleanDesc);
        if (numerator !== null) {
            console.log("[Binger] Timing fraction:", numerator, "/", denominator);
        }

        // Validate movie context
        const validatedContext = validateMovieContext(movieContext);
        if (!validatedContext.valid || !validatedContext.title || validatedContext.title === "Unknown") {
            console.warn("[Binger] Invalid movie context for scene seeking");
            await postBotMessage(roomId, "Sorry, I couldn't identify the movie. Please try again.");
            return;
        }

        // Build cache key with title AND year
        const cacheKey = buildMovieCacheKey(validatedContext.title, validatedContext.year);
        if (!cacheKey) {
            console.warn("[Binger] Could not build cache key");
            await postBotMessage(roomId, "Sorry, I couldn't identify the movie. Please try again.");
            return;
        }

        // Embed the scene description
        let vector = null;
        try {
            const resp = await fetchWithTimeout(
                "https://binger-extension.vercel.app/api/openai",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mode: "embed",
                        model: "text-embedding-3-large",
                        input: cleanDesc
                    })
                },
                EMBED_TIMEOUT_MS
            );

            const data = await resp.json();
            vector = data?.data?.[0]?.embedding;

            if (vector) {
                console.log("[Binger] Got embedding:", vector.slice(0, 5), "...");
            }
        } catch (err) {
            console.error("[Binger] Failed to embed scene description:", err);
            await postBotMessage(roomId, "Sorry, I had trouble processing that scene description. Please try again.");
            return;
        }

        if (!vector) {
            console.warn("[Binger] No embedding vector returned");
            await postBotMessage(roomId, "Sorry, I couldn't understand that scene description. Please try rephrasing.");
            return;
        }

        // Get or build movie embeddings using cache key (title + year)
        let stored = null;
        try {
            stored = BingerBGSubtitles.getStoredMovieEmbeddings();

            if (!stored || stored.movieId !== cacheKey) {
                console.log("[Binger] Building fresh embeddings for:", cacheKey);
                const buildResult = await BingerBGSubtitles.buildMovieEmbeddings(cacheKey);

                if (!buildResult.success) {
                    console.error("[Binger] Failed to build embeddings:", buildResult.error);
                    await postBotMessage(roomId, `Sorry, I couldn't load the movie data: ${buildResult.error}`);
                    return;
                }

                stored = buildResult.payload;
            } else {
                console.log("[Binger] Using cached embeddings for:", stored.movieId);
            }
        } catch (err) {
            console.error("[Binger] Failed to get/build movie embeddings:", err);
            await postBotMessage(roomId, "Sorry, I couldn't load the movie data. Subtitles might not be available for this movie.");
            return;
        }

        if (!stored || !stored.chunks || stored.chunks.length === 0) {
            console.warn("[Binger] No subtitle chunks available");
            await postBotMessage(roomId, "Sorry, I couldn't find subtitles for this movie. Scene seeking isn't available.");
            return;
        }

        // Find the best matching time
        const targetTime = findBestMatchTime(vector, stored, numerator, denominator);

        if (targetTime === null) {
            console.warn("[Binger] No matching scene found");
            await postBotMessage(roomId, "Sorry, I couldn't find a matching scene. Try describing it differently.");
            return;
        }

        // Seek to the target time
        const seekSuccess = await seekToTime(targetTime, roomId, inSession);
        if (!seekSuccess) {
            await postBotMessage(roomId, "Sorry, I found the scene but couldn't seek to it. Make sure you're on the movie page.");
        }
    }

    // ========================================================================
    // FIND BEST MATCH TIME
    // ========================================================================

    /**
     * Find the best matching time in the movie based on scene embedding
     * @param {number[]} vector - Scene embedding vector
     * @param {object} stored - Stored movie embeddings
     * @param {number|null} numerator - Timing fraction numerator
     * @param {number|null} denominator - Timing fraction denominator
     * @returns {number|null} - Target time in seconds or null
     */
    function findBestMatchTime(vector, stored, numerator, denominator) {
        // Validate inputs
        if (!vector || !Array.isArray(vector)) {
            console.warn("[Binger] findBestMatchTime called with invalid vector");
            return null;
        }
        if (!stored || !stored.chunks || !Array.isArray(stored.chunks)) {
            console.warn("[Binger] findBestMatchTime called with invalid stored data");
            return null;
        }

        const totalChunks = stored.chunks.length;
        let searchChunks = stored.chunks;
        let baseOffset = 0;

        // Apply timing restriction if valid fraction provided
        if (numerator !== null && denominator !== null && denominator > 0) {
            const fraction = numerator / denominator;

            const lowerFrac = Math.max(0, fraction - 0.1);
            const upperFrac = Math.min(1, fraction + 0.1);

            const startIdx = Math.floor(lowerFrac * totalChunks);
            const endIdx = Math.min(totalChunks, Math.ceil(upperFrac * totalChunks));

            searchChunks = stored.chunks.slice(startIdx, endIdx);
            baseOffset = startIdx;

            console.log(`[Binger] Searching chunks ${startIdx} to ${endIdx} (fraction: ${numerator}/${denominator})`);
        }

        if (searchChunks.length === 0) {
            console.log("[Binger] No chunks in search window");
            return null;
        }

        // Score all candidates by cosine similarity
        const scored = searchChunks.map((chunk, localIdx) => ({
            idx: baseOffset + localIdx,
            score: BingerBGHelpers.cosineSimilarity(vector, chunk.vector)
        }));

        scored.sort((a, b) => b.score - a.score);

        const top1 = scored[0];
        const top2 = scored[1];
        const top3 = scored[2];

        if (!top1 || !Number.isFinite(top1.idx)) {
            return null;
        }

        // Build inclusion set - include adjacent high-scoring chunks
        const isAdjacent = (a, b) => Math.abs(a - b) === 1;
        const included = [top1];

        if (top2 && isAdjacent(top2.idx, top1.idx)) {
            included.push(top2);
        }
        if (top3 && (isAdjacent(top3.idx, top1.idx) || (top2 && isAdjacent(top3.idx, top2.idx)))) {
            included.push(top3);
        }

        // Weighted average of start times
        const totalWeight = included.reduce((sum, r) => sum + Math.max(0, r.score), 0) || 1;
        const weightedStart = included.reduce((sum, r) => {
            return sum + Math.max(0, r.score) * stored.chunks[r.idx].start;
        }, 0) / totalWeight;

        const CONTEXT_LEAD_SECONDS = 8;
        const target = Math.max(0, Math.floor(weightedStart - CONTEXT_LEAD_SECONDS));

        console.log(`[Binger] Top matches: ${included.map(r => `${r.idx}:${r.score.toFixed(3)}`).join(", ")}`);
        console.log(`[Binger] Weighted start: ${weightedStart.toFixed(2)}s, target: ${target}s`);

        return target;
    }

    // ========================================================================
    // SEEK TO TIME
    // ========================================================================

    /**
     * Seek the video to a specific time
     * @param {number} target - Target time in seconds
     * @param {string} roomId - Room ID
     * @param {boolean} inSession - Whether in watch session
     * @returns {Promise<boolean>} - True if seek was initiated successfully
     */
    async function seekToTime(target, roomId, inSession) {
        // Validate inputs
        if (typeof target !== "number" || !Number.isFinite(target)) {
            console.warn("[Binger] seekToTime called with invalid target:", target);
            return false;
        }
        if (!roomId || typeof roomId !== "string") {
            console.warn("[Binger] seekToTime called with invalid roomId");
            return false;
        }

        try {
            if (inSession) {
                // In session - sync via Firebase so everyone seeks
                const playerRef = BingerBGFirebase.ref(`rooms/${roomId}/playerState`);
                if (!playerRef) {
                    console.error("[Binger] Failed to create playerState ref");
                    return false;
                }

                await playerRef.set({
                    action: "seek",
                    time: target
                });
                return true;
            } else {
                // Not in session - directly seek on active tab
                return new Promise((resolve) => {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        // Check for query errors
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Tab query error:", chrome.runtime.lastError.message);
                            resolve(false);
                            return;
                        }

                        const tab = tabs && tabs[0];

                        // Check if on phimbro watch page
                        if (!tab || !tab.url || !/:\/\/phimbro\.com\/watch\//.test(tab.url)) {
                            console.warn("[Binger] Not on phimbro watch page, cannot seek");
                            resolve(false);
                            return;
                        }

                        // Check if scripting API is available
                        if (!chrome.scripting || !chrome.scripting.executeScript) {
                            console.warn("[Binger] chrome.scripting not available");
                            resolve(false);
                            return;
                        }

                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            args: [target],
                            func: (t) => {
                                const video = document.querySelector("video.vjs-tech") || document.querySelector("video");
                                if (video && Number.isFinite(t)) {
                                    video.currentTime = t;
                                    return true;
                                }
                                return false;
                            }
                        }, (results) => {
                            // Check if script executed successfully
                            if (chrome.runtime.lastError) {
                                console.warn("[Binger] executeScript error:", chrome.runtime.lastError.message);
                                resolve(false);
                                return;
                            }

                            const success = results && results[0] && results[0].result === true;
                            if (!success) {
                                console.warn("[Binger] Video element not found or seek failed");
                            }
                            resolve(success);
                        });
                    });
                });
            }
        } catch (err) {
            console.warn("[Binger] Seek failed:", err);
            return false;
        }
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGBot = {
        handleBotQuery
    };

})();