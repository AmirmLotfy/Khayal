/** Prepare a sample-continuous local PCM bed; no video render or publication. */
import { readFile, writeFile, mkdir, access, statfs } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const video = resolve(root, 'submission/video');
const work = resolve(video, 'work/gameplay-review');
const voiceFlag = process.argv.indexOf('--voice');
if (voiceFlag >= 0 && !process.argv[voiceFlag+1]) throw new Error('--voice requires a file path');
const source = voiceFlag >= 0 ? resolve(process.argv[voiceFlag+1]) : resolve(video, 'voiceover.wav');
const output = resolve(work, 'voice-bed.wav');
const timing = JSON.parse(await readFile(resolve(video, 'voice-alignment.json'), 'utf8'));
const rate = 48000, offset = timing.voiceStartsAt, duration = timing.timelineDuration;
const sha = b => createHash('sha256').update(b).digest('hex');
const original = await readFile(source);
if (sha(original) !== timing.voiceSha256) throw new Error('Voice hash differs from alignment source');
const disk = await statfs(root);
if (Number(disk.bavail)*Number(disk.bsize) < 2*1024**3 + 64*1024**2) throw new Error('Need2GiB reserve plus64MiB');
await mkdir(work, { recursive: true });
const call = (binary, args, extra={}) => {
  const r = spawnSync(binary, args, {cwd:root, maxBuffer:32*1024**2, ...extra});
  if (r.error || r.status !== 0) throw new Error(r.error?.message || String(r.stderr));
  return r;
};
const bundled = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3');
let python = process.env.KHAYAL_PYTHON;
if (!python) { try { await access(bundled); python=bundled; } catch { python='python3'; } }
const expectedVoiceFrames = Math.round(timing.voiceDuration*rate);
// PCM carries waveform samples, not sparse packet durations. Resetting timestamps
// before AAC encoding will be the muxer's separate responsibility.
const filter = 'loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,asetpts=N/SR/TB';
const pcm = call('ffmpeg', ['-v','error','-i',source,'-map','0:a:0','-ac','1','-af',filter,'-ar',String(rate),'-c:a','pcm_s16le','-f','s16le','pipe:1']).stdout;
const voiceFrames = pcm.length/2;
if (Math.abs(voiceFrames-expectedVoiceFrames)>1) throw new Error(`Normalization changed sample count: ${voiceFrames} vs ${expectedVoiceFrames}`);
const totalFrames = Math.round(duration*rate), leadFrames = Math.round(offset*rate);
if (leadFrames+voiceFrames>totalFrames) throw new Error('Voice does not fit timeline');
const payload = Buffer.alloc(totalFrames*2);
pcm.copy(payload,leadFrames*2);
const header = Buffer.alloc(44);
header.write('RIFF',0);header.writeUInt32LE(36+payload.length,4);header.write('WAVEfmt ',8);
header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);
header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);
header.write('data',36);header.writeUInt32LE(payload.length,40);
await writeFile(output,Buffer.concat([header,payload]));
const validation = String(call(python,['-c',String.raw`
import json,sys,wave,numpy as np
bed_path,source_path=sys.argv[1:3]
voice_frames,lead_frames,total_frames=map(int,sys.argv[3:6])
def load(p,rate):
 with wave.open(p) as w:
  assert (w.getframerate(),w.getnchannels(),w.getsampwidth())==(rate,1,2)
  return np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)
bed=load(bed_path,48000);source=load(source_path,16000)
assert len(bed)==total_frames
assert not np.any(bed[:lead_frames]) and not np.any(bed[lead_frames+voice_frames:])
# Every third48k sample is on the16k reference grid. Keep actual lead silence.
encoded=bed[::3];checks=[]
for position in [2,14,28,40,56,70,81,98]:
 expected=source[position*16000:position*16000+24000]
 start=round((position+lead_frames/48000-.2)*16000)
 search=encoded[start:start+30400]
 n=1<<(len(search)+len(expected)-2).bit_length()
 correlation=np.fft.irfft(np.fft.rfft(search,n)*np.fft.rfft(expected[::-1],n),n)
 valid=correlation[len(expected)-1:len(search)]
 shift=int(np.argmax(valid));matched=search[shift:shift+len(expected)]
 coefficient=float(np.dot(expected,matched)/(np.linalg.norm(expected)*np.linalg.norm(matched)))
 error=(start+shift)/16000-(position+lead_frames/48000)
 assert abs(error)<.001 and coefficient>.9,(position,error,coefficient)
 checks.append(dict(sourceSecond=position,delayErrorSeconds=round(error,8),correlation=round(coefficient,6)))
peak=float(20*np.log10(np.max(np.abs(bed))/32768))
assert peak<=-1.0,peak
print(json.dumps(dict(audioWindowChecks=checks,peakSampleDbfs=peak,pcmFrames=len(bed),pcmDurationSeconds=len(bed)/48000,leadingSilenceFrames=lead_frames,trailingSilenceFrames=total_frames-lead_frames-voice_frames,explicitSilenceVerified=True)))
`,output,resolve(video,'work/voice/input-16k.wav'),String(voiceFrames),String(leadFrames),String(totalFrames)],{encoding:'utf8'}).stdout);
const checks = JSON.parse(validation);
const meter = String(call('ffmpeg',['-v','info','-i',output,'-af','ebur128=peak=true','-f','null','-'],{encoding:'utf8'}).stderr);
await writeFile(resolve(work,'voice-bed-loudness.log'),meter);
const summary = meter.slice(meter.lastIndexOf('Summary:'));
const integrated = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
const truePeak = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
if (!Number.isFinite(integrated) || !Number.isFinite(truePeak) || truePeak>-1) throw new Error('Invalid loudness/true peak measurement');
const result = {
  checkedAtUtc:new Date().toISOString(),output:'submission/video/work/gameplay-review/voice-bed.wav',
  sourceVoiceSha256:sha(original),bedSha256:sha(await readFile(output)),
  method:'One local FFmpeg loudnorm PCM normalization; byte-level explicit silence/padding; FFT correlation against original16k reference',
  normalizationFilter:filter,approachesUsed:1,audioSampleRate:rate,audioChannels:1,audioFormat:'PCM signed16bit',
  targetIntegratedLufs:-16,measuredIntegratedLufs:integrated,measuredTruePeakDbfs:truePeak,
  originalVoiceDurationSeconds:timing.voiceDuration,expectedVoiceFrames,normalizedVoiceFrames:voiceFrames,
  voiceDelaySeconds:offset,...checks,
  validationScope:'Continuous PCM waveform duration and explicit zero samples; eight source speech windows. AAC packet continuity remains a separate check after muxing.',
  manualListeningQC:false,aacMuxVerified:false,fullVideoRendered:false,rawVoiceUploaded:false,
  limits:['No human listening judgement or perceptual subtitle-sync acceptance.','Dynamic loudness normalization changes gain; source cadence verified at eight windows.','A future AAC encode must retain sample-continuous timestamps; reject packet gaps and verify decoded audio.'],
};
await writeFile(resolve(root,'docs/audio-continuity-validation.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
