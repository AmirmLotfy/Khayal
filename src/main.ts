import "./style.css";
import { ShowSound } from "./show/sound";
import { Director } from "./show/director";
import { createStage } from "./stage/render";
import { exportPlaybill, type PlaybillPage } from "./playbill/export";
import { TwitchClient, scrubOAuthCallbackUrl } from "./twitch/client";
import { DEFAULT_COOLDOWNS } from "./twitch/commands";
import { PerformanceRecorder, PERFORMANCE_WINDOW_MS, type PerformanceContext } from "./telemetry/performance";
import { VisionController, circleIntersectsMask } from "./vision";
import { Sprite, Texture } from "pixi.js";
const root = document.querySelector<HTMLElement>("#app")!;
const COMPANY_SIZES = [12, 24, 30, 50] as const;
const COMPANY_STEP_SECONDS = 0.35;
const cue = location.pathname === "/cue";
const session =
  new URLSearchParams(location.search).get("show") ??
  sessionStorage.getItem("khayal-show") ??
  crypto.randomUUID();
sessionStorage.setItem("khayal-show", session);
const bus = new BroadcastChannel("khayal-" + session);
type Action = { type: string; value?: any };
interface PlaybillExportMetadata {
  showId: string;
  exportId: string;
  castCount: number;
  pages: PlaybillPage[];
}
interface StageStatusMessage {
  kind: "status";
  showId: string;
  settings: Record<string, string | number | boolean>;
  text: string;
  playbill: PlaybillExportMetadata | null;
  performance: PerformanceStatus;
}
interface PerformanceStatus {
  running: boolean;
  text: string;
  report: { showId: string; exportId: string; url: string; filename: string } | null;
}
let dispatch: (a: Action) => void = (a) =>
  bus.postMessage({ kind: "action", action: a });
