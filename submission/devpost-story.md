## Inspiration

A lamp, a screen, and a company of people can turn shadows into a shared performance. Khayal brings that invitation to Twitch: chat takes the puppets, and the streamer steps inside the picture.

Its moonlit cyanotype theatre uses open midnight-blue space, pale original cut-paper figures and amber lanterns. The central interaction is physical: the streamer's changing camera outline can defend the lights against chat-launched spirits.

## What it does

Viewers summon and own a puppet with commands such as `!cat` or `!camel`, move and jump, change its projected depth, and add a short caption. One puppet belongs to each viewer; a bounded queue and rotating turns keep a crowded stage manageable.

Afreet Hunt gives the streamer sixty seconds to protect five lanterns. Chat launches spirits and can dodge vertically. Keeping at least three lanterns lit wins the round. The detector looks for confident overlap and a changing silhouette boundary; a stationary outline should not count as a swat.

A separate cue book controls the show, camera, source, moderation and numbered cues. Follows and raids have folklore ceremonies, and the curtain exports a paginated playbill. Rehearsal remains visibly separate from Twitch input.

## How it was built with Codex

The concept and build were directed through Codex. Codex implemented and refined the TypeScript command parser and director, PixiJS stage, separate cue-book connection, Twitch OAuth/EventSub lifecycle, MediaPipe worker, playbill export, tests and submission tooling.

Vite serves the app locally. The stage owns authoritative show state, Twitch and the camera; the cue book sends commands over a per-show BroadcastChannel. PixiJS renders shared original vector art. A dedicated MediaPipe worker creates the camera mask and collision grid from the same crop and mirror transform. Camera frames are processed locally; the app has no camera-upload endpoint. OAuth access tokens stay in memory, and no client secret is needed in the browser.

## Challenges and lessons

The difficult part is making a shared performance reliable: fair turns, stale camera masks, reconnects, caption moderation, and clear source labels all matter. Actual browser testing also exposed Arabic letter tracking that broke joining, and an unreliable popup path for the cue book; both were corrected.

Video verification found that a combined audio/video encoding path could lose spoken sections. The replacement prepares a continuous PCM narration bed, checks its sample count and delay, and encodes audio separately. Readable captions need both speech alignment and checks of the final encoded frames.

## What works today

A dedicated Khayal Theatre Twitch application is connected. An actual camera and Twitch chat test received `!cat`, `!closer`, `!jump` and `!afreet`; the recorded hunt registered one silhouette hit and finished with all five lights lit. The commands were operated by the agent as the broadcaster, not by an invented audience. The gallery uses actual captures in labeled presentation frames; its separate promotional cover is an illustration.

Automated checks cover command ownership, moderator checks, Unicode captions, cooldowns, queue fairness, mask freshness, Hunt timing and Twitch lifecycle behavior. These checks do not replace human or provider acceptance.

## What's next

The entry remains in preparation. A multi-viewer performance, real follow and raid qualification, the deliberate-swat accuracy study, sustained OBS measurements, full listening review and the final public video remain open. The finished demonstration will preserve the distinction between real Twitch interaction, rehearsals and editorial explanations.

## Try it

Source and local setup: [github.com/AmirmLotfy/Khayal](https://github.com/AmirmLotfy/Khayal). Run on `http://localhost:5173/`; the setup guide explains the dedicated Twitch app and self-hosted vision assets.
