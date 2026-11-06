export const SOUNDS = [
  { id: "ding", label: "🔔 جرس" },
  { id: "buzzer", label: "🚫 خطأ" },
  { id: "applause", label: "👏 تصفيق" },
  { id: "drum", label: "🥁 طبول" },
  { id: "siren", label: "🚨 إنذار" },
  { id: "fanfare", label: "🎺 فوز" }
];

let ctx: AudioContext | null = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function playSound(id: string, volume: number) {
  try {
    const c = ac();
    const master = c.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume));
    master.connect(c.destination);
    const t = c.currentTime;
    if (id === "ding") {
      tone(c, master, "sine", 880, 880, t, 0.9, 0.5);
      tone(c, master, "sine", 1320, 1320, t, 0.6, 0.25);
    } else if (id === "buzzer") {
      tone(c, master, "sawtooth", 120, 100, t, 0.7, 0.4);
    } else if (id === "drum") {
      for (let i = 0; i < 4; i++) tone(c, master, "sine", 180, 50, t + i * 0.18, 0.2, 0.7);
      tone(c, master, "sine", 120, 40, t + 0.8, 0.5, 0.9);
    } else if (id === "siren") {
      for (let i = 0; i < 5; i++) {
        const f = i % 2 ? 800 : 600;
        tone(c, master, "square", f, f, t + i * 0.25, 0.25, 0.2);
      }
    } else if (id === "fanfare") {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, master, "triangle", f, f, t + i * 0.16, 0.3, 0.4));
      tone(c, master, "triangle", 1047, 1047, t + 0.64, 0.8, 0.45);
    } else if (id === "applause") {
      const nb = c.createBuffer(1, Math.floor(c.sampleRate * 0.05), c.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      for (let k = 0; k < 45; k++) {
        const s = c.createBufferSource();
        s.buffer = nb;
        const g = c.createGain();
        g.gain.value = 0.15 + Math.random() * 0.25;
        const f = c.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 1200 + Math.random() * 2000;
        s.connect(f);
        f.connect(g);
        g.connect(master);
        s.start(t + Math.random() * 1.5);
      }
    }
  } catch (e) {
    console.error(e);
  }
}