async function callGemini() {
  // Chat Completions API
  const response = await fetch(`${process.env.GEMINI_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: `${process.env.GEMINI_MODEL}`,
      messages: [
        { role: 'user', content: 'TypeScriptについて簡潔に説明してください。' }
      ],
    }),
  });

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  console.log(data.choices?.[0]?.message?.content);
}

callGemini();
