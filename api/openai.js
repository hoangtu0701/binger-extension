export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const { mode, prompt, model, input } = req.body;
    const apiKey = process.env.OPENAI_KEY;

    let url, body;

    if (mode === "embed") {
      url = "https://api.openai.com/v1/embeddings";
      body = JSON.stringify({
        model: model,
        input
      });
    } else {
      // Default - chat/response
      url = "https://api.openai.com/v1/responses";
      body = JSON.stringify({
        model: model || "gpt-5-chat-latest",
        input: [{ role: "user", content: prompt || "Hello from OpenAI proxy" }]
      });
    }

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body
    });

    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("[Vercel] OpenAI error:", err);
    return res.status(500).json({ error: err.message });
  }
}
