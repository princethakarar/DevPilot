# <p align="center"><img src="./public/icon-bg-removed.png" alt="DevPilot Icon" width="42" valign="middle" style="vertical-align: middle; margin-right: 8px;" /> DevPilot</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.x-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js Version" />
  <img src="https://img.shields.io/badge/React-19.x-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React Version" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript Version" />
  <img src="https://img.shields.io/badge/MongoDB-Native_Driver-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/WebContainers-API-1389FD?style=for-the-badge&logo=stackblitz&logoColor=white" alt="WebContainers" />
  <img src="https://img.shields.io/badge/Groq_LLM-Qwen3_32B-F3A530?style=for-the-badge&logo=meta&logoColor=white" alt="Groq" />
  <img src="https://img.shields.io/badge/Mistral-Codestral_FIM-FF7000?style=for-the-badge&logo=mistral&logoColor=white" alt="Mistral" />
  <img src="https://img.shields.io/badge/Monaco-Editor-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="Monaco Editor" />
</p>

<p align="center">
  <img src="./Sample Images/hero.png" alt="DevPilot Landing Page" width="100%" style="border-radius: 8px; border: 1px solid #30363d;" />
</p>

---

### *"A full-stack, browser-native AI-powered IDE featuring an autonomous coding agent, real-time inline code completions, a VS Code-inspired editor with integrated terminal, live preview, Git source control, and multi-framework project scaffolding — all running entirely in the browser via WebContainers."*

`DevPilot` is an enterprise-grade cloud IDE platform that lets developers spin up full-stack projects directly in the browser. Choose from 6+ framework templates (React, Next.js, Vue, Angular, Express, Node), write code in a Monaco-powered editor with AI ghost-text completions, delegate complex tasks to an autonomous AI agent that reads, writes, and verifies code on your behalf, and push changes directly to GitHub — all without installing a single dependency locally.

---

## 🔍 Visual Overview

Click on the tabs below to expand high-fidelity visual representations of the application's core pages and features.

<details>
<summary>🖥️ <b>Browser-Native IDE & Code Editor (Monaco + WebContainers)</b></summary>

![Browser-Native IDE & Code Editor](./Sample%20Images/Playground.png)

*The VS Code-inspired IDE layout powered by **Monaco Editor** and **WebContainers API**. Features include a resizable file explorer, multi-tab code editing with syntax highlighting, an integrated xterm.js terminal, and a real-time live preview panel — all running natively in the browser with no server-side compute.*

</details>

<details>
<summary>🤖 <b>Autonomous AI Coding Agent (Groq + Qwen3-32B)</b></summary>

*The autonomous agent panel embedded in the IDE sidebar. Users describe a task in natural language, and the agent autonomously reads files, searches the codebase, writes changes, runs verification commands (lint/build/test), and creates rollback checkpoints — all with full visibility into every tool call via a real-time streaming log.*

</details>

<details>
<summary>✨ <b>AI Inline Code Completions (Mistral Codestral FIM)</b></summary>

*Ghost-text suggestions powered by **Mistral's Codestral** Fill-in-the-Middle endpoint. Completions appear inline as the developer types, with rate-limiting and secret-redaction baked in server-side. Togglable on/off per session from the editor toolbar.*

</details>

<details>
<summary>🔄 <b>GitHub Source Control Panel (Octokit Data API)</b></summary>

*The built-in VS Code-style Source Control view. Tracks file changes (added, modified, deleted) with gitignore-aware diffing against the last pushed baseline. Supports creating new GitHub repos, committing with messages, and pushing — all via the GitHub Data API (no local Git binary needed). Includes initial push retry and repo unlinking.*

</details>

---

