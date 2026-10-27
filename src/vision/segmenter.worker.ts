/// <reference lib="webworker" />
import { FilesetResolver, ImageSegmenter } from "@mediapipe/tasks-vision";
import { MaskProcessor } from "./masks";
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  MASK_HEIGHT,
  MASK_WIDTH,
  type TransferMasks,
  type WorkerRequest,
  type WorkerResponse,
} from "./types";

const worker = self as DedicatedWorkerGlobalScope;
const processor = new MaskProcessor(
  MASK_WIDTH,
  MASK_HEIGHT,
  GRID_WIDTH,
  GRID_HEIGHT,
);
const inputCanvas = new OffscreenCanvas(MASK_WIDTH, MASK_HEIGHT);
const inputContext = inputCanvas.getContext("2d", { alpha: false });
const recycled: TransferMasks[] = [];
let segmenter: ImageSegmenter | undefined;
let previousMirror: boolean | undefined;

function reply(message: WorkerResponse, transfer: Transferable[] = []) {
  worker.postMessage(message, transfer);
}

function buffers(): TransferMasks {
  return (
    recycled.pop() ?? {
      rgba: new ArrayBuffer(MASK_WIDTH * MASK_HEIGHT * 4),
      occupancy: new ArrayBuffer(GRID_WIDTH * GRID_HEIGHT),
      motion: new ArrayBuffer(GRID_WIDTH * GRID_HEIGHT),
    }
  );
}

// Serialize asynchronous initialization/configuration before frame work.
let pending = Promise.resolve();
worker.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  pending = pending
    .then(async () => {
      if (message.type === "recycle") {
        if (
          recycled.length < 2 &&
          message.buffers.rgba.byteLength === MASK_WIDTH * MASK_HEIGHT * 4 &&
          message.buffers.occupancy.byteLength === GRID_WIDTH * GRID_HEIGHT &&
          message.buffers.motion.byteLength === GRID_WIDTH * GRID_HEIGHT
        )
          recycled.push(message.buffers);
        return;
      }
      if (message.type === "initialize") {
        segmenter?.close();
        // The second argument selects the ESM WASM loader for this module worker.
        const fileset = await FilesetResolver.forVisionTasks(
          message.wasmRoot,
          true,
        );
        segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: message.modelPath,
            delegate: message.delegate,
          },
          canvas: new OffscreenCanvas(MASK_WIDTH, MASK_HEIGHT),
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        processor.reset();
        reply({ type: "ready" });
        return;
      }
      if (message.type === "configure") {
        if (!segmenter) throw new Error("Segmenter is not ready");
        await segmenter.setOptions({
          baseOptions: { delegate: message.delegate },
        });
        processor.reset();
        reply({ type: "configured", requestId: message.requestId });
        return;
      }
      try {
        if (!segmenter || !inputContext)
          throw new Error("Segmentation is unavailable in this browser");
        if (previousMirror !== message.mirror) processor.reset();
        previousMirror = message.mirror;
        inputContext.setTransform(
          message.mirror ? -1 : 1,
          0,
          0,
          1,
          message.mirror ? MASK_WIDTH : 0,
          0,
        );
        inputContext.drawImage(message.bitmap, 0, 0, MASK_WIDTH, MASK_HEIGHT);
        inputContext.resetTransform();
        const output = buffers();
        const started = performance.now();
        segmenter.segmentForVideo(inputCanvas, message.timestamp, (result) => {
          const masks = result.confidenceMasks;
          // The pinned selfie model emits one person confidence channel. Accommodate
          // metadata-labelled two-channel variants without confusing background/person.
          const person = masks?.[masks.length === 1 ? 0 : 1];
          if (!person)
            throw new Error("Model returned no person confidence mask");
          processor.process(
            person.getAsFloat32Array(),
            person.width,
            person.height,
            new Uint8ClampedArray(output.rgba),
            new Uint8Array(output.occupancy),
            new Uint8Array(output.motion),
            message.timestamp,
          );
        });
        reply(
          {
            type: "result",
            timestamp: message.timestamp,
            mirror: message.mirror,
            inferenceMs: performance.now() - started,
            buffers: output,
          },
          [output.rgba, output.occupancy, output.motion],
        );
      } finally {
        message.bitmap.close();
      }
    })
    .catch((error: unknown) => {
      try {
        segmenter?.close();
      } catch {
        /* The controller terminates this worker. */
      }
      segmenter = undefined;
      reply({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
};
