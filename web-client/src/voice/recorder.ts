/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Implemented voice recording and safe application of drafts to the errand form.
 * Author review: I validated correctness, and added boundary checks.
 */

// MediaRecorder wrapper for N3F1.1: explicit start, stop or cancel, elapsed time and a hard limit.

export type RecorderFailure = "denied" | "unsupported" | "failed";
export type RecorderFinish = "stopped" | "limit";

export type RecorderEvents = {
  onRecording: () => void;
  onTick: (elapsedSeconds: number) => void;
  onFinish: (audio: Blob, reason: RecorderFinish) => void;
  onError: (failure: RecorderFailure) => void;
};

export type RecorderConstructor = {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
  isTypeSupported?: (type: string) => boolean;
};

export type RecorderEnvironment = {
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  Recorder?: RecorderConstructor;
  now?: () => number;
};

// Chrome and Firefox record Opus in WebM or Ogg; Safari records AAC in MP4.
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export function pickMimeType(Recorder?: RecorderConstructor): string | undefined {
  return PREFERRED_TYPES.find((type) => Recorder?.isTypeSupported?.(type));
}

export class VoiceRecorder {
  private readonly events: RecorderEvents;
  private readonly maxSeconds: number;
  private readonly mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  private readonly Recorder?: RecorderConstructor;
  private readonly now: () => number;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private timer: number | undefined;
  private startedAt = 0;
  private finish: RecorderFinish | null = null;
  private active = false;

  constructor(events: RecorderEvents, maxSeconds = 60, environment: RecorderEnvironment = {}) {
    this.events = events;
    this.maxSeconds = maxSeconds;
    this.mediaDevices = "mediaDevices" in environment ? environment.mediaDevices : globalThis.navigator?.mediaDevices;
    this.Recorder = "Recorder" in environment ? environment.Recorder : (globalThis.MediaRecorder as RecorderConstructor | undefined);
    this.now = environment.now ?? (() => Date.now());
  }

  static supported(environment: RecorderEnvironment = {}): boolean {
    const mediaDevices = "mediaDevices" in environment ? environment.mediaDevices : globalThis.navigator?.mediaDevices;
    const Recorder = "Recorder" in environment ? environment.Recorder : globalThis.MediaRecorder;
    return Boolean(mediaDevices?.getUserMedia && Recorder);
  }

  // N3F1.1.1: the microphone is requested only here, after the requester presses Start.
  async start(): Promise<void> {
    if (this.active) return;
    if (!this.mediaDevices?.getUserMedia || !this.Recorder) { this.events.onError("unsupported"); return; }
    this.active = true;
    let stream: MediaStream;
    try {
      stream = await this.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      this.active = false;
      const name = (error as { name?: string })?.name;
      this.events.onError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed");
      return;
    }
    if (!this.active) { stream.getTracks().forEach((track) => track.stop()); return; }
    this.stream = stream;
    this.chunks = [];
    this.finish = null;
    try {
      const mimeType = pickMimeType(this.Recorder);
      const recorder = new this.Recorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
      recorder.onstop = () => this.completed(recorder.mimeType || mimeType || "audio/webm");
      recorder.onerror = () => this.fail();
      this.recorder = recorder;
      recorder.start();
    } catch {
      this.fail();
      return;
    }
    this.startedAt = this.now();
    this.events.onRecording();
    this.events.onTick(0);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  // N3F1.1.4: "Stop and generate draft" ends recording and hands the audio straight on.
  stop(reason: RecorderFinish = "stopped"): void {
    if (!this.recorder || this.finish) return;
    this.finish = reason;
    this.clearTimer();
    this.recorder.stop();
  }

  // Cancelling discards the audio; no transcription starts.
  cancel(): void {
    this.active = false;
    this.finish = null;
    this.chunks = [];
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    this.release();
  }

  private tick() {
    const elapsed = Math.min(this.maxSeconds, Math.floor((this.now() - this.startedAt) / 1000));
    this.events.onTick(elapsed);
    // N3F1.1.3: stop automatically at the limit and continue to drafting.
    if (elapsed >= this.maxSeconds) this.stop("limit");
  }

  private completed(type: string) {
    const reason = this.finish ?? "stopped";
    const audio = new Blob(this.chunks, { type: type.split(";")[0] });
    this.chunks = [];
    this.recorder = null;
    this.active = false;
    this.release();
    if (!audio.size) { this.events.onError("failed"); return; }
    this.events.onFinish(audio, reason);
  }

  private fail() {
    this.cancel();
    this.events.onError("failed");
  }

  private clearTimer() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private release() {
    this.clearTimer();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
