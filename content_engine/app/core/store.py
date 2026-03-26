from __future__ import annotations

from typing import Dict
from uuid import UUID

from content_engine.app.models.schemas import PipelineRunResult, Project


class InMemoryStore:
    def __init__(self) -> None:
        self.projects: Dict[UUID, Project] = {}
        self.jobs: Dict[UUID, PipelineRunResult] = {}


store = InMemoryStore()
