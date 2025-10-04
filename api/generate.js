import fetch from 'node-fetch';
const API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  try {
    const payload = {
      contents: [{ parts: [{ text: `Create a 5-page children's story about: ${prompt}` }] }],
      // UPDATED: I've made the system instruction very direct and clear about the required JSON format.
      systemInstruction: {
        parts: [{ text: "You are a children's book author. Your task is to generate a story in a specific JSON format. The output MUST be a single, valid JSON object and nothing else. Do not include any introductory text or markdown formatting like ```json. The JSON object must have a 'title' (string) and a 'pages' array. Each object in the 'pages' array must contain 'page_number' (integer), 'text' (string), and 'image_prompt' (string, a simple description for an illustration)." }]
      },
      // CHANGE: The complex responseSchema has been removed to simplify the API call, which is likely the cause of the 400 error.
      generationConfig: {
        responseMimeType: "application/json",
      }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        // This log will now appear in your Vercel logs so you can see the exact error from the Gemini API.
        console.error("API Error Response:", errorBody); 
        throw new Error(`API request failed with status ${response.status}. See function logs for details.`);
    }

    const json = await response.json();
    const textResponse = json?.candidates?.[0]?.content?.parts[0]?.text;

    if (!textResponse) {
      console.error("No text response from API:", JSON.stringify(json, null, 2));
      throw new Error("Failed to get a valid story response from the AI.");
    }
    
    // IMPROVED PARSING: This logic is more robust. It finds the JSON object within the AI's
    // text response, even if it accidentally includes extra text or formatting.
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error("Could not find valid JSON in the AI's response:", textResponse);
        throw new Error("AI response did not contain a valid JSON object.");
    }

    const storyJson = JSON.parse(jsonMatch[0]);
    res.status(200).json(storyJson);

  } catch (e) {
    console.error("Handler Error:", e.message);
    res.status(500).json({ error: e.message });
  }
}

