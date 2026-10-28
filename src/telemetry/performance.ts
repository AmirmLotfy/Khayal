export const PERFORMANCE_WINDOW_MS = 300_000;
const MAX_SAMPLES = 50_000;
const MAX_CHANGES = 100;
const COVERAGE_GAP_MS = 1000;

export interface PerformanceContext {
  source: "sim" | "live";
  delegate: "GPU" | "CPU";
  requestedFps: number;
  mirror: boolean;
  camera: boolean;
  visibility: string;
  phase: string;
  ordinaryActors: number;
  waitingActors: number;
  afreets: number;
  waitingAfreets: number;
}
const settingKeys = ["source", "delegate", "requestedFps", "mirror", "camera"] as const;
const actorKeys = ["ordinaryActors", "waitingActors", "afreets", "waitingAfreets"] as const;
type StopReason = "manual" | "max-duration" | "page-unload";

/** Nearest-rank percentile; invalid input produces no statistic. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length || !Number.isFinite(fraction) || fraction < 0 || fraction > 1 ||
      values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}
function summary(values: readonly number[]) {
  return {
    samples: values.length,
    meanMs: values.length ? values.reduce((total, value) => total + value, 0) / values.length : null,
    p95Ms: percentile(values, 0.95),
    maxMs: values.length ? Math.max(...values) : null,
  };
}
function cadence(values: readonly number[]) {
  const result = summary(values);
  return { ...result, averageFps: result.meanMs && result.meanMs > 0 ? 1000 / result.meanMs : null };
}

/** Pure, bounded local observation. All timestamps use the stage's performance.now clock. */
export class PerformanceRecorder {
  private endedAt: number | null = null;
  private stopReason: StopReason | null = null;
  private lastObservedAt: number;
  private context: PerformanceContext;
  private previousRender: number | null = null;
  private firstRender: number | null = null;
  private previousInference: number | null = null;
  private firstInference: number | null = null;
  private previousCapture: number | null = null;
  private renderIntervals: number[] = [];
  private inferenceIntervals: number[] = [];
  private latencies: number[] = [];
  private workerTimes: number[] = [];
  private invalidSamples = { render: 0, inference: 0, context: 0, clock: 0, capacity: 0 };
  private skippedBoundaryResults = 0;
  private hiddenSince: number | null = null;
  private hiddenDurationMs = 0;
  private visibilityChanges: { offsetMs: number; state: string }[] = [];
  private settingChanges: { offsetMs: number; key: string; before: unknown; after: unknown }[] = [];
  private phases = new Set<string>();
  private actorRanges: Record<typeof actorKeys[number], { min: number; max: number }>;
  private storedReport: ReturnType<PerformanceRecorder["createReport"]> | null = null;

