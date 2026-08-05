import { callChatCompletionsAPI } from "./call-chat-completions-api";

callChatCompletionsAPI(
  process.env.GEMINI_PROVIDER as string,
  process.env.GEMINI_MODEL as string,
  process.env.GEMINI_URL as string,
  process.env.GEMINI_API_KEY as string,
);
