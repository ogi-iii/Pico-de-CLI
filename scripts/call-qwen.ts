import { callChatCompletionsAPI } from "./call-chat-completions-api";

callChatCompletionsAPI(
  process.env.QWEN_PROVIDER as string,
  process.env.QWEN_MODEL as string,
  process.env.QWEN_URL as string,
  process.env.QWEN_API_KEY as string,
);
