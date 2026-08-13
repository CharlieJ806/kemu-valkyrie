/* AudioEngine: Web Audio API procedural synthesis (no external files) */

export type SfxName =
  | "click"
  | "correct"
  | "wrong"
  | "timeout"
  | "hit"
  | "crit"
  | "hurt"
  | "coin"
  | "heal"
  | "levelup"
  | "throwBall"
  | "ballHit"
  | "ballShake"
  | "caught"
  | "escape"
  | "flee"
  | "ko"
  | "switchP"
  | "victory"
  | "defeat"
  | "boss"
  | "fanfare";

export type BgmName = "title" | "map" | "battle" | "boss" | "shop" | "rest";

type OscType = OscillatorType;

type ToneOpts = {
  freq?: number;
  freq2?: number | null;
  type?: OscType;
  dur?: number;
  vol?: number;
  when?: number;
  attack?: number;
  slideT?: number | null;
};

type NoiseOpts = {
  dur?: number;
  vol?: number;
  when?: number;
  freq?: number;
  q?: number;
  type?: BiquadFilterType;
  freq2?: number | null;
};

type BgmCfg = {
  bpm: number;
  bass: number[];
  lead: Record<number, number>;
  hat: boolean;
  leadType: OscType;
  vol: number;
};

type AudioState = {
  ctx: AudioContext | null;
  master: GainNode | null;
  bgmGain: GainNode | null;
  sfxGain: GainNode | null;
  bgmVol: number;
  sfxVol: number;
  bgmTimer: ReturnType<typeof setInterval> | null;
  bgmName: BgmName | null;
  bgmNamePending: BgmName | null;
  step: number;
  noiseBuf: AudioBuffer | null;
};

const A: AudioState = {
  ctx: null,
  master: null,
  bgmGain: null,
  sfxGain: null,
  bgmVol: 0.6,
  sfxVol: 0.8,
  bgmTimer: null,
  bgmName: null,
  bgmNamePending: null,
  step: 0,
  noiseBuf: null,
};

