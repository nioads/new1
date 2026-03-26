from __future__ import annotations

from fastapi import APIRouter, HTTPException

from content_engine.app.core.store import store
from content_engine.app.models.schemas import (
    PipelineRunRequest,
    PipelineRunResult,
    PipelineType,
    Project,
    ProjectCreateRequest,
    PublishRequest,
    PublishResult,
    RenderRequest,
    RenderResult,
)
from content_engine.app.services.orchestrator import orchestrator_service
from content_engine.app.services.publish import publish_service
from content_engine.app.services.render import render_service

router = APIRouter(prefix="/v1", tags=["content-engine"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/projects", response_model=Project)
def create_project(payload: ProjectCreateRequest) -> Project:
    project = Project(workspace_id=payload.workspace_id, name=payload.name)
    store.projects[project.id] = project
    return project


@router.get("/projects/{project_id}", response_model=Project)
def get_project(project_id: str) -> Project:
    for pid, project in store.projects.items():
        if str(pid) == project_id:
            return project
    raise HTTPException(status_code=404, detail="Project not found")


@router.post("/projects/{project_id}/pipelines/{pipeline}:run", response_model=PipelineRunResult)
def run_pipeline(project_id: str, pipeline: PipelineType, payload: PipelineRunRequest) -> PipelineRunResult:
    project = next((p for pid, p in store.projects.items() if str(pid) == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    result = orchestrator_service.run_pipeline(project.id, pipeline, payload)
    store.jobs[result.job_id] = result
    return result


@router.post("/timelines/{timeline_id}:render", response_model=RenderResult)
def render_timeline(timeline_id: str, payload: RenderRequest) -> RenderResult:
    request = RenderRequest(project_id=payload.project_id, timeline_id=timeline_id)
    return render_service.render(request)


@router.post("/projects/{project_id}/publish/{platform}", response_model=PublishResult)
def publish(project_id: str, platform: str, payload: PublishRequest) -> PublishResult:
    _ = project_id
    return publish_service.publish(platform=platform, request=payload)
