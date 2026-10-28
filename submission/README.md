# Khayal submission studio

The [Devpost project](https://devpost.com/software/khayal) remains **DRAFT / INCOMPLETE SUBMISSION**. The pitch, cover, seven gallery images (five actual gameplay/cue/playbill captures and two genuine Codex stills), source link, story and Additional info answers are saved. Three eligibility declarations remain unchecked at the owner's explicit request. Final terms and Submit project have not been accepted/clicked. The [public gameplay demo](https://www.youtube.com/watch?v=VxjgW2sga6o) is published and saved in the Devpost video field; the draft is now3/5 steps.

## Current media

- `video/khayal-gameplay-demo-114s.mp4`: local1:54/1080p30 review, [published publicly on YouTube](https://www.youtube.com/watch?v=VxjgW2sga6o), using actual Twitch/camera footage, a clearly labeled animated rehearsal, actual cue-book/playbill captures and genuine owner-recorded Codex conversation footage. It contains56 corrected caption cues and the complete supplied narration. The source labels distinguish the agent-operated broadcaster test from simulated viewers.
- `screenshots/`: untouched actual canvas/browser/playbill captures. `screenshots/gallery/` contains five1536×1024 presentation images uploaded to Devpost. `gallery-manifest.json` identifies originals and added framing. Raw captures and the local narrated-video file remain ignored in Git; the selected demo is public on YouTube.
- `artwork/khayal-devpost-3x2.png`: designed1536×1024 promotional illustration, five lanterns, provenance alongside; saved as the Devpost cover. It is separate from gameplay screenshots.
- `devpost-story.md`: exact saved public project story. `devpost-draft.md` keeps historical copy behind a current status note.
- `video/captions.srt` / `video/voice-alignment.json`:56 short cues from locally validated whisper.cpp DTW token points. Proper-name spellings follow the approved script; timing remains approximate and full listening review is open.
- `research.md`, `storyboard.md`, `voiceover-script.md`: winner research, capture brief and original293-word recording guide. Current footage timing is recorded in `video/gameplay-demo-receipt.json`.

## Corrections and verification

The previous narrated still-image cut is retired after the owner reported sync defects. Its combined filter path produced sparse AAC packets with missing speech and failed caption intervals. The replacement builds an exact114-second PCM bed, with the full105.480-second narration after three seconds of actual silence, encodes AAC independently, and supplies one explicit caption PNG per30fps video frame. The owner explicitly confirmed this is their own spoken recording. No synthetic voice was generated and the supplied recording was not uploaded for transcription.

`docs/gameplay-demo-validation.json` records continuous decoded AAC, eight speech windows with zero measured delay error, and112 sampled caption frames matching their intended cues. These are technical checks; they do not claim a human listening judgement. Original voice is unchanged. `docs/browser-live-validation.json` records the actual broadcaster/camera test and its limits.

To reproduce from the private inputs: `node scripts/render-gameplay-review.mjs --codex-recording`. FFmpeg, sharp, NumPy/Pillow and the private captures/voice are required. `node scripts/package-gallery.mjs` rebuilds presentation frames from actual screenshots. `scripts/verify-gameplay-review.py --codex-recording` runs the decoded media checks with the bundled Python runtime. Retired `render-review.mjs --voice` is intentionally blocked; the original150-second silent editorial review remains historical material.

`node scripts/prepare-video.mjs --check` remains the stricter final-capture gate; its nine original clip slots must be supplied honestly. It never substitutes simulated footage for a genuine capture requirement. No script uploads or submits.

## Remaining acceptance

The current video is a broadcaster test montage, not the planned multi-viewer hero performance. Real follow/raid qualification, the20-swat/static-overlap study, sustained OBS measurements, human fairness and full listening review remain open. The current review is published publicly with its source and review labels intact. The owner has now supplied a genuine19-second Codex conversation recording, linked with two stills in the main README and `docs/BUILD_WITH_CODEX.md`. The revised public demo now integrates the owner recording; its historical planning and change summaries are labeled. Computer Use still blocks direct capture of the Codex app. Browser access otherwise works; Devpost connector still rejects authentication, while the signed-in browser successfully saved the draft.

Target remains Nov2,18:00Cairo. Eligibility statements stay unchecked until the owner explicitly changes that instruction. Final submission is pending.
