// 절차적으로 만드는 자연의 소리 (외부 음원 파일 없음)
// 솔바람·새소리·발소리(숲/모래/바위/콘크리트)·파도·갈매기·낚시 효과음

export class SoundScape {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mix = { forest: 0, sea: 0, gull: 0, rock: 0, boat: 0 };
    this._nextBird = 0;
    this._nextGull = 0;
    this._nextWave = 0;
    this._reelOn = false;
    this._nextTick = 0;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.white = this._noise('white');
    this.pink = this._noise('pink');
    this.brown = this._noise('brown');

    // 솔바람: 핑크 노이즈 → 밴드패스, 천천히 숨쉬는 음량
    this.wind = this._loop(this.pink, 'bandpass', 700, 0.6);
    // 솔잎 사각임: 고역 노이즈
    this.needles = this._loop(this.white, 'highpass', 4200, 0.7);
    // 파도 몸통(저역) + 포말(고역)
    this.waveBody = this._loop(this.brown, 'lowpass', 700, 0.7);
    this.waveFoam = this._loop(this.white, 'bandpass', 2600, 0.5);
    // 바닷바람(해변의 넓은 공기감)
    this.seaAir = this._loop(this.pink, 'lowpass', 380, 0.4);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15);
  }

  _noise(kind) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  _loop(buf, type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start(0, Math.random() * 3);
    return { src, f, g };
  }

  // 매 프레임 호출: 현재 위치의 환경 비율을 받아 레이어를 섞는다
  update(mix, dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    Object.assign(this.mix, mix);
    const m = this.mix;

    const breathe = 0.6 + 0.4 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1.3);
    this.wind.g.gain.setTargetAtTime(m.forest * 0.22 * breathe + m.sea * 0.04, t, 0.4);
    this.wind.f.frequency.setTargetAtTime(500 + 500 * breathe, t, 0.5);
    this.needles.g.gain.setTargetAtTime(m.forest * 0.05 * breathe * breathe, t, 0.3);
    this.seaAir.g.gain.setTargetAtTime(m.sea * 0.12 + m.boat * 0.1, t, 0.6);

    // 파도 주기 스케줄링 (밀려오고 부서지고 쓸려나감)
    if (t >= this._nextWave) {
      const period = m.boat > 0.5 ? 3 + Math.random() * 1.5 : 6 + Math.random() * 3.5;
      const amp = Math.max(m.sea, m.boat * 0.7) * (0.75 + Math.random() * 0.35) * (1 + m.rock * 0.5);
      const bg = this.waveBody.g.gain;
      const fg = this.waveFoam.g.gain;
      const bf = this.waveBody.f.frequency;
      const rise = period * 0.38;
      bg.cancelScheduledValues(t);
      fg.cancelScheduledValues(t);
      bf.cancelScheduledValues(t);
      bg.setValueAtTime(bg.value, t);
      fg.setValueAtTime(fg.value, t);
      bf.setValueAtTime(bf.value, t);
      bg.linearRampToValueAtTime(0.55 * amp, t + rise);
      bf.linearRampToValueAtTime(1300 + m.rock * 900, t + rise);
      fg.linearRampToValueAtTime(0.05 * amp, t + rise * 0.8);
      fg.linearRampToValueAtTime(0.32 * amp, t + rise + 0.25);
      bg.linearRampToValueAtTime(0.18 * amp, t + rise + 1.6);
      bf.linearRampToValueAtTime(450, t + period);
      fg.linearRampToValueAtTime(0.08 * amp, t + period * 0.85);
      bg.linearRampToValueAtTime(0.1 * amp, t + period);
      fg.linearRampToValueAtTime(0.02 * amp, t + period);
      if (m.rock > 0.3 && amp > 0.1) this._splash(t + rise + 0.05, amp * m.rock);
      this._nextWave = t + period;
    }

    if (m.forest > 0.2 && t >= this._nextBird) {
      this._bird(m.forest);
      this._nextBird = t + 1.5 + Math.random() * 5;
    }
    if (m.gull > 0.2 && t >= this._nextGull) {
      this._gull(m.gull);
      this._nextGull = t + 5 + Math.random() * 12;
    }
    if (this._reelOn && t >= this._nextTick) {
      this._click(0.05, 3200 + Math.random() * 600);
      this._nextTick = t + 0.045;
    }
  }

  _env(node, t, a, peak, d) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _burst(buf, type, freq, q, peak, a, d, when = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(this.master);
    this._env(g, t, a, peak, d);
    s.start(t, Math.random() * 3);
    s.stop(t + a + d + 0.05);
    return f;
  }

  _tone(type, f0, f1, peak, a, d, when = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    const g = ctx.createGain();
    o.connect(g).connect(this.master);
    this._env(g, t, a, peak, d);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }

  _click(peak, freq) { this._burst(this.white, 'bandpass', freq, 6, peak, 0.001, 0.02); }

  _bird(level) {
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 5);
    const kind = Math.random();
    for (let i = 0; i < n; i++) {
      const w = i * (0.09 + Math.random() * 0.05);
      if (kind < 0.5) this._tone('sine', base, base * 1.35, 0.05 * level, 0.01, 0.07, w);
      else this._tone('sine', base * 1.3, base * 0.9, 0.04 * level, 0.008, 0.1, w);
    }
  }

  _gull(level) {
    const ctx = this.ctx;
    const calls = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < calls; i++) {
      const t = ctx.currentTime + i * (0.28 + Math.random() * 0.1);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 1500 + Math.random() * 300;
      o.frequency.setValueAtTime(f0 * 0.8, t);
      o.frequency.linearRampToValueAtTime(f0 * 1.15, t + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.32);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 3;
      const g = ctx.createGain();
      o.connect(bp).connect(g).connect(this.master);
      this._env(g, t, 0.03, 0.05 * level, 0.3);
      o.start(t); o.stop(t + 0.4);
    }
  }

  _splash(when, amp) {
    if (!this.ctx) return;
    const d = Math.max(0, when - this.ctx.currentTime);
    this._burst(this.white, 'highpass', 1500, 0.5, 0.25 * amp, 0.01, 0.9, d);
    this._burst(this.brown, 'lowpass', 300, 0.7, 0.4 * amp, 0.01, 0.5, d);
  }

  // 발소리 — 바닥 재질별로 다르게
  step(surface) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const r = Math.random();
    switch (surface) {
      case 'forest':
        this._burst(this.pink, 'bandpass', 1400 + r * 600, 1.2, 0.18, 0.004, 0.07);
        this._burst(this.white, 'highpass', 5000, 0.7, 0.04, 0.002, 0.04, 0.01);
        if (r < 0.15) this._click(0.12, 2200); // 마른 솔방울/잔가지
        break;
      case 'sand': {
        // 모래: 짧은 알갱이 소리 여러 겹
        for (let i = 0; i < 4; i++) {
          this._burst(this.white, 'bandpass', 2500 + Math.random() * 2500, 2, 0.06, 0.003, 0.05, i * 0.022);
        }
        this._burst(this.brown, 'lowpass', 500, 0.7, 0.12, 0.01, 0.12);
        break;
      }
      case 'rock':
        this._burst(this.brown, 'lowpass', 260, 1, 0.35, 0.003, 0.09);
        this._burst(this.white, 'bandpass', 1800, 3, 0.04, 0.002, 0.03);
        break;
      case 'concrete':
        this._burst(this.brown, 'lowpass', 400, 1, 0.3, 0.002, 0.06);
        this._click(0.06, 2800);
        break;
      default:
        break;
    }
  }

  cast() {
    if (!this.ctx) return;
    const f = this._burst(this.white, 'bandpass', 600, 1.5, 0.3, 0.05, 0.35);
    f.frequency.exponentialRampToValueAtTime(3500, this.ctx.currentTime + 0.35);
  }

  plop(far = 0.5) {
    if (!this.ctx) return;
    const v = 0.35 * (1 - far * 0.6);
    this._tone('sine', 600, 150, v * 0.6, 0.005, 0.12);
    this._burst(this.white, 'bandpass', 1600, 1, v * 0.5, 0.005, 0.25, 0.02);
  }

  reel(on) {
    this._reelOn = on;
  }

  bell() {
    if (!this.ctx) return;
    for (let i = 0; i < 6; i++) {
      const w = i * 0.16 + Math.random() * 0.04;
      this._tone('sine', 2350, null, 0.12, 0.002, 0.5, w);
      this._tone('sine', 3560, null, 0.05, 0.002, 0.3, w);
    }
  }

  hit() {
    if (!this.ctx) return;
    this._tone('triangle', 220, 440, 0.2, 0.01, 0.15);
    this._burst(this.white, 'bandpass', 900, 1, 0.25, 0.005, 0.3);
  }

  snap() {
    if (!this.ctx) return;
    this._click(0.4, 4000);
    this._tone('sine', 1200, 200, 0.15, 0.002, 0.25);
  }

  success() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, null, 0.12, 0.01, 0.35, i * 0.11));
  }

  flag() {
    if (!this.ctx) return;
    this._burst(this.brown, 'lowpass', 300, 1, 0.3, 0.005, 0.15);
    this._tone('sine', 880, 1320, 0.08, 0.01, 0.25, 0.1);
  }

  ui() {
    if (!this.ctx) return;
    this._tone('sine', 900, 1100, 0.05, 0.005, 0.08);
  }
}
