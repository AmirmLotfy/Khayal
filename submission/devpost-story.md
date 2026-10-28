## Inspiration

A lamp, a screen and a company of people can turn shadows into a shared performance. Khayal brings Egyptian shadow theatre to Twitch: chat holds the puppets, and the streamer steps inside the picture to guard the light.

The moonlit cyanotype stage uses open midnight-blue space, pale original cut-paper figures and amber lanterns. Body-driven lantern defense is the central interaction. Silhouette-play installations such as [Shadow Monsters](https://www.acmi.net.au/works/114487--shadow-monsters/) are credited inspirations.

## What it does

Chat summons a cat, camel, Goha, boat or crocodile. Each viewer owns one puppet and can move, jump, change projected depth or speak through a short moderated caption. Twenty-four puppets share the stage; a bounded FIFO queue rotates waiting viewers into the performance.

In **Afreet Hunt**, chat launches spirits toward five lanterns during a sixty-second round. Viewers dodge vertically while the streamer's changing camera outline catches spirits. Keeping at least three lights burning wins. Ordinary puppets and welcome ceremonies wait while the Hunt is active.

A separate **director's desk** controls numbered cues, pause, captions, camera and Twitch. Simulated follows introduce the Mesaharati; raids produce a bounded camel caravan. These ceremonies also have live EventSub handlers. Curtain exports readable, numbered playbill pages so a large cast is retained. A visibly labeled simulator lets one person rehearse the show.

## How we built it with Codex

Amir supplied the brief, directed the visual redesign, provided his spoken narration and recorded the Codex conversation. Codex translated the plan into the application, authored the original vector art, wrote tests, corrected browser defects and assembled the demo.

The local app uses **Vite, TypeScript and PixiJS**. One stage owns authoritative show state, Twitch and the camera; the cue book sends typed commands over a per-show BroadcastChannel. **MediaPipe Tasks Vision** runs segmentation in a worker, with one frame in flight. The displayed silhouette and collision grid share the same crop and mirror transform. Camera frames stay local.

**Twitch OAuth and EventSub WebSockets** bind the show to the authorizing broadcaster and handle chat, moderation, follows and incoming raids. Tokens stay in memory. Codex was the development tool; generative AI does not control the gameplay loop.

## Challenges and what we learned

The hardest work was making the performance reliable: fair turns, caption deletion while queued, paused clocks, stale camera masks and reconnect handling. Browser testing revealed Arabic tracking that broke joining and an unreliable cue-window popup; both were corrected. Ceremonies now suspend during Hunt, and long Arabic names wrap in exported playbills.

Video verification also caught missing speech and caption intervals in an earlier encoding path. We rebuilt the edit with continuous narration audio, independently encoded AAC and explicit caption frames, then checked the encoded result against the source.

## Demonstration and verification

The [public 1:54 demo](https://www.youtube.com/watch?v=VxjgW2sga6o) includes actual Twitch command/camera gameplay, a labeled simulator excerpt, cue-book/playbill captures and genuine owner-recorded Codex planning and change summaries. The Twitch commands were agent-operated broadcaster tests, not an invented audience. Narration is Amir's own spoken recording. The separate cover is promotional illustration; the gameplay gallery uses actual captures.

The repository passes **64 automated tests** and the production build. A fresh public checkout passes installation and bundled asset checks. An additional reproducible rehearsal runs fifty synthetic viewers through two complete Hunts and twenty-three scenario checks. A five-minute local GPU observation with twenty-four simulated puppets met the numeric performance targets; it is not an OBS qualification.

Physical swat accuracy, human fairness, real follow/raid delivery and sustained OBS capture remain unqualified. A hand moving entirely inside an unchanged torso outline is outside this boundary-motion detector's capability. These limits are documented rather than presented as completed tests.

## Try it

[Public source and setup](https://github.com/AmirmLotfy/Khayal). Run `npm ci`, then `npm run dev`, and open `http://localhost:5173/`. Enter the theatre and open the separate director's desk to start a simulated company or try `!cat`, `!closer`, `!jump` and `!say hello`. `npm run rehearse` runs the deterministic source-level show checks.

For Twitch on a fresh checkout, copy the supplied `.env.example` to `.env.local` before startup. It contains only the public Khayal Theatre app identifier. Connect your own broadcaster account while the show is stopped; no client secret or new developer application is required. The fonts, model and WASM runtime are bundled locally.
