# Local Meeting Transcriber

Offline-first macOS Electron app for meeting transcription, diarization, and analysis. Drop in audio, get a speaker-diarized transcript, run Analyze to extract action items / decisions / dates / open questions, and chat with the transcript. Everything runs on-device.

- Transcription: [whisper.cpp](https://github.com/ggerganov/whisper.cpp) via the [`smart-whisper`](https://www.npmjs.com/package/smart-whisper) Node binding (GGML model, native arm64).
- Speaker diarization: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) via [`sherpa-onnx-node`](https://www.npmjs.com/package/sherpa-onnx-node) (pyannote-3.0 segmentation + NeMo TitaNet embeddings, all ONNX).
- LLM analysis + chat: [Ollama](https://ollama.com) at `http://localhost:11434`, default model `llama3.1:8b`.
- All-Node — no Python, no sidecar process. ~1.5 GB peak memory on a 30-min meeting.
- Persistence: JSON files under your user-data directory. No cloud, no telemetry.

## Prerequisites

- macOS Apple Silicon (arm64). Intel Macs aren't built in v1 — see "Architecture" below.
- Node.js 20.18+ (`nvm use` honors `.nvmrc`).
- Xcode Command Line Tools (clang). `smart-whisper` builds whisper.cpp natively at install.
- [`ffmpeg`](https://ffmpeg.org) on `PATH` for decoding non-WAV inputs:
  ```bash
  brew install ffmpeg
  ```
- [Ollama](https://ollama.com) for analysis and chat:
  ```bash
  brew install ollama
  ollama serve            # background process
  ollama pull llama3.1:8b
  ```
  The app detects Ollama at startup; if it isn't running or the configured model isn't pulled, an in-app banner walks you through it.

## Install

This project uses [pnpm](https://pnpm.io) — `npm install` and `yarn install` are blocked by a `preinstall` hook. Install pnpm once with `brew install pnpm` (or enable [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`, which honors the `packageManager` field in `package.json`).

```bash
nvm use
pnpm install
```

## Develop

```bash
# Resources are needed before transcription works in dev. ~1.3 GB download.
pnpm fetch:resources

# Hot-reloading dev shell.
pnpm dev
```

The app spawns the bundled Python sidecar lazily on first transcribe. If `pnpm fetch:resources` hasn't been run yet, transcription will fail with a clear message and everything else (UI, settings, library, Ollama health checks) still works.

## Test

```bash
pnpm test                 # 102 unit tests
pnpm test:watch
pnpm test:coverage        # threshold: 80% lines on services/prompts/parsers/stores/lib
pnpm typecheck
```

## Build

```bash
# Produces dist/Local Meeting Transcriber-<version>-arm64.dmg
pnpm build:mac
```

The DMG is **unsigned** by default. macOS Gatekeeper will refuse it on first launch — right-click the app → **Open** → **Open** to bypass once.

### Code signing (optional)

Set the standard electron-builder env vars before `pnpm build:mac`:

```bash
export CSC_LINK=path/to/cert.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDEFGHIJ
```

The bundled Python tree is re-signed by `scripts/postbuild-codesign.cjs` (electron-builder `afterPack` hook) so every transitively bundled Mach-O is covered.

## Data location

```
~/Library/Application Support/Local Meeting Transcriber/
├── settings.json
├── logs/
└── transcripts/
    └── <ulid>/
        ├── transcript.json
        ├── analysis.json
        └── chat.json
```

Models are bundled with the app and live next to the source in `resources/models/`:

```
resources/models/
├── whisper/ggml-medium.en-q5_0.bin     # whisper.cpp GGML model
└── diarization/segmentation.onnx       # sherpa-onnx pyannote-3.0
└── diarization/embedding.onnx          # sherpa-onnx NeMo TitaNet
```

**Open in Finder** from Settings → "Open transcripts folder", or `cmd-click` the latest entry in the Library list.

## Swap models

- **LLM**: Settings → Ollama → Model. Any model installed locally (`ollama list`) works. Larger models (e.g. `llama3.1:70b`, `qwen2.5:32b`) give better analysis but take more RAM.
- **Whisper**: locked to `medium.en` (q5_0 quantized, ~514 MB). To override during a build, set `WHISPER_MODEL=ggml-<size>.bin` before `pnpm fetch:resources`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Ollama not running" banner won't clear | Run `ollama serve` in a terminal, or run Ollama.app. Click **Re-check**. |
| "Speaker diarization not ready" on first transcribe | Settings → enter HuggingFace token. Visit https://huggingface.co/pyannote/speaker-diarization-3.1 and click **Agree and access repository** with the same account. |
| `pnpm fetch:resources` fails on Python download | The script falls back to a hardcoded python-build-standalone URL. If that's unreachable, set `PBS_URL` env var to a mirror. |
| App launches blank | Check `~/Library/Application Support/Local Meeting Transcriber/logs/`. Right-click the app → **Show Package Contents** → `Contents/MacOS/` and run from terminal to see stderr. |
| Transcription stalls at "diarize" | Check that the HuggingFace token in Settings is valid and the pyannote models are accessible. The sidecar fetches `pyannote/segmentation-3.0` (~6 MB) and `pyannote/wespeaker-voxceleb-resnet34-LM` (~26 MB) at runtime — token must remain valid. |
| Analyze returns empty cards | The LLM didn't return valid JSON. Open the transcript folder; `analysis.json` will contain `rawModelOutput` for inspection. Try a larger model or click **Retry**. |
| Pre-commit hook complains about Python `__pycache__` | They're in `.gitignore`. If they slipped through, `git rm -r --cached resources/python/**/__pycache__`. |

## Architecture

- **Stack:** Electron 41 + electron-vite 5, Vue 3 + `<script setup>` + TS 6, shadcn-vue-style components on top of `reka-ui`, Tailwind v4 (CSS-first config), Pinia 3, Vue Router 5, Vitest 4. Major versions pinned in `package.json`.
- **Process model:**
  - Main process owns lifecycle, IPC, JSON storage, the Python sidecar child process, and the Ollama HTTP client.
  - Python sidecar (`resources/python/app/sidecar.py`) is a long-lived child started lazily on first transcribe. JSON-RPC over stdio with 4-byte big-endian length-prefixed frames.
  - Renderer is fully sandboxed (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`); the only host bridge is the typed `window.api` defined in `src/preload/index.ts`.
- **Bundling:**
  - `python-build-standalone` 3.12.7 vendored under `resources/python/` at build time (not committed).
  - Whisper `medium.en` (q5_0) weights bundled in the DMG.
  - pyannote weights downloaded on first run into `userData/models/pyannote/` (smaller DMG, simpler licensing).
- **Architecture targets:** v1 ships `arm64` only. Intel support is a `target.arch: [arm64, x64]` flip in `electron-builder.yml` plus an `x86_64-apple-darwin` python-build-standalone download — left out to halve the DMG and match the dev box.

See `/Users/br/.claude/plans/do-task-md-majestic-honey.md` for the full architectural plan.

## License

Internal / unspecified. The pyannote diarization weights are downloaded under their own license — by entering a HF token and accepting the model card, you agree to those terms. WhisperX and faster-whisper are MIT-licensed.
