# Pico-de-CLI

A lightweight CLI agent blending cloud & local LLMs with custom tools.

<p align="center">
  <img src="assets/pico-de-cli-mascot.png" alt="Pico-de-CLI Mascot" width="600" />
  <br />
  <sub><i>Mascot illustration generated using Google Gemini.</i></sub>
</p>

> **Concept**  
> Like *Pico de Gallo*, finely chopping and blending various LLMs (Cloud & Local) and tools into a single, sharp CLI experience.

## Key Features

- **Multi-Engine Fusion**: Seamlessly switch between Cloud LLMs (e.g., Gemini) and Local LLMs (e.g., Ollama / Qwen).
- **Tool Integration**: Easily connect custom tools to execute complex developer workflows.
- **Lightweight & Fast**: Built for speed and simplicity, right inside your terminal.

## Prerequisites & Tools

* **Docker**
  > 💡 **Note for Local LLMs:** When running local LLMs, allocate sufficient memory (**6.0 GB or more**) in Docker settings (`Settings > Resources`) to prevent Out-Of-Memory (OOM) crashes during inference.
* **VS Code** + **Dev Containers Extension**
  > Provides an isolated environment to protect your host system from unexpected actions or file modifications by AI agents.
* **Gemini API Key** *(Optional)*
  > Required if you plan to use Google Gemini models. You can generate an API key via [Google AI Studio](https://aistudio.google.com/app/apikey).
