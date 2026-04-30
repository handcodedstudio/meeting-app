// sherpa-onnx-node ships JSDoc-typed JS but no .d.ts. We only use the offline
// speaker diarization surface, so declare just that here.
declare module 'sherpa-onnx-node' {
  export interface OfflineSpeakerSegmentationPyannoteModelConfig {
    model: string;
  }

  export interface OfflineSpeakerSegmentationModelConfig {
    pyannote?: OfflineSpeakerSegmentationPyannoteModelConfig;
    numThreads?: number;
    debug?: boolean | number;
    provider?: string;
  }

  export interface SpeakerEmbeddingExtractorConfig {
    model: string;
    numThreads?: number;
    debug?: boolean | number;
    provider?: string;
  }

  export interface FastClusteringConfig {
    numClusters?: number;
    threshold?: number;
  }

  export interface OfflineSpeakerDiarizationConfig {
    segmentation?: OfflineSpeakerSegmentationModelConfig;
    embedding?: SpeakerEmbeddingExtractorConfig;
    clustering?: FastClusteringConfig;
    minDurationOn?: number;
    minDurationOff?: number;
  }

  export interface SpeakerDiarizationSegment {
    start: number;
    end: number;
    speaker: number;
  }

  // Concrete class for default-import + destructure (CJS interop).
  export class OfflineSpeakerDiarization {
    constructor(config: OfflineSpeakerDiarizationConfig);
    readonly sampleRate: number;
    process(samples: Float32Array): SpeakerDiarizationSegment[];
    setConfig(config: { clustering: FastClusteringConfig }): void;
  }

  export interface SileroVadModelConfig {
    model?: string;
    threshold?: number;
    minSilenceDuration?: number;
    minSpeechDuration?: number;
    windowSize?: number;
    maxSpeechDuration?: number;
  }

  export interface VadConfig {
    sileroVad?: SileroVadModelConfig;
    sampleRate?: number;
    numThreads?: number;
    provider?: string;
    debug?: boolean | number;
  }

  export interface SpeechSegment {
    /** Sample index (int32) where the segment starts in the original waveform. */
    start: number;
    samples: Float32Array;
  }

  export class Vad {
    constructor(config: VadConfig, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    pop(): void;
    front(enableExternalBuffer?: boolean): SpeechSegment;
    flush(): void;
    reset(): void;
    clear(): void;
  }

  const _default: {
    OfflineSpeakerDiarization: typeof OfflineSpeakerDiarization;
    Vad: typeof Vad;
  };
  export default _default;
}
