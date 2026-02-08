export default async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    const { film_name, year } = req.query;
    if (!film_name) {
      return res.status(400).json({ error: "film_name is required" });
    }

    const params = {
      api_key: process.env.SUBDL_KEY,
      film_name,
      type: "movie",
      languages: "EN"
    };

    if (year) {
      params.year = year;
    }

    const query = new URLSearchParams(params).toString();

    const r = await fetch(`https://api.subdl.com/api/v1/subtitles?${query}`);
    const data = await r.json();

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
