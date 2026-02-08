// ============================================================================
// SUBTITLE HANDLERS
// Handle subtitle fetching, parsing, and movie embedding generation
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // API endpoints
    const SUBDL_API_URL = "https://binger-extension.vercel.app/api/subdl";
    const SUBDL_DOWNLOAD_BASE_URL = "https://dl.subdl.com";
    const OPENROUTER_API_URL = "https://binger-extension.vercel.app/api/openrouter";
    const OPENAI_API_URL = "https://binger-extension.vercel.app/api/openai";

    // Chunking settings
    const CHUNK_DURATION_SECONDS = 60;

    // GPT rewrite settings
    const REWRITE_MODEL = "google/gemini-2.5-flash-lite";
    const REWRITE_TEMPERATURE = 0.2;
    const REWRITE_MAX_TOKENS = 50;

    // Embedding model
    const EMBEDDING_MODEL = "text-embedding-3-large";

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGState"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-subtitles missing dependencies:", missing.join(", "));
            return false;
        }

        // Check JSZip separately since it's loaded via importScripts
        if (typeof JSZip === "undefined") {
            console.error("[Binger] bg-subtitles missing JSZip library");
            return false;
        }

        return true;
    }

    // ========================================================================
    // FETCH SUBTITLES
    // ========================================================================

    /**
     * Fetch subtitles from SubDL API and parse SRT content
     * @param {string} rawName - The movie/show name
     * @returns {Promise<{success: boolean, entries?: Array, error?: string}>}
     */
    async function fetchSubsInternal(rawName) {
        // Validate input
        if (!rawName || typeof rawName !== "string") {
            return { success: false, error: "Invalid movie name" };
        }

        // Clean up film name
        const filmName = rawName.replace(/[:]/g, "").replace(/\(.*?\)/g, "").trim();
        if (!filmName) {
            return { success: false, error: "Empty movie name after cleanup" };
        }

        // Step 1: Search for subtitles
        let searchData;
        try {
            const searchUrl = `${SUBDL_API_URL}?film_name=${encodeURIComponent(filmName)}`;
            const res = await fetch(searchUrl);

            if (!res.ok) {
                return { success: false, error: `SubDL API error: ${res.status} ${res.statusText}` };
            }

            searchData = await res.json();
        } catch (err) {
            console.error("[Binger] SubDL search failed:", err);
            return { success: false, error: `Failed to search subtitles: ${err.message}` };
        }

        // Step 2: Find best subtitle
        let chosen = null;
        if (searchData?.subtitles?.length) {
            // Prefer BluRay if available
            chosen = searchData.subtitles.find(s =>
                s.release_name && s.release_name.toLowerCase().includes("bluray")
            );

            // Fallback - just take the first one
            if (!chosen) {
                chosen = searchData.subtitles[0];
            }
        }

        if (!chosen || !chosen.url) {
            return { success: false, error: `No subtitles found for "${filmName}"` };
        }

        console.log("[Binger] Using subtitle release:", chosen.release_name);

        // Step 3: Download ZIP
        let zipBuffer;
        try {
            const zipUrl = `${SUBDL_DOWNLOAD_BASE_URL}${chosen.url}`;
            const zipRes = await fetch(zipUrl);

            if (!zipRes.ok) {
                return { success: false, error: `Failed to download subtitle ZIP: ${zipRes.status}` };
            }

            zipBuffer = await zipRes.arrayBuffer();
        } catch (err) {
            console.error("[Binger] Subtitle ZIP download failed:", err);
            return { success: false, error: `Failed to download subtitles: ${err.message}` };
        }

        // Step 4: Extract SRT from ZIP
        let srtContent;
        try {
            const zip = await JSZip.loadAsync(zipBuffer);

            let srtPromise = null;
            zip.forEach((path, file) => {
                if (!srtPromise && path.toLowerCase().endsWith(".srt")) {
                    srtPromise = file.async("string");
                }
            });

            if (!srtPromise) {
                return { success: false, error: "No SRT file found in subtitle ZIP" };
            }

            srtContent = await srtPromise;
        } catch (err) {
            console.error("[Binger] ZIP extraction failed:", err);
            return { success: false, error: `Failed to extract subtitles: ${err.message}` };
        }

        // Step 5: Parse SRT into entries
        const entries = parseSrtContent(srtContent);

        if (entries.length === 0) {
            return { success: false, error: "Failed to parse any subtitle entries from SRT" };
        }

        console.log(`[Binger] Parsed ${entries.length} subtitle entries`);
        return { success: true, entries };
    }

    /**
     * Parse SRT content into time-stamped entries
     * @param {string} srt - Raw SRT file content
     * @returns {Array} Array of {start, end, text} objects
     */
    function parseSrtContent(srt) {
        const entries = [];
        const blocks = srt.split(/\r?\n\r?\n/);

        for (const block of blocks) {
            const lines = block.split(/\r?\n/).filter(Boolean);
            if (lines.length < 2) continue;

            // Match timestamp line: 00:01:23,456 --> 00:01:25,789
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

            // Text is everything after the timestamp line
            const text = lines.slice(2).join(" ").trim();
            if (text) {
                entries.push({ start, end, text });
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
     * @returns {Promise<{success: boolean, payload?: object, error?: string}>}
     */
    async function buildMovieEmbeddings(movieTitle) {
        // Validate dependencies
        if (!validateDependencies()) {
            return { success: false, error: "Missing dependencies" };
        }

        // Validate input
        if (!movieTitle || typeof movieTitle !== "string" || movieTitle.trim() === "") {
            return { success: false, error: "Invalid movie title" };
        }

        const title = movieTitle.trim();

        // Step 1: Fetch subtitles
        const subsResult = await fetchSubsInternal(title);
        if (!subsResult.success) {
            return { success: false, error: subsResult.error };
        }

        const entries = subsResult.entries;

        // Step 2: Group into chunks
        const chunks = groupIntoChunks(entries);
        console.log(`[Binger] Chunked ${entries.length} subtitle entries into ${chunks.length} chunks`);

        // Step 3: Rewrite chunks with GPT
        console.log(`[Binger] Rewriting ${chunks.length} chunks...`);
        const rewriteResult = await rewriteChunks(chunks);

        if (!rewriteResult.success) {
            return { success: false, error: rewriteResult.error };
        }

        const rewrittenChunks = rewriteResult.chunks;
        console.log("[Binger] Finished GPT rewrites");

        // Step 4: Generate embeddings
        const embedResult = await generateEmbeddings(rewrittenChunks);

        if (!embedResult.success) {
            return { success: false, error: embedResult.error };
        }

        // Step 5: Build and cache payload
        const payload = {
            movieId: title,
            chunks: rewrittenChunks.map((c, i) => ({
                start: c.start,
                end: c.end,
                text: c.text,
                vector: embedResult.vectors[i]
            }))
        };

        BingerBGState.setMovieEmbeddingCache(payload);
        console.log(`[Binger] Cached embeddings for "${title}" with ${payload.chunks.length} chunks`);

        return { success: true, payload };
    }

    /**
     * Group subtitle entries into ~60-second chunks
     * @param {Array} entries - Array of {start, end, text} entries
     * @returns {Array} Array of chunk objects with combined text
     */
    function groupIntoChunks(entries) {
        if (!entries || entries.length === 0) return [];

        const chunks = [];
        let buffer = [];
        let chunkStart = entries[0].start;

        for (const entry of entries) {
            buffer.push(entry.text);
            const chunkEnd = entry.end;

            if (chunkEnd - chunkStart >= CHUNK_DURATION_SECONDS) {
                chunks.push({
                    start: chunkStart,
                    end: chunkEnd,
                    text: buffer.join(" ")
                });
                buffer = [];
                chunkStart = entry.end;
            }
        }

        // Flush any leftover
        if (buffer.length > 0) {
            const lastEnd = entries[entries.length - 1].end;
            chunks.push({
                start: chunkStart,
                end: lastEnd,
                text: buffer.join(" ")
            });
        }

        return chunks;
    }

    /**
     * Rewrite all chunks using GPT for better semantic matching
     * @param {Array} chunks - Array of chunk objects
     * @returns {Promise<{success: boolean, chunks?: Array, error?: string}>}
     */
    async function rewriteChunks(chunks) {
        const systemPrompt = [
            "You rewrite subtitles into concise descriptive movie summaries.",
            "Rules:",
            "- Merge all lines into 1-2 sentences, 20-25 words max.",
            "- Keep character names if present.",
            "- Keep actions, sounds, stage directions.",
            "- Capture tone/emotion (shouting, laughing, etc.).",
            "- Mention props/locations if present.",
            "- Do NOT invent new details.",
            "- Return ONLY the rewritten text, no quotes or extra commentary."
        ].join("\n");

        const requests = chunks.map((chunk, idx) => {
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Rewrite this subtitle chunk:\n\n${chunk.text}` }
            ];

            return fetch(OPENROUTER_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: REWRITE_MODEL,
                    temperature: REWRITE_TEMPERATURE,
                    max_tokens: REWRITE_MAX_TOKENS,
                    reasoning: { effort: "none" },
                    messages
                })
            })
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                })
                .then(data => {
                    const content = data?.choices?.[0]?.message?.content?.trim();
                    return content || chunk.text;
                })
                .catch(err => {
                    console.warn(`[Binger] GPT rewrite failed for chunk ${idx}:`, err.message);
                    return chunk.text; // Fallback to original
                });
        });

        try {
            const results = await Promise.allSettled(requests);

            const rewrittenChunks = chunks.map((chunk, i) => ({
                start: chunk.start,
                end: chunk.end,
                text: results[i].status === "fulfilled" ? results[i].value : chunk.text
            }));

            return { success: true, chunks: rewrittenChunks };
        } catch (err) {
            console.error("[Binger] Chunk rewriting failed:", err);
            return { success: false, error: `Failed to rewrite chunks: ${err.message}` };
        }
    }

    /**
     * Generate embeddings for all chunks
     * @param {Array} chunks - Array of chunk objects with text
     * @returns {Promise<{success: boolean, vectors?: Array, error?: string}>}
     */
    async function generateEmbeddings(chunks) {
        try {
            const resp = await fetch(OPENAI_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "embed",
                    model: EMBEDDING_MODEL,
                    input: chunks.map(c => c.text)
                })
            });

            if (!resp.ok) {
                return { success: false, error: `Embedding API error: ${resp.status} ${resp.statusText}` };
            }

            const data = await resp.json();
            const vectors = data?.data?.map(d => d.embedding);

            if (!vectors || vectors.length !== chunks.length) {
                return { success: false, error: `Embedding count mismatch: got ${vectors?.length || 0}, expected ${chunks.length}` };
            }

            return { success: true, vectors };
        } catch (err) {
            console.error("[Binger] Embedding generation failed:", err);
            return { success: false, error: `Failed to generate embeddings: ${err.message}` };
        }
    }

    // ========================================================================
    // GET STORED EMBEDDINGS
    // ========================================================================

    /**
     * Retrieve current embeddings from cache (synchronous)
     * @returns {object|null} Cached embedding payload or null
     */
    function getStoredMovieEmbeddings() {
        if (!validateDependencies()) {
            return null;
        }
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