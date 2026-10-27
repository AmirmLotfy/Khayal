"""Check the encoded review against voice delay and every caption's pixels.

Requires NumPy and Pillow (available in the Codex bundled Python runtime).
This verifies stream/frame timing, not a human listening judgement.
"""
import json
import math
import subprocess
import wave
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
video = root / "submission/video"
work = video / "work/gameplay-review"
film = video / "khayal-gameplay-review-114s.mp4"
probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(film)]))
assert abs(float(probe["format"]["duration"])-114) < 1/30
picture = next(s for s in probe["streams"] if s["codec_type"] == "video")
assert (picture["width"], picture["height"], picture["r_frame_rate"]) == (1920, 1080, "30/1")
sound = next(s for s in probe["streams"] if s["codec_type"] == "audio")
assert sound["sample_rate"] == "48000"
decoded = json.loads(subprocess.check_output(["ffprobe","-v","error","-select_streams","a:0","-show_frames","-show_entries","frame=pts_time,nb_samples","-of","json",str(film)]))["frames"]
gaps = [float(b["pts_time"])-float(a["pts_time"])-int(a["nb_samples"])/48000 for a,b in zip(decoded,decoded[1:])]
assert max(map(abs,gaps)) < 2/48000, "AAC contains a timestamp discontinuity"
audio = work / "encoded-audio-16k.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(film), "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(audio)], check=True)
def samples(path):
    with wave.open(str(path)) as source:
        assert source.getnchannels() == 1 and source.getframerate() == 16000 and source.getsampwidth() == 2
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(np.float32)
original = samples(video / "work/voice/input-16k.wav")
encoded = samples(audio)
assert abs(len(encoded)/16000-114) < 1024/48000, "Decoded audio sample count differs from timeline"
audio_checks = []
for position in [2, 14, 28, 40, 56, 70, 81, 98]:
    start = round((position+3-0.2)*16000)
    expected = original[position*16000:(position*16000)+24000]
    search = encoded[start:start+30400]
    size = 1 << (len(search)+len(expected)-2).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(search, size)*np.fft.rfft(expected[::-1], size), size)
    valid = correlation[len(expected)-1:len(search)]
    shift = int(np.argmax(valid))
    matched = search[shift:shift+len(expected)]
    coefficient = float(np.dot(expected, matched)/(np.linalg.norm(expected)*np.linalg.norm(matched)))
    error = (start+shift)/16000-(position+3)
    assert abs(error) < 0.01 and coefficient > 0.9, (position, error, coefficient)
    audio_checks.append({"sourceSecond":position,"delayErrorSeconds":round(error,6),"correlation":round(coefficient,4)})

def seconds(stamp):
    h,m,s=map(float,stamp.replace(",", ".").split(":"))
    return h*3600+m*60+s
cues=[]
for block in (video / "captions.srt").read_text().strip().split("\n\n"):
    lines=block.splitlines();start,end=map(seconds,lines[1].split(" --> "))
    cues.append((start,end))
checks = sorted((frame, i) for i,(start,end) in enumerate(cues)
                for frame in {math.ceil(start*30)+3, math.floor(end*30)-3})
assert len({frame for frame,_ in checks}) == len(checks)
chunks=[]
# Keep AVExpr recursion bounded rather than building a >100-term expression.
for begin in range(0,len(checks),28):
    selection="+".join(f"eq(n,{frame})" for frame,_ in checks[begin:begin+28])
    chunks.append(subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(film), "-vf", f"select='{selection}',format=gray,crop=1920:113:0:967:exact=1,scale=960:56", "-fps_mode", "passthrough", "-f", "rawvideo", "pipe:1"]))
frames=b"".join(chunks)
assert len(frames) == len(checks)*960*56
frames=np.frombuffer(frames,dtype=np.uint8).reshape(len(checks),56,960)
patterns=np.array([np.array(Image.open(video / f"work/gameplay-captions/caption-{i:03}.png").crop((0,967,1920,1080)).resize((960,56), Image.Resampling.BICUBIC).convert("L")) for i in range(len(cues))],dtype=np.float32)
mismatches=[]
for actual,(frame,expected) in zip(frames,checks):
    errors=np.mean(np.square(patterns-actual.astype(np.float32)),axis=(1,2))
    recognized=int(np.argmin(errors))
    if recognized != expected:
        mismatches.append({"frame":frame,"second":frame/30,"expectedCue":expected+1,"closestCue":recognized+1})
report={"file":"submission/video/khayal-gameplay-review-114s.mp4","durationSeconds":114,"videoFormat":"H264 1920x1080 30fps","audioSampleRate":48000,"maximumDecodedAacFrameGapSeconds":max(map(abs,gaps)),"decodedAudioDurationSeconds":len(encoded)/16000,"audioDelayTargetSeconds":3,"audioWindowChecks":audio_checks,"captionCues":len(cues),"burnedCaptionFramesChecked":len(checks),"burnedCaptionMismatchCount":len(mismatches),"mismatches":mismatches,"method":"Decoded AAC continuity, audio correlation at eight source windows, decoded caption pixels classified against all native caption PNGs near each cue start/end","manualListeningQC":False,"timingLimit":"Correct encoded stream offsets and agreement with the DTW-aligned SRT do not prove perceptual word timing or replace full listening review.","submissionReady":False}
(root / "docs/gameplay-review-validation.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
assert not mismatches, "Burned captions disagree with SRT"
