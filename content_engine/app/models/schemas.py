from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class PipelineType(str, Enum):
    news = "news"
    avatars = "avatars"
    music = "music"
    shorts = "shorts"


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"


class ProjectCreateRequest(BaseModel):
    workspace_id: str = Field(min_length=2)
    name: str = Field(min_length=2)


class Project(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    workspace_id: str
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PipelineRunRequest(BaseModel):
    topic_input: str = Field(min_length=3)
    style: str = Field(default="default")
    target_ratios: list[str] = Field(default_factory=lambda: ["9:16", "16:9"])


class PipelineRunResult(BaseModel):
    job_id: UUID = Field(default_factory=uuid4)
    project_id: UUID
    pipeline: PipelineType
    status: JobStatus = JobStatus.queued
    outputs: dict[str, Any] = Field(default_factory=dict)


class RenderRequest(BaseModel):
    project_id: UUID
    timeline_id: str


class RenderResult(BaseModel):
    render_id: UUID = Field(default_factory=uuid4)
    output_url: str


class PublishRequest(BaseModel):
    timeline_id: str
    scheduled_at: datetime | None = None


class PublishResult(BaseModel):
    publish_id: UUID = Field(default_factory=uuid4)
    platform: str
    status: JobStatus
