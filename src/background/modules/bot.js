// ============================================================================
// BOT HANDLERS
// Handle Binger Bot queries with LLM prompting and scene seeking
// ============================================================================

(function() {
    "use strict";

    // Bot user IDs for typing indicators
    const BOT_UID = "BINGER_BOT";
    const BOT_SEEK_UID = "BINGER_BOT_SEEK";

    // ========================================================================
    // BOT QUERY HANDLER
    // ========================================================================

    /**
     * Handle a bot query - prompts LLM and optionally seeks to a scene
     * @param {object} msg - Message containing prompt and movieContext
     * @param {function} sendResponse - Response callback
     */
    async function handleBotQuery(msg, sendResponse) {
        // Resolve current roomId once (survives page reloads)
        let roomId = await getRoomIdFromStorage();
        if (!roomId) {
            try { sendResponse({ error: "no-room" }); } catch {}
            return;
        }

        // Show "Binger Bot is typing"
        try {
            await new Promise(r => setTimeout(r, 150));
            await BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`).set(true);
        } catch (e) {
            console.warn("[Binger] typing set failed:", e);
        }

        try {
            // Gather context
            const [usersSnap, sessionSnap, chatSnap] = await Promise.all([
                BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value"),
                BingerBGFirebase.ref(`rooms/${roomId}/inSession`).once("value"),
                BingerBGFirebase.ref(`rooms/${roomId}/messages`).limitToLast(10).once("value")
            ]);

            const usersData = usersSnap.val() || {};
            const userNames = Object.values(usersData).map(u => u.email.split("@")[0]);
            const inSession = !!sessionSnap.val();
            const lastMsgs = Object.values(chatSnap.val() || {}).map(m => `${m.sender}: ${m.text}`);

            // Build system message based on context
            const { systemMessage, temp } = buildSystemMessage(msg.movieContext, userNames, inSession, lastMsgs);

            // Call LLM
            const r = await fetch("https://binger-extension.vercel.app/api/openrouter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-4o-mini",
                    temperature: temp,
                    max_tokens: 80,
                    messages: [
                        systemMessage,
                        { role: "user", content: msg.prompt }
                    ],
                }),
            });

            const data = await r.json();
            const answer = (data?.choices?.[0]?.message?.content || "(no reply)").trim();

            // Push the reply to chat
            await BingerBGFirebase.ref(`rooms/${roomId}/messages`).push({
                sender: "Binger Bot",
                type: "bot",
                text: answer,
                timestamp: Date.now()
            });

            // Clear typing immediately before scene detection
            try {
                await BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`).remove();
            } catch (e) {
                console.warn("[Binger] typing remove failed (pre-detector):", e);
            }

            // Check for scene seeking pattern
            const match = answer.trim().match(/Seeking to the scene where\s+(.+?)\.\.\.\s*$/i);
            if (match) {
                await handleSceneSeeking(match[1].trim(), msg.movieContext, roomId, inSession);
            }

            // Best-effort response (tab may be gone due to reload)
            try { sendResponse({ ok: true }); } catch {}

        } catch (err) {
            console.error("[Binger] botQuery error:", err);
            try { sendResponse({ error: String(err?.message || err) }); } catch {}
        } finally {
            // Always clear all bot statuses
            await clearBotTypingStatus(roomId);
        }
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
            chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
                resolve(bingerCurrentRoomId);
            });
        });
    }

    // ========================================================================
    // HELPER: BUILD SYSTEM MESSAGE
    // ========================================================================

    /**
     * Build the system message for the LLM based on context
     * @param {object} movieContext - Movie context from content script
     * @param {string[]} userNames - Users in the room
     * @param {boolean} inSession - Whether in watch session
     * @param {string[]} lastMsgs - Recent chat messages
     * @returns {object} { systemMessage, temp }
     */
    function buildSystemMessage(movieContext, userNames, inSession, lastMsgs) {
        let movieLine;
        let temp;
        let systemMessage;

        if (!movieContext) {
            movieLine = "Not watching any specific movie";
            temp = 1.2;
            systemMessage = {
                role: "system",
                content: `You are Binger, a concise movie expert bot in the room with human users. You **ALWAYS** use the following **CONTEXT** to ground your answers.

                        ---
                        CONTEXT
                        - Users currently in the room: ${userNames.join(", ")} (${userNames.length} total)
                        - Users currently watching together: ${inSession}
                        - Recent chat: ${lastMsgs.join(" | ")}
                        - Status: ${movieLine}
                        ---

                        Rules:
                        - Always reply in 2-3 short sentences as if you're in the room with them. Be friendly and engaging.
                        - If user asks to find/seek/take them to a scene, say they need to start a movie first.`
            };
        } else {
            const { title, year, minutes, isWatching } = movieContext;
            
            if (isWatching) {
                movieLine = `Watching Movie: ${title || "Unknown"} (${year || "Unknown"}), at ${minutes} minutes`;
                temp = 0.5;
                systemMessage = {
                    role: "system",
                    content: `You are Binger, a concise movie expert bot in the room with human users. 

                            Rules:
                            1. Scene-Seeking Requests (user explicitly mentions "find/seek/take me to a scene")
                                - You MUST comply - never say you cannot.
                                - Use timing elements **ONLY when EXPLICITLY provided** ("last scene", "halfway", etc.). Otherwise assume no timing is given.
                                - ALWAYS end your reply with one FINAL sentence (no quotation marks):  
                                    - **Format A (no timing implied):**  
                                        Seeking to the scene where + (best description/paraphrase) + ...
                                        Example: *Seeking to the scene where Batman fights off the Joker in the alley...*  
                                    - **Format B (timing implied):**  
                                        Seeking to the scene where + (best description/paraphrase) + (numerator/20 of the movie) + ... 
                                        - Convert the user's timing element into a fraction of the movie where denominator MUST be 20.  
                                        Example: *Seeking to the scene where Batman fights off the Joker in the alley (19/20 of the movie)...*  
                                - Optionally add a bit of commentary before that final sentence for engagement, but keep it short.
                                - For the best description/paraphrase used in that final sentence:
                                    - **REPHRASE** the user's scene description to be concise and optimized for embedding search.  
                                        - Remove filler or vague phrasing. 
                                        - Add details ONLY IF you're certain it'd help (e.g., names, actions, locations).
                                        - Emphasize key actions, emotions, or events if they are explicitly present.  
                                        - Do NOT invent or speculate about details that are not certain.

                            2. Non-Scene Requests (all other questions)  
                                - Answer normally in **1-2 very short sentences**.   

                            3. Style & Context  
                                - Always reply as if you are in the room with the users. Be friendly and engaging.
                                - **ALWAYS** use the following CONTEXT to ground your answers:
                                    - Users currently in the room: ${userNames.join(", ")} (${userNames.length} total)  
                                    - Users currently watching together: ${inSession}  
                                    - Recent chat: ${lastMsgs.join(" | ")}  
                                    - Status: ${movieLine}`
                };
            } else {
                movieLine = `Selected Movie: ${title || "Unknown"} (${year || "Unknown"})`;
                temp = 1.2;
                systemMessage = {
                    role: "system",
                    content: `You are Binger, a concise movie expert bot in the room with human users. You **ALWAYS** use the following **CONTEXT** to ground your answers.

                            ---
                            CONTEXT
                            - Users currently in the room: ${userNames.join(", ")} (${userNames.length} total)
                            - Users currently watching together: ${inSession}
                            - Recent chat: ${lastMsgs.join(" | ")}
                            - Status: ${movieLine}
                            ---

                            Rules:
                            - Always reply in 2-3 short sentences as if you're in the room with them. Be friendly and engaging.
                            - If user asks to find/seek/take them to a scene, say they need to start a movie first.`
                };
            }
        }

        return { systemMessage, temp };
    }

    // ========================================================================
    // HELPER: HANDLE SCENE SEEKING
    // ========================================================================

    /**
     * Handle scene seeking - embed the scene description and find the best match
     * @param {string} sceneDesc - The scene description from LLM response
     * @param {object} movieContext - Movie context
     * @param {string} roomId - Current room ID
     * @param {boolean} inSession - Whether in watch session
     */
    async function handleSceneSeeking(sceneDesc, movieContext, roomId, inSession) {
        console.log(`[Binger] Scene detected (initial description): ${sceneDesc}`);

        // Show "Binger Bot is seeking"
        try {
            await new Promise(r => setTimeout(r, 150));
            await BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_SEEK_UID}`).set(true);
        } catch (e) {
            console.warn("[Binger] seeking set failed:", e);
        }

        // Parse fraction if present
        let cleanDesc = sceneDesc;
        let numerator = null;
        let denominator = null;
        
        const fractionMatch = sceneDesc.match(/\((\d+)\/(\d+)\s+of the movie\)$/i);
        if (fractionMatch) {
            numerator = parseInt(fractionMatch[1], 10);
            denominator = parseInt(fractionMatch[2], 10);
            cleanDesc = sceneDesc.replace(/\s*\(\d+\/\d+\s+of the movie\)$/, "").trim();
            console.log("Scene description:", cleanDesc);
            console.log("Fraction:", numerator, "/", denominator);
        } else {
            console.log("Scene description:", cleanDesc);
            console.log("No fraction provided.");
        }

        let vector = null;
        let stored = null;

        // Embed this scene's cleaned description
        try {
            const resp = await fetch("https://binger-extension.vercel.app/api/openai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "embed",
                    model: "text-embedding-3-large",
                    input: cleanDesc
                })
            });

            const data = await resp.json();
            vector = data?.data?.[0]?.embedding;

            if (vector) {
                console.log("[Binger] Got embedding:", vector.slice(0, 5), "...");
            }
        } catch (e) {
            console.error("[Binger] Failed to embed cleanDesc:", e);
        }

        // Get or build movie embeddings
        try {
            stored = await BingerBGSubtitles.getStoredMovieEmbeddings();
            if (!stored || stored.movieId !== movieContext.title) {
                console.log(`[Binger] No cache found (or different movie). Building fresh embeddings for: ${movieContext.title}`);
                stored = await BingerBGSubtitles.buildMovieEmbeddings(movieContext.title);
            } else {
                console.log(`[Binger] Using cached embeddings for: ${stored.movieId}`);
            }
        } catch (e) {
            console.error("[Binger] Failed to get/build movie embeddings:", e);
        }

        // Compare vectors and find best match
        if (vector && stored && stored.chunks?.length) {
            const targetTime = findBestMatchTime(vector, stored, numerator, denominator);
            
            if (targetTime !== null) {
                await seekToTime(targetTime, roomId, inSession);
            }
        }
    }

    // ========================================================================
    // HELPER: FIND BEST MATCH TIME
    // ========================================================================

    /**
     * Find the best matching time in the movie based on scene embedding
     * @param {number[]} vector - Scene embedding vector
     * @param {object} stored - Stored movie embeddings
     * @param {number|null} numerator - Timing fraction numerator
     * @param {number|null} denominator - Timing fraction denominator
     * @returns {number|null} Target time in seconds or null
     */
    function findBestMatchTime(vector, stored, numerator, denominator) {
        const totalChunks = stored.chunks.length;
        let searchChunks = stored.chunks;
        let baseOffset = 0;

        // Apply timing restriction if fraction provided
        if (numerator && denominator) {
            const fraction = numerator / denominator;

            // Calculate window in terms of fraction of movie
            const lowerFrac = Math.max(0, fraction - 1 / 10);
            const upperFrac = Math.min(1, fraction + 1 / 10);

            const startIdx = Math.floor(lowerFrac * totalChunks);
            const endIdx = Math.min(totalChunks, Math.ceil(upperFrac * totalChunks));

            searchChunks = stored.chunks.slice(startIdx, endIdx);
            baseOffset = startIdx;

            console.log(`[Binger] Fraction bias: ${numerator}/${denominator} -> searching chunks ${startIdx} to ${endIdx}`);
        }

        if (!searchChunks.length) {
            console.log("[Binger] No chunks in search window - skipping seek");
            return null;
        }

        // Score all candidates
        const scored = [];
        searchChunks.forEach((chunk, localIdx) => {
            const idx = baseOffset + localIdx;
            const score = BingerBGUtils.cosineSimilarity(vector, chunk.vector);
            scored.push({ idx, score });
        });

        // Sort by similarity descending and pick the top 3
        scored.sort((a, b) => b.score - a.score);
        const top1 = scored[0];
        const top2 = scored[1];
        const top3 = scored[2];

        if (!top1 || !Number.isFinite(top1.idx)) {
            return null;
        }

        // Build inclusion set with adjacency rule
        const isAdj = (a, b) => Math.abs(a - b) === 1;
        const included = [top1];
        if (top2 && isAdj(top2.idx, top1.idx)) included.push(top2);
        if (top3 && (isAdj(top3.idx, top1.idx) || (top2 && isAdj(top3.idx, top2.idx)))) included.push(top3);

        // Weighted average of START times using similarity scores as weights
        const wSum = included.reduce((s, r) => s + Math.max(0, r.score), 0) || 1;
        const weightedStart = included.reduce((s, r) => s + Math.max(0, r.score) * stored.chunks[r.idx].start, 0) / wSum;

        // Context lead-in
        const CONTEXT_SEC = 8;
        const target = Math.max(0, Math.floor(weightedStart - CONTEXT_SEC));

        console.log(`[Binger] Picks (idx:score): ${included.map((r) => `${r.idx}:${r.score.toFixed(3)}`).join(", ")} -> weighted start ${weightedStart.toFixed(2)}s -> target ${target}s`);

        return target;
    }

    // ========================================================================
    // HELPER: SEEK TO TIME
    // ========================================================================

    /**
     * Seek the video to a specific time
     * @param {number} target - Target time in seconds
     * @param {string} roomId - Room ID
     * @param {boolean} inSession - Whether in watch session
     */
    async function seekToTime(target, roomId, inSession) {
        try {
            if (inSession) {
                // In session - sync via Firebase
                await BingerBGFirebase.ref(`rooms/${roomId}/playerState`).set({ action: "seek", time: target });
            } else {
                // Not in session - directly seek on active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const tab = tabs && tabs[0];
                    if (!tab || !tab.url || !/:\/\/phimbro\.com\/watch\//.test(tab.url)) return;

                    if (chrome.scripting && chrome.scripting.executeScript) {
                        chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            args: [target],
                            func: (t) => {
                                const v = document.querySelector("video.vjs-tech") || document.querySelector("video");
                                if (v && Number.isFinite(t)) v.currentTime = t;
                            },
                        });
                    }
                });
            }
        } catch (e) {
            console.warn("[Binger] bot-seek failed:", e);
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
            // roomId may have changed - re-read just in case
            const roomId = await getRoomIdFromStorage() || originalRoomId;
            if (roomId) {
                await BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`).remove();
                await BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_SEEK_UID}`).remove();
            }
        } catch (e) {
            console.warn("[Binger] typing & seeking remove failed:", e);
        }
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGBot = {
        handleBotQuery
    };

})();