## ⚙️ Authentication & Session Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer
    participant FE as Frontend (Next.js 16)
    participant Auth as NextAuth.js v5 (JWT)
    participant DB as Database (MongoDB)
    participant OAuth as OAuth Provider (GitHub / Google)

    User->>FE: Click "Sign In"
    FE->>Auth: Redirect to OAuth Provider
    Auth->>OAuth: Authorization Request (Scopes: repo, user:email)
    OAuth-->>Auth: Return Authorization Code
    Auth->>OAuth: Exchange Code for Tokens
    OAuth-->>Auth: Return Access + ID Tokens
    Auth->>DB: Find or Create User & Link Account
    DB-->>Auth: Return User Record
    Auth-->>FE: Set JWT Access Token (In-Memory) + Session Cookie
    FE-->>User: Redirect to Dashboard
    Note over FE,Auth: Silent JWT rotation via<br/>NextAuth session callbacks.<br/>Access tokens are short-lived,<br/>refresh handled automatically.
```

---

## 🤖 Autonomous AI Agent Orchestration Flow

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant UI as Agent Panel (React)
    participant API as API Route (Next.js)
    participant Orch as Orchestrator (Server)
    participant LLM as Groq API (Qwen3-32B)
    participant DB as Database (MongoDB)
    participant WC as WebContainer (Browser)

    Dev->>UI: Enter Task Description & Start Run
    UI->>API: POST /api/ai/agent/run (SSE Stream)
    activate API
    API->>DB: Create AgentRun Record
    API->>Orch: runAgentOrchestrator({ runId, playgroundId, task })
    activate Orch
    Note over Orch: Phase 1: Load project file tree<br/>from DB (TemplateFiles)
    Orch->>DB: Create Pre-Task Checkpoint (Rollback Safety Net)
    Note over Orch,DB: Entire file tree snapshot<br/>stored with TTL expiry

    loop Autonomous Tool-Calling Loop
        Orch->>LLM: ChatCompletion (System Prompt + Task + Context)
        activate LLM
        LLM-->>Orch: Return Tool Calls (read_file, write_file, run_command, etc.)
        deactivate LLM
        Note over Orch: Execute tools against in-memory file tree.<br/>write_file → persist to DB + emit sync event.<br/>run_command → relay to WebContainer terminal.
        Orch-->>UI: Stream SSE Events (tool_call, tool_result, status)
        UI-->>WC: Sync file changes to live WebContainer
    end

    Orch->>DB: Create Post-Task Checkpoint
    Orch-->>API: Emit "done" Event (completed / blocked / capped)
    deactivate Orch
    API-->>UI: Close SSE Stream
    deactivate API
    UI-->>Dev: Display Summary + Offer Checkpoint Restore
```

---

## ⚡ Features

### 🛠️ Browser-Native IDE (Zero Local Setup)
*   **WebContainer Runtime**: Full Node.js environment running natively in the browser via StackBlitz's `@webcontainer/api`. No Docker, no SSH, no remote servers — `npm install` and `npm run dev` execute right in the browser tab.
*   **Monaco Code Editor**: VS Code's editor engine with full syntax highlighting, IntelliSense, multi-tab editing, and keyboard shortcuts — powered by `@monaco-editor/react`.
*   **Integrated Terminal**: Real xterm.js terminal (`@xterm/xterm`) with search, web links, and auto-fit addons, connected directly to the WebContainer shell.
*   **Live Preview Panel**: Real-time preview of the running development server, embedded as an iframe that listens for the WebContainer's `server-ready` event.

### 🤖 AI Autonomous Coding Agent
*   **Full Agentic Loop**: The agent reads files, searches the codebase, writes changes, runs shell commands (via an allowlist), and verifies results — all autonomously in a tool-calling loop.
*   **Groq-Powered LLM**: Uses `Qwen3-32B` on Groq's high-speed inference API with intelligent rate-limit handling, token budget management, and context trimming.
*   **Checkpoint Safety Net**: Automatic pre/post-task snapshots stored in MongoDB with TTL expiry. One-click rollback to any checkpoint from the Agent Panel.
*   **Stall Detection**: Detects repeated failing tool calls and gracefully stops the run with a specific diagnosis rather than burning through the token budget.
*   **Real-Time Streaming**: Every tool call, result, and status update streams to the UI via Server-Sent Events, giving full transparency into the agent's reasoning.

