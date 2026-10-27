/** Original quiet synthesized cues; no sampled music or imitation crowd/voice. */
export class ShowSound {
  private context: AudioContext | null = null;
  enabled = false;
  async toggle() {
    if (!this.context) this.context = new AudioContext();
    await this.context.resume();
    this.enabled = !this.enabled;
    return this.enabled;
  }
  cue(kind: "enter" | "swat" | "out" | "ceremony" | "hunt") {
    if (!this.enabled || !this.context || this.context.state !== "running")
      return;
    const ctx = this.context,
      base = ctx.currentTime;
    const drum = (offset: number, pitch: number, volume: number) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitch, base + offset);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(45, pitch * 0.35),
        base + offset + 0.16,
      );
      gain.gain.setValueAtTime(0.001, base + offset);
      gain.gain.exponentialRampToValueAtTime(volume, base + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, base + offset + 0.23);
      osc.connect(gain).connect(ctx.destination);
      osc.start(base + offset);
      osc.stop(base + offset + 0.25);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    };
    if (kind === "ceremony") {
      drum(0, 180, 0.09);
      drum(0.18, 260, 0.045);
      drum(0.34, 180, 0.07);
    } else
      drum(
        0,
        kind === "swat"
          ? 300
          : kind === "out"
            ? 85
            : kind === "hunt"
              ? 210
              : 140,
        kind === "swat" ? 0.055 : 0.075,
      );
  }
  dispose() {
    void this.context?.close();
    this.context = null;
    this.enabled = false;
  }
}
