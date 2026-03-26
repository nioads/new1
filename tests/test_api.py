from fastapi.testclient import TestClient

from content_engine.app.main import app


client = TestClient(app)


def test_create_project_and_get_project() -> None:
    create = client.post("/v1/projects", json={"workspace_id": "ws_1", "name": "Daily News"})
    assert create.status_code == 200
    project = create.json()

    fetched = client.get(f"/v1/projects/{project['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Daily News"


def test_run_news_pipeline() -> None:
    create = client.post("/v1/projects", json={"workspace_id": "ws_2", "name": "Pipeline Test"})
    project = create.json()

    run = client.post(
        f"/v1/projects/{project['id']}/pipelines/news:run",
        json={"topic_input": "AI creator economy", "style": "breaking-news", "target_ratios": ["9:16"]},
    )

    assert run.status_code == 200
    payload = run.json()
    assert payload["pipeline"] == "news"
    assert payload["status"] == "completed"
    assert payload["outputs"]["provider"] == "sora_stub"
