import fetch from 'node-fetch';
const API_KEY=process.env.GEMINI_API_KEY;

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {text}=req.body;
  if(!text) return res.status(400).json({error:'Text required'});

  try{
    const payload={
      contents:[{parts:[{text:`Read in cheerful children's story tone: "${text}"`}]}],
      generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:"Puck"}}}},
      model:"gemini-2.5-flash-preview-tts"
    };
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const audioData=response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if(!audioData) throw new Error("TTS failed");
    res.status(200).json({audioUrl:`data:audio/wav;base64,${audioData}`});
  }catch(e){res.status(500).json({error:e.message});}
}
