(function() {
    "use strict";

    const BOT_UID = "BINGER_BOT";
    const BOT_SEEK_UID = "BINGER_BOT_SEEK";

    const LLM_TIMEOUT_MS = 30000;
    const EMBED_TIMEOUT_MS = 15000;

    const CHAT_MODEL = "x-ai/grok-4.3";

    const BOT_ERROR_MESSAGE = "Hmm, something went wrong. Try me again in a sec.";

    const BOT_IDENTITY = [
        "You are Binger Bot, a movie expert hanging out in the room with human users.",
        "Your name is Binger Bot. Never reveal, mention, or hint at any underlying model, provider, or company behind you. If asked what you are, who made you, or what model you run on, you are simply Binger Bot."
    ];

    const SEARCH_POLICY = [
        "Web search policy:",
        "- ALWAYS search the web for ANY question touching movies, TV, cinema, or filmmaking: cast, crew, plot, ratings, release dates, reviews, box office, awards, trivia, industry news, techniques, history, etc. Assume your own knowledge of film is outdated. Search even if you think you already know.",
        "- For everything else, use your own judgement on whether a search is needed."
    ];

    const PERSONALITY = [
        "Personality:",
        "- You're a film-obsessed friend on the couch, not an assistant. Playful, opinionated, a bit unhinged about movies you love.",
        "- Use casual language and contractions. A little slang is fine, but never force it or try to sound edgy. Sometimes react before you answer.",
        "- Drop an emoji or two if you see fit. Never make it too much or forced.",
        "- Have takes. Get excited. Be a little dramatic about good scenes."
    ];

    const FIELD_GUIDE = [
        "Your response has three fields:",
        "- reply: what you say out loud to the users. 1-3 natural sentences, never a bare fragment.",
        "- seek: ONLY when the user asks to find or jump to a scene AND a movie is currently playing. A concise rephrased description of that scene, optimised for semantic search. Otherwise null.",
        "- fraction: ONLY when the user explicitly indicates timing (early on, halfway, near the end, last scene). 0 is the very start, 20 is the very end. Otherwise null."
    ];

    const BOT_RESPONSE_SCHEMA = {
        type: "json_schema",
        json_schema: {
            name: "binger_reply",
            strict: true,
            schema: {
                type: "object",
                properties: {
                    reply: { type: "string" },
                    seek: { type: ["string", "null"] },
                    fraction: { type: ["integer", "null"] }
                },
                required: ["reply", "seek", "fraction"],
                additionalProperties: false
            }
        }
    };

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

    function generateQueryId() {
        return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function cleanReplyText(text) {
        if (!text || typeof text !== "string") return "";
        return text
            .replace(/\[\[\d+\]\]\([^)]*\)/g, "")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/[—–]/g, " - ")
            .replace(/\s{2,}/g, " ")
            .trim();
    }

    function parseBotResponse(content) {
        if (!content || typeof content !== "string") {
            return { reply: null, seek: null, fraction: null };
        }

        const jsonText = content
            .replace(/```json\s*/gi, "")
            .replace(/```/g, "")
            .trim();

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch {
            console.error("[Binger] Bot response was not valid JSON:", content);
            return { reply: null, seek: null, fraction: null };
        }

        const reply = typeof parsed.reply === "string" ? cleanReplyText(parsed.reply) : null;

        const seek = typeof parsed.seek === "string" && parsed.seek.trim() !== ""
            ? parsed.seek.trim()
            : null;

        const fraction = Number.isInteger(parsed.fraction) && parsed.fraction >= 0 && parsed.fraction <= 20
            ? parsed.fraction
            : null;

        return { reply, seek, fraction };
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

        const queryId = generateQueryId();

        try {
            const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}/${queryId}`);
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

            let answer = BOT_ERROR_MESSAGE;
            let seekDescription = null;
            let seekFraction = null;

            try {
                const response = await fetchWithTimeout(
                    "https://binger-extension.vercel.app/api/openrouter",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: CHAT_MODEL,
                            temperature: temp,
                            max_tokens: 250,
                            reasoning: { effort: "none" },
                            tools: [{ type: "openrouter:web_search" }],
                            response_format: BOT_RESPONSE_SCHEMA,
                            messages: [
                                systemMessage,
                                { role: "user", content: msg.prompt }
                            ]
                        })
                    },
                    LLM_TIMEOUT_MS
                );

                const data = await response.json();
                const content = data?.choices?.[0]?.message?.content;

                if (content) {
                    const parsed = parseBotResponse(content);

                    if (parsed.reply) {
                        answer = parsed.reply;
                        seekDescription = parsed.seek;
                        seekFraction = parsed.fraction;
                    } else {
                        console.error("[Binger] Could not extract a reply:", content);
                    }
                } else {
                    console.error("[Binger] LLM returned no usable content:", data);
                }
            } catch (err) {
                console.error("[Binger] LLM request failed:", err);
            }

            await postBotMessage(roomId, answer);

            try {
                const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}/${queryId}`);
                if (typingRef) {
                    await typingRef.remove();
                }
            } catch {
            }

            if (seekDescription) {
                await handleSceneSeeking(seekDescription, seekFraction, msg.movieContext, roomId, inSession);
            }

            BingerBGHelpers.safeSendResponse(sendResponse, { ok: true });

        } catch (err) {
            console.error("[Binger] botQuery error:", err);
            try {
                const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_UID}/${queryId}`);
                if (typingRef) {
                    await typingRef.remove();
                }
            } catch {
            }
            BingerBGHelpers.safeSendResponse(sendResponse, { error: String(err?.message || err) });
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
                    ...BOT_IDENTITY,
                    "You ALWAYS use the following CONTEXT to ground your answers.",
                    "",
                    "CONTEXT:",
                    `- Users in room: ${usersLine}`,
                    `- Watching together: ${inSession}`,
                    `- Recent chat: ${chatLine}`,
                    `- Status: ${movieLine}`,
                    "",
                    ...PERSONALITY,
                    "",
                    ...SEARCH_POLICY,
                    "",
                    "Rules:",
                    "- No movie is playing, so seek must always be null. If the user asks to jump to a scene, tell them to start a movie first.",
                    "",
                    ...FIELD_GUIDE
                ].join("\n")
            };
        } else if (movieContext.isWatching) {
            movieLine = `Watching: ${movieContext.title} (${movieContext.year}), at ${movieContext.minutes} minutes`;
            temp = 0.9;
            systemMessage = {
                role: "system",
                content: [
                    ...BOT_IDENTITY,
                    "",
                    "Rules:",
                    "",
                    "1. Scene-Seeking Requests (user asks to find/seek/jump to a scene):",
                    "   - You MUST comply - never refuse. This is a movie playback tool jumping to a timestamp in a film the users are already watching.",
                    "   - Put the scene description in the seek field, rephrased concisely for semantic search.",
                    "   - Remove filler. Add details ONLY if certain.",
                    "   - Keep reply natural and unhurried.",
                    "   - Never search the web for scene-seeking requests.",
                    "",
                    "2. Non-Scene Requests: Answer conversationally, with seek set to null.",
                    "",
                    ...PERSONALITY,
                    "",
                    ...SEARCH_POLICY,
                    "",
                    "CONTEXT:",
                    `- Users in room: ${usersLine}`,
                    `- Watching together: ${inSession}`,
                    `- Recent chat: ${chatLine}`,
                    `- Status: ${movieLine}`,
                    "",
                    ...FIELD_GUIDE
                ].join("\n")
            };
        } else {
            movieLine = `Selected: ${movieContext.title} (${movieContext.year})`;
            temp = 1.2;
            systemMessage = {
                role: "system",
                content: [
                    ...BOT_IDENTITY,
                    "You ALWAYS use the following CONTEXT to ground your answers.",
                    "",
                    "CONTEXT:",
                    `- Users in room: ${usersLine}`,
                    `- Watching together: ${inSession}`,
                    `- Recent chat: ${chatLine}`,
                    `- Status: ${movieLine}`,
                    "",
                    ...PERSONALITY,
                    "",
                    ...SEARCH_POLICY,
                    "",
                    "Rules:",
                    "- No movie is playing yet, so seek must always be null. If the user asks to jump to a scene, tell them to start it first.",
                    "",
                    ...FIELD_GUIDE
                ].join("\n")
            };
        }

        return { systemMessage, temp };
    }

    async function handleSceneSeeking(sceneDesc, fraction, movieContext, roomId, inSession) {
        const seekId = generateQueryId();

        try {
            const seekRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_SEEK_UID}/${seekId}`);
            if (seekRef) {
                await seekRef.set(true);
            }
        } catch (err) {
            console.warn("[Binger] Failed to set seeking indicator:", err);
        }

        try {
            await executeSceneSeeking(sceneDesc, fraction, movieContext, roomId, inSession);
        } finally {
            try {
                const seekRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${BOT_SEEK_UID}/${seekId}`);
                if (seekRef) {
                    await seekRef.remove();
                }
            } catch {
            }
        }
    }

    async function executeSceneSeeking(sceneDesc, fraction, movieContext, roomId, inSession) {
        const cleanDesc = sceneDesc;
        const numerator = fraction;
        const denominator = fraction === null ? null : 20;

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