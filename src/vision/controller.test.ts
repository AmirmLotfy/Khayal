import { afterEach, describe, expect, it, vi } from "vitest";
import { VISION_OPERATION_TIMEOUT_MS, VisionController } from "./controller";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  MASK_HEIGHT,
  MASK_WIDTH,
  type WorkerRequest,
  type WorkerResponse,
} from "./types";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null;
  onerror: unknown;
  onmessageerror: unknown;
  postMessage = vi.fn<(message: WorkerRequest, transfer?: Transferable[]) => void>();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  emit(message: WorkerResponse) {
    this.onmessage?.({ data: message });
  }
}

function result(timestamp: number, mirror = true): WorkerResponse {
  return {
    type: "result",
    timestamp,
    mirror,
    inferenceMs: 10,
    buffers: {
      rgba: new ArrayBuffer(MASK_WIDTH * MASK_HEIGHT * 4),
      occupancy: new ArrayBuffer(GRID_WIDTH * GRID_HEIGHT),
      motion: new ArrayBuffer(GRID_WIDTH * GRID_HEIGHT),
    },
  };
}

async function settle() {
  // Camera acquisition, video.play(), and bitmap transfer each use a microtask.
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function harness() {
  FakeWorker.instances = [];
  let now = 100;
  let animation: FrameRequestCallback | undefined;
  const track = Object.assign(new EventTarget(), { stop: vi.fn() });
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null,
    currentTime: 1,
    readyState: 2,
    videoWidth: 1280,
    videoHeight: 720,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
  };
  const bitmap = { close: vi.fn() };
  const capture = vi.fn(async () => bitmap);
  const onFrame = vi.fn();
  const onError = vi.fn();
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("createImageBitmap", capture);
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia },
  });
  vi.stubGlobal("location", { href: "http://localhost:5173/" });
  vi.stubGlobal("performance", { now: () => now });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animation = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const controller = new VisionController({ onFrame, onError });
  const start = async () => {
    const started = controller.start(video as unknown as HTMLVideoElement);
    await settle();
    const worker = FakeWorker.instances.at(-1)!;
    worker.emit({ type: "ready" });
    await started;
    return worker;
  };
  const tick = async (timestamp: number) => {
    now = timestamp;
    video.currentTime += 1;
    animation?.(now);
    await settle();
  };
  return {
    controller, track, stream, video, bitmap, capture, getUserMedia,
    onFrame, onError, start, tick,
    setNow: (timestamp: number) => { now = timestamp; },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("camera lifecycle and collision freshness", () => {
  it("keeps at most one capture in flight and resumes after its result", async () => {
    const f = harness();
    const worker = await f.start();
    await f.tick(100);
    await f.tick(200);
    expect(f.capture).toHaveBeenCalledTimes(1);
    worker.emit(result(100));
    await f.tick(300);
    expect(f.capture).toHaveBeenCalledTimes(2);
    f.controller.stop();
  });

  it("expires a frozen camera frame and discards delayed inference", async () => {
    const f = harness();
    const worker = await f.start();
    await f.tick(100);
    worker.emit(result(100));
    expect(f.controller.currentFrame).not.toBeNull();
    f.setNow(351);
    expect(f.controller.currentFrame).toBeNull();
    await f.tick(400);
    f.setNow(651);
    worker.emit(result(400));
    expect(f.onFrame).toHaveBeenCalledTimes(1);
    expect(f.controller.currentFrame).toBeNull();
    await f.tick(700);
    expect(f.capture).toHaveBeenCalledTimes(3);
    f.controller.stop();
  });

  it("keeps collisions invalid until CPU reconfiguration has completed", async () => {
    const f = harness();
    const worker = await f.start();
    await f.tick(100);
    const configured = f.controller.configure({ delegate: "CPU" });
    worker.emit(result(100));
    expect(f.controller.currentFrame).toBeNull();
    expect(f.onFrame).not.toHaveBeenCalled();
    await f.tick(200);
    expect(f.capture).toHaveBeenCalledTimes(1);
    const request = worker.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === "configure");
    if (request?.type !== "configure") throw new Error("Missing configure request");
    expect(request.delegate).toBe("CPU");
    worker.emit({ type: "configured", requestId: request.requestId });
    await configured;
    await f.tick(300);
    worker.emit(result(300));
    expect(f.controller.currentFrame?.timestamp).toBe(300);
    f.controller.stop();
  });

  it("rejects frames captured with the previous mirror setting", async () => {
    const f = harness();
    const worker = await f.start();
    await f.tick(100);
    await f.controller.configure({ mirror: false });
    worker.emit(result(100, true));
    expect(f.onFrame).not.toHaveBeenCalled();
    expect(f.controller.currentFrame).toBeNull();
    await f.tick(200);
    worker.emit(result(200, false));
    expect(f.controller.currentFrame?.mirror).toBe(false);
    f.controller.stop();
  });

  it("clears collision data and releases the owned camera when its track ends", async () => {
    const f = harness();
    const worker = await f.start();
    await f.tick(100);
    worker.emit(result(100));
    f.track.dispatchEvent(new Event("ended"));
    expect(f.controller.status).toBe("error");
    expect(f.controller.currentFrame).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.video.srcObject).toBeNull();
    expect(f.onError).toHaveBeenCalledOnce();
    worker.emit(result(100));
    expect(f.controller.currentFrame).toBeNull();
  });

  it("closes a capture that resolves after stop without sending it to a new worker", async () => {
    const f = harness();
    let resolveCapture!: (bitmap: typeof f.bitmap) => void;
    f.capture.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCapture = resolve;
    }));
    const oldWorker = await f.start();
    await f.tick(100);
    f.controller.stop();
    const nextWorker = await f.start();
    resolveCapture(f.bitmap);
    await settle();
    expect(f.bitmap.close).toHaveBeenCalledOnce();
    for (const worker of [oldWorker, nextWorker])
      expect(worker.postMessage.mock.calls.some(([message]) => message.type === "frame")).toBe(false);
    f.controller.stop();
  });

  it("rejects a silent model worker and releases the camera within the startup deadline", async () => {
    const f = harness();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const started = f.controller.start(f.video as unknown as HTMLVideoElement);
    const rejected = expect(started).rejects.toThrow("model initialization timed out");
    await settle();
    const worker = FakeWorker.instances.at(-1)!;
    expect(f.controller.status).toBe("loading-model");
    await vi.advanceTimersByTimeAsync(VISION_OPERATION_TIMEOUT_MS);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.video.srcObject).toBeNull();
    expect(f.controller.status).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
    // Timed-out generations cannot be revived by a late worker response.
    worker.emit({ type: "ready" });
    expect(f.controller.status).toBe("error");
    await f.start();
    expect(f.controller.status).toBe("running");
    expect(vi.getTimerCount()).toBe(0);
    f.controller.stop();
  });

  it("rejects a silent processor change and tears down stale collision state", async () => {
    const f = harness();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const worker = await f.start();
    await f.tick(100);
    worker.emit(result(100));
    expect(f.controller.currentFrame).not.toBeNull();
    const configured = f.controller.configure({ delegate: "CPU" });
    const rejected = expect(configured).rejects.toThrow("processor change timed out");
    await vi.advanceTimersByTimeAsync(VISION_OPERATION_TIMEOUT_MS);
    await rejected;
    expect(f.controller.status).toBe("error");
    expect(f.controller.currentFrame).toBeNull();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases a camera permission grant that arrives after startup timed out", async () => {
    const f = harness();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let grantPermission!: (stream: typeof f.stream) => void;
    f.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => {
      grantPermission = resolve;
    }));
    const started = f.controller.start(f.video as unknown as HTMLVideoElement);
    const rejected = expect(started).rejects.toThrow("permission timed out");
    await vi.advanceTimersByTimeAsync(VISION_OPERATION_TIMEOUT_MS);
    await rejected;
    expect(FakeWorker.instances).toHaveLength(0);
    grantPermission(f.stream);
    await settle();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.video.srcObject).toBeNull();
    expect(f.controller.status).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares the startup deadline across permission and stalled video playback", async () => {
    const f = harness();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let grantPermission!: (stream: typeof f.stream) => void;
    f.getUserMedia.mockImplementationOnce(() => new Promise((resolve) => {
      grantPermission = resolve;
    }));
    f.video.play.mockImplementationOnce(() => new Promise<void>(() => {}));
    const started = f.controller.start(f.video as unknown as HTMLVideoElement);
    const rejected = expect(started).rejects.toThrow("playback timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    f.setNow(10_100);
    grantPermission(f.stream);
    await settle();
    await vi.advanceTimersByTimeAsync(VISION_OPERATION_TIMEOUT_MS - 10_001);
    expect(f.controller.status).toBe("requesting-camera");
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.video.srcObject).toBeNull();
    expect(f.controller.status).toBe("error");
    expect(vi.getTimerCount()).toBe(0);
  });
});
