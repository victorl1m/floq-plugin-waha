// Voice note capture: MediaRecorder on a microphone stream, plus an AnalyserNode for the live level.
export const VOICE_MIMES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"];

/** First supported recorder type, "" when the browser picks its own default, null when none can be used. */
export function pickVoiceMime(isTypeSupported: (m: string) => boolean = (m) => MediaRecorder.isTypeSupported(m)): string | null {
  return VOICE_MIMES.find((m) => { try { return isTypeSupported(m); } catch { return false; } }) ?? null;
}

export const voiceSupported = () =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

export interface VoiceSession {
  /** Instant input level 0..1. */
  level(): number;
  stop(): Promise<{ blob: Blob; durationMs: number }>;
  cancel(): void;
}

export class VoiceError extends Error {}

export async function startVoice(): Promise<VoiceSession> {
  if (!voiceSupported()) throw new VoiceError("This browser cannot record audio.");
  const mime = pickVoiceMime();
  if (mime === null) throw new VoiceError("This browser has no supported audio format for voice notes.");
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) {
    const name = (e as { name?: string } | null)?.name;
    throw new VoiceError(name === "NotAllowedError" || name === "SecurityError" ? "Microphone access was blocked. Allow it in the browser to send voice notes." : "No microphone was found.");
  }
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream, { mimeType: mime });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  let ctx: AudioContext | null = null, analyser: AnalyserNode | null = null, buf: Uint8Array<ArrayBuffer> | null = null;
  try {
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);
  } catch { analyser = null; }
  const started = performance.now();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => undefined);
  };
  rec.start(250);
  return {
    level() {
      if (!analyser || !buf) return 0;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      return Math.min(1, Math.sqrt(sum / buf.length) * 3);
    },
    stop() {
      return new Promise((resolve, reject) => {
        const durationMs = performance.now() - started;
        rec.onstop = () => { release(); resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), durationMs }); };
        rec.onerror = () => { release(); reject(new VoiceError("Recording failed.")); };
        if (rec.state === "inactive") rec.onstop(new Event("stop")); else rec.stop();
      });
    },
    cancel() {
      rec.ondataavailable = null; rec.onstop = null;
      try { if (rec.state !== "inactive") rec.stop(); } catch { /* already stopped */ }
      release();
    },
  };
}
