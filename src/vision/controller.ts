import { coverCrop, isMaskFresh } from "./masks";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  MASK_HEIGHT,
  MASK_WIDTH,
  type TransferMasks,
  type VisionCallbacks,
  type VisionConfiguration,
  type VisionFrame,
  type VisionStatus,
  type WorkerRequest,
  type WorkerResponse,
} from "./types";

export interface VisionControllerOptions
  extends VisionCallbacks,
    Partial<VisionConfiguration> {
  wasmRoot?: string;
  modelPath?: string;
}

/** Owns one camera, one worker, and at most one captured ImageBitmap in flight. */
export class VisionController {
  private readonly callbacks: VisionCallbacks;
  private readonly wasmRoot: string;
  private readonly modelPath: string;
  private settings: VisionConfiguration;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private worker: Worker | null = null;
  private animationId = 0;
  private frameBusy = false;
  private generation = 0;
  private failedGeneration = -1;
  private lastCapture = -Infinity;
  private lastVideoTime = -1;
  private frame: VisionFrame | null = null;
  private requestId = 0;
  private initializing: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;
  private configuring = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  private currentStatus: VisionStatus = "idle";

  constructor(options: VisionControllerOptions) {
    this.callbacks = options;
    this.settings = {
      mirror: options.mirror ?? true,
      fps: options.fps ?? 15,
      delegate: options.delegate ?? "GPU",
    };
    this.wasmRoot = options.wasmRoot ?? "/assets/vision/wasm";
    this.modelPath =
      options.modelPath ?? "/assets/vision/selfie_segmenter_landscape.tflite";
  }

  get configuration(): Readonly<VisionConfiguration> {
    return { ...this.settings };
  }
  get status(): VisionStatus {
    return this.currentStatus;
  }
  /** Null as soon as the last capture exceeds the 250ms collision TTL. */
  get currentFrame(): VisionFrame | null {
    return this.getFreshFrame();
  }
  getFreshFrame(nowMs = performance.now()): VisionFrame | null {
    return isMaskFresh(this.frame, nowMs) ? this.frame : null;
  }