  constructor(
    readonly startedAt: number,
    readonly startedAtIso: string,
    readonly initialContext: PerformanceContext,
  ) {
    if (!Number.isFinite(startedAt) || startedAt < 0) throw new Error("Invalid telemetry start clock");
    this.lastObservedAt = startedAt;
    this.context = { ...initialContext };
    this.initialContext = { ...initialContext };
    this.actorRanges = Object.fromEntries(actorKeys.map((key) => [key, { min: initialContext[key], max: initialContext[key] }])) as typeof this.actorRanges;
    this.observeContext(startedAt, initialContext);
    this.visibilityChanges.push({ offsetMs: 0, state: initialContext.visibility });
    if (initialContext.visibility !== "visible") this.hiddenSince = startedAt;
  }
  get running(): boolean { return this.endedAt === null; }
  get report() { return this.storedReport; }
  progress(now: number) {
    return {
      running: this.running,
      durationMs: Math.max(0, Math.min(this.endedAt ?? now, this.startedAt + PERFORMANCE_WINDOW_MS) - this.startedAt),
      renderSamples: this.renderIntervals.length,
      inferenceResults: this.latencies.length,
    };
  }
  private time(now: number): boolean {
    if (!this.running) return false;
    if (!Number.isFinite(now) || now < this.lastObservedAt) {
      this.invalidSamples.clock++;
      return false;
    }
    if (now >= this.startedAt + PERFORMANCE_WINDOW_MS) {
      this.stop(now, "max-duration");
      return false;
    }
    this.lastObservedAt = now;
    return true;
  }
  private append(values: number[], value: number) {
    if (values.length >= MAX_SAMPLES) { this.invalidSamples.capacity++; return; }
    values.push(value);
  }
  observeContext(now: number, next: PerformanceContext): void {
    if (!this.time(now)) return;
    if (![15, 30].includes(next.requestedFps) ||
        !["GPU", "CPU"].includes(next.delegate) ||
        !["sim", "live"].includes(next.source) ||
        typeof next.camera !== "boolean" || typeof next.mirror !== "boolean" ||
        typeof next.visibility !== "string" || !next.visibility ||
        actorKeys.some((key) => !Number.isSafeInteger(next[key]) || next[key] < 0)) {
      this.invalidSamples.context++;
      return;
    }
    for (const key of settingKeys) {
      if (next[key] !== this.context[key]) {
        if (this.settingChanges.length < MAX_CHANGES)
          this.settingChanges.push({ offsetMs: now - this.startedAt, key, before: this.context[key], after: next[key] });
        else this.invalidSamples.capacity++;
      }
    }
    if (next.visibility !== this.context.visibility) this.visibility(now, next.visibility);
    this.context = { ...next };
    for (const key of actorKeys) {
      this.actorRanges[key].min = Math.min(this.actorRanges[key].min, next[key]);
      this.actorRanges[key].max = Math.max(this.actorRanges[key].max, next[key]);
    }
    if (this.phases.size < MAX_CHANGES) this.phases.add(next.phase);
    else if (!this.phases.has(next.phase)) this.invalidSamples.capacity++;
  }
  visibility(now: number, state: string): void {
    if (!this.time(now) || state === this.context.visibility) return;
    if (this.hiddenSince !== null) this.hiddenDurationMs += now - this.hiddenSince;
    this.hiddenSince = state === "visible" ? null : now;
    this.context.visibility = state;
    if (this.visibilityChanges.length < MAX_CHANGES)
      this.visibilityChanges.push({ offsetMs: now - this.startedAt, state });
    else this.invalidSamples.capacity++;
  }
  render(now: number, context: PerformanceContext): void {
    if (!this.time(now)) return;
    this.observeContext(now, context);
    if (this.previousRender !== null) {
      const interval = now - this.previousRender;
      if (interval <= 0) { this.invalidSamples.render++; return; }
      this.append(this.renderIntervals, interval);
    }
    this.firstRender ??= now;
    this.previousRender = now;
  }
  inference(now: number, capturedAt: number, workerInferenceMs: number): void {
    if (!this.time(now)) return;
    if (!Number.isFinite(capturedAt) || capturedAt < 0 || capturedAt > now ||
        !Number.isFinite(workerInferenceMs) || workerInferenceMs < 0 ||
        (this.previousCapture !== null && capturedAt <= this.previousCapture) ||
        (this.previousInference !== null && now <= this.previousInference)) {
      this.invalidSamples.inference++;
      return;
    }
    // An in-flight capture from before Start is outside this observation window.
    if (capturedAt < this.startedAt) { this.skippedBoundaryResults++; return; }
    if (this.previousInference !== null) this.append(this.inferenceIntervals, now - this.previousInference);
    this.append(this.latencies, now - capturedAt);
    this.append(this.workerTimes, workerInferenceMs);
    this.firstInference ??= now;
    this.previousInference = now;
    this.previousCapture = capturedAt;
  }
  stop(now: number, reason: StopReason = "manual") {
    if (this.storedReport) return this.storedReport;
    if (!Number.isFinite(now) || now < this.lastObservedAt) {
      this.invalidSamples.clock++;
      now = this.lastObservedAt;
    }
    this.endedAt = Math.min(now, this.startedAt + PERFORMANCE_WINDOW_MS);
    this.stopReason = now >= this.startedAt + PERFORMANCE_WINDOW_MS ? "max-duration" : reason;
    if (this.hiddenSince !== null) this.hiddenDurationMs += this.endedAt - this.hiddenSince;
    this.storedReport = this.createReport();
    return this.storedReport;
  }
  private createReport() {
    const endedAt = this.endedAt!;
    const fullFiveMinutes = endedAt >= this.startedAt + PERFORMANCE_WINDOW_MS;
    const durationMs = fullFiveMinutes ? PERFORMANCE_WINDOW_MS : endedAt - this.startedAt;
    const render = cadence(this.renderIntervals);
    const inference = cadence(this.inferenceIntervals);
    const coverage = (first: number | null, last: number | null, intervals: readonly number[]) => ({
      firstResultOffsetMs: first === null ? null : first - this.startedAt,
      finalResultGapMs: last === null ? null : endedAt - last,
      maxObservedGapMs: first === null || last === null ? null : Math.max(first - this.startedAt, endedAt - last, ...intervals),
    });
    const renderCoverage = coverage(this.firstRender, this.previousRender, this.renderIntervals);
    const inferenceCoverage = coverage(this.firstInference, this.previousInference, this.inferenceIntervals);
    const issues: string[] = [];
    if (!this.renderIntervals.length) issues.push("Missing render interval samples");
    if (!this.inferenceIntervals.length) issues.push("Fewer than two valid inference results");
    if (!this.initialContext.camera) issues.push("Camera was off when observation started");
    if (Object.values(this.invalidSamples).some((count) => count > 0)) issues.push("Invalid samples or capacity exceeded");
    if (this.hiddenDurationMs > 0 || this.visibilityChanges.some((change) => change.state !== "visible")) issues.push("Stage was hidden during observation");
    if (this.settingChanges.length) issues.push("Source or camera settings changed during observation");
    const coverageComplete = [renderCoverage, inferenceCoverage].every((item) => item.maxObservedGapMs !== null && item.maxObservedGapMs <= COVERAGE_GAP_MS);
    if (!coverageComplete) issues.push("Render or inference coverage contains a missing period over one second");
    const usable = issues.length === 0;
    return {
      schema: "khayal-local-performance-v1",
      evidence: "Local browser telemetry only; no automated human, OBS, device or live Twitch acceptance",
      startedAtIso: this.startedAtIso,
      durationMs,
      targetDurationMs: PERFORMANCE_WINDOW_MS,
      stopReason: this.stopReason,
      initialContext: { ...this.initialContext },
      finalContext: { ...this.context },
      actorRanges: this.actorRanges,
      observedPhases: [...this.phases],
      settingsChanges: this.settingChanges,
      visibility: { hiddenDurationMs: this.hiddenDurationMs, changes: this.visibilityChanges },
      render: { ...render, definition: "Unclamped requestAnimationFrame callback intervals; not GPU render duration", coverage: renderCoverage },
      inference: { ...inference, results: this.latencies.length, definition: "Cadence of actual delivered onFrame results, not requested FPS", coverage: inferenceCoverage },
      captureToOnFrame: { ...summary(this.latencies), definition: "Stage performance.now at onFrame minus the frame's capture timestamp" },
      workerInference: summary(this.workerTimes),
      invalidSamples: { ...this.invalidSamples },
      skippedPreStartInferenceResults: this.skippedBoundaryResults,
      validity: { measurementsUsable: usable, issues },
      coverage: { fullFiveMinutes, complete: coverageComplete, maxAllowedGapMs: COVERAGE_GAP_MS },
      acceptance: {
        fiveMinuteLocalObservation: usable && fullFiveMinutes && coverageComplete ? "recorded" : "not-established",
        performanceTargets: "unassessed",
        obs: "unverified",
        human: "unverified",
      },
    };
  }
}
export type PerformanceReport = NonNullable<PerformanceRecorder["report"]>;
