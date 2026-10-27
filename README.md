# Khayal · خيال

A local shadow theatre for Twitch: chat holds the puppets, the streamer guards the light.

## Run

Requires Node22.12+ and current desktop Chrome. `npm ci`, `npm run assets:vision`, `npm run dev`. Open http://localhost:5173/ then **Open cue book**. Production: `npm run build`, `npm start`. Only one server can occupy5173; startup fails rather than changing the OAuth origin.

Raise the lamp, start the simulator company, and try `!cat`, `!camel`, `!goha`, `!boat`, `!croc`, `!left`, `!right`, `!jump`, `!closer`, `!far`, `!say hello`. Start Afreet Hunt; viewers launch `!afreet` and dodge with `!up`/`!down`. Mods use `!khayal pause`, `!khayal clear`, `!khayal ban @login`. Bans affect this stage only. Keyboard1/2/4 runs raise/hunt/curtain; Space pauses. Caption export may prompt Chrome to permit multiple PNG downloads for casts larger than48.

## Twitch

Register a dedicated application named Khayal Theatre, category Game Integration, Confidential client type for implicit OAuth, redirect **http://localhost:5173/**. Copy `.env.example` to `.env.local` and set `VITE_TWITCH_CLIENT_ID` to its public client ID. Restart the server. No client secret belongs in the app or env file. Connect Twitch while the show is stopped and authorize your own broadcaster account. Required scopes: `user:read:chat moderator:read:followers`. Tokens remain in memory, are validated hourly, and need reauthorization after reload/expiry. All frontend environment variables are public.

Simulator and live inputs are distinct; switching source clears stage/cast state. Rehearsal controls do not inject events into live mode. Follow/raid delivery still needs real-event verification. A dedicated app has **not yet been created**: internal-browser control is disabled in Work settings.

## Camera and capture

Start camera from cue book or stage and grant video permission in the stage window. No microphone is requested. Keep arms away from the torso outline when swatting: segmentation detects a changing silhouette, not internal hand motion. Camera/model failure pauses the hunt. Choose15/30fps and GPU/CPU in Settings. The worker and model are served locally; the fetch command records source URLs and hashes. No camera upload endpoint exists.

Use Chrome window capture in OBS, with a1920×1080/60 output. Capture view hides setup chrome; press the browser reload or leave capture mode via Escape to return to controls. Keep the stage window visible. If OBS holds the webcam, use a camera-only OBS Virtual Camera. OBS installation and device/recording acceptance remain pending.

## Evidence and limits

This build uses original code-drawn development silhouettes and procedural cloth/frame placeholders. Meshy models, photographed linen/khayamiya/wordmark, user sound recordings are **pending**. The four specified font families and their OFL notices are served locally. It is not the final art pipeline result. No generated concept art or video is used.

`npm test` tests parser, moderation ownership, queue/clock and mask behavior. `npm run build` checks TypeScript and produces the static app. Neither establishes browser rendering, actual camera latency, human swat fairness, real Twitch events or OBS performance. See CURRENT_HANDOFF.md and docs/hackathon-build/checklist.md for current gates.

## License

Application code: MIT. MediaPipe runtime: Apache2.0 (see dependency notices); downloaded model provenance is in public/assets/vision/manifest.json. Generated/final assets require their individual license and attribution records before public release. Do not publish recordings or participant names without their permission.
