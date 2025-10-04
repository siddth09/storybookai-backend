// api/story.js
import fetch from "node-fetch";

export default async function handler(req, res) {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Story prompt is required" });
    }

    const API_KEY = process.env.GEMINI_API_KEY; // store in Vercel env
    if (!API_KEY) return res.status(500).json({ error: "API_KEY not set" });

    try {
        // 1️⃣ Generate story JSON
        const systemPrompt = `You are an expert children's book author...`; // same as in your HTML
        const storyResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `Create a 5-page story: ${prompt}` }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    generationConfig: { responseMimeType: "application/json" }
                }),
            }
        );
        const storyData = await storyResponse.json();
        res.status(200).json({ story: storyData });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
}
