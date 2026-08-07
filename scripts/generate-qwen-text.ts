import { generateText } from "../src/core/generate-text";
import { createOpenAI } from "../src/providers/openai";
import type { Message } from "../src/types";

const messages: Message[] = [
	{ role: "user", content: "AI エージェントとは何ですか？" },
];

const ollama = createOpenAI({
	apiKey: process.env.QWEN_API_KEY || "ollama", // required but unused
	baseURL: process.env.QWEN_URL,
});
const result = await generateText({
	model: ollama(process.env.QWEN_MODEL as string),
	messages,
});

console.log(`Qwen ganerated text: ${result.text}`);
