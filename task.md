Local Meeting Transcription & Analysis — macOS Electron app

Goal

Build an offline-first macOS desktop app that transcribes audio, diarizes speakers, and lets the user analyze and query transcripts with a local LLM. No data leaves the machine.

Tech stack (latest compatible)





Electron + Vite (electron-vite scaffold)



Vue 3, Composition API, <script setup>, TypeScript



shadcn-vue + Tailwind CSS



Pinia for state



Jest for unit tests (or Vitest if it integrates more cleanly with Vite — recommend and justify)



Pin major versions in package.json

Local AI — make a decision and document it

Transcription + diarization: WhisperX is Python, not Node. Pick one:





Python sidecar (bundled with uv or PyInstaller), IPC over stdio/HTTP



whisper.cpp Node bindings for transcription + sherpa-onnx or pyannote sidecar for diarization



nodejs-whisper if approximate diarization is acceptable

Document the chosen approach and bundling strategy in the README.

LLM for analysis & chat: Ollama at http://localhost:11434, default model llama3.1:8b, configurable in settings. Detect if Ollama is missing and show setup instructions in-app.

Architecture





Use sub-agents in parallel: (1) Electron main/preload, (2) Vue/shadcn UI shell, (3) transcription pipeline, (4) LLM integration, (5) tests.



contextIsolation: true, nodeIntegration: false, narrow preload API.



Persist data as JSON in app.getPath('userData')/transcripts/<id>/{transcript.json, analysis.json, chat.json}.

Features

1. Upload & transcribe





Drag-drop or file picker; accept MP3, MP4, WAV, M4A



Progress UI for model load → transcription → diarization



On completion show: duration (mm:ss), speaker count, word count, transcript grouped by speaker turns with timestamps



Inline rename speakers (Speaker 1 → "Sarah")



Write transcript.json

2. Analyze





"Analyze" button sends transcript to local LLM with a structured prompt extracting:





Action items (with assignee where mentioned)



Key decisions made



Key dates / deadlines



Outstanding / unresolved decisions



Render as copyable cards, save analysis.json

3. Chat with transcript





Q&A panel, transcript as context, stream responses, persist history per transcript

4. Library + UX





List view of past transcripts (title, date, duration)



Copy-to-clipboard on every output block

Tests

Jest coverage on business logic: stores, JSON I/O, LLM prompt builders, transcript parsers, speaker-merging logic. Don't chase line coverage on Vue templates.

Deliverables





pnpm dev, pnpm build:mac (produces signed-or-unsigned .dmg), pnpm test



README: prerequisites (Node version, Ollama, Python if used), install, dev, build, test, data location, how to swap models, troubleshooting



.gitignore covering Node, Electron build artifacts, Python __pycache__/.venv, downloaded model files, macOS junk

Definition of done

I launch the app, drop in a 30-minute MP3, get a speaker-diarized transcript, click Analyze, see action items, ask "what did Sarah commit to?" — all offline.