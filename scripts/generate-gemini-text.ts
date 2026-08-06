import { generateText } from "../src/core/generate-text";
import { createGoogle } from "../src/providers/google";
import type { Message } from "../src/types";

const messages: Message[] = [
	{ role: "user", content: "AI エージェントとは何ですか？" },
];

const google = createGoogle();
const result = await generateText({
	model: google(process.env.GEMINI_MODEL as string),
	messages,
});

console.log(`Gemini ganerated text: ${result.text}`);
