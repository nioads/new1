from __future__ import annotations

from content_engine.app.models.schemas import JobStatus, PublishRequest, PublishResult


class PublishService:
    def publish(self, platform: str, request: PublishRequest) -> PublishResult:
        _ = request
        return PublishResult(platform=platform, status=JobStatus.completed)


publish_service = PublishService()
