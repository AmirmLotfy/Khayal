# Khayal

**Local draft, 27 October 2026. Nothing has been sent to Devpost.** This is editorial copy updated after the cyanotype redesign. Original vector art, promotional cover, native engine previews and a captioned review cut are prepared. The supplied owner voice is integrated into a 114-second local review. Genuine camera/Twitch/Codex footage, final video link and authenticated form fields remain pending.

## Tagline

Chat sends the spirits. Your shadow guards the light.

## Inspiration

We wanted the streamer's body and the audience's choices to share one stage. Khayal takes its starting point from Egyptian shadow theatre: a lamp, a screen, and figures brought to life through performance. [Philip Worthington's Shadow Monsters](https://www.acmi.net.au/works/114487--shadow-monsters/) is a visual-interaction inspiration. Our interpretation gives chat its own puppets and places the performer inside a timed lantern-defense game.

## What it does

Khayal is a local shadow theatre built for Twitch. Viewers summon a cat, camel or another character, then steer their puppet through chat commands. Moving toward the lamp makes its shadow larger and softer. Each viewer owns one puppet; the stage admits 24, with a waiting queue.

Afreet Hunt is the central game: chat sends spirits toward five lanterns during a 60-second round, while the streamer defends them using movement along their camera silhouette. Saving at least three lanterns wins. A separate cue book directs the performance, and a curtain call exports a playbill crediting the cast.

The implementation also contains follow and raid ceremonies and a clearly separated rehearsal source. These event paths still require actual Twitch qualification; rehearsal footage will be labeled.

## How we built it with Codex

The owner directed the concept, interaction and visual constraints. Codex implemented the TypeScript app with PixiJS, command parsing, cooldowns, cast/queue state, cue-book communication, OAuth/EventSub connection code and a MediaPipe camera worker. The stage owns the show and camera; the separate cue book sends local control actions. Camera inference uses bounded frame delivery, and stale camera input pauses Hunt.

The command path sanitizes plain-text captions, enforces viewer ownership and reads moderator authority from Twitch IDs and badges. OAuth tokens stay in memory. The app has no backend or camera-upload endpoint. This is implementation description, not a claim of device or provider acceptance.

Following a new art direction, Codex authored original cut-paper species paths and a moonlit cyanotype stage shared by Pixi and native vector exports. An owner-authorized OpenAI-generated 3:2 cover is promotional illustration, not gameplay evidence. The app uses original quiet synthesized cues; the owner supplies the narration. A Blender exporter exists as an optional tool, but no Meshy generation or completed Blender production run is claimed.

## Challenges and what we learned

Silhouette motion must be fair as well as responsive. Segmentation sees changes around an outline; it cannot reliably interpret a hand moving entirely inside a torso silhouette. The game therefore needs real physical-swat, static-overlap and camera-loss testing. Source tests cannot answer those questions.

Another challenge is keeping the public performance readable while the operator manages the show. The cue book gives controls their own window, and a labeled simulator permits solo rehearsal without suggesting that simulated viewers are a real audience.

## What we are proud of

A coherent performance loop: chat owns the figures, the streamer guards the light, and the cast receives a playbill. The command, moderation, queue and camera systems are connected in the local implementation. The current source passes 30 automated tests and the TypeScript/production build. These checks establish source behavior only; browser, Twitch, camera, OBS and human acceptance remain separate.

## What's next

Complete real camera and Twitch acceptance, measure OBS performance, finish the genuine demonstration edit using the supplied owner voice. Optional modes stay outside this baseline. No user numbers, event deliveries, fairness scores or performance claims are invented.

## Testing instructions draft

Use the repository README for exact setup. Start the local app on its fixed localhost origin, open the cue book, raise the lamp and choose the clearly labeled simulator for rehearsal. Try `!cat`, `!closer`, `!left` and `!say hello`; inspect depth changes and cast ownership. Use a real permitted camera and a dedicated Twitch application only for the separate live route. Configuration and credentials stay local. Rehearsal cannot prove real Twitch behavior.

## Fields to finalize after authenticated form inspection

- Code repository URL: **https://github.com/AmirmLotfy/Khayal** (public source preview).
- YouTube demo URL: **pending genuine captures, final listening review and approved upload**.
- Primary Codex session ID: **01a17eb7-e4d9-7453-9053-6b3eab7a4153**, verified from the active build runtime’s matching session/thread IDs.
- Public hosted app URL: **none claimed; local application**. Only supply this if an actual form requires it and an approved route exists.
- Built with: TypeScript, Vite, PixiJS, MediaPipe, Twitch EventSub, Vitest, Codex. Add Blender or Meshy to the public list only with actual usage/artifact evidence appropriate to the claim.
- Gallery and video: follow `storyboard.md`; attach only existing reviewed assets.
- Personal eligibility, rights and terms: **owner confirmation pending**.

For current official requirements and related winners, see `research.md`. This file is a paste-ready working draft, not a completed entry or a claim that the footage exists.
