import fetch from 'node-fetch';
const API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  try {
    // CHANGE: The system instructions have been moved directly into the main prompt.
    // This creates a simpler and more reliable request payload.
    const fullPrompt = `
      You are a children's book author. Your task is to generate a story in a specific JSON format.
      The output MUST be a single, valid JSON object and nothing else. Do not include any introductory text or markdown formatting like \`\`\`json.
      The JSON object must have a 'title' (string) and a 'pages' array of exactly 5 pages. Each object in the 'pages' array must contain 'page_number' (integer), 'text' (string), and 'image_prompt' (string, a simple description for an illustration).

      Here is the story topic: "${prompt}"
    `;

    const payload = {
      // The full instructions and the user's prompt are now combined here.
      contents: [{ parts: [{ text: fullPrompt }] }],
      // The separate 'systemInstruction' object has been removed.
      generationConfig: {
        responseMimeType: "application/json",
      }
    };
    
    // *** THIS IS THE LINE WITH THE FIX ***
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("API Error Response:", errorBody); 
        throw new Error(`API request failed with status ${response.status}. See function logs for details.`);
    }

    const json = await response.json();
    const textResponse = json?.candidates?.[0]?.content?.parts[0]?.text;

    if (!textResponse) {
      console.error("No text response from API:", JSON.stringify(json, null, 2));
      throw new Error("Failed to get a valid story response from the AI.");
    }
    
    // This robust parsing logic will find the JSON even if the AI adds extra text.
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