function ensure(): boolean {
  if (typeof window === "undefined") return false;
  if (A.ctx) {
    if (A.ctx.state === "suspended") void A.ctx.resume();
    return true;
  }
  try {
    const Win = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || Win.webkitAudioContext;
    if (!AC) return false;
    A.ctx = new AC();
    A.master = A.ctx.createGain();
    A.master.gain.value = 1;
    A.master.connect(A.ctx.destination);
    A.bgmGain = A.ctx.createGain();
    A.bgmGain.gain.value = A.bgmVol * 0.5;
    A.bgmGain.connect(A.master);
    A.sfxGain = A.ctx.createGain();
    A.sfxGain.gain.value = A.sfxVol;
    A.sfxGain.connect(A.master);
    const len = A.ctx.sampleRate * 1;
    A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch {
    return false;
  }
}

function tone(opts: ToneOpts): void {
  if (!ensure() || !A.ctx || !A.sfxGain) return;
  const {
    freq = 440,
    freq2 = null,
    type = "square",
    dur = 0.15,
    vol = 0.3,
    when = 0,
    attack = 0.005,
    slideT = null,
  } = opts;
  const t0 = A.ctx.currentTime + when;
  const o = A.ctx.createOscillator();
  const g = A.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freq2 != null) {
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + (slideT ?? dur));
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(A.sfxGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(opts: NoiseOpts): void {
  if (!ensure() || !A.ctx || !A.sfxGain || !A.noiseBuf) return;
  const {
    dur = 0.2,
    vol = 0.3,
    when = 0,
    freq = 1200,
    q = 1,
    type = "bandpass",
    freq2 = null,
  } = opts;
  const t0 = A.ctx.currentTime + when;
  const s = A.ctx.createBufferSource();
  s.buffer = A.noiseBuf;
  s.loop = true;
  const f = A.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  f.Q.value = q;
  if (freq2 != null) f.frequency.exponentialRampToValueAtTime(freq2, t0 + dur);
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f);
  f.connect(g);
  g.connect(A.sfxGain);
  s.start(t0);
  s.stop(t0 + dur + 0.05);
}

const SFX: Record<SfxName, () => void> = {
  click: () => {
    tone({ freq: 880, type: "square", dur: 0.06, vol: 0.12 });
  },
  correct: () => {
    tone({ freq: 660, type: "square", dur: 0.1, vol: 0.22 });
    tone({ freq: 990, type: "square", dur: 0.16, vol: 0.22, when: 0.09 });
    tone({ freq: 1320, type: "sine", dur: 0.22, vol: 0.15, when: 0.18 });
  },
  wrong: () => {
    tone({ freq: 220, freq2: 110, type: "sawtooth", dur: 0.35, vol: 0.25 });
    tone({ freq: 180, freq2: 90, type: "sawtooth", dur: 0.35, vol: 0.2, when: 0.05 });
  },
  timeout: () => {
    tone({ freq: 440, freq2: 160, type: "triangle", dur: 0.4, vol: 0.25 });
  },
  hit: () => {
    noise({ dur: 0.18, vol: 0.4, freq: 300, q: 0.8, type: "lowpass" });
    tone({ freq: 120, freq2: 50, type: "triangle", dur: 0.2, vol: 0.4 });
  },
  crit: () => {
    noise({ dur: 0.25, vol: 0.5, freq: 600, freq2: 150, q: 1 });
    tone({ freq: 800, freq2: 200, type: "sawtooth", dur: 0.25, vol: 0.3 });
  },
  hurt: () => {
    tone({ freq: 200, freq2: 80, type: "square", dur: 0.25, vol: 0.3 });
    noise({ dur: 0.15, vol: 0.25, freq: 500, type: "lowpass" });
  },
  coin: () => {
    tone({ freq: 990, type: "square", dur: 0.07, vol: 0.16 });
    tone({ freq: 1320, type: "square", dur: 0.14, vol: 0.16, when: 0.07 });
  },
  heal: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, type: "sine", dur: 0.25, vol: 0.16, when: i * 0.08 }),
    );
  },
  levelup: () => {
    [523, 587, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, type: "square", dur: 0.14, vol: 0.16, when: i * 0.07 }),
    );
  },
  throwBall: () => {
    noise({ dur: 0.35, vol: 0.25, freq: 300, freq2: 2400, q: 2 });
  },
  ballHit: () => {
    tone({ freq: 300, freq2: 100, type: "triangle", dur: 0.15, vol: 0.3 });
  },
  ballShake: () => {
    tone({ freq: 180, type: "square", dur: 0.06, vol: 0.2 });
    tone({ freq: 180, type: "square", dur: 0.06, vol: 0.2, when: 0.12 });
  },
  caught: () => {
    [523, 659, 784, 1046, 1318].forEach((f, i) =>
      tone({ freq: f, type: "square", dur: 0.2, vol: 0.18, when: i * 0.1 }),
    );
    noise({ dur: 0.5, vol: 0.15, freq: 3000, q: 0.6, when: 0.4 });
  },
  escape: () => {
    noise({ dur: 0.3, vol: 0.3, freq: 2000, freq2: 300, q: 1.5 });
    tone({ freq: 500, freq2: 900, type: "square", dur: 0.2, vol: 0.15, when: 0.15 });
  },
  flee: () => {
    noise({ dur: 0.4, vol: 0.2, freq: 2500, freq2: 400, q: 1 });
  },
  ko: () => {
    tone({ freq: 400, freq2: 60, type: "sawtooth", dur: 0.6, vol: 0.28 });
  },
  switchP: () => {
    tone({ freq: 600, freq2: 900, type: "sine", dur: 0.15, vol: 0.18 });
  },
  victory: () => {
    [523, 523, 523, 659, 784, 784, 1046].forEach((f, i) =>
      tone({ freq: f, type: "square", dur: i === 6 ? 0.5 : 0.16, vol: 0.2, when: i * 0.14 }),
    );
  },
  defeat: () => {
    [392, 370, 349, 330].forEach((f, i) =>
      tone({ freq: f, type: "triangle", dur: 0.5, vol: 0.22, when: i * 0.3 }),
    );
  },
  boss: () => {
    tone({ freq: 110, type: "sawtooth", dur: 0.5, vol: 0.3 });
    tone({ freq: 116, type: "sawtooth", dur: 0.5, vol: 0.3 });
    noise({ dur: 0.8, vol: 0.2, freq: 200, freq2: 1200, q: 2, when: 0.3 });
  },
  fanfare: () => {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
      tone({ freq: f, type: "square", dur: 0.22, vol: 0.2, when: i * 0.16 }),
    );
  },
};

