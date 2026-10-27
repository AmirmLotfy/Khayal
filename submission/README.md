# Khayal submission studio

The [Devpost project](https://devpost.com/software/khayal) remains **DRAFT / INCOMPLETE SUBMISSION**. The pitch, cover, five actual-capture gallery images, source link, story and Additional info answers are saved. Three eligibility declarations remain unchecked at the owner's explicit request. Final terms and Submit project have not been accepted/clicked. No final YouTube URL exists.

## Current media

- `video/khayal-gameplay-review-114s.mp4`: private local1:54/1080p30 review using actual Twitch/camera footage, a clearly labeled animated rehearsal, actual cue-book/playbill captures and an editorial source explanation. It contains56 corrected caption cues and the complete supplied narration. The source labels distinguish the agent-operated broadcaster test from simulated viewers.
- `screenshots/`: untouched actual canvas/browser/playbill captures. `screenshots/gallery/` contains five1536×1024 presentation images uploaded to Devpost. `gallery-manifest.json` identifies originals and added framing. Raw captures and narrated video remain ignored/private in Git.
- `artwork/khayal-devpost-3x2.png`: designed1536×1024 promotional illustration, five lanterns, provenance alongside; saved as the Devpost cover. It is separate from gameplay screenshots.
- `devpost-story.md`: exact saved public project story. `devpost-draft.md` keeps historical copy behind a current status note.
- `video/captions.srt` / `video/voice-alignment.json`:56 short cues from locally validated whisper.cpp DTW token points. Proper-name spellings follow the approved script; timing remains approximate and full listening review is open.
- `research.md`, `storyboard.md`, `voiceover-script.md`: winner research, capture brief and original293-word recording guide. Current footage timing is recorded in `video/gameplay-review-receipt.json`.

## Corrections and verification

The previous narrated still-image cut is retired after the owner reported sync defects. Its combined filter path produced sparse AAC packets with missing speech and failed caption intervals. The replacement builds an exact114-second PCM bed, with the full105.480-second narration after three seconds of actual silence, encodes AAC independently, and supplies one explicit caption PNG per30fps video frame. No synthetic voice was generated and the supplied recording was not uploaded for transcription.

`docs/gameplay-review-validation.json` records continuous decoded AAC, eight speech windows with zero measured delay error, and112 sampled caption frames matching their intended cues. These are technical checks; they do not claim a human listening judgement. Original voice is unchanged. `docs/browser-live-validation.json` records the actual broadcaster/camera test and its limits.

To reproduce from the private inputs: `node scripts/render-gameplay-review.mjs`. FFmpeg, sharp, NumPy/Pillow and the private captures/voice are required. `node scripts/package-gallery.mjs` rebuilds presentation frames from actual screenshots. `scripts/verify-gameplay-review.py` runs the decoded media checks with the bundled Python runtime. Retired `render-review.mjs --voice` is intentionally blocked; the original150-second silent editorial review remains historical material.

`node scripts/prepare-video.mjs --check` remains the stricter final-capture gate; its nine original clip slots must be supplied honestly. It never substitutes simulated footage for a genuine capture requirement. No script uploads or submits.

## Remaining acceptance

The current video is a broadcaster test montage, not the planned multi-viewer hero performance. Real follow/raid qualification, the20-swat/static-overlap study, sustained OBS measurements, human fairness, full listening review and final public video remain open. Computer Use still blocks direct access to the Codex app, so genuine Codex UI capture is unavailable; the review uses actual source and narration to explain its role. Browser access otherwise works; Devpost connector still rejects authentication, while the signed-in browser successfully saved the draft.

Target remains Nov2,18:00Cairo. Eligibility statements stay unchecked until the owner explicitly changes that instruction. Final submission is pending.
