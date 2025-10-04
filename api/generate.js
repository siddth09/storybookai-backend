import fetch from 'node-fetch';
const API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  try {
    const payload = {
      contents: [{ parts: [{ text: `Create a 5-page children's story about: ${prompt}` }] }],
      systemInstruction: {
        parts: [{ text: "You are a world-class children's book author. You will be given a prompt and must return a JSON object with a 'title' and a 'pages' array. Each object in the 'pages' array should contain 'page_number' (integer), 'text' (string), and a simple 'image_prompt' (string) for a watercolor illustration." }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        // CHANGE: Added a responseSchema to ensure the AI returns data in the correct format.
        // This is the most reliable way to get structured JSON and avoids parsing errors.
        responseSchema: {
          type: "OBJECT",
          properties: {
            "title": { "type": "STRING" },
            "pages": {
              "type": "ARRAY",
              "items": {
                "type": "OBJECT",
                "properties": {
                  "page_number": { "type": "INTEGER" },
                  "text": { "type": "STRING" },
                  "image_prompt": { "type": "STRING" }
                },
                "required": ["page_number", "text", "image_prompt"]
              }
            }
          },
          "required": ["title", "pages"]
        }
      }
    };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });

    if (!response.ok) {
        // Better error handling to see what the API is complaining about
        const errorBody = await response.text();
        console.error("API Error:", errorBody);
        throw new Error(`API request failed with status ${response.status}`);
    }

    const json = await response.json();
    let text = json?.candidates?.[0]?.content?.parts[0]?.text;

    // The text should now be clean JSON because of the schema, so no need to strip markdown.
    const storyJson = JSON.parse(text);
    res.status(200).json(storyJson);
  } catch (e) {
    console.error("Handler Error:", e);
    res.status(500).json({ error: e.message });
  }
}