### ✨ Inline AI Code Completions
*   **Mistral Codestral FIM**: Ghost-text suggestions via Mistral's dedicated Fill-in-the-Middle endpoint — purpose-built for code completion, not repurposed chat.
*   **Secret Redaction**: Server-side middleware automatically strips `.env` values and API keys from the context sent to the model.
*   **Rate Limiting**: Per-user, per-minute limits prevent abuse without degrading the editor experience (silently returns empty on limit hit).

### 🔄 GitHub Source Control Integration
*   **Create & Link Repos**: Create new GitHub repositories directly from the IDE with customizable name, description, and visibility settings via the Octokit REST API.
*   **VS Code-Style Change Tracking**: Gitignore-aware file diffing against the last pushed baseline. Changes are categorized as Added, Modified, or Deleted with per-file discard support.
*   **Commit & Push**: Commit with custom messages and push via the GitHub Data API (tree → blob → commit → ref update) — no local Git binary required.
*   **Initial Push Retry**: If the first push fails after repo creation, a dedicated "Retry Initial Push" flow prevents orphaned empty repos.

### 📄 Multi-Framework Project Templates
*   **6 Starter Templates**: React (TypeScript), Next.js, Vue, Angular, Express, and Node.js — each with pre-configured build tooling and sensible defaults.
*   **Snapshot Caching Pipeline**: Three-tier dependency caching (IndexedDB → CDN → npm fallback) with pre-built `node_modules` snapshots for near-instant project boot.
*   **Boot Reliability Engine**: Smart retry with progressive strategy escalation (`--legacy-peer-deps` → `--force`), install verification, and real-time error classification.

### 🔐 Authentication & User Management
*   **OAuth Providers**: GitHub and Google sign-in via NextAuth.js v5 with automatic account linking.
*   **JWT Sessions**: Stateless JWT tokens with silent server-side rotation. User schemas validated with Zod.
*   **Secure Environment Variables**: Per-project encrypted env var storage with server-side injection into WebContainer processes.

---

## 🧠 Step-by-Step System Architecture

The application is a single Next.js 16 deployment with distinct runtime layers cooperating in real-time:

### 1. The Frontend Layer (React 19 + Next.js App Router)
*   Renders the landing page with cinematic intro animation, particle canvas, and custom cursor.
*   Provides a responsive dashboard for project management (CRUD, star/bookmark, duplicate, delete).
*   Hosts the full IDE layout with resizable panels: File Explorer, Code Editor, Terminal, Preview, Source Control, AI Agent, and AI Chat.
*   Uses `zustand` for global state management and `react-resizable-panels` for the IDE panel system.

### 2. The Server Layer (Next.js API Routes + Server Actions)
*   Handles OAuth authentication, JWT session management, and role-based middleware.
*   Serves CRUD operations for projects, template files, user accounts, and agent run records via server actions.
*   Hosts the AI agent orchestrator as an SSE-streaming API route.
*   Proxies inline completion requests to Mistral's Codestral FIM API with rate limiting and secret redaction.
*   Manages GitHub operations (repo creation, commit, push) via the Octokit Data API.

### 3. The Browser Runtime (WebContainers + Monaco + xterm)
*   Boots a full Node.js environment in-browser via `@webcontainer/api` with COOP/COEP headers.
*   Persists `node_modules` to IndexedDB between sessions to eliminate redundant installs.
*   Streams terminal I/O between the WebContainer shell and the xterm.js terminal component.
*   Syncs file changes bidirectionally between the Monaco editor, the in-memory file tree, and the database.

---

## 🛠️ Detailed Technical Deep-Dives

### 🔄 Snapshot Caching Pipeline (3-Tier Dependency Speed System)
To eliminate the 30–90 second `npm install` cold start on every project load:
1.  **IndexedDB Cache**: Pre-built `node_modules` tarballs stored as blobs in the browser via `idb-keyval`, keyed by content hash.
2.  **CDN Snapshots**: Fallback to `https://snapshots.devpilot.app/{template}/{hash}.tar.gz` for cache misses.
3.  **npm Install**: Final fallback with progressive retry strategies and post-install integrity verification.

