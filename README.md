# Content Engine (Initial Scaffold)

This repository now includes an initial implementation scaffold for the Advanced Content Engine PRD.

## What is implemented
- FastAPI service with health endpoint and core orchestration endpoints.
- In-memory project store.
- Pipeline run endpoint for `news`, `avatars`, `music`, and `shorts`.
- Vendor adapter abstraction with stub adapters for Sora, Veo, and Avatar generation.
- Internal render and publish service stubs.
- Basic unit tests for project creation and pipeline execution.

## Run locally
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn content_engine.app.main:app --reload
```

## API examples
- `POST /v1/projects`
- `GET /v1/projects/{project_id}`
- `POST /v1/projects/{project_id}/pipelines/news:run`
- `POST /v1/timelines/{timeline_id}:render`
- `POST /v1/projects/{project_id}/publish/youtube`
