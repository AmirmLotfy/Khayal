"""Align the approved script to local whisper.cpp JSON; no audio is uploaded.

Usage: python3 scripts/align-voice.py transcript.json /path/to/voice.wav
Requires review of reported recognition differences before final publication.
"""
import difflib
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
video = root / "submission/video"
transcript, voice = map(Path, sys.argv[1:3])
asr = json.loads(transcript.read_text())
probe = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(voice)
]))
voice_duration = float(probe["format"]["duration"])
paragraphs = (root / "submission/voiceover-to-record.txt").read_text().strip().split("\n\n")
script = [word for paragraph in paragraphs for word in paragraph.split()]
observed = []
for segment in asr["transcription"]:
    words = segment["text"].split()
    start, end = (segment["offsets"][k] / 1000 for k in ("from", "to"))
    for i, word in enumerate(words):
        observed.append((word, start + (end-start)*i/len(words), start + (end-start)*(i+1)/len(words)))

normalize = lambda word: re.sub(r"[^a-z0-9]", "", word.lower())
matcher = difflib.SequenceMatcher(None, list(map(normalize, script)),
                                [normalize(w[0]) for w in observed], autojunk=False)
if matcher.ratio() < 0.90:
    raise SystemExit("Script/voice similarity below 90%; manually resolve before alignment")
aligned, differences = [None] * len(script), []
for tag, i, j, k, l in matcher.get_opcodes():
    if tag == "equal":
        for target, source in zip(range(i, j), range(k, l)):
            aligned[target] = observed[source][1:]
    else:
        differences.append({"script": " ".join(script[i:j]),
                            "recognition": " ".join(w[0] for w in observed[k:l])})
        if i == j:
            continue
        start = observed[k][1] if k < l else (observed[k-1][2] if k else 0)
        end = observed[l-1][2] if k < l else (observed[k][1] if k < len(observed) else voice_duration)
        total = sum(len(w) for w in script[i:j])
        cursor = start
        for target in range(i, j):
            duration = (end-start) * len(script[target]) / total
            aligned[target] = (cursor, cursor+duration)
            cursor += duration

offset, duration = 3, 114
if offset + voice_duration > duration - 2:
    raise SystemExit("Voice requires a longer timeline")
def stamp(t):
    ms = round(t * 1000)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"

cues, take_starts, cursor = [], [], 0
for paragraph in paragraphs:
    words = paragraph.split()
    take_starts.append(round(aligned[cursor][0] + offset, 3))
    # Prefer sentence/phrase ends and prevent one-word flashes or dangling articles.
    scores, next_break = [math.inf] * (len(words)+1), {}
    scores[-1] = 0
    weak_ends = set("a an the and or with for to of at from in into by that while so is are".split())
    for i in range(len(words)-1, -1, -1):
        for j in range(i+2, min(len(words), i+10)+1):
            text = " ".join(words[i:j])
            if len(text) > 82:
                continue
            span = aligned[cursor+j-1][1]-aligned[cursor+i][0]
            cost = 5 + (j-i-7)**2 * 0.15 + max(0, span-4.5)*5
            cost += 20 if normalize(words[j-1]) in weak_ends else 0
            cost -= 6 if re.search(r"[.!?]$", words[j-1]) else (2 if re.search(r"[,;:]$", words[j-1]) else 0)
            cost += max(0, len(text)/max(span, 0.2)-24)
            if cost+scores[j] < scores[i]:
                scores[i], next_break[i] = cost+scores[j], j
    if 0 not in next_break:
        raise SystemExit("Could not make readable caption groups")
    i = 0
    while i < len(words):
        j = next_break[i]
        text = words[i:j]
        lines = [" ".join(text)]
        if len(lines[0]) > 47:
            split = min(range(1, len(text)), key=lambda s: abs(len(" ".join(text[:s]))-len(" ".join(text[s:]))))
            lines = [" ".join(text[:split]), " ".join(text[split:])]
        first, last = cursor+i, cursor+j-1
        start = aligned[first][0] + offset
        next_start = aligned[last+1][0] + offset if last+1 < len(aligned) else offset+voice_duration
        end = min(max(aligned[last][1]+offset, start+0.6), next_start)
        if end <= start:
            raise SystemExit(f"Invalid alignment near {text}")
        cues.append((start, end, lines))
        i = j
    cursor += len(words)

draft = video / "captions-draft-150s.srt"
if not draft.exists():
    draft.write_text((video / "captions.srt").read_text())
(video / "captions.srt").write_text("\n\n".join(
    f"{i+1}\n{stamp(start)} --> {stamp(end)}\n" + "\n".join(lines)
    for i, (start, end, lines) in enumerate(cues)) + "\n")
plan = json.loads((video / "edit-plan.json").read_text())
plan.update(duration=duration, voiceStartsAt=offset, output="khayal-submission-114s.mp4",
            captionTiming="Local whisper.cpp alignment to supplied owner recording; listening QC pending")
# Cut just before each new paragraph, while keeping the opening hook three seconds.
boundaries = [0, offset] + [round(t-0.10, 3) for t in take_starts[1:]] + [duration]
for segment, start, end in zip(plan["segments"], boundaries, boundaries[1:]):
    segment.update(start=start, end=end)
(video / "edit-plan.json").write_text(json.dumps(plan, indent=2, ensure_ascii=False)+"\n")
report = {
    "voiceSha256": hashlib.sha256(voice.read_bytes()).hexdigest(),
    "voiceDuration": voice_duration, "timelineDuration": duration, "voiceStartsAt": offset,
    "spokenScriptWords": len(script), "localRecognitionWords": len(observed),
    "normalizedSequenceSimilarity": round(matcher.ratio(), 4),
    "captionCues": len(cues), "takeStarts": take_starts,
    "method": "Local whisper.cpp, English base model; approved-script spelling with recognized word timings; replacement spans interpolated",
    "recognitionDifferencesForReview": differences,
    "manualListeningQC": False, "finalPublicationApproved": False,
    "rawVoiceIsPublic": False
}
(video / "voice-alignment.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(report, indent=2))