### 🛡️ Boot Reliability & Error Recovery
WebContainer's WASM filesystem has a write-back cache — `npm install` can exit before files are fully flushed. DevPilot mitigates this with:
1.  **500ms post-install delay** before verification (ensures WASM memory flush).
2.  **Deep integrity checks**: Validates `node_modules/.bin` entries and verifies each key package's main entry file exists.
3.  **Smart retry engine**: 3 retries with escalating strategies (normal → `--legacy-peer-deps` → `--force`).
4.  **Real-time error classification**: Scans npm output for `ERESOLVE`, `ENOTFOUND`, `EINTEGRITY`, `ENOSPC`, and `EADDRINUSE` patterns with targeted user-facing suggestions.

### 🤖 AI Agent — Security & Safeguards
The autonomous agent has production-grade guardrails:
1.  **Command Allowlist**: Only package manager commands (`npm`, `yarn`, `pnpm`, `bun`) and read-only git commands pass validation. Shell operators (`&&`, `|`, `;`, `>`) are rejected outright.
2.  **Token Budget System**: Per-run caps on tool calls (count), wall-clock time (minutes), and approximate token usage — prevents runaway billing.
3.  **Stall Detection**: Tracks repeated identical failures. After N consecutive identical error signatures, the run is stopped with a specific diagnostic rather than looping indefinitely.
4.  **Mandatory Checkpoints**: Every run creates a pre-task snapshot before any writes and a post-task snapshot after completion — one-click rollback from the UI.
5.  **Context Trimming**: Older tool results are progressively summarized to stay under Groq's TPM budget, keeping only the most recent result in full.

---

## 📂 Folder Structure

