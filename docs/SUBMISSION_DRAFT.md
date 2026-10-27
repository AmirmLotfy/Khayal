# Khayal — submission working copy

Status: NOT SUBMISSION READY. This document is a preparation draft, not a claim that the video, real Twitch qualification or final assets exist.

## Title and tagline

Khayal · Twitch chat holds the puppets.

## Inspiration

Khayal draws on Cairo’s khayal al-zill shadow theatre and the shared performance of a streamer and their community. Shadow Monsters is a visual-interaction inspiration. Describe this as an original combination and personal interpretation; do not claim no similar project exists.

## What it does

Viewers summon and steer a cast of shadow puppets using chat commands. Moving closer to the lamp makes a puppet larger and softer. In Afreet Hunt, viewers send spirits toward five lanterns while the streamer defends them with a changing silhouette. Follow and raid ceremonies welcome the community; a paginated playbill credits the cast. A separate cue book controls the show, and a clearly labeled simulator supports solo rehearsal.

## How we built it

The local app uses TypeScript, PixiJS, MediaPipe and Twitch EventSub. Inference runs in a worker with bounded frame delivery; mask changes feed the swat detector. OAuth tokens stay in memory. The cue book and stage communicate locally. Codex implemented and tested the command, show, Twitch and vision systems and prepared a Blender silhouette exporter. Current29tests and the production build pass.

Replace this paragraph only after genuine evidence exists: final Meshy/Blender production, real Twitch event qualification, human testing and OBS measurements are pending. Current puppets are original code placeholders. Do not describe the exporter as a completed production run until it has processed actual approved models.

## Challenges and next steps

Sustained performance during capture and fair motion detection require real tests. A changing silhouette detects outline movement; a hand moving inside a torso silhouette needs a future tracking method. Optional modes remain outside this entry’s baseline.

## Required final fields

- Public GitHub URL: pending release.
- Public YouTube URL: pending recording/edit/review/publication.
- Main Codex session ID: retrieve the actual session ID through the app/status at submission time.
- Build tags: TypeScript, Vite, PixiJS, MediaPipe, Twitch, EventSub, Blender, Codex; add Meshy only after actual use.
- Gallery: actual screenshots of the stage, hunt, cue book and playbill, plus real build evidence.
- Verify official custom form fields and registration at preparation time; current connector needs reauthentication.
- Confirm personal eligibility/terms, then verify actual Submitted status. A saved draft is not an entry.
