/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Generated and refined Voice Assist client, form or recording regression checks.
 * Author review: I validated correctness, and added boundary checks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickMimeType, VoiceRecorder, type RecorderConstructor, type RecorderEvents } from "../../src/voice/recorder";
import { fakeMicrophone, FakeMediaRecorder } from "../voice-fakes";

const Recorder = FakeMediaRecorder as unknown as RecorderConstructor;

function events() {
  return {
    onRecording: vi.fn(),
    onTick: vi.fn(),
    onFinish: vi.fn(),
    onError: vi.fn(),
  } satisfies RecorderEvents;
}

describe("VoiceRecorder (N3F1.1)", () => {
  let now = 0;
  beforeEach(() => { vi.useFakeTimers(); now = 0; FakeMediaRecorder.instances = []; });
  afterEach(() => { vi.useRealTimers(); });

  function recorder(handlers: RecorderEvents, microphone = fakeMicrophone()) {
    return {
      microphone,
      recorder: new VoiceRecorder(handlers, 60, { mediaDevices: microphone, Recorder, now: () => now }),
    };
  }

  it("asks for the microphone only when recording starts", async () => {
    const handlers = events();
    const { microphone, recorder: voice } = recorder(handlers);
    expect(microphone.getUserMedia).not.toHaveBeenCalled();
    await voice.start();
    expect(microphone.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(handlers.onRecording).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances[0].mimeType).toBe("audio/webm;codecs=opus");
  });

  it("reports elapsed seconds and returns the audio when stopped", async () => {
    const handlers = events();
    const { microphone, recorder: voice } = recorder(handlers);
    await voice.start();
    now = 12_400;
    vi.advanceTimersByTime(250);
    expect(handlers.onTick).toHaveBeenLastCalledWith(12);
    voice.stop();
    const [audio, reason] = handlers.onFinish.mock.calls[0];
    expect(reason).toBe("stopped");
    expect((audio as Blob).type).toBe("audio/webm");
    expect(microphone.track.stop).toHaveBeenCalled();
  });

  it("stops automatically at the 60-second limit", async () => {
    const handlers = events();
    const { recorder: voice } = recorder(handlers);
    await voice.start();
    now = 60_000;
    vi.advanceTimersByTime(250);
    expect(handlers.onFinish).toHaveBeenCalledWith(expect.any(Blob), "limit");
  });

  it("discards the audio when cancelled", async () => {
    const handlers = events();
    const { microphone, recorder: voice } = recorder(handlers);
    await voice.start();
    voice.cancel();
    expect(handlers.onFinish).not.toHaveBeenCalled();
    expect(microphone.track.stop).toHaveBeenCalled();
  });

  it.each([["denied", "denied"], ["unavailable", "failed"]] as const)(
    "explains a %s microphone", async (result, failure) => {
      const handlers = events();
      const { recorder: voice } = recorder(handlers, fakeMicrophone(result));
      await voice.start();
      expect(handlers.onError).toHaveBeenCalledWith(failure);
    },
  );

  it("reports unsupported browsers", async () => {
    const handlers = events();
    await new VoiceRecorder(handlers, 60, { mediaDevices: undefined, Recorder: undefined }).start();
    expect(handlers.onError).toHaveBeenCalledWith("unsupported");
    expect(VoiceRecorder.supported({ mediaDevices: undefined, Recorder: undefined })).toBe(false);
  });

  it("prefers WebM Opus and falls back to MP4 for Safari", () => {
    expect(pickMimeType(Recorder)).toBe("audio/webm;codecs=opus");
    const safari = Object.assign(class {}, { isTypeSupported: (type: string) => type === "audio/mp4" });
    expect(pickMimeType(safari as never)).toBe("audio/mp4");
  });
});
