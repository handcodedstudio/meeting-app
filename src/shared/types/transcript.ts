export type WhisperModelSize = 'tiny.en' | 'base.en' | 'small.en' | 'medium.en' | 'small' | 'medium' | 'large-v3';

export interface Word {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: string;
}

export interface SpeakerTurn {
  speaker: string;
  displayName: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export interface SpeakerEntry {
  id: string;
  displayName: string;
}

export interface TranscriptSourceFile {
  originalPath: string;
  importedAt: string;
  sizeBytes: number;
  mime: string;
}

export interface TranscriptAudio {
  durationSec: number;
  sampleRate?: number;
}

export type DiarizationBackend = 'sherpa-onnx-pyannote3+titanet' | 'pyannote-3.1';

export interface TranscriptDiarization {
  backend: DiarizationBackend;
  minSpeakers?: number;
  maxSpeakers?: number;
}

export interface TranscriptStats {
  speakerCount: number;
  wordCount: number;
  turnCount: number;
}

export interface Transcript {
  id: string;
  schemaVersion: 1;
  title: string;
  sourceFile: TranscriptSourceFile;
  audio: TranscriptAudio;
  language: string;
  modelSize: WhisperModelSize;
  diarization: TranscriptDiarization;
  speakers: SpeakerEntry[];
  turns: SpeakerTurn[];
  stats: TranscriptStats;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSummary {
  id: string;
  title: string;
  durationSec: number;
  speakerCount: number;
  createdAt: string;
}
