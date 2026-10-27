import { describe, expect, it } from "vitest";
import {
  MaskProcessor,
  circleIntersectsMask,
  coverCrop,
  isMaskFresh,
  mirrorGrid,
} from "./masks";
import type { CollisionMaskFrame } from "./types";

function fixture() {
  const processor = new MaskProcessor(8, 4, 4, 2);
  const confidence = new Float32Array(32);
  const rgba = new Uint8ClampedArray(128);
  const occupancy = new Uint8Array(8);
  const motion = new Uint8Array(8);
  const process = (timestamp: number) =>
    processor.process(confidence, 8, 4, rgba, occupancy, motion, timestamp);
  return { processor, confidence, rgba, occupancy, motion, process };
}

describe("foreground motion", () => {
  it("warms up without motion and emits no motion for a stationary person", () => {
    const f = fixture();
    f.confidence.fill(0.9);
    f.process(100);
    expect(f.occupancy.some(Boolean)).toBe(true);
    expect(f.motion.some(Boolean)).toBe(false);
    f.process(150);
    expect(f.motion.some(Boolean)).toBe(false);
    expect(f.rgba[3]).toBe(255);
  });

  it("detects only the entering boundary after an empty warmup", () => {
    const f = fixture();
    f.process(100);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) f.confidence[y * 8 + x] = 0.9;
    f.process(150);
    expect(f.motion.some(Boolean)).toBe(true);
    expect(
      Array.from(f.motion).filter(
        (value, index) => value && !f.occupancy[index],
      ),
    ).toEqual([]);
    f.confidence.fill(0);
    f.process(200);
    expect(f.motion.some(Boolean)).toBe(false);
    expect(f.occupancy.some(Boolean)).toBe(false);
  });

  it("keeps foreground through the hysteresis band, then releases it", () => {
    const f = fixture();
    f.confidence.fill(0.7);
    f.process(100);
    f.confidence.fill(0.5);
    f.process(150);
    expect(f.occupancy.every(Boolean)).toBe(true);
    expect(f.motion.some(Boolean)).toBe(false);
    f.confidence.fill(0.3);
    f.process(200);
    expect(f.occupancy.some(Boolean)).toBe(false);
    f.confidence.fill(0.5);
    f.process(250);
    expect(f.occupancy.some(Boolean)).toBe(false);
  });

  it("re-arms without a false swat after a stale gap", () => {
    const f = fixture();
    f.process(100);
    f.confidence.fill(0.9);
    f.process(400);
    expect(f.motion.some(Boolean)).toBe(false);
  });

  it("has no trail and clears binary state when reset", () => {
    const f = fixture();
    f.confidence.fill(0.9);
    f.process(100);
    f.processor.reset();
    f.confidence.fill(0.5);
    f.process(150);
    expect(f.rgba[3]).toBe(0);
    expect(f.occupancy.some(Boolean)).toBe(false);
  });
});

describe("collision geometry", () => {
  const frame: CollisionMaskFrame = {
    timestamp: 100,
    gridWidth: 4,
    gridHeight: 2,
    occupancy: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
    motion: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]),
  };
  const circle = { x: 0.1, y: 0.2, radiusX: 0.05, radiusY: 0.09 };

  it("accepts fresh overlap and rejects stale/future timestamps", () => {
    expect(circleIntersectsMask(frame, circle, 200)).toBe(true);
    expect(circleIntersectsMask(frame, circle, 351)).toBe(false);
    expect(circleIntersectsMask(frame, circle, 99)).toBe(false);
    expect(isMaskFresh(frame, 350)).toBe(true);
    expect(isMaskFresh(null, 100)).toBe(false);
  });

  it("rejects non-overlap and invalid circles", () => {
    expect(circleIntersectsMask(frame, { ...circle, x: 0.8 }, 200)).toBe(false);
    expect(circleIntersectsMask(frame, { ...circle, radiusX: 0 }, 200)).toBe(
      false,
    );
    expect(circleIntersectsMask(frame, { ...circle, x: NaN }, 200)).toBe(false);
  });

  it("mirrors collision occupancy into the matching display side", () => {
    const mirrored = { ...frame, motion: mirrorGrid(frame.motion, 4, 2) };
    expect(circleIntersectsMask(mirrored, circle, 200)).toBe(false);
    expect(circleIntersectsMask(mirrored, { ...circle, x: 0.9 }, 200)).toBe(
      true,
    );
    expect(mirrorGrid(mirrored.motion, 4, 2)).toEqual(frame.motion);
  });

  it("keeps an exact 16:9 center crop for landscape and portrait camera input", () => {
    expect(coverCrop(1280, 720)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
    const crop = coverCrop(720, 1280);
    expect(crop.width / crop.height).toBeCloseTo(16 / 9);
    expect(crop.y).toBeGreaterThan(0);
    expect(crop.x).toBe(0);
  });
});
