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
   * keeps each call inside its tested envelope.
   */
  chunkSec: number;
  /**
   * Adjacent chunks overlap by this many seconds. Segments in the overlap
   * region are used to map this chunk's local speaker IDs back to the previous
   * chunk's global IDs, so the same person keeps the same label across chunks.
   */
  overlapSec: number;
}

interface Seg {
  start: number;
  end: number;
  speaker: number;
}

interface WorkerResponse {
  ok: true;
  segments: Seg[];
  sampleRate: number;
}

interface WorkerError {
  ok: false;
  error: string;
}

const MIN_MATCH_SEC = 0.5;

if (!parentPort) {
  throw new Error('diarizer.worker must be spawned as a worker_threads worker');
}

function buildRemap(
  localSegs: Seg[],
  prevGlobalSegs: Seg[],
  offsetSec: number,
  overlapSec: number,
  nextGlobalId: number
): { remap: Map<number, number>; nextGlobalId: number } {
  const remap = new Map<number, number>();
  const overlapEndAbs = offsetSec + overlapSec;

  const prevInOverlap = prevGlobalSegs.filter(
    (s) => s.end > offsetSec && s.start < overlapEndAbs
  );

  const localByLocalSpkInOverlap = new Map<number, Array<{ start: number; end: number }>>();
  for (const seg of localSegs) {
    if (seg.start >= overlapSec) continue;
    const arr = localByLocalSpkInOverlap.get(seg.speaker) ?? [];
    arr.push({ start: seg.start, end: Math.min(seg.end, overlapSec) });
    localByLocalSpkInOverlap.set(seg.speaker, arr);
  }

  for (const [localSp, segs] of localByLocalSpkInOverlap) {
    const dursByGlobal = new Map<number, number>();
    for (const seg of segs) {
      const lAbsStart = offsetSec + seg.start;
      const lAbsEnd = offsetSec + seg.end;
      for (const prev of prevInOverlap) {
        const ovStart = Math.max(lAbsStart, prev.start);
        const ovEnd = Math.min(lAbsEnd, prev.end);
        if (ovEnd > ovStart) {
          dursByGlobal.set(
            prev.speaker,
            (dursByGlobal.get(prev.speaker) ?? 0) + (ovEnd - ovStart)
          );
        }
      }
    }
    let bestGlobal = -1;
    let bestDur = 0;
    for (const [g, d] of dursByGlobal) {
      if (d > bestDur) {
        bestDur = d;
        bestGlobal = g;
      }
    }
    if (bestGlobal >= 0 && bestDur >= MIN_MATCH_SEC) {
      remap.set(localSp, bestGlobal);
    }
  }

  const allLocalSpeakers = Array.from(new Set(localSegs.map((s) => s.speaker))).sort(
    (a, b) => a - b
  );
  let counter = nextGlobalId;
  for (const localSp of allLocalSpeakers) {
    if (!remap.has(localSp)) {
      remap.set(localSp, counter++);
    }
  }
  return { remap, nextGlobalId: counter };
}

parentPort.on('message', (msg: WorkerRequest) => {
  try {
    const sd = new OfflineSpeakerDiarization(msg.config);
    const sr = sd.sampleRate || 16000;
    const samples = msg.samples;
    const chunkSamples = Math.max(1, Math.floor(msg.chunkSec * sr));
    const overlapSec = Math.min(Math.max(0, msg.overlapSec), msg.chunkSec / 2);
    const overlapSamples = Math.min(
      Math.floor(overlapSec * sr),
      Math.max(0, chunkSamples - 1)
    );
    const stride = Math.max(1, chunkSamples - overlapSamples);

    const allSegments: Seg[] = [];
    let nextGlobalId = 0;
    let chunkIdx = 0;

    for (let start = 0; start < samples.length; start += stride) {
      const end = Math.min(start + chunkSamples, samples.length);
      const chunk = samples.subarray(start, end);
      const offsetSec = start / sr;

      const localSegs = sd.process(chunk) as Seg[];

      const { remap, nextGlobalId: nextId } =
        chunkIdx === 0
          ? (() => {
              const r = new Map<number, number>();
              const speakers = Array.from(new Set(localSegs.map((s) => s.speaker))).sort(
                (a, b) => a - b
              );
              let c = 0;
              for (const sp of speakers) r.set(sp, c++);
              return { remap: r, nextGlobalId: c };
            })()
          : buildRemap(localSegs, allSegments, offsetSec, overlapSec, nextGlobalId);

      nextGlobalId = nextId;

      const minStart = chunkIdx > 0 ? overlapSec : 0;
      for (const seg of localSegs) {
        if (seg.end <= minStart) continue;
        const adjStart = Math.max(seg.start, minStart);
        const globalSp = remap.get(seg.speaker);
        if (globalSp === undefined) continue;
        allSegments.push({
          start: offsetSec + adjStart,
          end: offsetSec + seg.end,
          speaker: globalSp
        });
      }

      chunkIdx++;
      if (end >= samples.length) break;
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
