// 낚시 미니게임: 서프루어 / 원투(방울) / 찌낚시(배)
import { FISH, METHODS, timeSlot } from './data.js';
import { lerp, clamp } from './scene.js';

const SLOT_BONUS = { 새벽: 1.9, 아침: 1.3, 낮: 0.8, 오후: 1, 해질녘: 1.9, 밤: 0.9 };

export class Fishing {
  constructor(audio, hooks) {
    this.audio = audio;
    this.hooks = hooks;
    this.mode = 'lure';
    this.reset(false);
  }

  reset(notify = true) {
    this.state = 'idle';
    this.power = 0;
    this.pDir = 1;
    this.d = 0;
    this.k = 0;
    this.pressed = false;
    this.fish = null;
    this.tension = 0;
    this.slack = 0;
    this.timer = 0;
    this.window = 0;
    this.msg = '';
    this.splashes = [];
    this.audio.reel(false);
    if (this.audio.drag) this.audio.drag(false);
    if (this.audio._fight && this.audio.fight) this.audio.fight(false);
    if (notify) this.emit();
  }

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    this.reset();
  }

  get busy() { return this.state !== 'idle'; }

  emit() {
    const s = this.state;
    const m = this.mode;
    let main = '', enabled = true, secondary = '';
    if (s === 'idle') main = '캐스팅 (길게 눌러 힘 조절)';
    else if (s === 'charging') main = '놓으면 던집니다!';
    else if (s === 'flying') { main = '…'; enabled = false; }
    else if (s === 'retrieve') { main = this.pressed ? '릴링 중…' : '릴링 (누르고 있기)'; secondary = '회수'; }
    else if (s === 'waiting') { main = m === 'far' ? '🔔 방울 소리를 기다리는 중…' : '찌를 지켜보는 중…'; enabled = false; secondary = '회수'; }
    else if (s === 'bite') main = '챔질!';
    else if (s === 'fight') main = this.pressed ? '감는 중! (텐션 주의)' : '릴링 (누르고 있기)';
    else if (s === 'result') { main = '다시 캐스팅'; }
    this.hooks.onUI({ state: s, main, enabled, secondary, power: this.power, tension: this.tension, msg: this.msg, fight: s === 'fight' });
  }

  press() {
    this.pressed = true;
    const s = this.state;
    if (s === 'idle' || s === 'result') {
      this.state = 'charging';
      this.power = 0;
      this.pDir = 1;
      this.msg = '';
    } else if (s === 'retrieve' || s === 'fight') {
      this.audio.reel(true);
    } else if (s === 'bite') {
      this.audio.hit();
      this.startFight();
      this.audio.reel(true);
    }
    this.emit();
  }

  release() {
    this.pressed = false;
    this.audio.reel(false);
    if (this.state === 'charging') {
      this.state = 'flying';
      this.k = 0;
      const p = this.power;
      const cast = this.gear ? this.gear.rod.cast : 1;
      if (this.mode === 'lure') this.target = (0.3 + p * 0.68) * cast;
      else if (this.mode === 'far') this.target = (0.45 + p * 0.53) * cast;
      else this.target = 0.12 + p * 0.3;
      this.audio.cast();
    }
    this.emit();
  }

  secondary() {
    if (this.state === 'retrieve' || this.state === 'waiting') {
      this.msg = '채비를 회수했어요.';
      this.state = 'idle';
      this.audio.reel(false);
      this.emit();
    }
  }

  pickFish(line) {
    const list = FISH[this.mode][line];
    // 미끼에 맞는 어종이 더 잘 문다
    const prefer = (this.gear && this.gear.bait.prefer) || [];
    const w = list.map(([n]) => (prefer.includes(n) ? 3 : 1));
    let k = Math.random() * w.reduce((a, b) => a + b, 0), idx = 0;
    while (k > w[idx]) { k -= w[idx]; idx++; }
    const [name, min, max] = list[Math.min(idx, list.length - 1)];
    const r = Math.pow(Math.random(), 1.6);
    const size = Math.round(min + (max - min) * r);
    return { name, size, str: 0.35 + r * 0.65, max };
  }

  startFight() {
    this.state = 'fight';
    this.fish = this.fish || this.pickFish(this.env.line);
    this.tension = 0.25;
    this.slack = 0;
    this.run = 0;
    this.nextRun = 0.6 + Math.random() * 0.8;
    // 감고 있으면 5~7초 안에 랜딩
    // 좋은 릴일수록 5초 쪽에 가깝게 (5~7초)
    const sp = this.gear ? this.gear.reel.speed : 1;
    this.fightT = 5 + Math.random() * 2 * Math.max(0.2, (1.32 - sp) / 0.32);
    this.progress = 0;
    this.d0 = Math.max(0.15, this.d);
    this.msg = '히트!! 릴을 누르고 감으세요! 텐션이 빨개지면 잠깐 놓아주세요';
    this.audio.fight && this.audio.fight(true);
    this.hooks.onHit && this.hooks.onHit(this.fish);
  }

  finish(ok, msg) {
    this.state = ok ? 'result' : 'idle';
    this.hooks.onFightEnd && this.hooks.onFightEnd(ok);
    this.audio.reel(false);
    this.audio.drag(false);
    this.audio.fight && this.audio.fight(false);
    this.msg = msg;
    if (ok) {
      this.audio.success();
      this.hooks.onCatch({ ...this.fish, method: this.mode, at: Date.now() });
    }
    this.fish = null;
    this.emit();
  }

  update(dt, env) {
    this.env = env;
    const s = this.state;
    const bonus = (SLOT_BONUS[timeSlot(env.date)] || 1) * (this.gear ? this.gear.bait.bite : 1);
    this.splashes = this.splashes.filter((p) => (p.life -= dt) > 0);

    if (s === 'charging') {
      this.power += this.pDir * dt * 0.9;
      if (this.power > 1) { this.power = 1; this.pDir = -1; }
      if (this.power < 0) { this.power = 0; this.pDir = 1; }
      this.emit();
    } else if (s === 'flying') {
      this.k += dt / (0.6 + this.target * 0.6);
      if (this.k >= 1) {
        this.k = 1;
        this.d = this.target;
        this.audio.plop(this.d);
        this.splash(1);
        if (this.mode === 'lure') {
          this.state = 'retrieve';
          this.msg = `${Math.round(this.d * 90 + 10)}m 캐스팅! 릴을 감아 루어를 움직이세요`;
        } else {
          this.state = 'waiting';
          this.timer = (this.mode === 'far' ? 6 : 4) + Math.random() * (this.mode === 'far' ? 12 : 8) / bonus;
          this.msg = this.mode === 'far' ? '낚싯대를 받침대에 꽂았어요. 방울이 울리면 챔질!' : '찌가 쏙 들어가면 챔질!';
        }
      }
      this.emit();
    } else if (s === 'retrieve') {
      if (this.pressed) this.d -= dt * 0.085;
      const rate = (this.pressed ? 0.2 : 0.05) * bonus * (0.6 + this.d);
      if (Math.random() < rate * dt) {
        this.fish = this.pickFish(env.line);
        this.audio.hit();
        this.startFight();
        this.emit();
        return;
      }
      if (this.d <= 0.02) {
        this.finish(false, '입질이 없네요. 각도를 바꿔 다시 캐스팅해 보세요.');
      }
    } else if (s === 'waiting') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'bite';
        this.window = this.mode === 'far' ? 2.2 : 1.4;
        this.fish = this.pickFish(env.line);
        if (this.mode === 'far') { this.audio.bell(); this.msg = '딸랑딸랑! 방울이 울려요!'; }
        else { this.msg = '찌가 잠겼어요!'; this.audio.plop(this.d); }
        this.emit();
      }
    } else if (s === 'bite') {
      this.window -= dt;
      if (this.window <= 0) {
        this.state = 'waiting';
        this.fish = null;
        if (Math.random() < 0.4) {
          this.finish(false, '앗, 미끼만 떼어먹고 갔어요. 다시 던져보세요.');
        } else {
          this.timer = 4 + Math.random() * 8;
          this.msg = '챔질 타이밍을 놓쳤어요… 다시 기다려 봅니다.';
          this.emit();
        }
      }
    } else if (s === 'fight') {
      const f = this.fish;
      this.nextRun -= dt;
      if (this.nextRun <= 0 && this.run <= 0) {
        this.run = 0.5 + f.str * 0.7;
        this.nextRun = 0.9 + Math.random() * 1.4;
      }
      const running = this.run > 0;
      if (running) this.run -= dt;
      // 드랙 소리: 감는 동안 계속, 물고기가 차고 나가면 더 세게
      this.audio.drag(this.pressed || running, running ? 0.6 + f.str * 0.4 : 0.25);
      if (this.pressed) {
        this.progress += (dt / this.fightT) * (running ? 0.55 : 1.18);
        const g = this.gear;
        const soft = g ? g.reel.smooth / g.rod.strong : 1;
        this.tension += dt * (running ? (0.32 + f.str * 0.25) * soft : -0.05);
        this.slack = 0;
      } else {
        this.tension -= dt * 0.6;
        this.progress -= dt * 0.03;
        if (this.tension < 0.06) this.slack += dt;
      }
      this.tension = clamp(this.tension, 0.05, 1.2);
      this.progress = clamp(this.progress, 0, 1);
      this.d = this.d0 * (1 - this.progress);
      this.hooks.onFight && this.hooks.onFight({ running, pressed: this.pressed, tension: this.tension });
      if (running && Math.random() < dt * 6) this.splash(0.5);
      if (this.tension >= 1) {
        this.audio.snap();
        this.finish(false, `팅! 라인이 터졌어요… (${f.name}였을지도?) 빨개지면 잠깐 놓아주세요.`);
        return;
      }
      if (this.slack > 3) {
        this.finish(false, '라인이 늘어져서 바늘이 빠졌어요. 계속 감아주세요.');
        return;
      }
      if (this.progress >= 1) {
        this.finish(true, `${f.name} ${f.size}cm 랜딩 성공!`);
        return;
      }
      this.emit();
    }
  }

  splash(n) {
    this.splashes.push({ d: this.d, life: 0.6 * n + 0.2, max: 0.6 * n + 0.2 });
  }

  pose(t) {
    const s = this.state;
    if (this.mode === 'far' && (s === 'waiting' || s === 'bite')) return { noRod: true };
    if (s === 'charging') return { rod: -1.2 - this.power * 1.4 };
    if (s === 'flying') return { rod: lerp(-2.6, -0.45, clamp(this.k * 3)) };
    if (s === 'retrieve') return { rod: -0.6 + Math.sin(t * 6) * (this.pressed ? 0.05 : 0) };
    if (s === 'waiting' || s === 'bite') return { rod: -0.7 + (s === 'bite' ? Math.sin(t * 30) * 0.06 : 0) };
    if (s === 'fight') return { rod: -1.0 - Math.sin(t * 9) * 0.05, bend: this.tension };
    if (s === 'result') return { rod: -1.4 };
    return {};
  }

  // 물 위 위치(d: 0=물가, 1=먼바다) → 화면 좌표
  waterPos(sc, tipX, d, boat) {
    const shore = boat ? sc.H * 0.7 : sc.sY - 4 * sc.S;
    const y = shore - Math.pow(d, 0.8) * (shore - sc.hY - 8) * 0.95;
    const x = tipX + (40 + d * 160) * sc.S;
    return { x, y, scale: 1 - d * 0.75 };
  }

  draw(g, sc, tip, t, { ax, ay, boat }) {
    const s = this.state;
    if (s === 'idle' || s === 'charging') {
      if (s === 'charging') this.drawLure(g, tip.x, tip.y + 12 * sc.S, 1, t, false);
      return;
    }
    let from = tip;
    // 원투: 받침대에 꽂힌 낚싯대 + 방울
    if (this.mode === 'far' && (s === 'waiting' || s === 'bite')) {
      const S = sc.S;
      const bx = ax + 42 * S, by = ay + 4 * S;
      const shake = s === 'bite' ? Math.sin(t * 40) * 4 * S : 0;
      const tx = bx + Math.cos(-1.15) * 130 * S + shake;
      const ty = by + Math.sin(-1.15) * 130 * S;
      g.strokeStyle = '#7a7f86';
      g.lineWidth = 2 * S;
      g.beginPath(); g.moveTo(bx - 8 * S, by); g.lineTo(bx + 6 * S, by - 40 * S); g.moveTo(bx + 14 * S, by); g.lineTo(bx + 6 * S, by - 40 * S); g.stroke();
      g.strokeStyle = '#1c1c1c';
      g.lineWidth = 2.8 * S;
      g.beginPath(); g.moveTo(bx - 4 * S, by + 6 * S); g.quadraticCurveTo(bx + 30 * S, by - 80 * S, tx, ty); g.stroke();
      // 방울
      g.fillStyle = '#f2c230';
      g.beginPath(); g.arc(tx, ty + 6 * S, 4 * S, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c99a10';
      g.beginPath(); g.arc(tx + 7 * S, ty + 8 * S, 3.4 * S, 0, Math.PI * 2); g.fill();
      if (s === 'bite') {
        g.strokeStyle = 'rgba(255,230,120,0.9)';
        g.lineWidth = 2;
        for (let i = 1; i <= 2; i++) {
          g.beginPath(); g.arc(tx, ty + 6 * S, (8 + i * 7 + (t * 30) % 7) * S, -1.2, 0.4); g.stroke();
        }
      }
      from = { x: tx, y: ty };
    }
    let lp;
    if (s === 'flying') {
      const end = this.waterPos(sc, from.x, this.target, boat);
      const k = this.k;
      lp = { x: lerp(from.x, end.x, k), y: lerp(from.y, end.y, k) - Math.sin(k * Math.PI) * sc.H * 0.22, scale: lerp(1, end.scale, k) };
    } else if (s === 'result') {
      // 잡은 물고기를 들어올림
      const S = sc.S;
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(tip.x, tip.y + 30 * S); g.stroke();
      this.drawFish(g, tip.x, tip.y + 42 * S, 1.2 * S, t);
      return;
    } else {
      lp = this.waterPos(sc, from.x, this.d, boat);
      if (s === 'fight') lp.x += Math.sin(t * 7) * 14 * sc.S * (this.run > 0 ? 1.6 : 0.5);
    }
    // 낚싯줄
    const sag = s === 'fight' ? (1 - this.tension) * 20 : s === 'flying' ? 0 : 30;
    g.strokeStyle = s === 'fight' && this.tension > 0.8 ? 'rgba(255,120,120,0.9)' : 'rgba(255,255,255,0.65)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.quadraticCurveTo((from.x + lp.x) / 2, Math.max(from.y, lp.y) + sag * sc.S * 0.5 - (s === 'flying' ? 0 : 10), lp.x, lp.y);
    g.stroke();
    // 물보라
    for (const p of this.splashes) {
      const wp = this.waterPos(sc, from.x, p.d, boat);
      const k = 1 - p.life / p.max;
      g.strokeStyle = `rgba(255,255,255,${1 - k})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(wp.x, wp.y, (6 + k * 26) * wp.scale * sc.S, (2 + k * 7) * wp.scale * sc.S, 0, 0, Math.PI * 2); g.stroke();
    }
    if (s === 'flying') {
      this.drawLure(g, lp.x, lp.y, lp.scale, t, false);
    } else if (this.mode === 'float' && (s === 'waiting' || s === 'bite')) {
      this.drawFloat(g, lp.x, lp.y, lp.scale * sc.S, t, s === 'bite');
    } else if (s === 'fight') {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.beginPath(); g.ellipse(lp.x, lp.y, 12 * lp.scale * sc.S, 3 * lp.scale * sc.S, 0, 0, Math.PI * 2); g.fill();
      if (this.run > 0) this.drawFish(g, lp.x, lp.y - 6 * sc.S * lp.scale, lp.scale * sc.S * 0.8, t, true);
    } else {
      // 물속 루어 / 봉돌 위치 표시: 잔물결
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1;
      const rr = ((t * 1.5) % 1);
      g.beginPath(); g.ellipse(lp.x, lp.y, (4 + rr * 12) * lp.scale * sc.S, (1.5 + rr * 3) * lp.scale * sc.S, 0, 0, Math.PI * 2); g.stroke();
    }
  }

  drawLure(g, x, y, sc, t) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 10) * 0.3);
    g.fillStyle = '#c8d3dd';
    g.beginPath(); g.ellipse(0, 0, 9 * sc, 3 * sc, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3aa0ff';
    g.beginPath(); g.ellipse(-1 * sc, -1 * sc, 6 * sc, 1.4 * sc, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  drawFloat(g, x, y, s, t, bite) {
    const dip = bite ? Math.min(1, (2 - this.window) * 3) : 0;
    const by = y + Math.sin(t * 2.4) * 1.5 * s + dip * 10 * s;
    g.save();
    g.beginPath();
    g.rect(x - 20 * s, y - 40 * s, 40 * s, 40 * s + 1);
    g.clip();
    g.fillStyle = '#ff3b2f';
    g.beginPath(); g.ellipse(x, by - 6 * s, 4 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffd33d';
    g.fillRect(x - 1 * s, by - 20 * s, 2 * s, 10 * s);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.ellipse(x, y, 9 * s, 2 * s, 0, 0, Math.PI * 2); g.stroke();
  }

  drawFish(g, x, y, s, t, jumping) {
    g.save();
    g.translate(x, y);
    g.rotate(jumping ? -0.5 : Math.PI / 2 + Math.sin(t * 12) * 0.25);
    const grad = g.createLinearGradient(0, -8 * s, 0, 8 * s);
    grad.addColorStop(0, '#5d6f7d');
    grad.addColorStop(1, '#e8eef2');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, 18 * s, 6.5 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(15 * s, 0); g.lineTo(25 * s, -7 * s); g.lineTo(25 * s, 7 * s); g.closePath();
    g.fill();
    g.fillStyle = '#111';
    g.beginPath(); g.arc(-12 * s, -1.5 * s, 1.5 * s, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

export { METHODS };
