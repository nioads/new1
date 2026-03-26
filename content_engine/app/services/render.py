from __future__ import annotations

from content_engine.app.models.schemas import RenderRequest, RenderResult


class RenderService:
    def render(self, request: RenderRequest) -> RenderResult:
        return RenderResult(output_url=f"https://cdn.local/{request.project_id}/{request.timeline_id}.mp4")


render_service = RenderService()
