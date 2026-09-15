<div align="center">

# Hermes AI Research Command Center

### Cheetah Youth Program Project

**Research Workflow · RAG · GPU Operations · AI Agents**

![Program](https://img.shields.io/badge/Project-Cheetah%20Youth%20Program-F59E0B?style=flat-square)
![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=flat-square&logo=react&logoColor=black)
![TanStack](https://img.shields.io/badge/Framework-TanStack-FF4154?style=flat-square)
![Hono](https://img.shields.io/badge/Backend-Hono-E36002?style=flat-square)
![SQLite](https://img.shields.io/badge/Data-SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Agents](https://img.shields.io/badge/Agents-FastClaw-111827?style=flat-square)

A full-stack AI product that grew out of the **Cheetah Youth Program** and evolved into a local-first research command center connecting papers, semantic search, AI agents, reproduction tracking, and compute operations.

</div>

## Program Context

This project was developed through the **Cheetah Youth Program** as a real-world product and engineering exercise rather than a standalone coding demo.

The program context pushed the project beyond interface design and into a complete delivery loop:

- translating activity requirements into product structure;
- designing frontend and backend boundaries;
- connecting structured data with real user workflows;
- integrating AI capabilities into a usable system;
- validating the system through iterative engineering and packaging.

The repository later evolved into **Hermes AI Research Command Center**, preserving the original product-engineering discipline while moving toward research tooling and AI-agent orchestration.

## Why This Project Exists

Research work is usually fragmented across a PDF manager, browser tabs, SSH terminals, notes, model chats, and experiment logs. Hermes explores a different workflow: one command center that keeps papers, AI agents, compute resources, and reproduction records connected.

## Core Workflow

```text
Paper / Research Question
          |
          v
     Research Library
          |
     +----+-----+
     |          |
     v          v
 RAG Search   AI Agents
     |          |
     +----+-----+
          |
          v
Reproduction / Deployment
          |
          v
 GPU / Device Workspace
```

## Main Capabilities

- **Paper library** — manage papers, PDFs, metadata, and structured analysis.
- **Semantic research search** — RAG-oriented search and paper conversations.
- **AI command center** — stream agent runs and tool events through a unified interface.
- **Research agents** — separate roles for research, paper analysis, and deployment workflows.
- **Device workspace** — manage remote compute resources and reproduction jobs.
- **Reproduction records** — keep implementation and experiment progress tied to the source paper.

## Architecture

```text
warmth-connect-portal/
├── fronted/   # TanStack Start + React 19 + Tailwind CSS + shadcn/ui
├── backend/   # Hono + Drizzle ORM + SQLite + zod
├── desktop/   # Desktop packaging / integration work
├── scripts/   # Integration and validation scripts
└── docs / engineering notes
```

The AI runtime is integrated as a separate FastClaw service through OpenAI-compatible and streaming APIs.

## Technology Stack

| Layer | Stack |
| --- | --- |
| Frontend | TanStack Start, React 19, Vite, Tailwind CSS v4, shadcn/ui |
| Backend | Hono, TypeScript, zod, pino |
| Data | Drizzle ORM, SQLite |
| AI runtime | FastClaw agents, OpenAI-compatible API, SSE |
| Remote operations | SSH-based device management |
| Packaging | Windows-focused desktop engineering loop |

## Local Development

### Frontend

```bash
cd fronted
bun install
bun run dev
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

The frontend and backend are intentionally runnable independently. Agent features require a configured FastClaw runtime and the corresponding environment variables.

## Important API Areas

```text
/api/papers                 Paper library
/api/rag                    RAG conversations
/api/devices                Compute device management
/api/reproduction-records   Reproduction tracking
/api/command                Research command execution
/api/fastclaw               Agent streaming / deployment helpers
```

## What This Project Trains

This project is one of the main long-form projects in my **Professional AI Player** portfolio. It trains the full path from activity-driven product work to a maintainable AI engineering system:

**requirements → product structure → interface → backend contracts → data model → AI integration → validation → packaging**

## Status

`Cheetah Youth Program` · `Active Development` · `Full-stack` · `AI Agent Integration` · `Research Tooling`
