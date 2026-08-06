import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createGoogle } from "./google";

const mockGenerateContent = mock();

mock.module("@google/genai", () => {
	return {
		GoogleGenAI: class {
			models = {
				generateContent: mockGenerateContent,
			};
		},
	};
});

describe("createGoogle", () => {
	beforeEach(() => {
		mockGenerateContent.mockClear();
	});

	it("should correctly convert messages to Gemini API format and send them", async () => {
		mockGenerateContent.mockResolvedValueOnce({
			candidates: [
				{
					content: {
						parts: [{ text: "Hello!" }],
					},
					finishReason: "STOP",
				},
			],
		});

		const google = createGoogle({
			apiKey: process.env.GEMINI_API_KEY as string,
		});
		const model = google(process.env.GEMINI_MODEL as string);

		const result = await model.doGenerate({
			messages: [{ role: "user", content: "Hi" }],
		});

		expect(result.text).toBe("Hello!");
		expect(result.finishReason).toBe("stop");
		expect(mockGenerateContent).toHaveBeenCalledTimes(1);
	});
});
