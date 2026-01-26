// ============================================================================
// SUBTITLE HANDLERS
// Handle subtitle fetching, parsing, and movie embedding generation
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // FETCH SUBTITLES
    // ========================================================================

    /**
     * Fetch subtitles from SubDL API and parse SRT content
     * @param {string} rawName - The movie/show name
     * @returns {Promise<Array>} Array of subtitle entries with start, end, text
     */
    async function fetchSubsInternal(rawName) {
        let filmName = (rawName || "").replace(/[:]/g, "").replace(/\(.*?\)/g, "").trim();
        if (!filmName) return [];

        const res = await fetch(`https://binger-extension.vercel.app/api/subdl?film_name=${encodeURIComponent(filmName)}`);
        const data = await res.json();

        let chosen = null;
        if (data?.subtitles?.length) {
            // Prefer BluRay if available
            chosen = data.subtitles.find(s =>
                s.release_name && s.release_name.toLowerCase().includes("bluray")
            );

            // Fallback - just take the first one
            if (!chosen) {
                chosen = data.subtitles[0];
            }
        }

        if (!chosen) return [];

        console.log("[Binger] Using subtitle release:", chosen.release_name);

        const zipRes = await fetch(`https://dl.subdl.com${chosen.url}`);
        const zipBuffer = await zipRes.arrayBuffer();
        const zip = await JSZip.loadAsync(zipBuffer);

        let srtPromise = null;
        zip.forEach((path, file) => {
            if (!srtPromise && path.toLowerCase().endsWith(".srt")) {
                srtPromise = file.async("string");
            }
        });
        if (!srtPromise) return [];

        const srt = await srtPromise;

        // Parse .srt text into embedding-ready objects
        const entries = [];
        const blocks = srt.split(/\r?\n\r?\n/);

        for (const block of blocks) {
            const lines = block.split(/\r?\n/).filter(Boolean);
            if (lines.length >= 2) {
                const match = lines[1].match(
                    /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})/
                );
                if (!match) continue;

                const start =
                    parseInt(match[1]) * 3600 +
                    parseInt(match[2]) * 60 +
                    parseInt(match[3]) +
                    parseInt(match[4]) / 1000;
                const end =
                    parseInt(match[5]) * 3600 +
                    parseInt(match[6]) * 60 +
                    parseInt(match[7]) +
                    parseInt(match[8]) / 1000;

                const text = lines.slice(2).join(" ");
                if (text.trim()) {
                    entries.push({ start, end, text });
                }
            }
        }

        return entries;
    }

    // ========================================================================
    // BUILD MOVIE EMBEDDINGS
    // ========================================================================

    /**
     * Build and store embeddings for a movie's subtitles
     * Groups subtitles into ~60-second chunks, rewrites them, then embeds
     * @param {string} movieTitle - The movie title
     * @returns {Promise<object>} Payload with movieId and chunks array
     */
    async function buildMovieEmbeddings(movieTitle) {
        const entries = await fetchSubsInternal(movieTitle);
        if (!entries.length) throw new Error("No subtitles found for " + movieTitle);

        // Group into ~60-second chunks
        const chunks = [];
        let buffer = [];
        let chunkStart = entries[0].start;

        for (const entry of entries) {
            buffer.push(entry.text);
            const chunkEnd = entry.end;

            if (chunkEnd - chunkStart >= 60) {
                chunks.push({ start: chunkStart, end: chunkEnd, text: buffer.join(" ") });
                buffer = [];
                chunkStart = entry.start;
            }
        }
        // Flush any leftover
        if (buffer.length) {
            const lastEnd = entries[entries.length - 1].end;
            chunks.push({ start: chunkStart, end: lastEnd, text: buffer.join(" ") });
        }

        console.log(`[Binger] Chunked ${entries.length} subtitle entries into ${chunks.length} chunks`);

        // Rephrase all chunks concurrently
        console.log(`[Binger] Rewriting ${chunks.length} chunks...`);

        // Log examples before rewrite
        console.log("[Binger] Sample before rewrite (with timestamps):");
        chunks.slice(0, 5).forEach((c, i) => {
            console.log(
                `  [${i}] start=${c.start}, end=${c.end}\n       ${c.text}`
            );
        });

        const requests = chunks.map((chunk, idx) => {
            const messages = [
                {
                    role: "system",
                    content: `You rewrite subtitles into concise descriptive movie summaries.
                        Rules:
                        - Merge all lines into 1-2 sentences, 20-25 words max.
                        - Keep character names if present.
                        - Keep actions, sounds, stage directions.
                        - Capture tone/emotion (shouting, laughing, etc.).
                        - Mention props/locations if present.
                        - Do NOT invent new details.
                        - Return ONLY the rewritten text, no quotes or extra commentary.`
                },
                {
                    role: "user",
                    content: `Rewrite this subtitle chunk:\n\n${chunk.text}`
                }
            ];

            return fetch("https://binger-extension.vercel.app/api/openrouter", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-4o-mini",
                    temperature: 0.2,
                    max_tokens: 50,
                    messages
                })
            })
            .then(r => r.json())
            .then(data => {
                const content = data?.choices?.[0]?.message?.content?.trim();
                return content || chunk.text;
            })
            .catch(err => {
                console.error(`[Binger] GPT rewrite failed for chunk ${idx}`, err);
                return chunk.text;
            });
        });

        const rewrites = await Promise.allSettled(requests);

        rewrites.forEach((res, i) => {
            if (res.status === "fulfilled") {
                chunks[i].text = res.value;
            }
        });

        // Log examples after rewrite
        console.log("[Binger] Sample after rewrite:");
        chunks.slice(0, 5).forEach((c, i) => {
            console.log(
                `  [${i}] start=${c.start}, end=${c.end}\n       ${c.text}`
            );
        });

        console.log("[Binger] Finished GPT rewrites.");

        // Embed all chunks
        const resp = await fetch("https://binger-extension.vercel.app/api/openai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: "embed",
                model: "text-embedding-3-large",
                input: chunks.map(c => c.text)
            })
        });

        const data = await resp.json();
        const vectors = data?.data?.map(d => d.embedding);
        if (!vectors || vectors.length !== chunks.length) {
            throw new Error("Mismatch between chunks and embeddings");
        }

        // Build payload
        const payload = {
            movieId: movieTitle,
            chunks: chunks.map((c, i) => ({
                start: c.start,
                end: c.end,
                vector: vectors[i]
            }))
        };

        // Save only in memory
        BingerBGState.setMovieEmbeddingCache(payload);
        console.log(`[Binger] Cached embeddings in memory for "${movieTitle}" with ${payload.chunks.length} chunks`);

        return payload;
    }

    // ========================================================================
    // GET STORED EMBEDDINGS
    // ========================================================================

    /**
     * Retrieve current embeddings from cache
     * @returns {Promise<object|null>} Cached embedding payload or null
     */
    async function getStoredMovieEmbeddings() {
        return BingerBGState.getMovieEmbeddingCache();
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGSubtitles = {
        fetchSubsInternal,
        buildMovieEmbeddings,
        getStoredMovieEmbeddings
    };

})();