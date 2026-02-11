(function() {
    "use strict";

    const BOT_UID = "BINGER_BOT";
    const BOT_SEEK_UID = "BINGER_BOT_SEEK";

    const LLM_TIMEOUT_MS = 30000;
    const EMBED_TIMEOUT_MS = 15000;

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGSubtitles", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-bot missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

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

    async function postBotMessage(roomId, text) {
        if (!roomId || typeof roomId !== "string") return;
        if (!text || typeof text !== "string") return;

        try {
            const ref = BingerBGFirebase.ref(`rooms/${roomId}/messages`);
            if (!ref) return;

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

    function extractSceneDescription(text) {
        if (!text || typeof text !== "string") return null;

        const patterns = [
            /Seeking to (?:the )?scene\s+(.+?)\.\.\./i,
            /Seeking to (?:the )?scene\s+(.+?)\.{2,}/i,
            /Seeking to (?:the )?scene\s+(.+?)$/im
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                let desc = match[1].trim();
                desc = desc.replace(/\.+$/, "").trim();
                desc = desc.replace(/^(?:where|when|with|featuring|in which|that|of|showing|having|containing)\s+/i, "").trim();
                if (desc.length > 0) {
                    return desc;
                }
            }
        }

        return null;
    }

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

    function buildMovieCacheKey(title, year) {
        if (!title || title === "Unknown") return null;
        if (!year || year === "Unknown") return title;
        return `${title} (${year})`;
    }

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

    async function needsWebSearch(userPrompt, lastMsgs) {
        try {
            const response = await fetchWithTimeout(
                "https://binger-extension.vercel.app/api/openrouter",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "meta-llama/llama-3.2-3b-instruct",
                        temperature: 0,
                        max_tokens: 3,
                        messages: [
                            {
                                role: "system",
                                content: [
                                    "You are a classifier. Your ONLY job is to decide whether a question requires up-to-date web information about a movie or TV series to answer properly.",
                                    "",
                                    "This message is being sent from a user to Binger Bot, a concise movie expert bot that can chat casually, answer movie questions, and seek to specific scenes in a movie when asked. Your job is ONLY to decide if Binger needs live web search to answer this message.",
                                    "",
                                    "Reply YES if the question directly involves knowledge of a movie or series and needs current/factual info (cast, plot, ratings, release dates, reviews) OR if the user wants to.",
                                    "",
                                    "Reply NO for everything else: casual chat, greetings, jokes, personal questions, scene-seeking requests, general knowledge, or anything not about specific movies/series.",
                                    "",
                                    "Recent chat for context:",
                                    lastMsgs && lastMsgs.length > 0 ? lastMsgs.join(" | ") : "No recent messages",
                                    "",
                                    "Reply with ONLY YES or NO. Nothing else."
                                ].join("\n")
                            },
                            { role: "user", content: userPrompt }
                        ]
                    })
                },
                LLM_TIMEOUT_MS
            );

            const data = await response.json();
            const reply = (data?.choices?.[0]?.message?.content || "").trim().toUpperCase();
            return reply.startsWith("YES");
        } catch (err) {
            console.warn("[Binger] Web search decision failed, defaulting to offline:", err);
            return false;
        }
    }

    async function handleBotQuery(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { error: "missing-dependencies" });
            return;
        }

        if (!msg || typeof msg.prompt !== "string" || msg.prompt.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { error: "invalid-prompt" });
            return;
        }

        let roomId = await getRoomIdFromStorage();
        if (!roomId) {
            BingerBGHelpers.safeSendResponse(sendResponse, { error: "no-room" });
            return;
        }

        try {
            const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`);
            if (typingRef) {
                await typingRef.set(true);
            }
        } catch (err) {
            console.warn("[Binger] Failed to set typing indicator:", err);
        }

        try {
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

            const { systemMessage, temp } = buildSystemMessage(msg.movieContext, userNames, inSession, lastMsgs);

            const useOnline = await needsWebSearch(msg.prompt, lastMsgs);
            const chatModel = useOnline
                ? "x-ai/grok-4.1-fast:online"
                : "x-ai/grok-4.1-fast";

            let answer = "(no reply)";
            try {
                const response = await fetchWithTimeout(
                    "https://binger-extension.vercel.app/api/openrouter",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: chatModel,
                            temperature: temp,
                            max_tokens: 80,
                            reasoning: { effort: "none" },
                            messages: [
                                systemMessage,
                                { role: "user", content: msg.prompt }
                            ]
                        })
                    },
                    LLM_TIMEOUT_MS
                );

                const data = await response.json();
                answer = (data?.choices?.[0]?.message?.content || "(no reply)")
                    .replace(/\[\[\d+\]\]\([^)]*\)/g, "")
                    .replace(/\s{2,}/g, " ")
                    .trim();
            } catch (err) {
                console.error("[Binger] LLM request failed:", err);
                answer = "Sorry, I couldn't process that request. Please try again.";
            }

            await postBotMessage(roomId, answer);

            try {
                const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}`);
                if (typingRef) {
                    await typingRef.remove();
                }
            } catch {
            }

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

    function buildSystemMessage(rawMovieContext, userNames, inSession, lastMsgs) {
        const movieContext = validateMovieContext(rawMovieContext);

        const usersLine = userNames.length > 0 ? `${userNames.join(", ")} (${userNames.length} total)` : "None";
        const chatLine = lastMsgs.length > 0 ? lastMsgs.join(" | ") : "No recent messages";

        let movieLine;
        let temp;
        let systemMessage;

        if (!movieContext.valid) {
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

    async function handleSceneSeeking(sceneDesc, movieContext, roomId, inSession) {
        try {
            const seekRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_SEEK_UID}`);
            if (seekRef) {
                await seekRef.set(true);
            }
        } catch (err) {
            console.warn("[Binger] Failed to set seeking indicator:", err);
        }

        const { cleanDesc, numerator, denominator } = parseTimingFraction(sceneDesc);

        const validatedContext = validateMovieContext(movieContext);
        if (!validatedContext.valid || !validatedContext.title || validatedContext.title === "Unknown") {
            await postBotMessage(roomId, "Sorry, I couldn't identify the movie. Please try again.");
            return;
        }

        const cacheKey = buildMovieCacheKey(validatedContext.title, validatedContext.year);
        if (!cacheKey) {
            await postBotMessage(roomId, "Sorry, I couldn't identify the movie. Please try again.");
            return;
        }

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
        } catch (err) {
            console.error("[Binger] Failed to embed scene description:", err);
            await postBotMessage(roomId, "Sorry, I had trouble processing that scene description. Please try again.");
            return;
        }

        if (!vector) {
            await postBotMessage(roomId, "Sorry, I couldn't understand that scene description. Please try rephrasing.");
            return;
        }

        let stored = null;
        try {
            stored = BingerBGSubtitles.getStoredMovieEmbeddings();

            if (!stored || stored.movieId !== cacheKey) {
                const buildResult = await BingerBGSubtitles.buildMovieEmbeddings(cacheKey);

                if (!buildResult.success) {
                    console.error("[Binger] Failed to build embeddings:", buildResult.error);
                    await postBotMessage(roomId, `Sorry, I couldn't load the movie data: ${buildResult.error}`);
                    return;
                }

                stored = buildResult.payload;
            }
        } catch (err) {
            console.error("[Binger] Failed to get/build movie embeddings:", err);
            await postBotMessage(roomId, "Sorry, I couldn't load the movie data. Subtitles might not be available for this movie.");
            return;
        }

        if (!stored || !stored.chunks || stored.chunks.length === 0) {
            await postBotMessage(roomId, "Sorry, I couldn't find subtitles for this movie. Scene seeking isn't available.");
            return;
        }

        const targetTime = findBestMatchTime(vector, stored, numerator, denominator);

        if (targetTime === null) {
            await postBotMessage(roomId, "Sorry, I couldn't find a matching scene. Try describing it differently.");
            return;
        }

        const seekSuccess = await seekToTime(targetTime, roomId, inSession);
        if (!seekSuccess) {
            await postBotMessage(roomId, "Sorry, I found the scene but couldn't seek to it. Make sure you're on the movie page.");
        }
    }

    function findBestMatchTime(vector, stored, numerator, denominator) {
        if (!vector || !Array.isArray(vector)) return null;
        if (!stored || !stored.chunks || !Array.isArray(stored.chunks)) return null;

        const totalChunks = stored.chunks.length;
        let searchChunks = stored.chunks;
        let baseOffset = 0;

        if (numerator !== null && denominator !== null && denominator > 0) {
            const fraction = numerator / denominator;

            const lowerFrac = Math.max(0, fraction - 0.1);
            const upperFrac = Math.min(1, fraction + 0.1);

            const startIdx = Math.floor(lowerFrac * totalChunks);
            const endIdx = Math.min(totalChunks, Math.ceil(upperFrac * totalChunks));

            searchChunks = stored.chunks.slice(startIdx, endIdx);
            baseOffset = startIdx;
        }

        if (searchChunks.length === 0) return null;

        const scored = searchChunks.map((chunk, localIdx) => ({
            idx: baseOffset + localIdx,
            score: BingerBGHelpers.cosineSimilarity(vector, chunk.vector)
        }));

        scored.sort((a, b) => b.score - a.score);

        const top1 = scored[0];
        const top2 = scored[1];
        const top3 = scored[2];

        if (!top1 || !Number.isFinite(top1.idx)) return null;

        const isAdjacent = (a, b) => Math.abs(a - b) === 1;
        const included = [top1];

        if (top2 && isAdjacent(top2.idx, top1.idx)) {
            included.push(top2);
        }
        if (top3 && (isAdjacent(top3.idx, top1.idx) || (top2 && isAdjacent(top3.idx, top2.idx)))) {
            included.push(top3);
        }

        const totalWeight = included.reduce((sum, r) => sum + Math.max(0, r.score), 0) || 1;
        const weightedStart = included.reduce((sum, r) => {
            return sum + Math.max(0, r.score) * stored.chunks[r.idx].start;
        }, 0) / totalWeight;

        const CONTEXT_LEAD_SECONDS = 8;
        return Math.max(0, Math.floor(weightedStart - CONTEXT_LEAD_SECONDS));
    }

    async function seekToTime(target, roomId, inSession) {
        if (typeof target !== "number" || !Number.isFinite(target)) return false;
        if (!roomId || typeof roomId !== "string") return false;

        try {
            if (inSession) {
                const playerRef = BingerBGFirebase.ref(`rooms/${roomId}/playerState`);
                if (!playerRef) return false;

                await playerRef.set({
                    action: "seek",
                    time: target
                });
                return true;
            } else {
                return new Promise((resolve) => {
                    chrome.tabs.query({ url: "*://phimbro.com/watch/*" }, (tabs) => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Tab query error:", chrome.runtime.lastError.message);
                            resolve(false);
                            return;
                        }

                        const tab = tabs && tabs[0];

                        if (!tab) {
                            resolve(false);
                            return;
                        }

                        if (!chrome.scripting || !chrome.scripting.executeScript) {
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
                            if (chrome.runtime.lastError) {
                                console.warn("[Binger] executeScript error:", chrome.runtime.lastError.message);
                                resolve(false);
                                return;
                            }

                            const success = results && results[0] && results[0].result === true;
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

    self.BingerBGBot = {
        handleBotQuery
    };

})();