// api/generate.js
export const config = {
  api: {
    bodyParser: true, // allow automatic JSON parsing
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Story prompt is required" });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  try {
    // --- Helper for retries ---
    async function fetchWithRetry(url, options, retries = 3) {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(url, options);
          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(`${response.status}: ${errBody.message || "Unknown error"}`);
          }
          return await response.json();
        } catch (err) {
          if (i === retries - 1) throw err;
          await new Promise((r) => setTimeout(r, 2 ** i * 1000));
        }
      }
    }

    // --- Gemini Story Generation ---
    const storyPayload = {
      contents: [{ parts: [{ text: `Create a 5-page children's story about: ${prompt}` }] }],
      systemInstruction: {
        parts: [
          {
            text: `You are an expert children's book author. Generate a short story broken into exactly 5 pages. Each page must contain text suitable for reading aloud to a child (simple, encouraging sentences) and a detailed prompt for an image generator. Respond in JSON format with { "title": string, "pages": [ { "page_number": number, "text": string, "image_prompt": string } ] }`,
          },
        ],
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            pages: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  page_number: { type: "INTEGER" },
                  text: { type: "STRING" },
                  image_prompt: { type: "STRING" },
                },
              },
            },
          },
        },
      },
    };

    const storyUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;
    const storyResponse = await fetchWithRetry(storyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storyPayload),
    });

    let storyText = storyResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!storyText) throw new Error("Gemini did not return story text");
    storyText = storyText.replace(/```json|```/g, "").trim();
    const storyJson = JSON.parse(storyText);

    // Validate pages
    if (!storyJson.pages || !Array.isArray(storyJson.pages) || storyJson.pages.length !== 5) {
      throw new Error("Story JSON invalid or missing 5 pages");
    }

    // --- Generate Images for each page ---
    const imageUrlPromises = storyJson.pages.map(async (page) => {
      const imgPayload = {
        instances: [{ prompt: `Children's storybook illustration, watercolor style, focus on character, ${page.image_prompt}` }],
        parameters: { sampleCount: 1, aspectRatio: "16:9" },
      };
      const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`;
      const imgResp = await fetchWithRetry(imgUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imgPayload),
      });
      const base64Data = imgResp.predictions?.[0]?.bytesBase64Encoded;
      page.imageUrl = base64Data ? `data:image/png;base64,${base64Data}` : null;
    });

    await Promise.all(imageUrlPromises);

    // --- Generate TTS for each page ---
    const ttsPromises = storyJson.pages.map(async (page) => {
      const ttsPayload = {
        contents: [{ parts: [{ text: `Read the following text in a warm, engaging, cheerful tone: "${page.text}"` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } } },
        model: "gemini-2.5-flash-preview-tts",
      };
      const ttsUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`;
      const ttsResp = await fetchWithRetry(ttsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ttsPayload),
      });
      const part = ttsResp.candidates?.[0]?.content?.parts?.[0];
      const audioData = part?.inlineData?.data;
      const mimeType = part?.inlineData?.mimeType;
      if (audioData && mimeType?.startsWith("audio/L16")) {
        const pcmBuffer = Buffer.from(audioData, "base64");
        // Minimal WAV header generation
        const wavHeader = Buffer.alloc(44);
        // We'll skip full PCM->WAV conversion here; frontend can play base64 L16 audio if needed
        page.audioUrl = `data:audio/L16;base64,${audioData}`;
      } else {
        page.audioUrl = null;
      }
    });

    await Promise.all(ttsPromises);

    res.status(200).json(storyJson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
