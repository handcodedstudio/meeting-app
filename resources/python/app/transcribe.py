"""faster-whisper transcription with word timestamps.

The model directory is loaded by passing the local path as ``model_size_or_path``.
Streams progress for two stages: ``load`` and ``transcribe``.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

ProgressCB = Callable[[str, float, Optional[str]], None]


def _select_compute() -> Dict[str, str]:
    # On macOS arm64, faster-whisper runs on CPU with int8/float32. CUDA is not
    # available; MPS is not exposed via CTranslate2. int8 is fast and small.
    return {"device": "cpu", "compute_type": "int8"}


def transcribe(
    audio_path: str,
    model_size: str,
    whisper_model_dir: str,
    progress: Optional[ProgressCB] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    """Run faster-whisper and return language, duration, and a flat word list."""
    if progress:
        progress("load", 0.0, f"loading whisper model {model_size}")

    # Imported lazily so the sidecar can answer health() before deps are present.
    from faster_whisper import WhisperModel  # type: ignore

    compute = _select_compute()
    model = WhisperModel(whisper_model_dir, **compute)

    if progress:
        progress("load", 100.0, "model loaded")
        progress("transcribe", 0.0, "starting transcription")

    segments_iter, info = model.transcribe(
        audio_path,
        beam_size=5,
        word_timestamps=True,
        vad_filter=True,
    )

    duration = float(getattr(info, "duration", 0.0) or 0.0)
    language = str(getattr(info, "language", "en") or "en")

    words: List[Dict[str, Any]] = []
    last_pct = -1.0
    for segment in segments_iter:
        if cancel_check and cancel_check():
            raise RuntimeError("transcription cancelled")
        seg_words = getattr(segment, "words", None) or []
        for w in seg_words:
            text = (getattr(w, "word", None) or "").strip()
            if not text:
                continue
            words.append(
                {
                    "text": text,
                    "start": float(getattr(w, "start", 0.0) or 0.0),
                    "end": float(getattr(w, "end", 0.0) or 0.0),
                    "confidence": float(getattr(w, "probability", 0.0) or 0.0),
                }
            )
        if progress and duration > 0:
            pct = min(99.0, (float(segment.end) / duration) * 100.0)
            if pct - last_pct >= 1.0:
                progress("transcribe", pct, None)
                last_pct = pct

    if progress:
        progress("transcribe", 100.0, f"{len(words)} words")

    return {"duration": duration, "language": language, "words": words}
