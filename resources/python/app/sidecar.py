"""Sidecar entrypoint.

Exposes a few methods over length-prefixed JSON-RPC on stdio:

  - ``health``     → { pythonVersion, whisperxVersion, ready }
  - ``transcribe`` → end-to-end transcribe + diarize + assign_words
  - ``cancel``     → cooperative cancel for an in-flight job

Each long-running method emits ``progress`` frames as it goes.
"""

from __future__ import annotations

import os
import platform
import sys
import threading
from typing import Any, Callable, Dict, Optional

# Make sibling modules importable when invoked as `python sidecar.py`.
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import rpc  # noqa: E402
from diarize import assign_words, diarize  # noqa: E402
from transcribe import transcribe as run_transcribe  # noqa: E402


_cancelled_jobs: set[str] = set()
_cancel_lock = threading.Lock()


def _cancel_check_for(job_id: Optional[str]) -> Callable[[], bool]:
    def check() -> bool:
        if not job_id:
            return False
        with _cancel_lock:
            return job_id in _cancelled_jobs

    return check


def _whisperx_version() -> Optional[str]:
    try:
        import whisperx  # type: ignore

        return getattr(whisperx, "__version__", "unknown")
    except Exception:
        return None


def _faster_whisper_version() -> Optional[str]:
    try:
        import faster_whisper  # type: ignore

        return getattr(faster_whisper, "__version__", "unknown")
    except Exception:
        return None


def health(_params: Dict[str, Any], _progress: Callable[..., None]) -> Dict[str, Any]:
    return {
        "ready": True,
        "pythonVersion": platform.python_version(),
        "whisperxVersion": _whisperx_version() or _faster_whisper_version() or "missing",
    }


def transcribe(params: Dict[str, Any], progress: Callable[[str, float, Optional[str]], None]) -> Dict[str, Any]:
    audio_path = params["audioPath"]
    model_size = params.get("modelSize", "small.en")
    whisper_model_dir = params["whisperModelDir"]
    pyannote_cache_dir = params.get("pyannoteCacheDir", "")
    hf_token = params.get("hfToken") or None
    job_id = params.get("jobId")

    cancel_check = _cancel_check_for(job_id)

    progress("load", 0.0, "starting")
    result = run_transcribe(
        audio_path=audio_path,
        model_size=model_size,
        whisper_model_dir=whisper_model_dir,
        progress=progress,
        cancel_check=cancel_check,
    )

    if cancel_check():
        raise RuntimeError("transcription cancelled")

    segments = diarize(
        audio_path=audio_path,
        pyannote_cache_dir=pyannote_cache_dir,
        hf_token=hf_token,
        progress=progress,
        cancel_check=cancel_check,
    )

    progress("finalize", 0.0, "assigning speakers")
    words = assign_words(result["words"], segments)

    speakers = sorted({w["speaker"] for w in words if w.get("speaker")})
    progress("finalize", 100.0, f"{len(speakers)} speakers")

    return {
        "duration": result["duration"],
        "language": result["language"],
        "words": words,
        "speakers": speakers,
        "segments": [
            {"start": s[0], "end": s[1], "speaker": s[2]} for s in segments
        ],
    }


def cancel(params: Dict[str, Any], _progress: Callable[..., None]) -> Dict[str, Any]:
    job_id = params.get("jobId") or params.get("transcriptId")
    if job_id:
        with _cancel_lock:
            _cancelled_jobs.add(str(job_id))
    return {"ok": True}


def main() -> None:
    handlers = {
        "health": health,
        "transcribe": transcribe,
        "cancel": cancel,
    }
    rpc.serve(handlers)


if __name__ == "__main__":
    main()
