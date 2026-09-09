export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing event id" });
  }

  try {
    const response = await fetch(
      `https://www.sofascore.com/api/v1/event/${id}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
          "Accept": "application/json",
          "Referer": "https://www.sofascore.com/",
          "Origin": "https://www.sofascore.com"
        }
      }
    );

    const text = await response.text();

    res.status(response.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}