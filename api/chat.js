
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: { message: 'Server Configuration Error: API Key missing' } });
  }

  try {
    const { history, imageBase64, systemPrompt } = req.body;

    let dynamicPrompt = systemPrompt || "";

    // Construct payload for Gemini
    let contents = history;

    // Handle Image if present (similar logic to client-side)
    if (imageBase64) {
      // We need to act carefully here. The history passed from client 
      // is likely just the conversation history. 
      // We need to attach the image to the last user message or a new message.
      // Logic from client:
      /*
        const historyCopy = JSON.parse(JSON.stringify(history));
        const lastTurn = historyCopy[historyCopy.length - 1];
        if (lastTurn && lastTurn.role === "user") {
           // ... attach image ...
        }
      */
      // However, to simplify, the client can pass the "ready-to-send" contents array
      // OR we can reconstruct it here.
      // Let's rely on the client assuming it sends the 'contents' structure 
      // compatible with Gemini, OR we reconstruct it if it's our internal format.

      // Let's assume the client sends the cleaner "contents" list already formatted for Gemini if possible,
      // BUT the client-side logic for "multimodal" was complex.
      // Let's stick to the client sending "history" (our internal format) and "imageBase64".

      const historyCopy = JSON.parse(JSON.stringify(history));
      const lastTurn = historyCopy[historyCopy.length - 1];
      if (lastTurn && lastTurn.role === "user") {
        const rawBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        lastTurn.parts = [
          { text: "お客様が撮影した画像です。内容を説明し、もしメニューや商品が分かれば教えてください。" },
          { inline_data: { mime_type: "image/png", data: rawBase64 } }
        ];
      }
      contents = historyCopy;
    }

    const payload = {
      system_instruction: { parts: [{ text: dynamicPrompt }] },
      contents: contents
    };

    // Verify model is gemini-1.5-flash which supports Pay-As-You-Go billing
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || response.statusText);
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error(error);

    // Attempt to list models to help debugging
    try {
      const listResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey);
      const listData = await listResponse.json();

      let availableModels = "Models lookup failed";
      if (listData && listData.models) {
        availableModels = listData.models.map(m => m.name).filter(n => n.includes("gemini")).join(", ");
      }

      return res.status(500).json({
        error: {
          message: `(v4) Model Error: ${error.message}. \n\n[Check Billing]: Ensure your GCP project has billing enabled to avoid 'free_tier_requests' errors. \nAvailable Models: [${availableModels}]`
        }
      });
    } catch (listError) {
      res.status(500).json({ error: { message: `(v3) ${error.message} (Failed to list models)` } });
    }
  }
}
