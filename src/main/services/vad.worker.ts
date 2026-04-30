import { parentPort } from 'node:worker_threads';
import sherpa from 'sherpa-onnx-node';

const { Vad } = sherpa;

const SAMPLE_RATE = 16000;
const WINDOW_SIZE = 512;

interface WorkerRequest {
  samples: Float32Array;
  modelPath: string;
  threshold: number;
  minSilenceDuration: number;
  minSpeechDuration: number;
  maxSpeechDuration: number;
}

interface VoicedSegment {
  /** sample index in the original waveform */
  startSample: number;
  /** exclusive end sample index */
  endSample: number;
}

interface WorkerOk {
  ok: true;
  segments: VoicedSegment[];
}

interface WorkerErr {
  ok: false;
  error: string;
}

if (!parentPort) {
  throw new Error('vad.worker must be spawned as a worker_threads worker');
}

parentPort.on('message', (msg: WorkerRequest) => {
  try {
    const vad = new Vad(
      {
        sileroVad: {
          model: msg.modelPath,
          threshold: msg.threshold,
          minSilenceDuration: msg.minSilenceDuration,
          minSpeechDuration: msg.minSpeechDuration,
          windowSize: WINDOW_SIZE,
          maxSpeechDuration: msg.maxSpeechDuration
        },
        sampleRate: SAMPLE_RATE,
        numThreads: 1,
        provider: 'cpu',
        debug: 0
      },
      30
    );

    const segments: VoicedSegment[] = [];
    const samples = msg.samples;
    const total = samples.length;

    // Feed in WINDOW_SIZE-sized chunks and drain detected segments as we go.
    for (let i = 0; i < total; i += WINDOW_SIZE) {
      const end = Math.min(i + WINDOW_SIZE, total);
      vad.acceptWaveform(samples.subarray(i, end));
      while (!vad.isEmpty()) {
        const seg = vad.front();
        const startSample = seg.start;
        const endSample = seg.start + seg.samples.length;
        segments.push({ startSample, endSample });
        vad.pop();
      }
    }
    vad.flush();
    while (!vad.isEmpty()) {
      const seg = vad.front();
      const startSample = seg.start;
      const endSample = seg.start + seg.samples.length;
      segments.push({ startSample, endSample });
      vad.pop();
    }

    const response: WorkerOk = { ok: true, segments };
    parentPort!.postMessage(response);
  } catch (err) {
    const response: WorkerErr = {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
    parentPort!.postMessage(response);
  }
});
