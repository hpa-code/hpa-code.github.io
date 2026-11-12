// All sound is synthesised in the browser: no audio files to download.
export function createAudio() {
  let ctx = null, master = null, wind = null, water = null, zip = null, on = true, noiseBuf = null;
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
    master = ctx.createGain(); master.gain.value = on ? 0.9 : 0; master.connect(ctx.destination);
    wind = loop(420, 0.6); water = loop(1500, 0.5, 'highpass'); zip = loop(900, 3); A.ready = true;
  };
  A.setOn = v => { on = v; if (master) master.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.05); };
  A.isOn = () => on;
  function burst(freq, q, dur, vol, type = 'bandpass') {
    if (!A.ready || !on) return; const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = noise(); src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master); src.start(t, Math.random()); src.stop(t + dur + 0.02);
  }
  function tone(freq, dur, vol, type = 'sine', when = 0, slide = 0) {
    if (!A.ready || !on) return; const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  A.step = snowy => burst(snowy ? 2600 : 900, 0.8, snowy ? 0.11 : 0.07, snowy ? 0.2 : 0.16, snowy ? 'highpass' : 'bandpass');
  A.grip = () => { burst(1800, 2, 0.05, 0.14); tone(140 + Math.random() * 40, 0.06, 0.05, 'triangle'); };
  A.jump = () => tone(240, 0.16, 0.09, 'triangle', 0, 1.9);
  A.lunge = () => { tone(300, 0.14, 0.09, 'triangle', 0, 2.2); burst(1200, 1, 0.12, 0.12); };
  A.land = hard => { burst(hard ? 160 : 320, 0.7, hard ? 0.3 : 0.12, hard ? 0.7 : 0.3, 'lowpass'); if (hard) tone(70, 0.22, 0.3, 'sine', 0, 0.5); };
  A.thud = v => { burst(240, 0.8, 0.16, 0.45 * v, 'lowpass'); tone(95, 0.12, 0.18 * v, 'sine', 0, 0.6); };
  A.pumped = () => tone(150, 0.3, 0.08, 'sawtooth', 0, 0.6);
  A.pickup = () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.22, 0.11, 'sine', i * 0.07)); };
  A.bell = () => { tone(1245, 1.6, 0.07); tone(1870, 1.1, 0.035); tone(622, 1.8, 0.05); };
  A.bowl = () => { tone(329.6, 3.2, 0.09); tone(331.8, 3.2, 0.07); tone(987, 2, 0.02); };
  A.open = () => tone(520, 0.1, 0.05, 'triangle', 0, 1.3);
  A.fanfare = () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 0.1, 'triangle', i * 0.12)); };
  // Wind rises with height and speed; water is louder near the stream; the zip line sings
  A.ambient = (height, speed, nearWater, zipping) => {
    if (!A.ready) return; const t = ctx.currentTime;
    wind.g.gain.setTargetAtTime(0.03 + height * 0.11 + Math.min(1, speed / 16) * 0.08, t, 0.4); wind.f.frequency.setTargetAtTime(320 + height * 420 + speed * 22, t, 0.4);
    water.g.gain.setTargetAtTime(nearWater * 0.11, t, 0.3);
    zip.g.gain.setTargetAtTime(zipping ? 0.22 : 0, t, 0.08); zip.f.frequency.setTargetAtTime(700 + speed * 40, t, 0.1);
  };
  return A;
}
