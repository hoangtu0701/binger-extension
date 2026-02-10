(function() {
    "use strict";

    const SUBDL_API_URL = "https://binger-extension.vercel.app/api/subdl";
    const SUBDL_DOWNLOAD_BASE_URL = "https://dl.subdl.com";
    const OPENROUTER_API_URL = "https://binger-extension.vercel.app/api/openrouter";
    const OPENAI_API_URL = "https://binger-extension.vercel.app/api/openai";

    const CHUNK_DURATION_SECONDS = 60;

    const REWRITE_MODEL = "x-ai/grok-4.1-fast";
    const REWRITE_TEMPERATURE = 0.2;
    const REWRITE_MAX_TOKENS = 50;

    const EMBEDDING_MODEL = "text-embedding-3-large";

    function validateDependencies() {
        const required = ["BingerBGState"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-subtitles missing dependencies:", missing.join(", "));
            return false;
        }

        if (typeof JSZip === "undefined") {
            console.error("[Binger] bg-subtitles missing JSZip library");
            return false;
        }

        return true;
    }

    async function fetchSubsInternal(rawName) {
        if (!rawName || typeof rawName !== "string") {
            return { success: false, error: "Invalid movie name" };
        }

        const yearMatch = rawName.match(/\((\d{4})\)/);
        const year = yearMatch ? yearMatch[1] : null;

        const filmName = rawName.replace(/[:]/g, "").replace(/\(.*?\)/g, "").trim();
        if (!filmName) {
            return { success: false, error: "Empty movie name after cleanup" };
        }

        let searchData;
        try {
            let searchUrl = `${SUBDL_API_URL}?film_name=${encodeURIComponent(filmName)}`;
            if (year) {
                searchUrl += `&year=${year}`;
            }
            const res = await fetch(searchUrl);

            if (!res.ok) {
                return { success: false, error: `SubDL API error: ${res.status} ${res.statusText}` };
            }

            searchData = await res.json();
        } catch (err) {
            console.error("[Binger] SubDL search failed:", err);
            return { success: false, error: `Failed to search subtitles: ${err.message}` };
        }

        let chosen = null;
        if (searchData?.subtitles?.length) {
            chosen = searchData.subtitles.find(s =>
                s.release_name && s.release_name.toLowerCase().includes("bluray")
            );

            if (!chosen) {
                chosen = searchData.subtitles[0];
            }
        }

        if (!chosen || !chosen.url) {
            return { success: false, error: `No subtitles found for "${filmName}"` };
        }

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

        const entries = parseSrtContent(srtContent);

        if (entries.length === 0) {
            return { success: false, error: "Failed to parse any subtitle entries from SRT" };
        }

        return { success: true, entries };
    }

    function parseSrtContent(srt) {
        const entries = [];
        const blocks = srt.split(/\r?\n\r?\n/);

        for (const block of blocks) {
            const lines = block.split(/\r?\n/).filter(Boolean);
            if (lines.length < 2) continue;

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

            const text = lines.slice(2).join(" ").trim();
            if (text) {
                entries.push({ start, end, text });
            }
        }

        return entries;
    }

    async function buildMovieEmbeddings(movieTitle) {
        if (!validateDependencies()) {
            return { success: false, error: "Missing dependencies" };
        }

        if (!movieTitle || typeof movieTitle !== "string" || movieTitle.trim() === "") {
            return { success: false, error: "Invalid movie title" };
        }

        const title = movieTitle.trim();

        const subsResult = await fetchSubsInternal(title);
        if (!subsResult.success) {
            return { success: false, error: subsResult.error };
        }

        const entries = subsResult.entries;

        const chunks = groupIntoChunks(entries);

        const rewriteResult = await rewriteChunks(chunks);

        if (!rewriteResult.success) {
            return { success: false, error: rewriteResult.error };
        }

        const rewrittenChunks = rewriteResult.chunks;

        const embedResult = await generateEmbeddings(rewrittenChunks);

        if (!embedResult.success) {
            return { success: false, error: embedResult.error };
        }

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

        return { success: true, payload };
    }

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
                    return chunk.text;
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

    function getStoredMovieEmbeddings() {
        if (!validateDependencies()) return null;
        return BingerBGState.getMovieEmbeddingCache();
    }

    self.BingerBGSubtitles = {
        fetchSubsInternal,
        buildMovieEmbeddings,
        getStoredMovieEmbeddings
    };

})();