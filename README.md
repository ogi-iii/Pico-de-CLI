# Pico-de-CLI

[![Test and Coverage](https://github.com/ogi-iii/Pico-de-CLI/actions/workflows/coveralls.yml/badge.svg)](https://github.com/ogi-iii/Pico-de-CLI/actions/workflows/coveralls.yml)
[![Coverage Status](https://coveralls.io/repos/github/ogi-iii/Pico-de-CLI/badge.svg?branch=main)](https://coveralls.io/github/ogi-iii/Pico-de-CLI?branch=main)

A lightweight CLI agent blending cloud & local LLMs with custom tools.

<p align="center">
  <img src="assets/pico-de-cli-mascot.png" alt="Pico-de-CLI Mascot" width="600" />
  <br />
  <sub><i>Mascot illustration generated using Google Gemini.</i></sub>
</p>

## Concept

Like [*Pico de Gallo*](https://es.wikipedia.org/wiki/Pico_de_gallo), finely chopping and blending various LLMs (Cloud & Local) and tools into a single, sharp CLI experience.

## Key Features

- **Multi-Engine Fusion**: Seamlessly switch between Cloud LLMs (e.g., Gemini) and Local LLMs (e.g., Ollama / Qwen).
- **Tool Integration**: Easily connect custom tools to execute complex developer workflows.
- **Lightweight & Fast**: Built for speed and simplicity, right inside your terminal.

## Requirements

* **Docker**
  > 💡 **Note for Local LLMs:**  
  > When running local LLMs, allocate sufficient memory (**6.0 GB or more**) in Docker settings (`Settings > Resources`) to prevent Out-Of-Memory (OOM) crashes during inference.
* **VS Code** + **Dev Containers Extension**
  > Provides an isolated environment to protect your host system from unexpected actions or file modifications by AI agents.
* **Gemini API Key** *(Optional)*
  > Required if you plan to use Google Gemini models. You can generate an API key via [Google AI Studio](https://aistudio.google.com/app/apikey).

## Usage

### Prerequisites

Set the required environment variables for your LLM provider.

> 💡 **Note:**  
> You can configure them using a `.env` file or exporting them directly in your terminal.

- Using a `.env` file **(recommended)**:   
    Copy `.env.example` to create your `.env` file in the project root and fill in the values:

    ```bash
    cp .env.example .env
    ```

    Example `.env` configurations:

    ```bash
    QWEN_PROVIDER=ollama
    QWEN_MODEL=qwen2.5:3b
    QWEN_URL=http://ollama:11434/v1/chat/completions
    QWEN_API_KEY= # no need to call Ollama's API

    GEMINI_PROVIDER=google
    GEMINI_MODEL=gemini-3.6-flash
    GEMINI_URL=https://generativelanguage.googleapis.com/v1beta/chat/completions
    GEMINI_API_KEY=<YOUR_API_KEY>

    LLM_PROVIDER=$GEMINI_PROVIDER
    LLM_MODEL=$GEMINI_MODEL
    LLM_URL=$GEMINI_URL
    LLM_API_KEY=$GEMINI_API_KEY
    ```

- Exporting environment variables directly in your terminal:   

    ```bash
    export LLM_PROVIDER="google"
    export LLM_MODEL="gemini-3.6-flash"
    export LLM_URL="https://generativelanguage.googleapis.com/v1beta/chat/completions"
    export LLM_API_KEY="<YOUR_API_KEY>"
    ```

### Command Syntax

```bash
bun run agent <YOUR_TASK_PROMPT> [options]
```

#### Arguments

* `<YOUR_TASK_PROMPT>` : The task or instruction you want the agent to execute.

#### Options

| Option | Short | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `--help` | `-h` | boolean | `false` | Show help message and exit |
| `--maxSteps` | `-m` | number | `30` | Maximum execution steps for the agent |
| `--verbose` | `-v` | boolean | `false` | Enable verbose debug logging |
| `--yolo` | `-y` | boolean | `false` | Automatically approve tool execution without asking |

### Examples

**Basic Task Execution:**

```bash
bun run agent "Create a simple HTTP server using Node.js"
```

**Run with Automatic Approval (YOLO Mode):**

```bash
bun run agent "Refactor src/index.ts to improve readability" --yolo
```

**Set Custom Max Steps with Verbose Logs:**

```bash
bun run agent "Analyze the codebase and generate comprehensive test cases" -m 50 -v
```

## Development

Commands for running tests, linting, and formatting the codebase:

```bash
# Run all tests with coverage
bun test

# Run linter with Biome
bun run check

# Run linter and format code with Biome
bun run check:fix
```
