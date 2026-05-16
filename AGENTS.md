# AGENTS.md

## Cursor Cloud specific instructions

### Codebase overview

This repository contains the **Content Engine** — a FastAPI-based API scaffold for social video generation. The actual application code lives on the `codex/draft-prd-for-advanced-content-engine` branch (main is nearly empty with just `.gitkeep`).

### Key facts

- **Single service**: FastAPI app with in-memory store, no database or external dependencies required.
- **Python >=3.11** required (`pyproject.toml`).
- **No Docker, no Redis, no DB** — everything runs locally with just Python.
- All vendor adapters (Sora, Veo, Avatar) are stubs returning fake data.

### Development commands

After checking out the feature branch:

```bash
# Install dependencies (from /workspace)
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Run tests
pytest -v

# Lint (ruff is not in pyproject.toml deps; install separately if needed)
pip install ruff && ruff check .

# Start dev server
uvicorn content_engine.app.main:app --reload --host 0.0.0.0 --port 8000
```

### Gotchas

- The `main` branch is essentially empty. You must checkout `codex/draft-prd-for-advanced-content-engine` to work with the actual codebase.
- `python3.12-venv` system package may need to be installed if not present (`sudo apt-get install python3.12-venv`).
- The render endpoint path includes the action suffix: `POST /v1/timelines/{timeline_id}:render`.
- The `PublishRequest` schema requires `timeline_id` (not `asset_url` or `title`).
