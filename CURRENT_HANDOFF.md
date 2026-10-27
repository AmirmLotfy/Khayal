# Khayal current handoff

## Checkout and ownership

cwd: /Users/frameless/Desktop/Khayal
Branch: main
Verified implementation HEAD: 7ecc276dab3654bf2273c54ef17110a5e3c0d620
This document is updated in a following documentation commit; inspect git log for the final documentation HEAD. Implementation files were clean at the recorded HEAD. Coordinator owns current milestone; two specialists finished Twitch/vision assignments. No further agent work pending.

## Implemented

Vite8/TypeScript/PixiJS8.22/MediaPipe0.10.35/Vitest5 local app. Stage owner lock, separate cue book with heartbeat and serialized commands, simulator/live separation, shared parser and cooldowns,24puppets/300FIFO, show moderation and deletion handling,60sHunt/5lanterns, bounded ceremonies, curtain and paginated PNG playbill. Webcam worker returns display+motion masks, latest-frame backpressure, CPU/GPU and15/30fps settings; stale/lost camera hides shadow and pauses Hunt. Live Hunt requires camera startup.

Twitch OAuth/EventSub code and unit fixtures present; dedicated application still NOT created. Public clientID must go in ignored .env.local (only VITE_TWITCH_CLIENT_ID; never clientsecret). Exact redirect http://localhost:5173/. GameIntegration/Confidential for implicit flow. No token persisted.

Four font families/OFL notices and matching camera runtime/model are local with provenance manifests. Original code-drawn puppets/proceduralcloth remain temporary. Blender exporter and runtime authored-layer loader are ready for actual geometry, with honest singlebody fallback when no named parts exist.

## Checks and evidence boundaries

Latest source checks:29/29tests across4files PASS; TypeScript+production build PASS. Vision hashes/signatures PASS. Seven HTTP route/asset probes returned200 with WASM application/wasm. Python exporter --help PASS; actual Blender rendering NOT exercised. Vendor whitespace is preserved verbatim and excluded from whitespace checking so integrity hashes remain valid.

No rendered browser, camera permission/device, physical swat, OBS, live Twitch chat/follow/raid or human fairness acceptance exists. No performance target has been measured. Clean-checkout reinstall is pending. No Meshy credits spent; no remote GitHub, YouTube or Devpost publication/submission performed. See docs/validation.json and docs/hackathon-build/checklist.md.

## Blockers and constraints

Internal browser tool now returns: Local browser use is disabled in Work settings. The earlier signed-in Twitch creation page could be inspected during planning; implementation action could not proceed. Treat as current session tooling/settings limitation; do not repeat unchanged creation attempts or blame the user. App panel opening of localhost returned queued, so this is not rendered evidence.

Devpost connector previously required reauthentication; registration status unknown. Owner supplies photos of linen/khayamiya/wordmark, percussion/voice, live performance, actual participants and username permissions. Only owner can confirm personal eligibility/terms.

Disk recently2.2GiB free (implementation began2.5GiB). Keep2GiB reserve; no unrelated cleanup. Defer OBS installation, fresh dependency duplication, model batch and recordings until space admission succeeds.

## Authorized next steps

1. Restore usable browser control and inspect http://localhost:5173/; open cue book from stage, test simulator/capture/Arabic/playbill, then real camera permission/loss and swats. Fix actual failures and rerun relevant checks.
2. Create dedicated Khayal Theatre Twitch app through internal browser (do not modify existing Aragoz app), configure publicclientID, validate real chat/follow/raid.
3. Once working camera/Hunt core is accepted, generate camel/cat Meshy6 pilot, then remaining assets within240creditcap/12calls total; record all prompts/tasks/costs/licenses. Do not start ungated generations. Prepare named parts and pivots before Blender export; integrate reviewed kind IDs into public/assets/cast/index.json.
4. Integrate human material/audio; perform OBS and human fairness gates; then final filmed demo/publicGitHub/publicYouTube and Devpost entry. docs/SUBMISSION_DRAFT.md and docs/DEMO_SHOTLIST.md are preparation, not completed evidence.

## Task-owned processes

Vite dev server intentionally running for user review: http://localhost:5173/; PID60197, exec session27438. Verify PID/cwd/listener before stopping. Tests/builds/downloads completed; no generation/render/recording job active. Preserve all unrelated processes.
