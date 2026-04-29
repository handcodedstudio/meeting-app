"""Length-prefixed JSON-RPC over stdio.

Frame format: 4-byte big-endian length header + UTF-8 JSON body.

Request:  { "id": <int|str>, "method": <str>, "params": <obj> }
Reply:    { "id": ..., "result": <obj> }
Error:    { "id": ..., "error": { "message": <str>, "type": <str> } }
Progress: { "id": ..., "progress": { "stage": <str>, "percent": <num>, "message": <str?> } }
          (Progress frames are NOT final replies; multiple may be emitted per id.)
"""

from __future__ import annotations

import io
import json
import struct
import sys
import threading
import traceback
from typing import Any, Callable, Dict, Optional

_HEADER = struct.Struct(">I")
_write_lock = threading.Lock()


def _stdin_buffer() -> io.BufferedReader:
    return sys.stdin.buffer


def _stdout_buffer() -> io.BufferedWriter:
    return sys.stdout.buffer


def read_frame() -> Optional[Dict[str, Any]]:
    buf = _stdin_buffer()
    header = buf.read(4)
    if not header or len(header) < 4:
        return None
    (length,) = _HEADER.unpack(header)
    body = b""
    remaining = length
    while remaining > 0:
        chunk = buf.read(remaining)
        if not chunk:
            return None
        body += chunk
        remaining -= len(chunk)
    return json.loads(body.decode("utf-8"))


def _write_frame(payload: Dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    header = _HEADER.pack(len(body))
    out = _stdout_buffer()
    with _write_lock:
        out.write(header)
        out.write(body)
        out.flush()


def write_result(req_id: Any, result: Any) -> None:
    _write_frame({"id": req_id, "result": result})


def write_error(req_id: Any, exc: BaseException) -> None:
    _write_frame(
        {
            "id": req_id,
            "error": {
                "message": str(exc) or exc.__class__.__name__,
                "type": exc.__class__.__name__,
                "traceback": traceback.format_exc(),
            },
        }
    )


def write_progress(req_id: Any, stage: str, percent: float, message: Optional[str] = None) -> None:
    payload: Dict[str, Any] = {
        "id": req_id,
        "progress": {"stage": stage, "percent": float(percent)},
    }
    if message is not None:
        payload["progress"]["message"] = message
    _write_frame(payload)


def make_progress_callback(req_id: Any) -> Callable[[str, float, Optional[str]], None]:
    def emit(stage: str, percent: float, message: Optional[str] = None) -> None:
        write_progress(req_id, stage, percent, message)

    return emit


def serve(handlers: Dict[str, Callable[[Dict[str, Any], Callable[[str, float, Optional[str]], None]], Any]]) -> None:
    """Read frames from stdin and dispatch to handlers until stdin closes."""
    while True:
        try:
            frame = read_frame()
        except Exception as exc:  # frame was malformed
            write_error(None, exc)
            continue
        if frame is None:
            return
        req_id = frame.get("id")
        method = frame.get("method")
        params = frame.get("params") or {}
        if not isinstance(method, str):
            write_error(req_id, ValueError("missing method"))
            continue
        handler = handlers.get(method)
        if handler is None:
            write_error(req_id, ValueError(f"unknown method: {method}"))
            continue
        try:
            result = handler(params, make_progress_callback(req_id))
            write_result(req_id, result)
        except BaseException as exc:  # noqa: BLE001 — surface anything to the client
            write_error(req_id, exc)