let lastSeen = 0;
function button(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener("click", fn);
}
function send(type: string, value?: any) {
  dispatch({ type, value });
}
function createPlaybillDownloads(after: Element): HTMLElement {
  const section = document.createElement("section");
  section.id = "playbill-downloads";
  section.setAttribute("aria-label", "Playbill downloads");
  section.hidden = true;
  after.insertAdjacentElement("afterend", section);
  return section;
}
function renderPlaybillDownloads(
  section: HTMLElement,
  playbill: PlaybillExportMetadata | null,
) {
  if (!playbill) {
    section.replaceChildren();
    section.hidden = true;
    delete section.dataset.exportId;
    return;
  }
  // Heartbeats must not replace focused links while someone downloads a page.
  if (section.dataset.exportId === playbill.exportId) return;
  const heading = document.createElement("p");
  heading.className = "eyebrow";
  heading.textContent = "THE NIGHT’S COMPANY / PLAYBILL";
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = `${playbill.castCount} cast members · ${playbill.pages.length} PNG ${playbill.pages.length === 1 ? "page" : "pages"}, 1080 × 1350 each. Download each numbered page once. Keep the stage window open while downloading.`;
  const links = document.createElement("div");
  links.className = "toolbar";
  for (const page of playbill.pages) {
    const link = document.createElement("a");
    link.className = "button-link";
    link.href = page.url;
    link.download = page.filename;
    link.textContent = `Download page ${page.page} of ${page.total}`;
    links.append(link);
  }
  section.replaceChildren(heading, note, links);
  section.dataset.exportId = playbill.exportId;
  section.hidden = false;
}
function ownedPlaybill(value: unknown): PlaybillExportMetadata | null {
  if (!value || typeof value !== "object") return null;
  const playbill = value as Partial<PlaybillExportMetadata>;
  if (
    playbill.showId !== session ||
    typeof playbill.exportId !== "string" || !playbill.exportId ||
    !Number.isSafeInteger(playbill.castCount) || (playbill.castCount ?? -1) < 0 ||
    !Array.isArray(playbill.pages) || playbill.pages.length === 0
  ) return null;
  const total = playbill.pages.length;
  if (!playbill.pages.every((page, index) =>
    page && page.page === index + 1 && page.total === total &&
    page.filename === `khayal-playbill-${index + 1}.png` &&
    typeof page.url === "string" && page.url.startsWith(`blob:${location.origin}/`)
  )) return null;
  return playbill as PlaybillExportMetadata;
}
function createPerformancePanel(controls: boolean): HTMLElement {
  const section = document.createElement("section");
  section.setAttribute("aria-label", "Local performance telemetry");
  section.dataset.controls = String(controls);
  section.innerHTML = `<p class="eyebrow">LOCAL PERFORMANCE / TELEMETRY</p><p class="note" data-performance-status aria-live="polite">No observation recorded.</p>${controls ? '<div class="toolbar"><button id="performance-start">Start 5-minute observation</button><button id="performance-stop" disabled>Stop observation</button></div><p class="note">Keep the stage visible. Source or camera-setting changes invalidate a run. Short runs provide measurements only. OBS and human performance remain unverified.</p>' : ""}<div class="toolbar"><a class="button-link" data-performance-download hidden>Download local telemetry JSON</a></div>`;
  section.hidden = !controls;
  return section;
}
function renderPerformancePanel(section: HTMLElement, status: PerformanceStatus) {
  section.querySelector<HTMLElement>("[data-performance-status]")!.textContent = status.text;
  const link = section.querySelector<HTMLAnchorElement>("[data-performance-download]")!;
  link.hidden = !status.report;
  link.style.display = status.report ? "" : "none";
  if (status.report) {
    link.href = status.report.url;
    link.download = status.report.filename;
  } else link.removeAttribute("href");
  const start = section.querySelector<HTMLButtonElement>("#performance-start");
  const stop = section.querySelector<HTMLButtonElement>("#performance-stop");
  if (start) start.disabled = status.running;
  if (stop) stop.disabled = !status.running;
  if (section.dataset.controls !== "true") section.hidden = !status.report;
}
function ownedPerformance(value: unknown): PerformanceStatus {
  const fallback: PerformanceStatus = { running: false, text: "No observation recorded.", report: null };
  if (!value || typeof value !== "object") return fallback;
  const status = value as Partial<PerformanceStatus>;
  if (typeof status.running !== "boolean" || typeof status.text !== "string") return fallback;
  const report = status.report;
  if (report && (report.showId !== session || typeof report.exportId !== "string" ||
      typeof report.filename !== "string" || !report.filename.startsWith("khayal-performance-") ||
      typeof report.url !== "string" || !report.url.startsWith(`blob:${location.origin}/`))) return fallback;
  return { running: status.running, text: status.text, report: report ?? null };
}
function cueBook() {
  const cooldownInfo = ([
    ["Movement", "movement"],
    ["Summon", "summon"],
    ["Captions", "say"],
    ["Afreet", "afreet"],
  ] as const)
    .map(([label, key]) => {
      const milliseconds = DEFAULT_COOLDOWNS[key];
      return `${label}: ${milliseconds < 1000 ? `${milliseconds} ms` : `${milliseconds / 1000} s`}`;
    })
    .join(" · ");
  root.innerHTML = `<article class="paper"><p class="eyebrow">KHAYAL · DIRECTOR / SESSION CONTROL</p><h1>Behind the moon</h1><p id="connection" class="status">Waiting for the stage…</p><section class="cues"><button class="cue" id="raise"><b>01</b> Open the theatre</button><button class="cue" id="hunt"><b>02</b> Afreet Hunt <small>60 seconds</small></button><button class="cue" id="curtain"><b>04</b> Curtain & playbill</button></section><section><div class="toolbar"><button id="pause">Pause / resume</button><button id="hide">Hide / show captions</button><button id="clear" class="danger">Clear stage</button></div></section><section><p class="eyebrow">THE COMPANY / REHEARSAL</p><form id="command"><input name="viewer" aria-label="Viewer name" value="CairoCat"><input name="command" aria-label="Chat command" placeholder="!cat" value="!cat"><button>Send cue</button></form><div class="toolbar"><button id="simulate">Start / stop company</button><button id="follow">Rehearse follow</button><button id="raid">Rehearse raid</button></div><p class="note">Rehearsal inputs are available only in simulator mode.</p></section><section><details><summary>Settings & connection</summary><p class="note">Per-viewer cooldowns<br>${cooldownInfo}</p><label>Input <select id="source"><option value="sim">Rehearsal simulator</option><option value="live">Live Twitch</option></select></label><label><input type="checkbox" id="steady"> Steady lamp</label><label><input type="checkbox" id="mirror" checked> Mirror silhouette</label><label>Inference <select id="fps"><option>30</option><option>15</option></select> fps</label><label>Processor <select id="delegate"><option>GPU</option><option>CPU</option></select></label><div class="toolbar"><button id="camera">Start / stop camera</button><button id="login">Connect Twitch</button></div><p class="note">Camera permission is granted in the stage window. Reconnect Twitch while the show is stopped.</p></details></section><footer class="note">1 Raise lamp · 2 Hunt · 4 Curtain · Space Pause<br>Come back tomorrow. There is more to see.</footer></article>`;
  const playbillDownloads = createPlaybillDownloads(root.querySelector(".cues")!);
  const companySizeControl = document.createElement("label");
  companySizeControl.innerHTML = `Rehearsal company size <select id="company-size">${COMPANY_SIZES.map((size) => `<option value="${size}"${size === 30 ? " selected" : ""}>${size} simulated viewers</option>`).join("")}</select><small>Changing size clears the stage and queues. Cast credits stay. Simulator evidence only.</small>`;
  document.getElementById("simulate")!.closest(".toolbar")!.insertAdjacentElement("beforebegin", companySizeControl);
  const performancePanel = createPerformancePanel(true);
  root.querySelector("details")!.append(performancePanel);
  button("performance-start", () => send("performance-start"));
  button("performance-stop", () => send("performance-stop"));
  for (const id of [
    "raise",
    "hunt",
    "curtain",
    "pause",
    "hide",
    "clear",
    "simulate",
    "follow",
    "raid",
    "camera",
    "login",
  ])
    button(id, () => send(id));
  for (const id of ["source", "steady", "mirror", "fps", "delegate", "company-size"])
    document.getElementById(id)!.addEventListener("change", (e) => {
      const el = e.target as HTMLInputElement;
      send(id, el.type === "checkbox" ? el.checked : el.value);
    });
  document.getElementById("command")!.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    send("command", { name: f.get("viewer"), text: f.get("command") });
  });
  bus.onmessage = (e) => {
    if (e.data.kind === "status" && e.data.showId === session) {
      const status = e.data as StageStatusMessage;
      lastSeen = performance.now();
      const settings = status.settings;
      if (settings)
        for (const [id, value] of Object.entries(settings)) {
          const input = document.getElementById(id) as HTMLInputElement | null;
          if (input && document.activeElement !== input) {
            if (input.type === "checkbox") input.checked = Boolean(value);
            else input.value = String(value);
          }
        }

      document.getElementById("connection")!.textContent = status.text;
      renderPlaybillDownloads(playbillDownloads, ownedPlaybill(status.playbill));
      for (const el of root.querySelectorAll<HTMLButtonElement>("button"))
        el.disabled = false;
      (document.getElementById("company-size") as HTMLSelectElement).disabled = settings.source !== "sim";
      renderPerformancePanel(performancePanel, ownedPerformance(status.performance));
    }
  };
  setInterval(() => {
    if (performance.now() - lastSeen > 3500) {
      document.getElementById("connection")!.textContent =
        "Stage disconnected. Return to its window.";
      for (const el of root.querySelectorAll<HTMLButtonElement>("button"))
        el.disabled = true;
      renderPlaybillDownloads(playbillDownloads, null);
    }
  }, 1000);
  bus.postMessage({ kind: "hello" });
}
async function stage() {
  root.innerHTML = `<div class="shell"><header class="masthead"><a class="brand" href="/" aria-label="Khayal home">KHAYAL<span lang="ar">خيال</span></a><span class="nav-note">A SHARED SHADOWPLAY</span><a id="cue" class="button-link quiet" href="/cue?show=${encodeURIComponent(session)}" target="khayal-cue">Director’s desk ↗</a></header><section class="hero"><p class="eyebrow">YOUR BODY. CHAT’S PLAYGROUND.</p><h1>Your shadow.<br><em>Their imagination.</em></h1><div class="hero-aside"><p>Step into the picture.<br>Let your community bring it to life.</p><span class="micro">ONE CAMERA · A WHOLE COMPANY</span></div></section><div class="stage-heading"><span id="stage-signal">THEATRE / REHEARSAL</span><span>SUMMON · PLAY · DEFEND THE LIGHT</span></div><div class="stage" id="stage" aria-label="Interactive shadowplay stage"></div><div class="toolbar"><button id="raise" class="primary">Enter the theatre <span>01</span></button><button id="camera">Enable silhouette</button><button id="capture">Focus stage</button><button id="sound" aria-pressed="false">Sound off</button><button id="save-frame">Save frame</button><button id="record">Record stage</button><button id="login" class="quiet">Connect Twitch ↗</button></div><section class="session-footer"><div><span class="micro">A SMALL INVITATION</span><p>Type <code>!cat</code> to arrive.<br><code>!closer</code> to become impossible to ignore.</p></div><p class="note" id="notice">Open the director’s desk for a solo rehearsal.<br>Your camera is processed on this device.</p><div class="closing-mark" lang="ar">خيال</div></section></div>`;
  const d = new Director();
  const playbillDownloads = createPlaybillDownloads(root.querySelector(".toolbar")!);
  const performancePanel = createPerformancePanel(false);
  playbillDownloads.insertAdjacentElement("afterend", performancePanel);
  let observation: PerformanceRecorder | null = null;
  let observationTimer: ReturnType<typeof setTimeout> | undefined;
  let performanceExport: PerformanceStatus["report"] = null;
  let exportedObservation: PerformanceRecorder | null = null;
  function performanceContext(): PerformanceContext {
    return {
      source: d.source,
      delegate: visionSettings.delegate,
      requestedFps: Number(visionSettings.fps),
      mirror: Boolean(visionSettings.mirror),
      camera: d.camera,
      visibility: document.visibilityState,
      phase: d.phase,
      ordinaryActors: d.puppets.length,
      waitingActors: d.queue.length,
      afreets: d.afreets.length,
      waitingAfreets: d.attackQueue.length,
    };
  }
  function syncPerformanceExport() {
    if (!observation?.report || exportedObservation === observation) return;
    clearTimeout(observationTimer);
    const exportId = crypto.randomUUID();
    const payload = { ...observation.report, showId: session, runId: exportId };
    performanceExport = {
      showId: session,
      exportId,
      filename: `khayal-performance-${observation.initialContext.delegate.toLowerCase()}-${exportId}.json`,
      url: URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })),
    };
    exportedObservation = observation;
  }
  function performanceStatus(): PerformanceStatus {
    syncPerformanceExport();
    if (!observation) return { running: false, text: "No observation recorded. OBS unverified.", report: null };
    const progress = observation.progress(performance.now());
    const report = observation.report;
    const metric = (value: number | null | undefined) => value == null ? "unavailable" : value.toFixed(1);
    return {
      running: observation.running,
      text: report
        ? `${report.initialContext.source.toUpperCase()} · ${report.initialContext.delegate} · requested ${report.initialContext.requestedFps} fps · ${(report.durationMs / 1000).toFixed(1)} s. Render ${metric(report.render.averageFps)} fps / p95 ${metric(report.render.p95Ms)} ms. Inference ${metric(report.inference.averageFps)} fps; capture-to-result p95 ${metric(report.captureToOnFrame.p95Ms)} ms. ${report.validity.measurementsUsable ? "Local measurements usable." : `Observation invalid: ${report.validity.issues.join("; ")}.`} ${report.acceptance.fiveMinuteLocalObservation === "recorded" ? "Five-minute local observation recorded." : report.coverage.fullFiveMinutes ? "Five-minute duration reached; observation not qualified." : "Short run; five-minute qualification not established."} OBS unverified; performance targets unassessed.`
        : `Recording local telemetry · ${(progress.durationMs / 1000).toFixed(0)} / ${PERFORMANCE_WINDOW_MS / 1000} s · ${progress.renderSamples} render intervals · ${progress.inferenceResults} inference results. Keep the stage visible. OBS unverified.`,
      report: performanceExport,
    };
  }
  let playbill: PlaybillExportMetadata | null = null;
  const revokePlaybill = () => {
    for (const page of playbill?.pages ?? []) URL.revokeObjectURL(page.url);
    playbill = null;
    renderPlaybillDownloads(playbillDownloads, null);
  };
  window.addEventListener("beforeunload", revokePlaybill);
  const sound = new ShowSound();
  let twitchStatus = "Twitch disconnected";
  let cameraStatus = "Camera off";
  let actionError = "";
  let sim = false;
  let companySize: number = 30;
  let companyCursor = 0;
  let simTimer = 0;
  let channel = "Rehearsal";
  let cameraStop: (() => void) | undefined;
  let swat: ((x: number, y: number, radius?: number) => boolean) | undefined;
  const client = new TwitchClient({
    clientId: import.meta.env.VITE_TWITCH_CLIENT_ID ?? "",
    onStatus: (s) => {
      twitchStatus = s.message;
      d.connection =
        s.state === "connected"
          ? "connected"
          : s.state === "connecting" || s.state === "reconnecting"
            ? "connecting"
            : "offline";
      if (
        ["disconnected", "error", "revoked"].includes(s.state) &&
        d.source === "live" &&
        d.phase === "hunt"
      )
        d.paused = true;
    },
    onIdentity: (i) => {
      channel = i?.login ?? "Rehearsal";
    },
    onEvent: (e) => {
      if (d.source !== "live") return;
      if (e.kind === "chat")
        d.input(
          {
            id: e.userId,
            name: e.displayName,
            login: e.login,
            mod: e.isBroadcaster || e.isModerator,
          },
          e.text,
          e.messageId,
        );
      if (e.kind === "delete") d.deleteCaption(e.messageId);
      if (e.kind === "user-clear") {
        d.removeUser(e.userId);
        d.clearCaptions(e.userId);
      }
      if (e.kind === "chat-clear") d.clearCaptions();
      if (e.kind === "follow" || e.kind === "raid") {
        d.event(e.kind, e.displayName, e.kind === "raid" ? e.viewers : 1);
      }
    },
  });
  const renderer = await createStage(document.getElementById("stage")!, d);
  let actionQueue = Promise.resolve();
  dispatch = (a) => {
    actionQueue = actionQueue.then(() => perform(a));
  };
  const perform = async (a: Action) => {
    try {
      actionError = "";
      if (a.type === "performance-start" && !observation?.running) {
        if (performanceExport) URL.revokeObjectURL(performanceExport.url);
        performanceExport = null;
        exportedObservation = null;
        clearTimeout(observationTimer);
        const current = new PerformanceRecorder(performance.now(), new Date().toISOString(), performanceContext());
        observation = current;
        observationTimer = setTimeout(() => {
          if (observation !== current) return;
          current.stop(performance.now(), "max-duration");
          publish();
        }, PERFORMANCE_WINDOW_MS);
        publish();
      }
      if (a.type === "performance-stop" && observation?.running) {
        observation.stop(performance.now());
        publish();
      }
      if (a.type === "raise") {
        d.raised = true;
        d.curtain = false;
        d.paused = false;
        d.phase = "free";
      }
      if (a.type === "hunt") {
        if (d.source === "live" && !d.camera)
          throw new Error("Start the camera before a live hunt.");
        d.hunt();
        d.curtain = false;
      }
      if (a.type === "pause") d.paused = !d.paused;
      if (a.type === "clear") d.clear();
      if (a.type === "hide") d.captions = !d.captions;
      if (a.type === "steady") d.steady = a.value;
      if (a.type === "source") {
        if (a.value === "live" && d.connection !== "connected")
          throw new Error("Connect Twitch before switching to live input.");
        if (recording?.state === "recording") recording.stop();
        d.clear();
        d.source = a.value;
        d.cast.clear();
        sim = false;
        companyCursor = 0;
        simTimer = 0;
      }
      if (a.type === "company-size") {
        if (d.source !== "sim") throw new Error("Company size is available only in rehearsal simulator mode.");
        const size = typeof a.value === "string" || typeof a.value === "number" ? Number(a.value) : NaN;
        if (!COMPANY_SIZES.some((allowed) => allowed === size)) throw new Error("Choose 12, 24, 30 or 50 simulated viewers.");
        if (size !== companySize) {
          companySize = size;
          companyCursor = 0;
          simTimer = 0;
          d.clear();
        }
        publish();
      }
      if (a.type === "simulate" && d.source === "sim") {
        sim = !sim;
        if (sim) {
          companyCursor = 0;
          simTimer = 0;
        }
        publish();
      }
      if (a.type === "command" && d.source === "sim")
        d.input(
          { id: "sim-" + a.value.name, name: String(a.value.name) },
          String(a.value.text),
        );
      if ((a.type === "follow" || a.type === "raid") && d.source === "sim")
        d.event(
          a.type,
          a.type === "raid" ? "NileCompany" : "LanternKeeper",
          a.type === "raid" ? 42 : 1,
        );
      if (a.type === "curtain") {
        d.clear();
        d.curtain = true;
        d.raised = false;
        const names = [...d.cast.values()];
        const pages = await exportPlaybill(
          names,
          d.source === "sim" ? "Rehearsal · simulated cast" : channel,
        );
        revokePlaybill();
        playbill = {
          showId: session,
          exportId: crypto.randomUUID(),
          castCount: names.length,
          pages,
        };
        renderPlaybillDownloads(playbillDownloads, playbill);
        publish();
      }
      if (a.type === "login") {
        if (d.raised) {
          d.raised = false;
          d.paused = true;
        }
        client.authorize();
      }
      if (a.type === "camera") {
        if (cameraStop) {
          cameraStop();
          cameraStop = undefined;
          cameraStatus = "Camera off";
          d.camera = false;
          swat = undefined;
          if (d.phase === "hunt") d.paused = true;
        } else {
          cameraStatus = "Camera initializing";
          await startVision();
        }
      }
      if (["fps", "delegate", "mirror"].includes(a.type)) {
        visionSettings[a.type] = a.value;
        observation?.observeContext(performance.now(), performanceContext());
        if (cameraStop) {
          cameraStop();
          cameraStop = undefined;
          await startVision();
        }
      }
      observation?.observeContext(performance.now(), performanceContext());
    } catch (e) {
      actionError = e instanceof Error ? e.message : String(e);
      if (["camera", "fps", "delegate", "mirror"].includes(a.type))
        cameraStatus = "Camera error: " + actionError;
      document.getElementById("notice")!.textContent = actionError;
      publish();
    }
  };
  const visionSettings: Record<string, any> = {
    fps: 30,
    delegate: "GPU",
    mirror: true,
  };
  async function startVision() {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 144;
    const ctx = canvas.getContext("2d")!;
    const texture = Texture.from(canvas);
    const shadow = new Sprite(texture);
    shadow.tint = 0xdaf0ef;
    shadow.alpha = 0.55;
    shadow.position.set(160, 90);
    shadow.width = 1600;
    shadow.height = 900;
    renderer.app.stage.addChildAt(shadow, 1);
    const controller = new VisionController({
      mirror: visionSettings.mirror,
      fps: Number(visionSettings.fps) as 15 | 30,
      delegate: visionSettings.delegate,
      onStatus: (s) => {
        cameraStatus = "Camera " + s;
      },
      onError: (e) => {
        cameraStatus = e.message;
        shadow.visible = false;
        d.camera = false;
        if (d.phase === "hunt") d.paused = true;
      },
      onFrame: (f) => {
        observation?.inference(performance.now(), f.timestamp, f.inferenceMs);
        shadow.visible = true;
        ctx.putImageData(
          new ImageData(new Uint8ClampedArray(f.rgba), f.width, f.height),
          0,
          0,
        );
        texture.source.update();
      },
    });
    cameraStop = () => {
      clearInterval(freshness);
      controller.stop();
      shadow.destroy();
      texture.destroy(true);
      video.remove();
    };
    const freshness = setInterval(() => {
      shadow.visible = !!controller.currentFrame;
      if (!controller.currentFrame && d.phase === "hunt") d.paused = true;
    }, 100);
    try {
      await controller.start(video);
      d.camera = true;
      swat = (x, y, radius = 45) => {
        const frame = controller.currentFrame;
        return (
          !!frame &&
          circleIntersectsMask(
            frame,
            {
              x: (x - 160) / 1600,
              y: (y - 90) / 900,
              radiusX: radius / 1600,
              radiusY: (radius * 1.2) / 900,
            },
            performance.now(),
            "motion",
          )
        );
      };
    } catch (e) {
      cameraStop();
      cameraStop = undefined;
      throw e;
    }
  }
  for (const id of ["raise", "camera", "login"]) button(id, () => send(id));
  function download(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  button("save-frame", () => {
    renderer.render();
    (renderer.app.canvas as HTMLCanvasElement).toBlob((b) => {
      if (b) download(b, `khayal-${d.source}-${Date.now()}.png`);
    }, "image/png");
  });
  let recording: MediaRecorder | undefined;
  button("record", () => {
    if (recording?.state === "recording") {
      recording.stop();
      return;
    }
    try {
      const canvas = renderer.app.canvas as HTMLCanvasElement;
      const stream = canvas.captureStream(30);
      const mime = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime)
        throw new Error(
          "Stage recording is unavailable in this browser. Use OBS window capture.",
        );
      const chunks: BlobPart[] = [];
      recording = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 4500000,
      });
      recording.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const recordingSource = d.source;
      recording.onstop = () => {
        download(
          new Blob(chunks, { type: mime }),
          `khayal-${recordingSource}-${Date.now()}.${mime.includes("mp4") ? "mp4" : "webm"}`,
        );
        stream.getTracks().forEach((t) => t.stop());
        document.getElementById("record")!.textContent = "Record stage";
      };
      recording.start(1000);
      document.getElementById("record")!.textContent = "Stop recording";
      const currentRecording = recording;
      setTimeout(() => {
        if (currentRecording.state === "recording") currentRecording.stop();
      }, 180000);
    } catch (e) {
      document.getElementById("notice")!.textContent = String(e);
    }
  });
  button("sound", () => {
    void sound
      .toggle()
      .then((on) => {
        const el = document.getElementById("sound")!;
        el.textContent = on ? "Sound on" : "Sound off";
        el.setAttribute("aria-pressed", String(on));
      })
      .catch((e) => {
        document.getElementById("notice")!.textContent = String(e);
      });
  });
  button("capture", () => {
    document.body.classList.toggle("capture");
  });
  bus.onmessage = (e) => {
    if (e.data.kind === "action") dispatch(e.data.action);
    if (e.data.kind === "hello") publish();
  };
  function publish() {
    document.getElementById("stage-signal")!.textContent =
      `THEATRE / ${d.source === "sim" ? "REHEARSAL" : channel.toUpperCase()}`;
    const m = renderer.metrics();
    const status: StageStatusMessage = {
      kind: "status",
      showId: session,
      settings: { source: d.source, steady: d.steady, "company-size": companySize, ...visionSettings },
      text: `${d.source === "sim" ? "REHEARSAL" : channel} · ${d.phase === "hunt" ? d.afreets.length : d.puppets.length} on stage / ${d.phase === "hunt" ? d.attackQueue.length : d.queue.length} waiting · ${m.fps.toFixed(0)} fps\n${twitchStatus} · ${cameraStatus}${d.paused ? " · PAUSED" : ""}${actionError ? "\nControl: " + actionError : ""}`,
      playbill,
      performance: performanceStatus(),
    };
    renderPerformancePanel(performancePanel, status.performance);
    bus.postMessage(status);
  }
  document.addEventListener("visibilitychange", () => {
    observation?.visibility(performance.now(), document.visibilityState);
    publish();
  });
  setInterval(publish, 1000);
  let last = performance.now();
  let previousSwats = 0,
    previousLights = 5,
    previousActors = 0,
    previousPhase = d.phase;
  let previousCeremony = d.ceremony;
  function frame() {
    if (
      d.source === "live" &&
      (d.connection !== "connected" || !d.camera) &&
      (d.phase === "hunt" || d.phase === "countdown")
    )
      d.paused = true;
    const now = performance.now(),
      elapsed = Math.max(0, (now - last) / 1000),
      dt = Math.min(0.05, elapsed);
    observation?.render(now, performanceContext());
    if (observation?.report && exportedObservation !== observation) publish();
    last = now;
    if (sim && d.source === "sim") {
      // Round-robin visits prevent random starvation. Even the largest company
      // refreshes every 17.5 seconds; catch-up work is capped to one full cycle.
      simTimer = Math.min(simTimer + elapsed, COMPANY_STEP_SECONDS * companySize);
      while (simTimer >= COMPANY_STEP_SECONDS) {
        simTimer -= COMPANY_STEP_SECONDS;
        const i = companyCursor;
        companyCursor = (companyCursor + 1) % companySize;
        const viewer = {
          id: "company-" + i,
          name: ["Nour", "Mariam", "Omar", "سلمى", "حسن"][i % 5] + " " + i,
        };
        d.input(
          viewer,
          d.phase === "hunt"
            ? "!afreet"
            : ["!cat", "!camel", "!goha", "!boat", "!croc"][i % 5],
        );
        if ((d.phase === "free" || d.phase === "result") && Math.random() < 0.35)
          d.input(viewer, ["!jump", "!left", "!right"][Math.floor(Math.random() * 3)]);
      }
    }
    d.tick(dt, swat);
    if (d.swats > previousSwats) sound.cue("swat");
    const lights = d.lanterns.filter(Boolean).length;
    if (lights < previousLights) sound.cue("out");
    if (d.puppets.length > previousActors) sound.cue("enter");
    if (d.phase === "hunt" && previousPhase !== "hunt") sound.cue("hunt");
    if (d.ceremony && d.ceremony !== previousCeremony) sound.cue("ceremony");
    previousSwats = d.swats;
    previousLights = lights;
    previousActors = d.puppets.length;
    previousPhase = d.phase;
    previousCeremony = d.ceremony;
    renderer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setInterval(
    () =>
      sessionStorage.setItem(
        "khayal-cast-" + session,
        JSON.stringify({ source: d.source, names: [...d.cast] }),
      ),
    5000,
  );
  const saved = sessionStorage.getItem("khayal-cast-" + session);
  if (saved)
    try {
      const data = JSON.parse(saved);
      if (data.source === d.source) d.cast = new Map(data.names);
    } catch {}
  await client.connect();
  if (client.identity) {
    d.source = "live";
    d.cast.clear();
  }
  window.addEventListener("beforeunload", () => {
    clearTimeout(observationTimer);
    observation?.stop(performance.now(), "page-unload");
    if (performanceExport) URL.revokeObjectURL(performanceExport.url);
    sound.dispose();
    client.dispose();
    cameraStop?.();
    bus.close();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === " " && (e.target as HTMLElement).closest("button,a,summary"))
    return;
  if (e.key === "Escape") document.body.classList.remove("capture");
  if ((e.target as HTMLElement).matches("input,textarea,select")) return;
  const action: Record<string, string> = {
    "1": "raise",
    "2": "hunt",
    "4": "curtain",
    " ": "pause",
  };
  if (action[e.key]) {
    e.preventDefault();
    send(action[e.key]);
  }
});
if (cue) cueBook();
else
  navigator.locks.request(
    "khayal-active-stage",
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        scrubOAuthCallbackUrl();
        root.innerHTML =
          '<article class="paper"><h1>The theatre is already open.</h1><p>Return to the existing stage window.</p></article>';
        return;
      }
      try {
        await stage();
        await new Promise(() => {});
      } catch (e) {
        root.textContent = "Unable to open Khayal: " + String(e);
      }
    },
  );
