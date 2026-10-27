# Khayal submission studio

This packet is in preparation. [Public source repository](https://github.com/AmirmLotfy/Khayal). Nothing here establishes a completed submission.

- **artwork/khayal-devpost-3x2.png**: final creative1536×1024promotional cover, built-in imagegen, five lanterns; provenance alongside. It is illustration, not a screenshot.
- **voiceover-script.md**: owner recording script, eight takes,293spokenwords, about2:30–2:40. Record only quoted passages, dry voice/no music. Leave one second around takes. Return the voice file for editing and timing.
- **research.md**: four confirmed Twitch award recipients and practical lessons, currentrules, comparison with Aragoz.
- **devpost-draft.md**: text preparation with evidence still pending explicitly identified.
- **storyboard.md**: actual capture requirements and the150second editorial plan.
- **renders/**: shared application geometry exported as SVG using synthetic rehearsal participants.
- **engine-previews/**: nativePNG versions of those vectors. These are engine exports, NOT actual Chrome, camera or Twitch screenshots. Do not upload them as genuine live evidence.
- **video/khayal-review-150s.mp4**: completed150second1080p/30 silent captioned editorial review; marked REVIEW CUT throughout. Uses native rehearsal frames and promotional art. It does not contain actual Twitch/camera/Codex footage or owner voice.
- **video/edit-plan.json** and **video/captions.srt**: editable150second timeline and provisional captions. Align captions to the supplied owner voice before final render.

## Prepare a final master

`node scripts/prepare-video.mjs --check` lists the actual clip and voice inputs still needed. The input filenames and slot durations are in video/edit-plan.json. Capture from the running application using **Save frame** and **Record stage**, or use OBS. The app recorder is video-only; source labels remain part of the frame. Never label simulated input as live.

Once actual media and the owner voice are present, review clip provenance/consent and subtitle alignment, then run `node scripts/prepare-video.mjs --render --voice /absolute/path/to/voice.wav`. It checks working space and source dimensions/durations, processes one clip at a time, burns captions, normalizes the supplied voice and produces a review receipt. It never uploads or submits. A correct encode is not proof of rule compliance or authentic footage.

Target: public GitHub, publicYouTube, mainCodexsessionID, requiredDevpostfields, and verifiedSubmitted by Nov2,18:00Cairo. Browser control and Devpost connection currently need recovery; final submission also needs actual camera/Twitch/Codex footage, ownervoice and final review.
