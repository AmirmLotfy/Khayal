# Khayal acceptance runbook

Use the production build (`npm run build`, then `npm start`) at `http://localhost:5173/`. Only one stage may own the show. Open the separate director's desk, and keep the stage visible during camera/performance observations. This guide does not certify that a run happened; save its actual artifacts and outcomes.

## Local performance observation

1. In rehearsal mode, choose **24 simulated viewers**, open the theatre and start the rehearsal company. This is an explicit simulator load, not a real audience. Wait for 24 on stage, zero waiting and a running camera.
2. Choose GPU or CPU and the requested inference rate **before** starting. Settings/source changes or a hidden stage invalidate a continuous observation.
3. In Settings, start the five-minute observation. The stage auto-stops collection at five minutes. Download its JSON using the explicit report link before starting another run.
4. Compare the measured render average, p95 frame interval, delivered inference cadence and capture-to-result p95 latency. Requested FPS alone is not throughput. Check actor ranges, sample coverage, invalid samples and visibility history.
5. The planned numeric targets are render average at least58fps, p95 frame interval at most20ms, delivered inference at least15fps and p95 application processing latency at most120ms. A short run or a run whose actor count fell below24 does not establish the sustained24-puppet target.
6. Repeat the selected configuration while **actually recording with OBS at1080p for five minutes**. Retain that recording and identify it alongside the telemetry. The application cannot detect or certify OBS; its reports deliberately keep OBS and human acceptance unverified.

The timing definitions are explicit in the report: rAF intervals describe rendering cadence, not GPU execution time; processing latency spans frame capture to the application's result callback. A separately recorded OBS run is required for the original performance gate.

## Physical silhouette qualification

Use ordinary room lighting and the selected mirror setting. Confirm that the displayed outline and hit locations align. Record20 deliberate swats that visibly change the body's outline, then30seconds of stationary overlap with a target. Save the count for each attempt and the stationary segment. The acceptance target is at least18of20 deliberate hits and zero stationary hits. Movements entirely inside an unchanged torso silhouette are outside this detector's capability.

Camera-start permission, camera-stop pause behavior, track-loss recovery and timeout recovery are separate observations. A mocked track-ended test is not physical camera-loss evidence.

## Real Twitch and human rehearsal

Connect the dedicated Khayal Theatre app as the broadcaster while the show is stopped. Rehearsal controls are not live viewers. Arrange a real performance with at least three viewers and a separate five-participant Hunt fairness check. Obtain permission to show names/recordings. Retain actual summon, movement, depth, caption and afreet messages, a genuine follow and a genuine incoming raid. A broadcaster-operated command test proves the provider path only; it does not replace audience participation or follow/raid evidence.

## Browser and playbill checks

- Opening another stage must show the existing-owner message. Closing/reopening only the cue book must retain the stage; closing the stage must visibly disconnect the cue book and invalidate its download links.
- Exercise long Arabic/English names, captions, hide-captions control, crowded stages, pause/resume and keyboard controls.
- Export a cast larger than one page. Download each numbered PNG explicitly; browsers can block automatic multi-file downloads. Inspect all names and page numbering, including wrapped long names. Keep each1080×1350 page.

## Release evidence

The public demo must remain under three minutes and show the project working with Twitch and how Codex was used. Use genuine captures and identify simulator sections. Review the complete narration/captions by listening, not only by numeric checks. Keep code/assets/licenses/setup instructions in the repository and verify a clean installation at the release revision.

Devpost's personal eligibility declarations and final rules/terms are owner decisions. The current instruction is to leave the three declarations unchecked; this runbook does not change it or authorize final submission.
