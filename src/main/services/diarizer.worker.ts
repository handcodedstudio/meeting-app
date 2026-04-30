import { parentPort } from 'node:worker_threads';
import sherpa from 'sherpa-onnx-node';
import type { OfflineSpeakerDiarizationConfig } from 'sherpa-onnx-node';

const { OfflineSpeakerDiarization } = sherpa;

interface WorkerRequest {
  samples: Float32Array;
  config: OfflineSpeakerDiarizationConfig;
  /**
   * Process audio in chunks of this many seconds. Sherpa's pyannote
   * implementation has hit hard asserts on very long inputs (>1hr); chunking
   * keeps each call inside its tested envelope. Speaker IDs are unique per
   * chunk and NOT re-aligned across chunk boundaries.
   */
  chunkSec: number;
}

interface WorkerResponse {
  ok: true;
  segments: Array<{ start: number; end: number; speaker: number }>;
  sampleRate: number;
}

interface WorkerError {
  ok: false;
  error: string;
}

if (!parentPort) {
  throw new Error('diarizer.worker must be spawned as a worker_threads worker');
}

parentPort.on('message', (msg: WorkerRequest) => {
  try {
    const sd = new OfflineSpeakerDiarization(msg.config);
    const sr = sd.sampleRate || 16000;
    const samples = msg.samples;
    const chunkSamples = Math.max(1, Math.floor(msg.chunkSec * sr));
    const allSegments: Array<{ start: number; end: number; speaker: number }> = [];
    let speakerOffset = 0;

    for (let start = 0; start < samples.length; start += chunkSamples) {
      const end = Math.min(start + chunkSamples, samples.length);
      const chunk = samples.subarray(start, end);
      const offsetSec = start / sr;

      const localSegs = sd.process(chunk) as Array<{
        start: number;
        end: number;
        speaker: number;
      }>;

      let maxLocal = -1;
      for (const seg of localSegs) {
        if (seg.speaker > maxLocal) maxLocal = seg.speaker;
        allSegments.push({
          start: offsetSec + seg.start,
          end: offsetSec + seg.end,
          speaker: speakerOffset + seg.speaker
        });
      }
      speakerOffset += maxLocal + 1;
    }

    const response: WorkerResponse = { ok: true, segments: allSegments, sampleRate: sr };
    parentPort!.postMessage(response);
  } catch (err) {
    const response: WorkerError = {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
    parentPort!.postMessage(response);
  }
});
