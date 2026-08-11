import { generateText } from "../src/core/generate-text";
import { createGoogle } from "../src/providers/google";
import { allTools } from "../src/tools/allTools";
import type { Message } from "../src/types";

const messages: Message[] = [
	{ role: "user", content: "AI エージェントとは何ですか？" },
];

const google = createGoogle({ apiKey: process.env.GEMINI_API_KEY as string });
const result = await generateText({
	model: google(process.env.GEMINI_MODEL as string),
	messages,
	tools: Object.values(allTools),
});

console.log(`Gemini ganerated text: ${result.text}`);
