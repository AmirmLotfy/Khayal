# Khayal submission research

Checked 27 October 2026. Local preparation only; no Devpost, YouTube or repository publication occurred. The Devpost requirements connector returned `UNAUTHORIZED` (reauthentication required); registration and custom form fields remain unverified. The public official pages below were read directly as requested. This is not an eligibility or terms attestation.

## Current contest requirements

[Official rules](https://twitchcon-codex.devpost.com/rules): build a new Twitch-connected experience with Codex during the contest period. Provide a runnable source/assets repository, description, primary build session ID and YouTube video under three minutes showing actual Twitch operation and Codex construction. Judges may use only submitted media. English or English translations are required. Multiple entries must be unique and substantially different; organizers decide. Four equal criteria cover innovation, usefulness/entertainment, implementation/Codex and design; innovation breaks the first tie.

Deadline: 2 November 2026, 14:00 Pacific. The [official FAQ](https://twitchcon-codex.devpost.com/resources) permits unlisted YouTube but has an inconsistent UTC conversion. Converting America/Los_Angeles to Africa/Cairo gives 3 November 00:00 Cairo; use the earlier project target of 2 November 18:00 Cairo and verify the countdown. Private video is unsuitable. Authenticated form fields still need a final check.

## Confirmed winners and useful techniques

These are 2024 Twitch Streamer Tools Hackathon results, **not predictions for the current contest**. Winner status is cross-checked against the [official winner announcement](https://twitchstreamertools.devpost.com/updates/33853-streamer-tools-hackathon-2024-winners-and-runner-ups), the [Devpost gallery](https://twitchstreamertools.devpost.com/project-gallery) and each actual project page. Lessons in the last column are editorial inferences, not judges' stated reasons.

| Project and confirmed award | What its project page actually describes | Useful technique for Khayal |
| --- | --- | --- |
| [PixelWars](https://devpost.com/software/bitwars) — Interactive Community Experiences winner | Named viewer characters battle another community or a tower; free and Bits options; setup panel. | Show a viewer command beside its immediate named consequence. Named avatars and audience combat are established prior art: put the performer's physical defense first. |
| [Stream Together Timeline](https://devpost.com/software/stream-together-timeline) — Streamer-to-Streamer Collaboration winner | Automatically preserves sessions, participants and clips in a timeline, accessible on and off Twitch. | End with the actual cast playbill so the community leaves with a tangible memory. Do not claim this feature itself is novel. |
| [tcghud by Tangia](https://devpost.com/software/tcghud-by-tangia) — Enhancing Stream Appearance winner | Camera card identification feeds a stream HUD; its writeup discusses lighting and model limitations. | Show input and visible response together, then explain one real camera constraint. Claim only measured performance. |
| [Lights Out!](https://devpost.com/software/streamalertstv) — runner-up | A viewer dims the screen; the streamer must locate a switch with a small illuminated area. | An immediately legible audience-triggered challenge is stronger than a feature tour. Show five lanterns, one incoming spirit and one clear save before adding more actors. |

## Inspiration, not a hackathon winner claim

[ACMI's Shadow Monsters collection entry](https://www.acmi.net.au/works/114487--shadow-monsters/) identifies Philip Worthington's 2005 installation: camera silhouettes become interactive creatures. Credit it as visual-interaction inspiration. Khayal's proposed contribution combines chat-owned puppets, depth-dependent shadows and a timed body-versus-chat lantern game. Avoid “first ever,” “no competition,” and cultural authenticity claims unsupported by the work.

## Substantial difference from ARAGOZ

Comparison uses current read-only `/Users/frameless/Desktop/Aragoz/README.md` and `submission/README.md`; no ARAGOZ files changed.

| Dimension | Khayal | ARAGOZ |
| --- | --- | --- |
| Central action | Move your silhouette to defend five lanterns during a 60-second hunt | Exploit chat-authored flaws, open counters and break monster modules |
| Audience agency | Own and steer a puppet; launch/dodge a spirit | Propose and vote on rule contracts |
| Performance language | Flat shadows, camera outline, rod motion, light and depth | Action combat, physical modules, modular boss and three-act House show |
| Presentation to emphasize | Immersive indigo/bone stage; one performer visibly meeting chat | Warm puppet-workshop identity and rule-making |
| Technical focus | Local camera inference, motion mask, authoritative stage and separate cue book | Server-backed show, voting/adaptation and modular combat |

Shared folklore and Twitch integration alone do not demonstrate substantial difference. The opening shot, cover, tagline and main explanation must show Khayal's distinctive action. Cosmetic changes cannot establish compliance. The comparison does not guarantee organizers' acceptance.

## Decisions for this packet

- Lead with “Chat sends the spirits. Your shadow guards the light.” Keep the product name Khayal / خيال.
- Put physical defense, depth change and the 60-second stakes ahead of ceremonies. Keep follow/raid clips optional until genuinely verified.
- The owner subsequently authorized a creative promotional cover: its built-in imagegen cyanotype illustration is in artwork/ with provenance. Gallery live-evidence images still require actual captures. Use the new palette.ts, gentle rod movement and restrained light changes; no neon cyan.
- Separate `LOCAL REHEARSAL`, `REAL CAMERA`, `REAL TWITCH` and `BUILD FOOTAGE` in review edits. A simulator capture cannot establish Twitch or human acceptance.
- Preserve the actual source frames and source category for every final asset. Do not rebuild a successful action from unrelated frames.

## Evidence at handoff

The initial `CURRENT_HANDOFF.md` records 29 passing tests and a passing TypeScript/build check. That is historical source evidence, not a new check by this specialist. It records no rendered browser, camera/device, human swat/fairness, OBS, actual Twitch or final Meshy/Blender production acceptance. Coordinator may append newer dated evidence; never silently upgrade these claims. The four files here are writing deliverables and were not tested as app behavior.
