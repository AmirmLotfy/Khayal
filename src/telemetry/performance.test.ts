import { describe, expect, it } from "vitest";
import { PerformanceRecorder, PERFORMANCE_WINDOW_MS, percentile, type PerformanceContext } from "./performance";

const context: PerformanceContext = {
  source: "sim", delegate: "GPU", requestedFps: 30, mirror: true,
  camera: true, visibility: "visible", phase: "free",
  ordinaryActors: 24, waitingActors: 6, afreets: 0, waitingAfreets: 0,
};
const recorder = () => new PerformanceRecorder(0, "2026-10-28T12:00:00Z", context);

describe("local performance statistics", () => {
  it("uses a nearest-rank p95 and rejects missing or invalid percentile samples", () => {
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 0.95)).toBe(95);
    expect(percentile([20, 10, 30], 0.95)).toBe(30);
    expect(percentile([], 0.95)).toBeNull();
    expect(percentile([10, NaN], 0.95)).toBeNull();
    expect(percentile([10, -1], 0.95)).toBeNull();
  });
  it("measures actual render and delivered inference cadence without clamping or substituting requested FPS", () => {
    const run = recorder();
    run.render(10, context);
    run.inference(20, 15, 2);
    run.render(30, context);
    run.inference(60, 50, 3);
    run.render(130, context);
    const report = run.stop(140);
    expect(report.render.meanMs).toBe(60);
    expect(report.render.averageFps).toBeCloseTo(1000 / 60);
    expect(report.render.p95Ms).toBe(100);
    expect(report.inference.averageFps).toBe(25);
    expect(report.captureToOnFrame.meanMs).toBe(7.5);
    expect(report.captureToOnFrame.p95Ms).toBe(10);
    expect(report.validity.measurementsUsable).toBe(true);
    expect(report.coverage.fullFiveMinutes).toBe(false);
    expect(report.acceptance.fiveMinuteLocalObservation).toBe("not-established");
    expect(report.acceptance.obs).toBe("unverified");
  });
  it("never qualifies missing, invalid, duplicated or future inference samples", () => {
    const empty = recorder().stop(100);
    expect(empty.render.averageFps).toBeNull();
    expect(empty.inference.averageFps).toBeNull();
    expect(empty.validity.measurementsUsable).toBe(false);
    const run = recorder();
    run.render(10, context);
    run.render(10, context);
    run.inference(20, 30, 2);
    run.inference(30, 25, 2);
    run.inference(40, 25, 2);
    run.inference(50, 45, NaN);
    run.render(NaN, context);
    const report = run.stop(60);
    expect(report.invalidSamples).toMatchObject({ render: 1, inference: 3, clock: 1 });
    expect(report.inference.results).toBe(1);
    expect(report.validity.measurementsUsable).toBe(false);
    expect(report.acceptance.fiveMinuteLocalObservation).toBe("not-established");
  });
  it("accounts for hidden time including a hidden tail and invalidates the observation", () => {
    const run = recorder();
    run.render(10, context);
    run.visibility(100, "hidden");
    run.visibility(350, "visible");
    run.visibility(500, "hidden");
    const report = run.stop(700);
    expect(report.visibility.hiddenDurationMs).toBe(450);
    expect(report.visibility.changes.map((change) => change.state)).toEqual(["visible", "hidden", "visible", "hidden"]);
    expect(report.validity.issues).toContain("Stage was hidden during observation");
  });
  it("discloses settings changes and actor ranges without treating actor count changes as settings changes", () => {
    const run = recorder();
    run.render(10, context);
    run.render(20, { ...context, ordinaryActors: 10, afreets: 4, phase: "hunt" });
    run.observeContext(30, { ...context, delegate: "CPU", requestedFps: 15 });
    const report = run.stop(40);
    expect(report.actorRanges.ordinaryActors).toEqual({ min: 10, max: 24 });
    expect(report.observedPhases).toEqual(["free", "hunt"]);
    expect(report.settingsChanges.map((change) => change.key)).toEqual(["delegate", "requestedFps"]);
    expect(report.validity.issues).toContain("Source or camera settings changed during observation");
    expect(report.initialContext.delegate).toBe("GPU");
    expect(report.finalContext.delegate).toBe("CPU");
  });
  it("auto-stops at five minutes and requires actual continuous inference coverage", () => {
    const run = recorder();
    for (let now = 10; now < PERFORMANCE_WINDOW_MS; now += 500) {
      run.render(now, context);
      run.inference(now + 1, now, 0.5);
    }
    run.render(PERFORMANCE_WINDOW_MS + 50, context);
    expect(run.running).toBe(false);
    const report = run.report!;
    expect(report.durationMs).toBe(PERFORMANCE_WINDOW_MS);
    expect(report.stopReason).toBe("max-duration");
    expect(report.acceptance.fiveMinuteLocalObservation).toBe("recorded");
    expect(report.acceptance.performanceTargets).toBe("unassessed");
    const stalled = recorder();
    stalled.render(10, context);
    stalled.inference(11, 10, 1);
    stalled.render(20, context);
    stalled.inference(21, 20, 1);
    const stalledReport = stalled.stop(PERFORMANCE_WINDOW_MS);
    expect(stalledReport.coverage.fullFiveMinutes).toBe(true);
    expect(stalledReport.coverage.complete).toBe(false);
    expect(stalledReport.acceptance.fiveMinuteLocalObservation).toBe("not-established");
  });
});