```
DevPilot/
├── app/                              # Next.js App Router
│   ├── (auth)/auth/                  # Sign-in page (OAuth flow)
│   ├── (root)/                       # Landing page (public)
│   ├── dashboard/                    # Project management dashboard
│   ├── playground/[id]/              # IDE workspace (per-project)
│   └── api/                          # API Routes
│       ├── ai/agent/run/             # AI Agent SSE streaming endpoint
│       ├── ai/inline-completion/     # Mistral Codestral FIM proxy
│       ├── chat/                     # AI Chat completions (Groq)
│       ├── template/                 # Template file serving
│       └── auth/                     # NextAuth.js handlers
│
├── modules/                          # Feature modules (domain-driven)
│   ├── playground/                   # IDE workspace logic
│   │   ├── actions/                  # Server actions (commit, env, create-repo)
│   │   ├── components/               # Explorer, Editor, Agent Panel, Source Control
│   │   ├── hooks/                    # useFileExplorer, useSourceControl, useAgentRun
│   │   └── lib/                      # Path-to-JSON tree, gitignore helpers
│   ├── webcontainers/                # WebContainer IDE shell
│   │   ├── components/               # IdeLayout, IdeEditor, IdeTerminal, IdePreview
│   │   ├── hooks/                    # useWebContainer, useProjectBoot, useIdeLayout
│   │   └── lib/                      # node_modules persistence (IndexedDB)
│   ├── ai-chat/                      # AI Chat sidebar panel
│   │   └── components/               # Chat UI with markdown rendering
│   ├── dashboard/                    # Dashboard module
│   │   ├── actions/                  # CRUD, GitHub linking, star/bookmark
│   │   ├── components/               # Project table, template modal, sidebar
│   │   └── lib/                      # Template icons, utilities
│   ├── home/                         # Landing page module
│   │   ├── landing/                  # Intro animation, hero canvas, chat demo
│   │   ├── header.tsx                # Navigation header
│   │   └── footer.tsx                # Site footer
│   └── auth/                         # Auth module (actions, hooks)
│
├── lib/                              # Shared library code
│   ├── ai/                           # AI subsystem
│   │   ├── agent/                    # Autonomous agent engine
│   │   │   ├── orchestrator.ts       # Main agent loop (tool-calling, checkpoints)
│   │   │   ├── tools.ts              # Tool definitions & system prompt
│   │   │   ├── model-client.ts       # Groq API client (Qwen3-32B)
│   │   │   ├── context-tools.ts      # list_files, read_file, search_codebase
│   │   │   ├── file-tools.ts         # write_file (tree mutation)
│   │   │   ├── allowlist.ts          # Command validation & security
│   │   │   ├── stall-detector.ts     # Repeated-failure detection
│   │   │   ├── token-budget.ts       # TPM budget & estimation
│   │   │   ├── context-trim.ts       # Progressive context window trimming
│   │   │   ├── rate-limit-retry.ts   # Groq 429/413 handling
│   │   │   └── relay.ts             # SSE event emitter & browser command relay
│   │   ├── rate-limiter.ts           # Per-user inline completion rate limiter
│   │   └── redact-secrets.ts         # .env value stripping from AI context
│   ├── boot/                         # WebContainer boot reliability
│   │   ├── error-detector.ts         # Real-time npm output pattern matching
│   │   ├── install-verifier.ts       # Post-install integrity validation
│   │   ├── retry-engine.ts           # Exponential backoff + strategy shifts
│   │   └── process-cleanup.ts        # Kill + clean + port release
│   ├── checkpoint/                   # Agent rollback system
│   │   ├── store.ts                  # Create / restore / list checkpoints (MongoDB)
│   │   └── constants.ts              # TTL configuration
│   ├── snapshot/                     # Dependency caching pipeline
│   │   ├── config.ts                 # Template hashes & dependency profiles
│   │   ├── loader.ts                 # 3-tier loading (IndexedDB → CDN → npm)
│   │   ├── cache.ts                  # IndexedDB blob storage (idb-keyval)
│   │   └── tar-parser.ts            # In-browser tar.gz extraction
│   ├── db/                           # Database layer
│   │   ├── mongoClient.ts            # MongoDB native driver connection
│   │   ├── schemas.ts                # Zod schemas (User, Account, Playground, etc.)
│   │   ├── repositories/             # Data access (users, accounts, playgrounds, etc.)
│   │   └── authAdapter.ts            # NextAuth.js custom MongoDB adapter
│   └── template.ts                   # Template scaffold loader
│
├── components/                       # Shared UI components
│   ├── ui/                           # Shadcn/UI primitives (Button, Dialog, etc.)
│   └── providers/                    # Theme provider (next-themes)
│
├── vibecode-starters/                # Bundled project templates
│   ├── react-ts/                     # React + TypeScript + Vite
│   ├── nextjs/                       # Next.js starter
│   ├── vue/                          # Vue 3 + Vite
│   ├── angular/                      # Angular CLI
│   ├── express-simple/               # Express.js API
│   ├── hono-nodejs-starter/          # Hono framework
│   ├── node/                         # Vanilla Node.js
│   └── ... (30+ additional templates)
│
├── scripts/                          # Build & maintenance scripts
│   ├── build-snapshots.ts            # Generate node_modules snapshot tarballs
│   └── ensure-checkpoint-indexes.ts  # MongoDB TTL index provisioning
│
├── auth.ts                           # NextAuth.js configuration
├── auth.config.ts                    # OAuth provider setup (GitHub, Google)
├── routes.ts                         # Route protection definitions
├── next.config.ts                    # Next.js config (COOP/COEP headers, etc.)
└── package.json                      # Dependencies & scripts
```

---

## ⚡ Quick Start

### 📋 Prerequisites
- **Node.js**: v20 or higher
- **MongoDB**: A running local or Atlas instance
- **GitHub OAuth App**: Client ID & Secret for authentication
- **Google OAuth App**: Client ID & Secret for authentication (optional)

---

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/princethakarar/Vibe-Code-Editor.git
cd Vibe-Code-Editor

