/* ============================================
   Audio — WebAudio mixer for training
   Three buses: master → (music, sfx). All sounds are synthesised
   in the browser (no asset files). Volumes are 0–100 and use a
   squared curve so the sliders feel perceptually even.
   Browsers only allow audio after a user gesture, so call
   unlock() from a click / key handler.
   ============================================ */
window.VantageEngine = window.VantageEngine || {};

VantageEngine.Audio = (function () {
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null, comp = null;
  let vols = { master: 80, music: 30, sfx: 70 };

  // Music state
  let musicSession = null;     // gain node holding every music voice (so it can fade out as one)
  let musicTimer = null;
  let musicNextTime = 0;
  let musicStep = 0;
  let musicVoices = [];

  const curve = (v) => { const x = Math.min(1, Math.max(0, v / 100)); return x * x; };

  // Per-bus trims keep music a quiet bed under the effects at equal slider positions
  const MUSIC_TRIM = 0.3;
  const SFX_TRIM = 1.0;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (err) { ctx = null; return false; }

    master = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    comp = ctx.createDynamicsCompressor(); // safety limiter so loud settings never clip
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 8;

    musicBus.connect(master);
    sfxBus.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);
    applyVolumes(true);
    return true;
  }

  function applyVolumes(immediate) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const set = (node, v) => {
      node.gain.cancelScheduledValues(t);
      if (immediate) node.gain.setValueAtTime(v, t);
      else node.gain.setTargetAtTime(v, t, 0.02);
    };
    set(master, curve(vols.master));
    set(musicBus, curve(vols.music) * MUSIC_TRIM);
    set(sfxBus, curve(vols.sfx) * SFX_TRIM);
  }

  function ready() { return !!ctx && ctx.state === 'running'; }

  /* ---------- Sound building blocks ---------- */

  function tone({ type = 'sine', f0, f1, start = 0, dur = 0.1, gain = 0.3, attack = 0.003, bus }) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus || sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return { osc, g };
  }

  /* ---------- Sound effects ---------- */

  function playHit() {
    if (!ready()) return;
    tone({ type: 'sine', f0: 1100, f1: 1750, dur: 0.09, gain: 0.34 });
    tone({ type: 'triangle', f0: 2200, f1: 2600, dur: 0.05, gain: 0.08 });
  }

  function playMiss() {
    if (!ready()) return;
    tone({ type: 'triangle', f0: 190, f1: 90, dur: 0.07, gain: 0.16 });
  }

  function playTick() {
    if (!ready()) return;
    tone({ type: 'sine', f0: 520, dur: 0.08, gain: 0.2 });
  }

  function playGo() {
    if (!ready()) return;
    tone({ type: 'sine', f0: 880, f1: 1040, dur: 0.22, gain: 0.28 });
  }

  function playFinish() {
    if (!ready()) return;
    [660, 880, 1100].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.35, gain: 0.2, start: i * 0.11 }));
  }

  function playShoot() {
    if (!ready()) return;
    const t0 = ctx.currentTime;

    // Layer 1: Low-end thump (body of the shot)
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, t0);
    thump.frequency.exponentialRampToValueAtTime(40, t0 + 0.12);
    thumpGain.gain.setValueAtTime(0.5, t0);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    thump.connect(thumpGain);
    thumpGain.connect(sfxBus);
    thump.start(t0);
    thump.stop(t0 + 0.17);

    // Layer 2: Mid crack (snap)
    const crack = ctx.createOscillator();
    const crackGain = ctx.createGain();
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(800, t0);
    crack.frequency.exponentialRampToValueAtTime(200, t0 + 0.06);
    crackGain.gain.setValueAtTime(0.25, t0);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    crack.connect(crackGain);
    crackGain.connect(sfxBus);
    crack.start(t0);
    crack.stop(t0 + 0.1);

    // Layer 3: Noise burst (the "bang" texture)
    const bufferSize = ctx.sampleRate * 0.08;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.8;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sfxBus);
    noise.start(t0);
    noise.stop(t0 + 0.09);

    // Layer 4: High-frequency ping (metallic ring)
    const ping = ctx.createOscillator();
    const pingGain = ctx.createGain();
    ping.type = 'square';
    ping.frequency.setValueAtTime(2400, t0);
    ping.frequency.exponentialRampToValueAtTime(1200, t0 + 0.04);
    pingGain.gain.setValueAtTime(0.06, t0);
    pingGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    ping.connect(pingGain);
    pingGain.connect(sfxBus);
    ping.start(t0);
    ping.stop(t0 + 0.06);
  }

  /* ---------- Music: soft procedural ambient bed ---------- */

  const CHORDS = [
    [110.00, 164.81, 261.63, 329.63], // Am
    [87.31, 174.61, 261.63, 329.63],  // Fmaj7
    [130.81, 196.00, 261.63, 329.63], // C
    [98.00, 196.00, 246.94, 329.63],  // G6
  ];
  const CHORD_DUR = 8;     // seconds per chord
  const PLUCK_STEP = 0.5;  // seconds between arpeggio notes

  function trackVoice(osc) {
    musicVoices.push(osc);
    osc.onended = () => { musicVoices = musicVoices.filter(v => v !== osc); };
  }

  function scheduleChord(t0, chord, idx) {
    // Pad: two slightly detuned oscillators per note through a soft low-pass
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const padGain = ctx.createGain();
    padGain.gain.setValueAtTime(0.0001, t0);
    padGain.gain.linearRampToValueAtTime(0.16, t0 + 2);
    padGain.gain.setValueAtTime(0.16, t0 + CHORD_DUR - 1.5);
    padGain.gain.linearRampToValueAtTime(0.0001, t0 + CHORD_DUR + 1.5);
    filter.connect(padGain);
    padGain.connect(musicSession);

    chord.forEach((f) => {
      [-4, 4].forEach((cents) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = cents;
        osc.connect(filter);
        osc.start(t0);
        osc.stop(t0 + CHORD_DUR + 1.6);
        trackVoice(osc);
      });
    });

    // Gentle arpeggio plucks (one octave up) for movement
    const steps = Math.floor(CHORD_DUR / PLUCK_STEP);
    for (let s = 0; s < steps; s++) {
      if (s % 2 === 1 && Math.random() < 0.4) continue; // a little variation
      const f = chord[(s + idx) % chord.length] * 2;
      const t = t0 + s * PLUCK_STEP;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(g);
      g.connect(musicSession);
      osc.start(t);
      osc.stop(t + 0.95);
      trackVoice(osc);
    }
  }

  function musicPump() {
    if (!musicSession || !ctx) return;
    // Keep ~one chord scheduled ahead
    while (musicNextTime < ctx.currentTime + CHORD_DUR) {
      const idx = musicStep % CHORDS.length;
      scheduleChord(Math.max(musicNextTime, ctx.currentTime + 0.05), CHORDS[idx], idx);
      musicNextTime += CHORD_DUR;
      musicStep++;
    }
  }

  function startMusic() {
    if (!ready() || musicSession) return;
    musicSession = ctx.createGain();
    musicSession.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicSession.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    musicSession.connect(musicBus);
    musicNextTime = ctx.currentTime + 0.05;
    musicStep = 0;
    musicPump();
    musicTimer = setInterval(musicPump, 1000);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
    if (!musicSession || !ctx) { musicSession = null; return; }
    const session = musicSession;
    const voices = musicVoices;
    musicSession = null;
    musicVoices = [];
    const t = ctx.currentTime;
    session.gain.cancelScheduledValues(t);
    session.gain.setValueAtTime(session.gain.value, t);
    session.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    setTimeout(() => {
      voices.forEach((v) => { try { v.stop(); } catch (err) { /* already stopped */ } });
      try { session.disconnect(); } catch (err) { /* ignore */ }
    }, 450);
  }

  /* ---------- Weapon-specific fire sounds ---------- */

  // Play a weapon-specific fire sound using the weapon system's sound profile.
  // Falls back to the generic playShoot() if the weapon has no custom sound.
  function playWeaponFire(weapon) {
    if (!ready() || !weapon) { playShoot(); return; }
    var s = weapon.sound;
    if (!s) { playShoot(); return; }
    var t0 = ctx.currentTime;

    // Layer 1: Low-end thump
    var thump = ctx.createOscillator();
    var thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(s.thumpFreq[0], t0);
    thump.frequency.exponentialRampToValueAtTime(s.thumpFreq[1], t0 + 0.12);
    thumpGain.gain.setValueAtTime(s.gain, t0);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    thump.connect(thumpGain);
    thumpGain.connect(sfxBus);
    thump.start(t0);
    thump.stop(t0 + 0.17);

    // Layer 2: Mid crack
    var crack = ctx.createOscillator();
    var crackGain = ctx.createGain();
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(s.crackFreq[0], t0);
    crack.frequency.exponentialRampToValueAtTime(s.crackFreq[1], t0 + 0.06);
    crackGain.gain.setValueAtTime(s.gain * 0.45, t0);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    crack.connect(crackGain);
    crackGain.connect(sfxBus);
    crack.start(t0);
    crack.stop(t0 + 0.1);

    // Layer 3: Noise burst
    var bufferSize = Math.floor(ctx.sampleRate * (s.noiseDur + 0.02));
    var noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(s.gain * 0.6, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + s.noiseDur);
    var noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = s.noiseFreq;
    noiseFilter.Q.value = 0.8;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sfxBus);
    noise.start(t0);
    noise.stop(t0 + s.noiseDur + 0.02);

    // Layer 4: High-frequency ping
    var ping = ctx.createOscillator();
    var pingGain = ctx.createGain();
    ping.type = 'square';
    ping.frequency.setValueAtTime(s.pingFreq[0], t0);
    ping.frequency.exponentialRampToValueAtTime(s.pingFreq[1], t0 + 0.04);
    pingGain.gain.setValueAtTime(s.gain * 0.12, t0);
    pingGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    ping.connect(pingGain);
    pingGain.connect(sfxBus);
    ping.start(t0);
    ping.stop(t0 + 0.06);
  }

  /* ---------- Public API ---------- */

  return {
    // Create / resume the audio context. Must run inside a user gesture the first time.
    // Resolves to true once audio is actually running.
    unlock() {
      if (!ensure()) return Promise.resolve(false);
      if (ctx.state === 'running') return Promise.resolve(true);
      return ctx.resume().then(() => ctx.state === 'running').catch(() => false);
    },
    isReady: ready,
    // volumes: { master, music, sfx } each 0–100
    setVolumes(v) {
      vols = { ...vols, ...v };
      applyVolumes(false);
    },
    getVolumes() { return { ...vols }; },
    playHit, playMiss, playTick, playGo, playFinish, playShoot, playWeaponFire,
    startMusic, stopMusic,
    isMusicPlaying() { return !!musicSession; },
  };
})();
