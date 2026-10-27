import "./style.css";
import { Director } from "./show/director";
import { createStage } from "./stage/render";
import { exportPlaybill } from "./playbill/export";
import { TwitchClient } from "./twitch/client";
import { VisionController, circleIntersectsMask } from "./vision";
import { Sprite, Texture } from "pixi.js";
const root = document.querySelector<HTMLElement>("#app")!;
const cue = location.pathname === "/cue";
const session =
  new URLSearchParams(location.search).get("show") ??
  sessionStorage.getItem("khayal-show") ??
  crypto.randomUUID();
sessionStorage.setItem("khayal-show", session);
const bus = new BroadcastChannel("khayal-" + session);
type Action = { type: string; value?: any };
let dispatch: (a: Action) => void = (a) =>
  bus.postMessage({ kind: "action", action: a });
let lastSeen = 0;
function button(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener("click", fn);
}
function send(type: string, value?: any) {
  dispatch({ type, value });
}
function cueBook() {
  root.innerHTML = `<article class="paper"><p class="eyebrow">KHAYAL · THE KEEPER’S CUE BOOK</p><h1>Tonight’s performance</h1><p id="connection" class="status">Waiting for the stage…</p><section class="cues"><button class="cue" id="raise"><b>01</b> Raise the lamp</button><button class="cue" id="hunt"><b>02</b> Afreet Hunt <small>60 seconds</small></button><button class="cue" id="curtain"><b>04</b> Curtain & playbill</button></section><section><div class="toolbar"><button id="pause">Pause / resume</button><button id="hide">Hide / show captions</button><button id="clear" class="danger">Clear stage</button></div></section><section><p class="eyebrow">REHEARSAL DESK</p><form id="command"><input name="viewer" aria-label="Viewer name" value="CairoCat"><input name="command" aria-label="Chat command" placeholder="!cat" value="!cat"><button>Send cue</button></form><div class="toolbar"><button id="simulate">Start / stop company</button><button id="follow">Rehearse follow</button><button id="raid">Rehearse raid</button></div><p class="note" style="color:#9C2E1F">Rehearsal inputs are available only in simulator mode.</p></section><section><details><summary>Settings & connection</summary><label>Input <select id="source"><option value="sim">Rehearsal simulator</option><option value="live">Live Twitch</option></select></label><label><input type="checkbox" id="steady"> Steady lamp</label><label><input type="checkbox" id="mirror" checked> Mirror silhouette</label><label>Inference <select id="fps"><option>30</option><option>15</option></select> fps</label><label>Processor <select id="delegate"><option>GPU</option><option>CPU</option></select></label><div class="toolbar"><button id="camera">Start / stop camera</button><button id="login">Connect Twitch</button></div><p class="note" style="color:#17110D">Camera permission is granted in the stage window. Reconnect Twitch while the show is stopped.</p></details></section><footer class="note" style="color:#17110D">1 Raise lamp · 2 Hunt · 4 Curtain · Space Pause<br>Come back tomorrow. There is more to see.</footer></article>`;
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
  for (const id of ["source", "steady", "mirror", "fps", "delegate"])
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
    if (e.data.kind === "status") {
      lastSeen = performance.now();
      document.getElementById("connection")!.textContent = e.data.text;
      for (const el of root.querySelectorAll<HTMLButtonElement>("button"))
        el.disabled = false;
    }
  };
  setInterval(() => {
    if (performance.now() - lastSeen > 3500) {
      document.getElementById("connection")!.textContent =
        "Stage disconnected. Return to its window.";
      for (const el of root.querySelectorAll<HTMLButtonElement>("button"))
        el.disabled = true;
    }
  }, 1000);
  bus.postMessage({ kind: "hello" });
}
async function stage() {
  root.innerHTML = `<div class="shell"><header class="masthead"><h1 class="brand">خيال <span>KHAYAL · SHADOW THEATRE</span></h1><button id="cue">Open cue book ↗</button></header><div class="stage" id="stage"></div><div class="toolbar"><button id="raise">Raise the lamp</button><button id="camera">Start camera</button><button id="capture">Capture view</button><button id="login">Connect Twitch</button></div><p class="note" id="notice">A theatre for your community. Open the cue book to summon the company.<br>Development artwork · photographed materials and finished Meshy cast pending.</p></div>`;
  const d = new Director();
  let twitchStatus = "Twitch disconnected";
  let cameraStatus = "Camera off";
  let sim = false;
  let channel = "Rehearsal";
  let cameraStop: (() => void) | undefined;
  let swat: ((x: number, y: number) => boolean) | undefined;
  const client = new TwitchClient({
    clientId: import.meta.env.VITE_TWITCH_CLIENT_ID ?? "",
    onStatus: (s) => {
      twitchStatus = s.message;
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
      if (e.kind === "follow" || e.kind === "raid")
        d.event(e.kind, e.displayName, e.kind === "raid" ? e.viewers : 1);
    },
  });
  const renderer = await createStage(document.getElementById("stage")!, d);
  let actionQueue = Promise.resolve();
  dispatch = (a) => {
    actionQueue = actionQueue.then(() => perform(a));
  };
  const perform = async (a: Action) => {
    try {
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
        d.clear();
        d.source = a.value;
        d.cast.clear();
        sim = false;
      }
      if (a.type === "simulate" && d.source === "sim") sim = !sim;
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
        await exportPlaybill([...d.cast.values()], channel);
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
        if (cameraStop) {
          cameraStop();
          cameraStop = undefined;
          await startVision();
        }
      }
    } catch (e) {
      cameraStatus = String(e);
      document.getElementById("notice")!.textContent = String(e);
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
    shadow.tint = 0x17110d;
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
      swat = (x, y) => {
        const frame = controller.currentFrame;
        return (
          !!frame &&
          circleIntersectsMask(
            frame,
            {
              x: (x - 160) / 1600,
              y: (y - 90) / 900,
              radiusX: 45 / 1600,
              radiusY: 55 / 900,
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
  button("cue", () => {
    const w = window.open(
      "/cue?show=" + encodeURIComponent(session),
      "khayal-cue",
      "width=850,height=950",
    );
    if (!w)
      document.getElementById("notice")!.textContent =
        "Allow the cue-book window, then open it again.";
  });
  button("capture", () => {
    document.body.classList.toggle("capture");
  });
  bus.onmessage = (e) => {
    if (e.data.kind === "action") dispatch(e.data.action);
    if (e.data.kind === "hello") publish();
  };
  function publish() {
    const m = renderer.metrics();
    bus.postMessage({
      kind: "status",
      text: `${d.source === "sim" ? "REHEARSAL" : channel} · ${d.phase === "hunt" ? d.afreets.length : d.puppets.length} on stage / ${d.phase === "hunt" ? d.attackQueue.length : d.queue.length} waiting · ${m.fps.toFixed(0)} fps\n${twitchStatus} · ${cameraStatus}${d.paused ? " · PAUSED" : ""}`,
    });
  }
  setInterval(publish, 1000);
  let simTimer = 0,
    last = performance.now();
  function frame() {
    const now = performance.now(),
      dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (sim && d.source === "sim") {
      simTimer += dt;
      if (simTimer > 0.35) {
        simTimer = 0;
        const i = Math.floor(Math.random() * 30);
        d.input(
          {
            id: "company-" + i,
            name: ["Nour", "Mariam", "Omar", "سلمى", "حسن"][i % 5] + " " + i,
          },
          d.phase === "hunt"
            ? "!afreet"
            : Math.random() < 0.35
              ? "!jump"
              : ["!cat", "!camel", "!goha", "!boat", "!croc"][i % 5],
        );
      }
    }
    d.tick(dt, swat);
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
    client.dispose();
    cameraStop?.();
    bus.close();
  });
}
document.addEventListener("keydown", (e) => {
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