# Install dependencies
npm install
```

---

### 2. Configure Environment Variables

Create a `.env` file in the root directory with the variables listed in the [Environment Variables](#-environment-variables-configuration) section below.

---

### 3. Provision Database Indexes

Run the checkpoint TTL index script once against your MongoDB instance:

```bash
npx tsx scripts/ensure-checkpoint-indexes.ts
```
> [!NOTE]
> This creates a TTL index on the `project_checkpoints` collection so expired rollback snapshots are automatically cleaned up by MongoDB's background monitor.

---

### 4. Launch the Development Server

```bash
npm run dev
```

> [!IMPORTANT]
> Access the fully responsive app at `http://localhost:3000`.  
> The app requires **Cross-Origin-Opener-Policy** and **Cross-Origin-Embedder-Policy** headers for WebContainers — these are configured automatically in `next.config.ts`.

---

## 🔑 Environment Variables Configuration

Create a `.env` file in the project root containing the following:

| Variable Name | Purpose / Category | Example Value |
| :--- | :--- | :--- |
| `DATABASE_URL` | MongoDB Connection String | `mongodb+srv://user:pass@cluster.mongodb.net/DevPilot` |
| `MONGODB_DATABASE` | Database Name | `DevPilot` |
| `AUTH_SECRET` | NextAuth.js Session Encryption | `64_char_random_hex_string` |
| `AUTH_GITHUB_ID` | GitHub OAuth App Client ID | `Ov23liXXXXXXXXXXXXXX` |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App Client Secret | `0f1d717eXXXXXXXXXXXXXXXXXXXXXXXX` |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | `123456789-XXXXX.apps.googleusercontent.com` |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | `GOCSPX-XXXXXXXXXXXXXXXXXXXXXXXX` |
| `GROQ_API_KEY` | Groq LLM API Key (Agent + Chat) | `gsk_XXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `GROQ_MODEL` | Groq Chat Model (AI Chat sidebar) | `llama-3.3-70b-versatile` |
| `MISTRAL_API_KEY` | Mistral API Key (Inline Completions) | `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` |
| `MISTRAL_CODESTRAL_MODEL` | Mistral FIM Model | `codestral-latest` |

> [!NOTE]
> The autonomous AI agent uses `qwen/qwen3-32b` on Groq (hardcoded in the orchestrator) — it reuses the same `GROQ_API_KEY`. The `GROQ_MODEL` variable controls only the AI Chat sidebar.

> [!TIP]
> `MISTRAL_API_KEY` is optional. If unset, the inline completion toggle still renders but silently returns empty suggestions — the editor works fine without it.

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires DATABASE_URL)
npm run test:integration
```

Tests are powered by **Vitest 4** with separate configs for unit (`vitest.config.ts`) and integration (`vitest.integration.config.ts`) suites.

---

## 🏗️ Building for Production

```bash
# Create optimized production build
npm run build

# Start the production server
npm start
```

---

## 📜 Scripts Reference

| Script | Description |
| :--- | :--- |
| `npm run dev` | Start Next.js development server with Webpack |
| `npm run build` | Create production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:integration` | Run integration tests against live DB |

---

## 🔧 Key Technology Decisions

| Decision | Rationale |
| :--- | :--- |
| **WebContainers** over remote VMs | Zero infrastructure cost, instant boot, browser-native — no SSH tunnels, no Docker orchestration, no cloud compute billing. |
| **MongoDB Native Driver** over Mongoose/Prisma | Direct wire protocol control after migrating from Atlas Data API (which MongoDB deprecated for new accounts). Zod schemas replace Prisma's validation layer. |
| **Groq (Qwen3-32B)** for the agent | Head-to-head testing showed Qwen3-32B was the only Groq-hosted model that reliably completed the full read → write → verify → mark_complete loop without malformed tool calls. |
| **Mistral Codestral** for inline completions | Purpose-built FIM (Fill-in-the-Middle) endpoint — not a chat model repurposed for completion, giving higher quality single-line/multi-line suggestions. |
| **Server Actions** over REST routes | Next.js 16 server actions reduce boilerplate for CRUD operations while keeping full TypeScript type safety end-to-end. |
| **Checkpoint system in MongoDB** (not Redis) | Checkpoints are the sole rollback path for an agent that auto-applies every edit. A cache-oriented store (Redis/Upstash) was the wrong durability tier for safety-critical data. |

---

<p align="center">
  Made with ❤️ by <b>Prince</b>
</p>
