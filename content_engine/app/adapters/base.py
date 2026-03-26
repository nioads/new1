from __future__ import annotations

from abc import ABC, abstractmethod


class VideoAdapter(ABC):
    name: str

    @abstractmethod
    def generate(self, prompt: str, ratios: list[str]) -> dict:
        raise NotImplementedError
