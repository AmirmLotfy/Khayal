"""Make phrase captions from validated whisper.cpp DTW token anchors.

Usage: python3 scripts/align-voice.py full-dtw.json /path/to/voice.wav
DTW points are approximate token locations, not verified acoustic boundaries.
The edit plan is read only. Missing/invalid lexical anchors fail before writes.
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
    "ffprobe", "-v", "error", "-show_format", "-of", "json", str(voice)
]))
voice_duration = float(probe["format"]["duration"])
plan = json.loads((video / "edit-plan.json").read_text())
offset, duration = plan["voiceStartsAt"], plan["duration"]
if offset + voice_duration > duration:
    raise SystemExit("Voice exceeds the edit plan")
paragraphs = (root / "submission/voiceover-to-record.txt").read_text().strip().split("\n\n")
script = [word for paragraph in paragraphs for word in paragraph.split()]
normalize = lambda word: re.sub(r"[^a-z0-9]", "", word.lower())

# Reconstruct words from lexical token spans, preserving subword anchors and
# excluding special/punctuation-only tokens. t_dtw is in centiseconds.
# https://github.com/ggml-org/whisper.cpp/blob/master/src/whisper.cpp
observed, lexical_anchors = [], []
for segment in asr["transcription"]:
    text, spans = "", []
    for token in segment.get("tokens", []):
        token_text = token["text"]
        if token_text.startswith("[_"):
            continue
        begin = len(text)
        text += token_text
        if normalize(token_text):
            anchor = token.get("t_dtw")
            if not isinstance(anchor, (int, float)) or not math.isfinite(anchor) or not 0 <= anchor / 100 <= voice_duration:
                raise SystemExit(f"Missing/out-of-range DTW lexical anchor: {token_text!r}: {anchor}")
            anchor /= 100
            if lexical_anchors and anchor < lexical_anchors[-1]:
                raise SystemExit(f"Nonmonotonic DTW anchor: {token_text!r}")
            lexical_anchors.append(anchor)
            spans.append((begin, len(text), anchor))
    if [normalize(w) for w in text.split() if normalize(w)] != [normalize(w) for w in segment["text"].split() if normalize(w)]:
        raise SystemExit("Token reconstruction differs from recognized segment")
    for match in re.finditer(r"\S+", text):
        if not normalize(match.group()):
            continue
        points = [t for a, b, t in spans if a < match.end() and b > match.start()]
        if not points:
            raise SystemExit(f"No lexical anchor for {match.group()!r}")
        observed.append((match.group(), points[0], points[-1]))
if not observed:
    raise SystemExit("No DTW words")
matcher = difflib.SequenceMatcher(None, list(map(normalize, script)),
                                [normalize(w[0]) for w in observed], autojunk=False)
if matcher.ratio() < 0.90:
    raise SystemExit("Script/recognition similarity below90%; resolve the text first")
aligned, differences = [None] * len(script), []
for tag, i, j, k, l in matcher.get_opcodes():
    if tag == "equal":
        for target, source in zip(range(i, j), range(k, l)):
            aligned[target] = observed[source][1:]
        continue
    # Keep the approved spelling, while exposing every recognition difference.
    # Never invent a word time for a deletion or interpolate unequal word counts.
    if tag != "replace" or k == l:
        raise SystemExit(f"Unanchored script/recognition difference: {script[i:j]} / {observed[k:l]}")
    if j - i == l - k:
        for target, source in zip(range(i, j), range(k, l)):
            aligned[target] = observed[source][1:]
        timing = "one-to-one recognized word anchors"
    else:
        # Multiword recognition of one proper name (Afreet / a freak, MediaPipe /
        # media pipe) retains the full recognized span; no synthetic word split.
        if j - i == 1:
            aligned[i] = (observed[k][1], observed[l-1][2])
            timing = "one approved word spans multiple recognized words"
        else:
            # Resolve compound names without dividing a timestamp span: e.g.
            # theatre; MediaPipe -> theater. Media pipe. Only explicit spelling
            # equivalence and concatenated lexical matches are accepted.
            canonical = lambda w: {"theatre": "theater"}.get(normalize(w), normalize(w))
            source = k
            for target in range(i, j):
                ends = [stop for stop in range(source+1, l+1)
                        if canonical(script[target]) == canonical("".join(w[0] for w in observed[source:stop]))]
                if len(ends) != 1:
                    raise SystemExit(f"Ambiguous replacement requires review: {script[i:j]} / {observed[k:l]}")
                stop = ends[0]
                aligned[target] = (observed[source][1], observed[stop-1][2])
                source = stop
            if source != l:
                raise SystemExit("Replacement leaves unused recognized words")
            timing = "explicit theatre/theater spelling equivalence and compound-name token grouping"
    differences.append({"script": " ".join(script[i:j]),
                        "recognition": " ".join(w[0] for w in observed[k:l]),
                        "timing": timing, "sourceAnchorSeconds": [observed[k][1], observed[l-1][2]],
                        "listeningVerified": False})

# DTW is a point estimate inside/near a token. A small documented reading lead
# avoids displaying a new phrase only after its first token's estimated point.
lead = 0.100
def word_start(index):
    return max(0, aligned[index][0] - lead) + offset

def stamp(t):
    ms = round(t * 1000)
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"

cues, take_starts, cursor = [], [], 0
weak_ends = set("a an the and or with for to of at from in into by that while so is are".split())
for paragraph in paragraphs:
    words = paragraph.split()
    take_starts.append(round(word_start(cursor), 3))
    scores, next_break = [math.inf] * (len(words)+1), {}
    scores[-1] = 0
    for i in range(len(words)-1, -1, -1):
        for j in range(i+2, min(len(words), i+7)+1):
            text = " ".join(words[i:j])
            if len(text) > 64:
                continue
            span = aligned[cursor+j-1][1] - aligned[cursor+i][0]
            start = word_start(cursor+i)
            next_start = word_start(cursor+j) if cursor+j < len(aligned) else offset+voice_duration
            if next_start-start < 0.8:
                continue
            cost = 4 + (j-i-5)**2 * 0.35 + max(0, span-3.2)*8
            cost += 18 if normalize(words[j-1]) in weak_ends else 0
            cost += sum(18 for w in words[i:j-1] if re.search(r"[.!?]$", w))
            cost -= 7 if re.search(r"[.!?]$", words[j-1]) else (3 if re.search(r"[,;:]$", words[j-1]) else 0)
            cost += max(0, len(text)/max(span, 0.3)-24)
            if cost+scores[j] < scores[i]:
                scores[i], next_break[i] = cost+scores[j], j
    if 0 not in next_break:
        raise SystemExit("Could not make readable phrase groups")
    i = 0
    while i < len(words):
        j = next_break[i]
        text = words[i:j]
        lines = [" ".join(text)]
        if len(lines[0]) > 42:
            split = min(range(1, len(text)), key=lambda s: abs(len(" ".join(text[:s]))-len(" ".join(text[s:]))))
            lines = [" ".join(text[:split]), " ".join(text[split:])]
        first, last = cursor+i, cursor+j-1
        start = word_start(first)
        next_start = word_start(last+1) if last+1 < len(aligned) else offset+voice_duration
        # Hold through the phrase, but clear long pauses instead of extending
        # captions throughout silence. The last word's DTW point is not an end.
        end = min(max(aligned[last][1]+offset+0.3, start+0.8), next_start, offset+voice_duration)
        if not offset <= start < end <= offset+voice_duration:
            raise SystemExit(f"Invalid cue interval near {text}")
        cues.append((start, end, lines))
        i = j
    cursor += len(words)
if any(round(a[1], 3) > round(b[0], 3) for a, b in zip(cues, cues[1:])):
    raise SystemExit("Overlapping rounded cues")
report = {
    "voiceSha256": hashlib.sha256(voice.read_bytes()).hexdigest(),
    "transcriptSha256": hashlib.sha256(transcript.read_bytes()).hexdigest(),
    "voiceDuration": voice_duration, "timelineDuration": duration, "voiceStartsAt": offset,
    "spokenScriptWords": len(script), "localRecognitionWords": len(observed),
    "normalizedSequenceSimilarity": round(matcher.ratio(), 4),
    "captionCues": len(cues), "takeStarts": take_starts,
    "method": "Local whisper.cpp base.en DTW lexical token points; approved-script spelling; short phrase captions",
    "dtwLexicalTokenCount": len(lexical_anchors),
    "dtwAnchorRangeSeconds": [min(lexical_anchors), max(lexical_anchors)],
    "dtwAnchorsFiniteMonotonicAndWithinVoice": True,
    "captionReadingLeadSeconds": lead,
    "captionEndPolicy": "last lexical DTW point plus300ms, minimum800ms, bounded by next phrase/word and recording end",
    "editPlanModified": False,
    "recognitionDifferencesForReview": differences,
    "timingLimit": "DTW points are experimental approximate token locations, not verified acoustic onset/end boundaries. Numeric validation does not establish audible sync.",
    "manualListeningQC": False, "finalPublicationApproved": False,
    "rawVoiceIsPublic": False
}
(video / "captions.srt").write_text("\n\n".join(
    f"{i+1}\n{stamp(start)} --> {stamp(end)}\n" + "\n".join(lines)
    for i, (start, end, lines) in enumerate(cues)) + "\n")
(video / "voice-alignment.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(report, indent=2))
