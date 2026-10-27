export const MASK_WIDTH = 256;
export const MASK_HEIGHT = 144;
export const GRID_WIDTH = 64;
export const GRID_HEIGHT = 36;
export const MASK_TTL_MS = 250;

export type VisionDelegate = "GPU" | "CPU";
export type VisionFps = 15 | 30;

export interface VisionConfiguration {
  mirror: boolean;
  fps: VisionFps;
  delegate: VisionDelegate;
}

export type VisionStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "running"
  | "stopped"
  | "error";

export interface CollisionMaskFrame {
  /** Monotonic capture time in the window's performance.now() clock. */
  timestamp: number;
  gridWidth: number;
  gridHeight: number;
  occupancy: Uint8Array;
  /** Newly entering foreground boundary only. A stationary body emits no motion. */
  motion: Uint8Array;
}

export interface VisionFrame extends CollisionMaskFrame {
  width: number;
  height: number;
  /** White foreground with alpha 255; background alpha 0. Already cropped and mirrored. */
  rgba: Uint8ClampedArray;
  mirror: boolean;
  inferenceMs: number;
}

export interface VisionCallbacks {
  /** Buffers remain valid until the next onFrame callback or stop(). Copy to retain. */
  onFrame: (frame: VisionFrame) => void;
  onStatus?: (status: VisionStatus) => void;
  onError?: (error: Error) => void;
}

export interface TransferMasks {
  rgba: ArrayBuffer;
  occupancy: ArrayBuffer;
  motion: ArrayBuffer;
}

export type WorkerRequest =
  | {
      type: "initialize";
      delegate: VisionDelegate;
      wasmRoot: string;
      modelPath: string;
    }
  | { type: "configure"; delegate: VisionDelegate; requestId: number }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number; mirror: boolean }
  | { type: "recycle"; buffers: TransferMasks };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "configured"; requestId: number }
  | {
      type: "result";
      timestamp: number;
      mirror: boolean;
      inferenceMs: number;
      buffers: TransferMasks;
    }
  | { type: "error"; message: string };
