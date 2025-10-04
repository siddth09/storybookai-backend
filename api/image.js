import fetch from 'node-fetch';
const API_KEY=process.env.GEMINI_API_KEY;

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const {prompt}=req.body;
  if(!prompt) return res.status(400).json({error:'Prompt required'});

  try{
    const payload={instances:[{prompt:`Children's storybook illustration, vibrant watercolor style, ${prompt}`}],parameters:{sampleCount:1,aspectRatio:"16:9"}};
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const json=await response.json();
    const base64=json.predictions?.[0]?.bytesBase64Encoded;
    if(!base64) throw new Error("Imagen failed");
    res.status(200).json({imageUrl:`data:image/png;base64,${base64}`});
  }catch(e){res.status(500).json({error:e.message});}
}
