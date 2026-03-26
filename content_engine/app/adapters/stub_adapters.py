from __future__ import annotations

from content_engine.app.adapters.base import VideoAdapter


class SoraStubAdapter(VideoAdapter):
    name = "sora_stub"

    def generate(self, prompt: str, ratios: list[str]) -> dict:
        return {
            "provider": self.name,
            "prompt": prompt,
            "ratios": ratios,
            "assets": [f"sora://asset/{i}" for i, _ in enumerate(ratios, start=1)],
        }


class VeoStubAdapter(VideoAdapter):
    name = "veo_stub"

    def generate(self, prompt: str, ratios: list[str]) -> dict:
        return {
            "provider": self.name,
            "prompt": prompt,
            "ratios": ratios,
            "assets": [f"veo://asset/{i}" for i, _ in enumerate(ratios, start=1)],
        }


class AvatarStubAdapter(VideoAdapter):
    name = "avatar_stub"

    def generate(self, prompt: str, ratios: list[str]) -> dict:
        return {
            "provider": self.name,
            "prompt": prompt,
            "ratios": ratios,
            "assets": [f"avatar://asset/{i}" for i, _ in enumerate(ratios, start=1)],
        }
