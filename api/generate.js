// File: api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Story prompt is required" });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  // Utility to convert Base64 PCM to WAV Blob URL
  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function pcmToWav(pcmData, sampleRate) {
    const pcm16 = new Int16Array(pcmData);
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);

    const buffer = new ArrayBuffer(44 + pcm16.byteLength);
    const view = new DataView(buffer);

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcm16.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcm16.byteLength, true);

    let offset = 44;
    for (let i = 0; i < pcm16.length; i++) {
      view.setInt16(offset, pcm16[i], true);
      offset += 2;
    }

    return Buffer.from(view.buffer);
  }

  try {
    // 1️⃣ Generate Story JSON
    const systemPrompt = `You are an expert children's book author. Generate a 5-page story with text and image prompts in JSON.`;
    const storyResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Create a 5-page story for a child about: ${prompt}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    let text = (await storyResponse.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini did not return story text");

    text = text.replace(/```json|```/g, '').trim();
    const storyJson = JSON.parse(text);

    if (!storyJson.pages || !Array.isArray(storyJson.pages)) {
      throw new Error("Story JSON missing pages array");
    }

    // 2️⃣ Generate Images for each page
    for (const page of storyJson.pages) {
      const imgResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt: `Children's storybook illustration, vibrant watercolor style, ${page.image_prompt}` }],
            parameters: { sampleCount: 1, aspectRatio: "16:9" },
          }),
        }
      );

      const imgData = (await imgResp.json())?.predictions?.[0]?.bytesBase64Encoded;
      if (!imgData) throw new Error(`Imagen failed for page ${page.page_number}`);
      page.imageUrl = `data:image/png;base64,${imgData}`;
    }

    // 3️⃣ Generate TTS for each page
    for (const page of storyJson.pages) {
      const ttsResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Read this text in a cheerful children's voice: "${page.text}"` }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
            },
            model: "gemini-2.5-flash-preview-tts",
          }),
        }
      );

      const audioPart = (await ttsResp.json())?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!audioPart?.data) throw new Error(`TTS failed for page ${page.page_number}`);

      const rateMatch = audioPart.mimeType.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      const wavBuffer = pcmToWav(base64ToArrayBuffer(audioPart.data), sampleRate);
      page.audioUrl = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
    }

    res.status(200).json({ story: storyJson });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
