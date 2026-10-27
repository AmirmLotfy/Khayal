# Khayal submission studio

This packet is in preparation. [Public source repository](https://github.com/AmirmLotfy/Khayal). Nothing here establishes a completed submission.

- **artwork/khayal-devpost-3x2.png**: final creative1536×1024promotional cover, built-in imagegen, five lanterns; provenance alongside. It is illustration, not a screenshot.
- **voiceover-script.md**: original owner recording guide, eight takes and 293 spoken words. The supplied recording is 105.480 seconds; its pace is preserved in the current 114-second edit.
- **research.md**: four confirmed Twitch award recipients and practical lessons, currentrules, comparison with Aragoz.
- **devpost-draft.md**: text preparation with evidence still pending explicitly identified.
- **storyboard.md**: actual capture requirements and the150second editorial plan.
- **renders/**: shared application geometry exported as SVG using synthetic rehearsal participants.
- **engine-previews/**: nativePNG versions of those vectors. These are engine exports, NOT actual Chrome, camera or Twitch screenshots. Do not upload them as genuine live evidence.
- **video/khayal-review-150s.mp4**: completed150second1080p/30 silent captioned editorial review; marked REVIEW CUT throughout. Uses native rehearsal frames and promotional art. It does not contain actual Twitch/camera/Codex footage or owner voice.
- **video/khayal-narrated-review-114s.mp4**: local private 1080p/30 review, supplied narration normalized, 39 timed English captions. Uses the same rehearsal/editorial sources; genuine live captures are pending. Not a final submission video.
- **video/edit-plan.json** and **video/captions.srt**: current 114-second timeline and captions aligned locally with whisper.cpp to the supplied voice. Listening QC remains open. Original draft captions are preserved separately.
- **video/voice-alignment.json**: timing method, voice hash and recognition differences. Proper-name spellings follow the approved script; interpolated replacement spans and lack of manual listening QC are explicit. Raw audio, recognition models/logs and narrated review are excluded from Git.

## Prepare a final master

`node scripts/prepare-video.mjs --check` lists the actual clip and voice inputs still needed. The input filenames and slot durations are in video/edit-plan.json. Capture from the running application using **Save frame** and **Record stage**, or use OBS. The app recorder is video-only; source labels remain part of the frame. Never label simulated input as live.

Once actual media and the owner voice are present, review clip provenance/consent and subtitle alignment, then run `node scripts/prepare-video.mjs --render --voice /absolute/path/to/voice.wav`. It checks working space and source dimensions/durations, processes one clip at a time, burns captions, normalizes the supplied voice and produces a review receipt. It never uploads or submits. A correct encode is not proof of rule compliance or authentic footage.

To rebuild the local narrated review: `node scripts/render-review.mjs --voice submission/video/voiceover.wav`. Keep the raw recording private. `scripts/align-voice.py` consumes a local whisper.cpp full JSON transcription and the voice path; it updates the timing and reports differences for review. No voice is sent to a transcription provider.

Target: public GitHub, publicYouTube, mainCodexsessionID, requiredDevpostfields, and verifiedSubmitted by Nov2,18:00Cairo. Browser control and Devpost connection currently return access errors despite owner confirmation that both are enabled. Final submission also needs actual camera/Twitch/Codex footage and final review. The owner voice has been received and integrated into the local review.
