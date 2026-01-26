export default async function handler(req, res) {
    try {
        // CORS headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        // Handle preflight
        if (req.method === "OPTIONS") {
            return res.status(200).end();
        }

        const { model, input } = req.body;

        // Validate required fields
        if (!model || !input) {
            return res.status(400).json({ error: "model and input are required" });
        }

        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ model, input })
        });

        const data = await response.json();
        return res.status(200).json(data);

    } catch (err) {
        console.error("[Vercel] OpenAI error:", err);
        return res.status(500).json({ error: err.message });
    }
}
