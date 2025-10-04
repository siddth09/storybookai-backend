import fetch from 'node-fetch';
const API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {prompt}=req.body;
  if(!prompt) return res.status(400).json({error:'Prompt required'});

  try{
    const payload={
      contents:[{parts:[{text:`Create a 5-page children's story about: ${prompt}` }]}],
      systemInstruction:{parts:[{text:"You are a children's book author..."}]},
      generationConfig:{responseMimeType:"application/json"}
    };
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    });
    const json=await response.json();
    let text=json?.candidates?.[0]?.content?.parts[0]?.text;
    text=text.replace(/```json|```/g,'').trim();
    const storyJson=JSON.parse(text);
    res.status(200).json(storyJson);
  }catch(e){res.status(500).json({error:e.message});}
}
