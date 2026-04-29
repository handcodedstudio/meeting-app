"""pyannote.audio 3.1 diarization + word→speaker assignment."""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, List, Optional, Tuple

ProgressCB = Callable[[str, float, Optional[str]], None]

PYANNOTE_MODEL_ID = "pyannote/speaker-diarization-3.1"


def _configure_cache(cache_dir: str) -> None:
    if not cache_dir:
        return
    os.makedirs(cache_dir, exist_ok=True)
    # pyannote uses huggingface_hub which honours HF_HOME / HUGGINGFACE_HUB_CACHE.
    os.environ.setdefault("HF_HOME", cache_dir)
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", cache_dir)
    os.environ.setdefault("PYANNOTE_CACHE", cache_dir)


def diarize(
    audio_path: str,
    pyannote_cache_dir: str,
    hf_token: Optional[str] = None,
    progress: Optional[ProgressCB] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> List[Tuple[float, float, str]]:
    """Run pyannote diarization and return [(start, end, speaker_label), ...]."""
    if progress:
        progress("diarize", 0.0, "loading diarization pipeline")

    _configure_cache(pyannote_cache_dir)

    from pyannote.audio import Pipeline  # type: ignore

    pipeline = Pipeline.from_pretrained(
        PYANNOTE_MODEL_ID,
        use_auth_token=hf_token if hf_token else None,
        cache_dir=pyannote_cache_dir or None,
    )

    if progress:
        progress("diarize", 25.0, "running diarization")

    if cancel_check and cancel_check():
        raise RuntimeError("diarization cancelled")

    annotation = pipeline(audio_path)

    segments: List[Tuple[float, float, str]] = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        segments.append((float(turn.start), float(turn.end), str(speaker)))

    if progress:
        progress("diarize", 100.0, f"{len({s for _, _, s in segments})} speakers")

    return segments


def assign_words(
    words: List[Dict[str, Any]],
    segments: List[Tuple[float, float, str]],
) -> List[Dict[str, Any]]:
    """Stamp ``speaker`` on each word using the segment containing its midpoint."""
    if not segments:
        for w in words:
            w.setdefault("speaker", "SPEAKER_00")
        return words

    sorted_segments = sorted(segments, key=lambda s: s[0])
    starts = [s[0] for s in sorted_segments]

    # Binary search by midpoint.
    import bisect

    for w in words:
        mid = (float(w["start"]) + float(w["end"])) / 2.0
        idx = bisect.bisect_right(starts, mid) - 1
        chosen: Optional[str] = None
        if 0 <= idx < len(sorted_segments):
            s = sorted_segments[idx]
            if s[0] <= mid <= s[1]:
                chosen = s[2]
        if chosen is None:
            # Fall back to nearest segment by edge distance.
            best_dist = float("inf")
            for s in sorted_segments:
                if mid < s[0]:
                    d = s[0] - mid
                elif mid > s[1]:
                    d = mid - s[1]
                else:
                    d = 0.0
                if d < best_dist:
                    best_dist = d
                    chosen = s[2]
        w["speaker"] = chosen or "SPEAKER_00"

    return words
