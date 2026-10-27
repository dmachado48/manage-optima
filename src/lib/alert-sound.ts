/** Shared Web Audio helpers — browsers mute until a user gesture primes the context. */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

/** Call on first pointer/keydown so later chimes are allowed. */
export async function primeAlertAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    // ignore
  }
}

/** Soft attention chime for the register nudge. */
export async function playRegisterChime(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;

    function tone(freq: number, start: number, dur: number, gain = 0.12) {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(gain, now + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(g);
      g.connect(ctx!.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }

    tone(660, 0, 0.2);
    tone(880, 0.18, 0.28);
  } catch {
    // Autoplay / unsupported — ignore
  }
}
