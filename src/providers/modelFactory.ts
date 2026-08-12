import type { LanguageModel } from "../types";
import { createGoogle } from "./google";
import { createOpenAI } from "./openai";

function loadEnv(): { provider: string, modelName: string, apiKey: string | undefined } {
	const provider = process.env.LLM_PROVIDER;
	const modelName = process.env.LLM_MODEL;
	const apiKey = process.env.LLM_API_KEY;

	if (!provider) {
		throw new Error("Environment variable is not set: LLM_PROVIDER");
	}
	if (!modelName) {
		throw new Error("Environment variable is not set: LLM_MODEL");
	}

  return { provider, modelName, apiKey }
}

type ModelFactory = (modelName: string, apiKey: string | undefined) => LanguageModel;

const openAIModelFactory: ModelFactory = (modelName: string, apiKey: string | undefined) => {
			if (apiKey && !process.env.OPENAI_API_KEY) {
				process.env.OPENAI_API_KEY = apiKey;
			}
			const openai = createOpenAI();
			return openai(modelName);
		};

const ollamaModelFactory: ModelFactory = (modelName: string, apiKey: string | undefined) => {
			if (apiKey && !process.env.QWEN_API_KEY) {
				process.env.QWEN_API_KEY = apiKey;
			}
			const ollama = createOpenAI(); // To invoke Ollama’s OpenAI compatible API endpoint
			return ollama(modelName);
		};

const googleModelFactory: ModelFactory = (modelName: string, apiKey: string | undefined) => {
			if (apiKey && !process.env.GEMINI_API_KEY) {
				process.env.GEMINI_API_KEY = apiKey;
			}
			const google = createGoogle();
			return google(modelName);
		};

const modelFactories: Record<string, ModelFactory> = {
  openai: openAIModelFactory,
  ollama: ollamaModelFactory,
  google: googleModelFactory,
};

export function createModelFromEnv(): LanguageModel {
  const { provider, modelName, apiKey } = loadEnv();

  const modelFactory = modelFactories[provider.toLowerCase()];

  if (!modelFactory) {
    throw new Error(
				`Unsupported provider: '${provider}' (Supported providers: openai, ollama, google)`,
			)
  }
  return modelFactory(modelName, apiKey);
}