  private setStatus(status: VisionStatus) {
    this.currentStatus = status;
    this.callbacks.onStatus?.(status);
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.video = video;
    this.setStatus("requesting-camera");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access requires a supported browser on HTTPS or localhost.",
        );
      if (
        typeof Worker === "undefined" ||
        typeof OffscreenCanvas === "undefined" ||
        typeof createImageBitmap === "undefined"
      )
        throw new Error(
          "This browser does not support worker-based segmentation.",
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      for (const track of stream.getVideoTracks())
        track.addEventListener("ended", this.onCameraLost);
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      if (generation !== this.generation) return;
      this.setStatus("loading-model");
      const worker = new Worker(
        new URL("./segmenter.worker.ts", import.meta.url),
        { type: "module", name: "khayal-segmentation" },
      );
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<WorkerResponse>) =>
        this.onMessage(event.data, generation);
      worker.onerror = (event) =>
        this.fail(
          new Error(event.message || "Segmentation worker failed"),
          generation,
        );
      worker.onmessageerror = () =>
        this.fail(
          new Error("Segmentation worker returned unreadable data"),
          generation,
        );
      const ready = new Promise<void>((resolve, reject) => {
        this.initializing = { resolve, reject };
      });
      this.post({
        type: "initialize",
        delegate: this.settings.delegate,
        wasmRoot: new URL(this.wasmRoot, location.href).href,
        modelPath: new URL(this.modelPath, location.href).href,
      });
      await ready;
      if (generation !== this.generation) return;
      this.setStatus("running");
      this.animationId = requestAnimationFrame(this.tick);
    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error(String(error));
      if (generation !== this.generation) {
        if (this.failedGeneration === generation) throw failure;
        return;
      }
      this.fail(failure, generation);
      throw failure;
    }
  }

  stop(): void {
    this.generation++;
    cancelAnimationFrame(this.animationId);
    this.animationId = 0;
    this.worker?.terminate();
    this.worker = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.removeEventListener("ended", this.onCameraLost);
        track.stop();
      }
    }
    if (this.video && this.video.srcObject === this.stream) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.stream = null;
    this.video = null;
    this.frame = null;
    this.frameBusy = false;
    this.lastCapture = -Infinity;
    this.lastVideoTime = -1;
    const stopped = new Error("Vision stopped");
    this.initializing?.reject(stopped);
    this.initializing = null;
    for (const pending of this.configuring.values()) pending.reject(stopped);
    this.configuring.clear();
    this.setStatus("stopped");
  }

  async configure(configuration: Partial<VisionConfiguration>): Promise<void> {
    if (
      configuration.fps !== undefined &&
      configuration.fps !== 15 &&
      configuration.fps !== 30
    )
      throw new Error("Vision FPS must be 15 or 30");
    if (
      configuration.delegate !== undefined &&
      configuration.delegate !== "GPU" &&
      configuration.delegate !== "CPU"
    )
      throw new Error("Vision delegate must be GPU or CPU");
    const delegateChanged =
      configuration.delegate !== undefined &&
      configuration.delegate !== this.settings.delegate;
    const mirrorChanged =
      configuration.mirror !== undefined &&
      configuration.mirror !== this.settings.mirror;
    this.settings = { ...this.settings, ...configuration };
    if (mirrorChanged || delegateChanged) this.frame = null;
    if (delegateChanged && this.worker) {
      const requestId = ++this.requestId;
      const completed = new Promise<void>((resolve, reject) =>
        this.configuring.set(requestId, { resolve, reject }),
      );
      this.post({
        type: "configure",
        delegate: this.settings.delegate,
        requestId,
      });
      await completed;
    }
  }

  private post(message: WorkerRequest, transfer: Transferable[] = []) {
    this.worker?.postMessage(message, transfer);
  }

  private recycle(frame: VisionFrame | null) {
    if (!frame || !this.worker) return;
    const buffers: TransferMasks = {
      rgba: frame.rgba.buffer as ArrayBuffer,
      occupancy: frame.occupancy.buffer as ArrayBuffer,
      motion: frame.motion.buffer as ArrayBuffer,
    };
    this.post({ type: "recycle", buffers }, [
      buffers.rgba,
      buffers.occupancy,
      buffers.motion,
    ]);
  }

  private onMessage(message: WorkerResponse, generation: number) {
    if (generation !== this.generation) return;
    if (message.type === "error") {
      this.fail(new Error(message.message), generation);
      return;
    }
    if (message.type === "ready") {
      this.initializing?.resolve();
      this.initializing = null;
      return;
    }
    if (message.type === "configured") {
      this.configuring.get(message.requestId)?.resolve();
      this.configuring.delete(message.requestId);
      return;
    }
    this.frameBusy = false;
    const next: VisionFrame = {
      width: MASK_WIDTH,
      height: MASK_HEIGHT,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      timestamp: message.timestamp,
      mirror: message.mirror,
      inferenceMs: message.inferenceMs,
      rgba: new Uint8ClampedArray(message.buffers.rgba),
      occupancy: new Uint8Array(message.buffers.occupancy),
      motion: new Uint8Array(message.buffers.motion),
    };
    if (
      !isMaskFresh(next, performance.now()) ||
      next.mirror !== this.settings.mirror
    ) {
      this.recycle(next);
      return;
    }
    this.recycle(this.frame);
    this.frame = next;
    this.callbacks.onFrame(next);
  }

  private tick = (now: number) => {
    if (this.currentStatus !== "running") return;
    this.animationId = requestAnimationFrame(this.tick);
    const video = this.video;
    if (
      !video ||
      this.frameBusy ||
      this.configuring.size > 0 ||
      now - this.lastCapture < 1000 / this.settings.fps ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoTime
    )
      return;
    if (!video.videoWidth || !video.videoHeight) return;
    this.frameBusy = true;
    this.lastCapture = now;
    this.lastVideoTime = video.currentTime;
    const generation = this.generation;
    const crop = coverCrop(video.videoWidth, video.videoHeight);
    const mirror = this.settings.mirror;
    // Capture only when the previous result has returned: no frame queue can form.
    void createImageBitmap(video, crop.x, crop.y, crop.width, crop.height, {
      resizeWidth: MASK_WIDTH,
      resizeHeight: MASK_HEIGHT,
      resizeQuality: "low",
    })
      .then((bitmap) => {
        if (generation !== this.generation || !this.worker) {
          bitmap.close();
          return;
        }
        this.post({ type: "frame", bitmap, timestamp: now, mirror }, [bitmap]);
      })
      .catch((error: unknown) =>
        this.fail(
          error instanceof Error ? error : new Error(String(error)),
          generation,
        ),
      );
  };

  private onCameraLost = () =>
    this.fail(
      new Error(
        "Camera disconnected. Reconnect it and start the camera again.",
      ),
      this.generation,
    );

  private fail(error: Error, generation: number) {
    if (generation !== this.generation) return;
    this.failedGeneration = generation;
    // Reject pending starts/configuration with the original actionable cause.
    this.initializing?.reject(error);
    this.initializing = null;
    for (const pending of this.configuring.values()) pending.reject(error);
    this.configuring.clear();
    this.stop();
    this.setStatus("error");
    this.callbacks.onError?.(error);
  }
}
