# Repository Guidelines

## Project Structure & Module Organization

This repository is split into `fronted/` and `backend/`. The frontend is a TanStack Start + React 19 app; application code lives under `fronted/src/`, with routes in `src/routes/`, shared helpers in `src/lib/`, reusable UI primitives in `src/components/ui/`, and Hermes-specific shell components in `src/components/hermes/`. The backend is a Hono + Drizzle SQLite service in `backend/src/`, organized by feature modules such as `modules/papers/`, `modules/rag/`, `modules/devices/`, and `modules/reproduction/`. Shared backend utilities live in `backend/src/shared/`, and database code lives in `backend/src/db/`.

## Build, Test, and Development Commands

Run commands from the relevant package directory.

- `cd fronted && npm run dev`: start the frontend Vite dev server.
- `cd fronted && npm run build`: produce the frontend production build.
- `cd fronted && npm run lint`: run ESLint on frontend TypeScript and TSX files.
- `cd backend && npm run dev`: start the backend with `tsx watch`.
- `cd backend && npm run build`: compile backend TypeScript to `dist/`.
- `cd backend && npm run db:generate`: generate Drizzle migrations from `src/db/schema.ts`.
- `cd backend && npm run db:migrate`: apply migrations to the configured SQLite database.
- `cd backend && npm run db:seed`: load sample data for local development.

## Coding Style & Naming Conventions

Use TypeScript throughout with 2-space indentation only where existing files do so; otherwise preserve the surrounding style and formatting. Keep modules focused and small. Use `PascalCase` for React components, `camelCase` for functions and variables, and kebab-free route files that follow TanStack conventions such as `library.$paperId.tsx` and `__root.tsx`. Run `npm run lint` and `npm run format` before submitting changes. Frontend linting uses `fronted/eslint.config.js`; both packages use Prettier.

## Testing Guidelines

There is currently no committed test runner or `tests/` directory in either package. Until one is added, treat linting, local build success, and manual route/API verification as the minimum quality gate. When adding tests, place them close to the feature or under a dedicated `tests/` directory, and use clear names such as `papers.service.test.ts`.

## Commit & Pull Request Guidelines

Recent history includes short messages such as `排序`, `实现 Docs 页面路由导航`, and generic `Changes`. Prefer concise, imperative commit subjects that describe the actual behavior change. Keep frontend and backend refactors separate when possible. PRs should include a short summary, affected areas, any schema or environment changes, and screenshots or API examples when UI or contract behavior changes.

## Security & Configuration Tips

Backend configuration is validated in `backend/src/config/env.ts`. Review `DATABASE_URL`, `PDF_STORAGE_DIR`, `CORS_ORIGIN`, `PORT`, and `LOG_LEVEL` before running locally. Do not commit local database files, secrets, or environment-specific `.env` values.
