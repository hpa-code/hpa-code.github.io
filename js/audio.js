// All sound is synthesised in the browser: no audio files to download.
export function createAudio() {
  let ctx = null, master = null, sfx = null, wind = null, water = null, rush = null, fire = null, eng = null, hub = null, music = null, on = true, noiseBuf = null, echo = null;
  const A = { ready: false };
  function noise() {
    if (noiseBuf) return noiseBuf; noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.5 + last * 6; } return noiseBuf;
  }
  function loop(freq, q, type = 'bandpass') {
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(master); src.start(); return { f, g };
  }
  A.start = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = on ? 0.9 : 0; master.connect(ctx.destination); sfx = master;
    wind = loop(420, 0.6); water = loop(1500, 0.5, 'highpass'); rush = loop(900, 2.2); fire = loop(2400, 0.4, 'highpass');
    // A snowmobile's engine: two detuned saws through a filter that opens with the throttle
    { const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 48; o2.frequency.value = 24.3; f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 2; g.gain.value = 0; const g2 = ctx.createGain(); g2.gain.value = 0.5; o1.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(master); o1.start(); o2.start(); eng = { o1, o2, f, g }; }
    // A bike's freewheel: a tick that speeds up as you coast
    hub = { next: 0 };
    // A long echo, for the bells and the music
    { const d = ctx.createDelay(1.2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), out = ctx.createGain(); d.delayTime.value = 0.42; fb.gain.value = 0.42; lp.type = 'lowpass'; lp.frequency.value = 1800; out.gain.value = 0.5; d.connect(lp).connect(fb).connect(d); d.connect(out).connect(master); echo = d; }
    music = { next: ctx.currentTime + 3, i: 0, vol: 0 };
    A.ready = true;
  };
  A.setOn = v => { on = v; if (master) master.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.05); };
  A.isOn = () => on;
  function burst(freq, q, dur, vol, type = 'bandpass', when = 0) {
    if (!A.ready || !on) return; const t = ctx.currentTime + when, src = ctx.createBufferSource(); src.buffer = noise(); src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(sfx); src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  function tone(freq, dur, vol, type = 'sine', when = 0, slide = 0, wet = 0) {
    if (!A.ready || !on) return; const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(sfx); if (wet && echo) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(echo); } o.start(t); o.stop(t + dur + 0.05);
  }
  const STEP = { grass: [700, 0.9, 0.07, 0.13, 'bandpass'], dirt: [950, 0.8, 0.06, 0.16, 'bandpass'], snow: [2600, 0.8, 0.12, 0.2, 'highpass'], wood: [420, 2.5, 0.07, 0.3, 'bandpass'], water: [1400, 0.6, 0.16, 0.2, 'bandpass'] };
  A.step = surface => { const s = STEP[surface] || STEP.grass; burst(s[0], s[1], s[2], s[3], s[4]); if (surface === 'wood') tone(110 + Math.random() * 30, 0.07, 0.07, 'triangle'); };
  A.grip = () => { burst(1800, 2, 0.05, 0.14); tone(140 + Math.random() * 40, 0.06, 0.05, 'triangle'); };
  A.jump = () => tone(240, 0.16, 0.08, 'triangle', 0, 1.9);
  A.leap = () => { tone(300, 0.14, 0.09, 'triangle', 0, 2.2); burst(1200, 1, 0.12, 0.12); };
  A.land = (hard, surface) => { burst(hard ? 160 : surface === 'snow' ? 900 : 320, 0.7, hard ? 0.3 : 0.12, hard ? 0.7 : 0.3, 'lowpass'); if (hard) tone(70, 0.22, 0.3, 'sine', 0, 0.5); };
  A.splash = () => { burst(1100, 0.5, 0.5, 0.5); burst(3200, 0.6, 0.35, 0.25, 'highpass', 0.04); };
  A.thud = v => { burst(240, 0.8, 0.16, 0.45 * v, 'lowpass'); tone(95, 0.12, 0.18 * v, 'sine', 0, 0.6); };
  A.pumped = () => tone(150, 0.3, 0.08, 'sawtooth', 0, 0.6);
  A.pickup = () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.22, 0.11, 'sine', i * 0.07, 0, 0.5)); };
  // Each ring is one step higher up a pentatonic scale
  A.ring = n => { const f = 392 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19][Math.min(8, n)] / 12); tone(f, 0.5, 0.14, 'sine', 0, 0, 0.6); tone(f * 2, 0.35, 0.06, 'sine', 0.03, 0, 0.6); };
  A.bell = () => { tone(1245, 1.6, 0.07, 'sine', 0, 0, 0.5); tone(1870, 1.1, 0.035); tone(622, 1.8, 0.05, 'sine', 0, 0, 0.5); };
  A.bowl = () => { tone(329.6, 3.4, 0.1, 'sine', 0, 0, 0.6); tone(331.8, 3.4, 0.08); tone(987, 2, 0.02); };
  A.open = () => tone(520, 0.1, 0.05, 'triangle', 0, 1.3);
  A.chalk = () => { for (let i = 0; i < 5; i++) burst(3200 + Math.random() * 1500, 3, 0.09, 0.1, 'bandpass', i * 0.11 + Math.random() * 0.03); };
  A.stamp = () => { burst(180, 0.8, 0.12, 0.6, 'lowpass'); tone(80, 0.1, 0.25, 'sine', 0, 0.6); burst(180, 0.8, 0.1, 0.4, 'lowpass', 0.28); };
  A.keys = () => { for (let i = 0; i < 7; i++) burst(2400 + Math.random() * 1200, 4, 0.025, 0.13, 'bandpass', i * 0.055 + Math.random() * 0.02); };
  A.shutter = () => { burst(3000, 1.5, 0.03, 0.3, 'highpass'); burst(900, 2, 0.05, 0.3, 'bandpass', 0.07); };
  A.whistle = () => { tone(1400, 0.16, 0.07, 'sine', 0, 1.5); tone(2100, 0.22, 0.07, 'sine', 0.17, 0.75); };
  A.wing = open => { burst(open ? 500 : 800, 0.6, open ? 0.5 : 0.25, 0.4, 'bandpass'); if (open) tone(180, 0.3, 0.06, 'triangle', 0, 2.2); };
  A.mount = kind => { if (kind === 'bike') { burst(2600, 4, 0.04, 0.2); tone(1900, 0.5, 0.05, 'sine', 0.05, 0, 0.3); } else if (kind === 'sled') { burst(200, 1, 0.4, 0.5, 'lowpass'); tone(60, 0.5, 0.2, 'sawtooth', 0, 1.8); } else burst(600, 1, 0.08, 0.2); };
  A.fanfare = () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.55, 0.1, 'triangle', i * 0.12, 0, 0.5)); };

  // A slow, sparse tune on a pentatonic scale, like a dramyin picked a long way off. It thins out when you are busy and after dark.
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16], PHRASE = [0, 2, 4, 2, 5, 4, 2, 0, 3, 4, 6, 4, 2, 1, 0, -1];
  function tune(s) {
    if (!on || music.vol < 0.01) { music.next = ctx.currentTime + 1; return; }
    while (music.next < ctx.currentTime + 0.3) {
      const n = PHRASE[music.i % PHRASE.length]; music.i++;
      if (n >= 0 && Math.random() < 0.82) {
        const f = 196 * Math.pow(2, SCALE[n] / 12) * (s.night > 0.5 ? 0.5 : 1), when = music.next - ctx.currentTime;
        tone(f, 1.8, 0.05 * music.vol, 'triangle', when, 0, 0.7); tone(f * 2.001, 0.9, 0.018 * music.vol, 'sine', when, 0, 0.7);
        if (music.i % 8 === 1) tone(f / 2, 3.2, 0.035 * music.vol, 'sine', when, 0, 0.3);
      }
      music.next += [0.9, 0.9, 1.8, 0.9, 0.45, 0.45, 1.8, 2.7][music.i % 8];
    }
  }
  // Everything that drones: wind rises with height and speed, water near the stream, the engine with the throttle
  A.ambient = s => {
    if (!A.ready) return; const t = ctx.currentTime, ride = s.mode === 'bike' || s.mode === 'sled', fly = s.mode === 'glide' || s.mode === 'zip';
    wind.g.gain.setTargetAtTime((0.025 + s.height * 0.1 + Math.min(1, s.speed / 18) * 0.1 + (fly ? 0.07 : 0)) * s.quiet, t, 0.4); wind.f.frequency.setTargetAtTime(300 + s.height * 380 + s.speed * 24, t, 0.4);
    water.g.gain.setTargetAtTime(s.water * 0.11 * s.quiet, t, 0.3);
    rush.g.gain.setTargetAtTime(s.mode === 'zip' ? 0.22 : s.mode === 'glide' ? 0.035 + Math.max(0, s.lift) * 0.012 : 0, t, 0.1); rush.f.frequency.setTargetAtTime(s.mode === 'zip' ? 700 + s.speed * 40 : 380 + s.speed * 22 + s.lift * 40, t, 0.15);
    fire.g.gain.setTargetAtTime(s.fire * (0.03 + Math.random() * 0.05), t, 0.03);
    const sled = s.mode === 'sled', rev = sled ? 46 + s.v * 5.2 + s.throttle * 22 + (s.air ? 30 : 0) : 40;
    eng.g.gain.setTargetAtTime(sled ? (0.05 + s.throttle * 0.05) * s.quiet : 0, t, 0.08); eng.o1.frequency.setTargetAtTime(rev, t, 0.09); eng.o2.frequency.setTargetAtTime(rev * 0.503, t, 0.09); eng.f.frequency.setTargetAtTime(240 + s.v * 26 + s.throttle * 420, t, 0.1);
    if (s.mode === 'bike' && s.v > 1.5 && s.throttle < 0.05 && !s.air) { hub.next -= s.dt; if (hub.next <= 0) { hub.next = Math.max(0.02, 0.5 / s.v); burst(4200, 6, 0.012, 0.07); } }
    music.vol += ((ride || fly ? 0.45 : 1) * s.quiet - music.vol) * Math.min(1, s.dt * 0.8); tune(s);
  };
  return A;
}
