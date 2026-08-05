export async function callChatCompletionsAPI(provider: string, model: string, url: string, apiKey: string) {
  console.log(`LLM Provider: ${provider}`)
  console.log(`LLM Model: ${model}`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: `${model}`,
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
  console.log(`API Response: ${data.choices?.[0]?.message?.content}`);
}
