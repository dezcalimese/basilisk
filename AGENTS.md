# Repository Guidelines

## Project Structure & Module Organization
- `backend/` (FastAPI) contains `app/` with `api/`, `models/`, `data/`, `db/`, and `core/`; runtime config lives in `.env`.
- `frontend/` (Next.js + Bun) keeps routes in `app/`, shared UI in `components/`, and helpers in `lib/`; static files go under `public/`.
- `cli/` (Rust Ratatui) exposes the entry points in `src/main.rs` and `src/app.rs` with API helpers in `src/api/` and views in `src/ui/`.

## Build, Test, and Development Commands
- Backend: `uv sync --all-extras` to install, `uv run python main.py` for hot reload, `uv run ruff check .` / `uv run ruff format .` for lint+format, `uv run mypy app/` for typing, `uv run pytest` for backend tests.
- Frontend: `bun install`, `bun dev` for the dashboard, `bun run build` + `bun start` for production, `bun run lint` for ESLint/TypeScript validation.
- CLI: `cargo build --release` (or `cargo run`), with `cargo fmt` and `cargo clippy --all-targets --all-features` before submission.

## Coding Style & Naming Conventions
- Python: 4-space indentation, exhaustive type hints, snake_case modules, PascalCase Pydantic models. `ruff` is the single source of truth for formatting and import order.
- TypeScript/React: keep components in PascalCase, hooks/utilities camelCase, favor functional components and Tailwind utility classes. Let ESLint/Next rules (triggered via `bun run lint`) resolve debates.
- Rust: run `cargo fmt` after edits. Modules snake_case, types/enums PascalCase, async helpers isolated in `app.rs` to keep `main.rs` slim.

## Testing Guidelines
- Backend tests belong in `backend/tests/` mirroring the `app/` tree; stub Kalshi traffic with fixtures and target probabilistic model coverage >=80%. Execute with `uv run pytest`.
- Frontend tests live next to components as `ComponentName.test.tsx` (Vitest/Jest via `bun test`).
- CLI tests should live in `cli/tests/` or inline `#[cfg(test)]` blocks; mock HTTP clients and run `cargo test --all`.

## Commit & Pull Request Guidelines
- History is empty, so default to Conventional Commits (`feat: add signal model`). Keep subjects imperative ≤72 chars and describe scope per package (`backend`, `frontend`, `cli`).
- Every PR needs: summary, linked issue (or context paragraph), checkboxes for touched packages, test evidence (`pytest`, `bun lint`, `cargo test`), and screenshots/recordings for UI or TUI changes.

## Environment & Security Notes
- Duplicate template env files (`backend/.env.example`, `frontend/.env.local.example`) before injecting secrets; never commit real Kalshi keys.
- Follow `KALSHI_SETUP.md` when enabling live market ingestion and keep `NEXT_PUBLIC_API_URL` pointed at `http://localhost:8000` for local stacks.
