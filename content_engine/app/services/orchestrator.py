from __future__ import annotations

from content_engine.app.adapters.stub_adapters import AvatarStubAdapter, SoraStubAdapter, VeoStubAdapter
from content_engine.app.models.schemas import JobStatus, PipelineRunRequest, PipelineRunResult, PipelineType


class OrchestratorService:
    def __init__(self) -> None:
        self.sora = SoraStubAdapter()
        self.veo = VeoStubAdapter()
        self.avatar = AvatarStubAdapter()

    def run_pipeline(self, project_id, pipeline: PipelineType, request: PipelineRunRequest) -> PipelineRunResult:
        result = PipelineRunResult(project_id=project_id, pipeline=pipeline, status=JobStatus.running)
        prompt = f"{pipeline.value}: {request.topic_input} | style={request.style}"

        if pipeline == PipelineType.news:
            outputs = self.sora.generate(prompt, request.target_ratios)
        elif pipeline == PipelineType.avatars:
            outputs = self.avatar.generate(prompt, request.target_ratios)
        elif pipeline == PipelineType.music:
            outputs = self.veo.generate(prompt, request.target_ratios)
        else:
            outputs = self.sora.generate(prompt, request.target_ratios)

        result.outputs = outputs
        result.status = JobStatus.completed
        return result


orchestrator_service = OrchestratorService()