function mf(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const BGMS: Record<BgmName, BgmCfg> = {
  title: {
    bpm: 100,
    bass: [45, 0, 45, 0, 48, 0, 43, 0],
    lead: { 0: 69, 2: 72, 4: 76, 6: 74 },
    hat: false,
    leadType: "triangle",
    vol: 0.1,
  },
  map: {
    bpm: 92,
    bass: [40, 0, 0, 40, 0, 43, 0, 38],
    lead: { 0: 64, 4: 67 },
    hat: false,
    leadType: "sine",
    vol: 0.09,
  },
  battle: {
    bpm: 142,
    bass: [33, 33, 45, 33, 36, 36, 48, 36],
    lead: { 0: 69, 2: 72, 3: 71, 4: 69, 6: 67 },
    hat: true,
    leadType: "square",
    vol: 0.08,
  },
  boss: {
    bpm: 158,
    bass: [30, 30, 42, 30, 31, 31, 43, 31],
    lead: { 0: 66, 1: 66, 3: 68, 4: 66, 6: 63 },
    hat: true,
    leadType: "sawtooth",
    vol: 0.085,
  },
  shop: {
    bpm: 96,
    bass: [48, 0, 52, 0, 50, 0, 47, 0],
    lead: { 2: 72, 6: 71 },
    hat: false,
    leadType: "triangle",
    vol: 0.08,
  },
  rest: {
    bpm: 72,
    bass: [41, 0, 0, 0, 45, 0, 0, 0],
    lead: { 0: 65, 4: 69 },
    hat: false,
    leadType: "sine",
    vol: 0.08,
  },
};

function bgmStep(): void {
  const cfg = A.bgmName ? BGMS[A.bgmName] : null;
  if (!cfg || !A.ctx || !A.bgmGain || !A.noiseBuf) return;
  const s = A.step % 8;
  const t0 = A.ctx.currentTime;
  const b = cfg.bass[s];
  if (b) {
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = mf(b);
    g.gain.setValueAtTime(cfg.vol * 1.6, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    o.connect(g);
    g.connect(A.bgmGain);
    o.start(t0);
    o.stop(t0 + 0.25);
  }
  const l = cfg.lead[s];
  if (l) {
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = cfg.leadType;
    o.frequency.value = mf(l);
    g.gain.setValueAtTime(cfg.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    o.connect(g);
    g.connect(A.bgmGain);
    o.start(t0);
    o.stop(t0 + 0.32);
  }
  if (cfg.hat && s % 2 === 1) {
    const src = A.ctx.createBufferSource();
    src.buffer = A.noiseBuf;
    src.playbackRate.value = 2;
    const f = A.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(cfg.vol * 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(A.bgmGain);
    src.start(t0);
    src.stop(t0 + 0.06);
  }
  A.step++;
}

function playBGM(name: BgmName): void {
  if (A.bgmName === name && A.bgmTimer) return;
  stopBgm();
  A.bgmName = name;
  A.step = 0;
  if (!ensure()) return;
  const cfg = BGMS[name];
  if (!cfg) return;
  const interval = (60 / cfg.bpm / 2) * 1000;
  bgmStep();
  A.bgmTimer = setInterval(bgmStep, interval);
}

function stopBgm(): void {
  if (A.bgmTimer) {
    clearInterval(A.bgmTimer);
    A.bgmTimer = null;
  }
  A.bgmName = null;
}

export const AudioEngine = {
  unlock(): void {
    ensure();
    if (A.bgmNamePending) {
      const n = A.bgmNamePending;
      A.bgmNamePending = null;
      playBGM(n);
    }
  },

  sfx(name: SfxName | string): void {
    const fn = SFX[name as SfxName];
    if (!fn) return;
    try {
      fn();
    } catch {
      /* ignore */
    }
  },

  bgm(name: BgmName | string): void {
    const n = name as BgmName;
    if (!BGMS[n]) return;
    if (A.ctx) playBGM(n);
    else {
      A.bgmNamePending = n;
      ensure();
      if (A.ctx) playBGM(n);
    }
  },

  stopBgm,

  /** @deprecated use stopBgm */
  stopBGM: stopBgm,

  setBgmVol(v: number): void {
    A.bgmVol = v;
    if (A.bgmGain) A.bgmGain.gain.value = v * 0.5;
  },

  setSfxVol(v: number): void {
    A.sfxVol = v;
    if (A.sfxGain) A.sfxGain.gain.value = v;
  },
};

export default AudioEngine;
