/*!
 * Overstack — a tiny retro stacking game.
 * Drop sliding blocks so their fuses line up. Overhang burns away.
 *
 * Embed:
 *   <div id="game"></div>
 *   <script src="overstack.js"></script>
 *   <script>Overstack.mount('#game');</script>
 *
 * Or just: <div data-overstack></div> + the script tag (auto-mounts).
 *
 * Options for mount(target, opts):
 *   maxScale    max integer pixel scale (default 3 → 480x720)
 *   keys        'focus' (default, keys work when the game has focus) or 'window'
 *   scanlines   false to disable the CRT scanline overlay
 *   music       false to disable the background chiptune (sound effects stay)
 *   vibrate     false to disable phone vibration
 *   operatorCode  letters typed on the keyboard to open the hidden operator
 *                 menu (default 'OPERATOR'). Change it on your page.
 *   blockedNames  extra words to block in high-score names, e.g. ['BADWORD']
 *   onScore(score), onGameOver(score, best), onHighScore({name, score, rank})   callbacks
 *
 * mount() returns { canvas, restart(), scores(), clearScores(), openOperatorMenu(), destroy() }.
 * The top-10 leaderboard is stored in this browser's localStorage.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- constants
  const W = 160, H = 240, BH = 8, GROUND_Y = H - 22;
  const START_W = 64, PERFECT_TOL = 2, GROW = 3, ZONE_EVERY = 25;
  const CUR_SCREEN_Y = 92;
  const MAX_NAME = 8, MAX_SCORES = 10;

  // 3x5 pixel font
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111',
    '3': '111001011001111', '4': '101101111001001', '5': '111100111001111',
    '6': '111100111101111', '7': '111001001010010', '8': '111101111101111',
    '9': '111101111001111', 'A': '010101111101101', 'B': '110101110101110',
    'C': '011100100100011', 'D': '110101101101110', 'E': '111100110100111',
    'F': '111100110100100', 'G': '011100101101011', 'H': '101101111101101',
    'I': '111010010010111', 'J': '001001001101010', 'K': '101101110101101',
    'L': '100100100100111', 'M': '101111111101101', 'N': '110101101101101',
    'O': '010101101101010', 'P': '110101110100100', 'Q': '010101101110011',
    'R': '110101110101101', 'S': '011100010001110', 'T': '111010010010010',
    'U': '101101101101111', 'V': '101101101101010', 'W': '101101111111101',
    'X': '101101010101101', 'Y': '101101010010010', 'Z': '111001010100111',
    'x': '000101010101000', '!': '010010010000010', '+': '000010111010000',
    '-': '000000111000000', '.': '000000000000010', ':': '000010000010000',
    '?': '111001010000010', '<': '001010100010001', '>': '100010001010100',
    ' ': '000000000000000'
  };

  const PALETTES = [
    { sky: ['#1a1c2c', '#29366f', '#3b5dc9', '#41a6f6'], star: '#f4f4f4', cloud: '#94b0c2', cloudDark: '#566c86',
      hill: '#29366f', ground: '#1a1c2c', grass: '#38b764', groundDot: '#333c57',
      blocks: ['#ef7d57', '#ffcd75', '#a7f070', '#73eff7'], fuse: ['#f4f4f4', '#b13e53'],
      text: '#f4f4f4', shadow: '#1a1c2c', accent: '#ffcd75' },
    { sky: ['#1b0c1f', '#3d1430', '#6b1e3a', '#a33a3a'], star: '#ffd3a0', cloud: '#d9725b', cloudDark: '#8c2f39',
      hill: '#3d1430', ground: '#1b0c1f', grass: '#e0784a', groundDot: '#3d1430',
      blocks: ['#f2a65a', '#ffe28a', '#b6d36b', '#f4f1de'], fuse: ['#fff3d6', '#6b1e3a'],
      text: '#fff3d6', shadow: '#1b0c1f', accent: '#ffe28a' },
    { sky: ['#081820', '#0e3b43', '#16615b', '#2a9d8f'], star: '#c7f9cc', cloud: '#57cc99', cloudDark: '#22796b',
      hill: '#0e3b43', ground: '#081820', grass: '#80ed99', groundDot: '#0e3b43',
      blocks: ['#ffd166', '#ef476f', '#c7f9cc', '#f8f9fa'], fuse: ['#f8f9fa', '#7a1f36'],
      text: '#f8f9fa', shadow: '#081820', accent: '#ffd166' },
    { sky: ['#0f380f', '#1e4a1e', '#306230', '#4b7a2a'], star: '#9bbc0f', cloud: '#8bac0f', cloudDark: '#306230',
      hill: '#1e4a1e', ground: '#0f380f', grass: '#8bac0f', groundDot: '#1e4a1e',
      blocks: ['#9bbc0f', '#e0f0a0', '#c4d82e', '#6f9a1f'], fuse: ['#e0f8d0', '#0f380f'],
      text: '#e0f8d0', shadow: '#0f380f', accent: '#c4d82e' },
    { sky: ['#22223b', '#3d405b', '#5c6f9a', '#8fb3d9'], star: '#ffffff', cloud: '#e0fbfc', cloudDark: '#98c1d9',
      hill: '#3d405b', ground: '#22223b', grass: '#e0fbfc', groundDot: '#3d405b',
      blocks: ['#ee6c4d', '#ffd6a5', '#caffbf', '#e0fbfc'], fuse: ['#ffffff', '#9a3b2a'],
      text: '#ffffff', shadow: '#22223b', accent: '#ffd6a5' }
  ];

  // Flat shade variants for each block colour (no gradients — just steps).
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
  }
  function colorSet(h) {
    return { base: h, light: mix(h, '#ffffff', 0.38), dark: mix(h, '#000000', 0.42), mortar: mix(h, '#000000', 0.2) };
  }
  PALETTES.forEach(p => { p.sets = p.blocks.map(colorSet); });
  const STONE = colorSet('#8b9bb4');
  const FLASH = { base: '#ffffff', light: '#ffffff', dark: '#c2c3c7', mortar: '#e4e4e4' };
  const SPARK = ['#ffffff', '#fff1a8', '#ffcd75', '#ef7d57', '#b13e53'];
  const WOOD = { dark: '#4a2c1d', base: '#b8764f', light: '#e0a476', ink: '#3a1f12', nail: '#d8d8d8', shade: '#9a5f3e' };
  const SIGN_EVERY = 10;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };

  // Names are limited to characters the pixel font can draw.
  function cleanName(s) { return String(s).toUpperCase().replace(/[^A-Z0-9 .!\-]/g, '').slice(0, MAX_NAME); }

  // ---- name filter. Words are ROT13-encoded so the source isn't a wall of slurs.
  // BLOCK_ANY matches anywhere in the name; BLOCK_WORD only as a whole word
  // (so CLASS, GRAPE, RACCOON, NIGERIA etc. stay allowed).
  const rot13 = s => s.replace(/[A-Z]/g, c => String.fromCharCode((c.charCodeAt(0) - 52) % 26 + 65));
  const BLOCK_ANY = rot13('SHPX SHX SPX FUVG PHAG AVTT AVTN AVTE SNTT SNTBG OVGPU OVPU JUBER FYHG QVPX PBPX CHFFL CRAVF INTVAN GJNG JNAX CBEA ANMV UVGYRE XXX ERGNEQ PUVAX XVXR GENAAL QLXR WVMM NFFUBYR NFFUNG QVYQB OBYYBPX CVFF ONFGNEQ ARTEB OBARE FRKL UBEAL OYBJWBO ENCVFG ZBYRFG CRQB FCREZ BETNFZ OBBO GVGGL GVGGVR YRFOB').split(' ');
  const BLOCK_WORD = rot13('NFF NFFRF NEFR PHZ PHZF FRK GVG GVGF ENCR ENCRQ FCVP FCVPF PBBA SNT SNTF UB UBR UBRF AVTRE UBZB AHQR AHQRF FUNT PENC QNZA URYY WNC TBBX JBC XLF CEVPX').split(' ');
  const LEET = { '0': 'O', '1': 'I', '3': 'E', '4': 'A', '5': 'S', '7': 'T', '8': 'B', '!': 'I' };
  const squeeze = s => s.replace(/(.)\1+/g, '$1');
  function isBlocked(name, extra) {
    const up = String(name).toUpperCase().replace(/[0-9!]/g, ch => LEET[ch] || ch);
    const joined = up.replace(/[^A-Z]/g, '');
    const forms = [joined, squeeze(joined)];
    const any = extra ? BLOCK_ANY.concat(extra.map(w => String(w).toUpperCase())) : BLOCK_ANY;
    if (any.some(w => w && forms.some(f => f.includes(w)))) return true;
    const words = up.split(/[^A-Z]+/).filter(Boolean).concat(joined);
    return words.some(w => BLOCK_WORD.includes(w) || BLOCK_WORD.includes(squeeze(w)));
  }

  function loadScores() {
    try {
      const a = JSON.parse(store.get('overstack.scores') || '[]');
      if (!Array.isArray(a)) return [];
      return a
        .filter(e => e && Number.isFinite(e.score))
        .map(e => ({ name: cleanName(e.name || '').trim() || '???', score: Math.floor(e.score), t: e.t || 0 }))
        .sort((x, y) => y.score - x.score)
        .slice(0, MAX_SCORES);
    } catch (e) { return []; }
  }
  function saveScores(s) { store.set('overstack.scores', JSON.stringify(s)); }

  // ---------------------------------------------------------------- sound
  const Sound = (function () {
    const VOL = 0.22, MUSIC_VOL = 0.55;
    let ac = null, master = null, noiseBuf = null, pulse25 = null, musicGain = null, sfxGain = null;
    let volMusic = 1, volSfx = 1;
    let muted = store.get('overstack.muted') === '1';

    function init() {
      if (!ac) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : VOL;
        master.connect(ac.destination);
        // crunchy sample-and-hold noise for that 8-bit hiss
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        let v = 0;
        for (let i = 0; i < d.length; i++) { if (i % 6 === 0) v = Math.random() * 2 - 1; d[i] = v; }
        // 25% duty pulse wave — the classic thin NES lead/arp timbre
        const N = 32, re = new Float32Array(N), im = new Float32Array(N);
        for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
        pulse25 = ac.createPeriodicWave(re, im);
        musicGain = ac.createGain();
        musicGain.gain.value = MUSIC_VOL * volMusic;
        musicGain.connect(master);
        sfxGain = ac.createGain();
        sfxGain.gain.value = volSfx;
        sfxGain.connect(master);
      }
      if (ac.state === 'suspended') ac.resume();
    }

    function tone(f, dur, o) {
      o = o || {};
      if (!ac || muted) return;
      const t = o.at != null ? o.at : ac.currentTime + (o.delay || 0);
      const osc = ac.createOscillator(), gn = ac.createGain();
      if (o.wave) osc.setPeriodicWave(o.wave); else osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      gn.gain.setValueAtTime(o.vol == null ? 0.4 : o.vol, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gn).connect(o.dest || sfxGain);
      osc.start(t); osc.stop(t + dur + 0.02);
    }

    function noise(dur, o) {
      o = o || {};
      if (!ac || muted) return;
      const t = o.at != null ? o.at : ac.currentTime + (o.delay || 0);
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = o.type || 'lowpass';
      f.frequency.setValueAtTime(o.freq || 2000, t);
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const gn = ac.createGain();
      gn.gain.setValueAtTime(o.vol || 0.4, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(gn).connect(o.dest || sfxGain);
      src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.02);
    }

    // ---- chiptune: A minor loop (Am F C G), 16 steps per bar, 4 bars.
    // Layers: 0 bass · 1 +drums · 2 +arpeggio · 3 +lead melody
    const midi = m => 440 * Math.pow(2, (m - 69) / 12);
    const BARS = [
      { root: 45, tones: [57, 60, 64] }, { root: 41, tones: [53, 57, 60] },
      { root: 48, tones: [55, 60, 64] }, { root: 43, tones: [55, 59, 62] }
    ];
    const BASS = [0, 0, 12, 0, 7, 0, 12, 7];
    const ARP = [0, 1, 2, 1];
    const LEAD = {
      0: [69, 2], 2: [72, 2], 4: [76, 4], 8: [74, 2], 10: [72, 2], 12: [76, 4],
      16: [77, 4], 20: [76, 2], 22: [72, 2], 24: [69, 6], 30: [72, 2],
      32: [79, 4], 36: [76, 2], 38: [72, 2], 40: [76, 4], 44: [79, 4],
      48: [74, 4], 52: [71, 2], 54: [74, 2], 56: [79, 6], 62: [71, 2]
    };
    const music = { on: false, level: 0, target: 0, step: 0, next: 0, timer: 0, bpm: 120 };

    function musicStep(s, t, sd) {
      const bar = BARS[(s >> 4) & 3], i = s & 15, L = music.level, out = musicGain;
      if ((i & 1) === 0) tone(midi(bar.root + BASS[i >> 1]), sd * 1.7, { type: 'triangle', vol: 0.55, at: t, dest: out });
      if (L >= 1) {
        if (i === 0 || i === 8 || (L >= 3 && i === 10)) tone(150, 0.12, { type: 'triangle', to: 40, vol: 0.7, at: t, dest: out });
        if (i === 4 || i === 12) noise(0.1, { type: 'highpass', freq: 1500, vol: 0.28, at: t, dest: out });
        if ((i & 1) === 0) noise(0.03, { type: 'highpass', freq: 7000, vol: (i & 3) === 2 ? 0.14 : 0.07, at: t, dest: out });
      }
      if (L >= 2) tone(midi(bar.tones[ARP[i & 3]] + (i >= 8 ? 12 : 0)), sd * 0.9, { wave: pulse25, vol: 0.09, at: t, dest: out });
      if (L >= 3) {
        const n = LEAD[s & 63];
        if (n) tone(midi(n[0]), sd * n[1] * 0.95, { type: 'square', vol: 0.1, at: t, dest: out });
      }
    }

    function schedule() {
      if (!ac || !music.on) return;
      if (typeof document !== 'undefined' && document.hidden) { music.next = 0; return; }
      const sd = 60 / music.bpm / 4;
      if (music.next < ac.currentTime) music.next = ac.currentTime + 0.05;
      while (music.next < ac.currentTime + 0.15) {
        // new layers come in on the bar line so they land on the beat
        if ((music.step & 15) === 0 && music.target > music.level) music.level = music.target;
        musicStep(music.step, music.next, sd);
        music.next += sd;
        music.step++;
      }
    }

    const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    return {
      init,
      get muted() { return muted; },
      setMuted(m) {
        muted = m;
        store.set('overstack.muted', m ? '1' : '0');
        if (master) master.gain.value = m ? 0 : VOL;
      },
      start() { tone(392, 0.06); tone(784, 0.1, { delay: 0.06 }); },
      place() { tone(196, 0.07, { vol: 0.3 }); tone(98, 0.09, { type: 'triangle', vol: 0.5 }); },
      cut() {
        noise(0.3, { freq: 2600, to: 250, vol: 0.45 });
        tone(170, 0.22, { type: 'sawtooth', to: 60, vol: 0.18 });
      },
      perfect(combo) {
        const n = PENTA[Math.min(combo - 1, PENTA.length - 1)];
        const f = 523.25 * Math.pow(2, n / 12);
        tone(f, 0.08, { vol: 0.3 });
        tone(f * 1.5, 0.12, { vol: 0.25, delay: 0.06 });
      },
      grow() { tone(1046, 0.05, { vol: 0.18, delay: 0.13 }); tone(1568, 0.08, { vol: 0.18, delay: 0.18 }); },
      gust() { noise(0.45, { type: 'bandpass', freq: 600, to: 2400, vol: 0.3 }); },
      zone() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.1, { delay: i * 0.07, vol: 0.25 })); },
      over() {
        tone(330, 0.7, { type: 'sawtooth', to: 50, vol: 0.25 });
        tone(165, 0.7, { type: 'square', to: 40, vol: 0.15, delay: 0.05 });
        noise(0.6, { freq: 1500, to: 100, vol: 0.4 });
      },
      blip() { tone(660, 0.05, { vol: 0.2 }); },
      tick() { tone(880, 0.03, { vol: 0.12 }); },
      fuse() { noise(0.65, { type: 'bandpass', freq: 2500, to: 4000, vol: 0.18 }); },
      launch(delay) {
        noise(0.4, { type: 'bandpass', freq: 400, to: 2200, vol: 0.18, delay });
        tone(300, 0.4, { type: 'triangle', to: 900, vol: 0.06, delay });
      },
      burst() {
        noise(0.5, { freq: 3000, to: 200, vol: 0.4 });
        tone(90, 0.25, { type: 'triangle', to: 40, vol: 0.4 });
        for (let k = 0; k < 4; k++) noise(0.04, { type: 'highpass', freq: 5000, vol: 0.12, delay: 0.25 + k * 0.08 + Math.random() * 0.05 });
      },
      musicStart(bpm) {
        if (!ac) return;
        music.on = true; music.step = 0; music.level = 0; music.target = 0; music.bpm = bpm || 120;
        music.next = ac.currentTime + 0.05;
        musicGain.gain.cancelScheduledValues(ac.currentTime);
        musicGain.gain.setValueAtTime(MUSIC_VOL * volMusic, ac.currentTime);
        if (!music.timer) music.timer = setInterval(schedule, 25);
      },
      musicStop() {
        music.on = false;
        if (music.timer) { clearInterval(music.timer); music.timer = 0; }
        if (ac && musicGain) musicGain.gain.setTargetAtTime(0, ac.currentTime, 0.05);
      },
      musicLevel(n) { music.target = n; if (n < music.level) music.level = n; }, // drops apply instantly
      musicTempo(bpm) { music.bpm = bpm; },
      setVolumes(m, s) {
        volMusic = m; volSfx = s;
        if (!ac) return;
        sfxGain.gain.value = s;
        if (music.on) { musicGain.gain.cancelScheduledValues(ac.currentTime); musicGain.gain.setValueAtTime(MUSIC_VOL * m, ac.currentTime); }
      },
      error() { tone(110, 0.12, { vol: 0.35 }); tone(98, 0.18, { vol: 0.35, delay: 0.12 }); },
      saved() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.09, { delay: i * 0.06, vol: 0.22 })); }
    };
  })();

  // ---------------------------------------------------------------- caches
  const skyCache = [];
  function skyCanvas(pi) {
    if (skyCache[pi]) return skyCache[pi];
    const p = PALETTES[pi];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bandH = H / p.sky.length;
    p.sky.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * bandH, W, bandH); });
    // dithered seams between flat bands
    for (let i = 1; i < p.sky.length; i++) {
      const y0 = i * bandH;
      for (let x = 0; x < W; x++) {
        g.fillStyle = p.sky[i];
        if ((x & 3) === 0) g.fillRect(x, y0 - 3, 1, 1);
        if ((x & 1) === 0) g.fillRect(x, y0 - 2, 1, 1);
        if ((x & 1) === 1) g.fillRect(x, y0 - 1, 1, 1);
        g.fillStyle = p.sky[i - 1];
        if ((x & 1) === 0) g.fillRect(x, y0, 1, 1);
        if ((x & 3) === 2) g.fillRect(x, y0 + 1, 1, 1);
      }
    }
    return (skyCache[pi] = c);
  }

  const SPEAKER = ['001', '011', '1111', '1111', '1111', '011', '001'];

  // ---------------------------------------------------------------- game
  function mount(target, opts) {
    opts = opts || {};
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) throw new Error('Overstack: mount target not found');

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H; canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Overstack game. Tap, click or press Space to drop the block. M toggles sound.');
    const st = canvas.style;
    st.display = 'block'; st.margin = '0 auto'; st.outline = 'none'; st.cursor = 'pointer';
    st.touchAction = 'manipulation'; st.userSelect = 'none'; st.webkitUserSelect = 'none';
    st.webkitTapHighlightColor = 'transparent';
    st.imageRendering = 'crisp-edges'; st.imageRendering = 'pixelated';

    // Invisible text input: gives us the real keyboard (incl. mobile) for name
    // entry, while the name itself is drawn on the canvas in the pixel font.
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = MAX_NAME; input.autocomplete = 'off'; input.spellcheck = false; input.tabIndex = -1;
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', 'Your name for the high score table');
    Object.assign(input.style, {
      position: 'absolute', left: '50%', top: '50%', width: '1px', height: '1px', opacity: '0',
      border: '0', padding: '0', margin: '0', fontSize: '16px', pointerEvents: 'none',
      background: 'transparent', color: 'transparent'
    });
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    wrap.appendChild(canvas);
    wrap.appendChild(input);
    host.appendChild(wrap);

    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    const coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);

    const maxScale = opts.maxScale || 3;
    function fit() {
      if (document.activeElement === input) return; // don't resize when the mobile keyboard opens
      const avail = host.clientWidth || W;
      let s = Math.min(avail / W, maxScale, (root.innerHeight * 0.95) / H);
      if (s >= 1) s = Math.floor(s);
      st.width = Math.round(W * s) + 'px';
      st.height = Math.round(H * s) + 'px';
    }
    fit();
    let ro = null;
    if (root.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }
    root.addEventListener('resize', fit);

    // ---- state
    let state = 'title', tower = [], cur = null, cam = 0, score = 0, combo = 0, zone = 0;
    const scores = loadScores();
    let best = Math.max(+store.get('overstack.best') || 0, scores.length ? scores[0].score : 0);
    let overT = 0, time = 0, shake = 0, zoneFlash = 0;
    let entering = false, autoFocused = false, newRank = -1, okBtn = null;
    // best height in blocks; runBest is frozen at the start of a run so the marker stays put
    let bestHeight = +store.get('overstack.bestHeight') || 0, runBest = 0, passedBest = false;
    let musicDropUntil = 0;
    const fuseRuns = [], rockets = [], fw = [];

    // operator settings (changed in the hidden operator menu, saved per browser)
    const OPS_DEFAULT = { music: 10, sfx: 10, nameTimeout: 30, idleTimeout: 30, vibrate: true };
    const ops = Object.assign({}, OPS_DEFAULT);
    try { Object.assign(ops, JSON.parse(store.get('overstack.ops') || '{}')); } catch (e) { /* keep defaults */ }
    const saveOps = () => store.set('overstack.ops', JSON.stringify(ops));
    const applyOps = () => Sound.setVolumes(ops.music / 10, ops.sfx / 10);
    applyOps();

    // idle tracking: seconds of game time since the last player input
    let lastInput = 0, nameError = 0;
    const poke = () => { lastInput = time; };

    const canBuzz = opts.vibrate !== false && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    function buzz(pattern) { if (canBuzz && ops.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignored */ } } }
    const qualifies = s => s > 0 && (scores.length < MAX_SCORES || s > scores[scores.length - 1].score);
    let dirFlip = 1;
    const debris = [], parts = [], floats = [];
    const stars = Array.from({ length: 36 }, () => ({ x: (Math.random() * W) | 0, y: (Math.random() * H) | 0, p: Math.random() * 6 }));
    const clouds = Array.from({ length: 4 }, (_, i) => ({ x: Math.random() * W, y: 30 + i * 46, w: 14 + ((Math.random() * 14) | 0), v: 2 + Math.random() * 4 }));
    const hills = Array.from({ length: W }, (_, x) => Math.round(16 + 7 * Math.sin(x * 0.06) + 5 * Math.sin(x * 0.17 + 1.3) + 2 * Math.sin(x * 0.5)));

    const pal = () => PALETTES[zone % PALETTES.length];
    const rowY = i => GROUND_Y - (i + 1) * BH;
    const placed = () => tower.length - 1;
    const blink = rate => Math.floor(time * rate) % 2 === 0;
    const mod8 = n => ((n % 8) + 8) % 8;
    const setOf = b => (b.ci < 0 ? STONE : PALETTES[b.pi % PALETTES.length].sets[b.ci]);
    const fuseOf = b => PALETTES[b.pi % PALETTES.length].fuse;

    function reset() {
      tower = [{ x: (W - START_W) / 2, w: START_W, ci: -1, pi: 0, phase: 0, flash: 0 }];
      score = 0; combo = 0; zone = 0; cam = 0; overT = 0;
      entering = false; newRank = -1; nameError = 0;
      runBest = bestHeight; passedBest = false;
      poke();
      debris.length = 0; parts.length = 0; floats.length = 0;
      fuseRuns.length = 0; rockets.length = 0; fw.length = 0;
      musicDropUntil = 0;
      spawn();
    }

    function spawn() {
      const top = tower[tower.length - 1];
      const n = placed();
      dirFlip = -dirFlip;
      cur = {
        x: dirFlip > 0 ? 0 : W - top.w, w: top.w, dir: dirFlip, t: 0,
        ci: n % 4, pi: zone, phase: top.phase,
        speed: Math.min(42 + n * 2.4, 150),
        gust: state === 'play' && n >= 8 && Math.random() < 0.18
      };
      if (cur.gust) {
        Sound.gust();
        addFloat('GUST!', W / 2, rowY(tower.length) - 10, pal().text, 1, 0.9);
      }
    }

    function addFloat(text, x, y, color, scale, life) {
      floats.push({ text, x, y, color, scale: scale || 1, life: life || 0.9, max: life || 0.9 });
    }

    function embers(x, y, n, spread, life) {
      for (let k = 0; k < n; k++) {
        const l = (life || 0.5) * (0.5 + Math.random());
        parts.push({ x, y, vx: (Math.random() * 2 - 1) * spread, vy: -Math.random() * spread - 8, g: 140, life: l, max: l });
      }
    }

    function drop() {
      const top = tower[tower.length - 1];
      const x = Math.round(cur.x), w = cur.w, y = rowY(tower.length);
      const p = pal();
      const dx = x - top.x;

      if (Math.abs(dx) <= PERFECT_TOL) {
        combo++;
        const b = { x: top.x, w, ci: cur.ci, pi: cur.pi, phase: cur.phase, flash: 0.12 };
        let grew = false;
        if (combo >= 3 && w < START_W) {
          const gw = Math.min(GROW, START_W - w);
          b.x = Math.max(0, b.x - gw); b.w += gw; b.phase = mod8(b.phase - gw);
          grew = true;
        }
        tower.push(b);
        // height is the main score; a perfect only pays extra when it regrows the block
        const pts = grew ? 2 : 1;
        score += pts;
        Sound.place(); Sound.perfect(combo);
        if (grew) Sound.grow();
        buzz(15);
        // 10 perfects in a row: light the shared fuse down the chain → fireworks
        if (combo % 10 === 0) {
          fuseRuns.push({ from: tower.length - 1, to: Math.max(1, tower.length - 10), t: 0 });
          Sound.fuse();
        }
        // the fuses link: spark at the junction
        embers(top.x + top.w - 1, y + BH, 14, 50, 0.6);
        addFloat(combo >= 2 ? 'PERFECT x' + combo : 'PERFECT', W / 2, y - 12, p.accent, 1, 0.8);
        addFloat('+' + pts, b.x + b.w + 8, y, p.text, 1, 0.7);
      } else {
        combo = 0;
        const L = Math.max(x, top.x), R = Math.min(x + w, top.x + top.w), ow = R - L;
        if (ow <= 0) return gameOver(x, y);
        const leftCut = x < top.x;
        debris.push({ x: leftCut ? x : R, y, w: w - ow, vx: leftCut ? -16 : 16, vy: -30,
                      set: PALETTES[cur.pi % PALETTES.length].sets[cur.ci], t: 0, burnT: 0, flip: 0 });
        tower.push({ x: L, w: ow, ci: cur.ci, pi: cur.pi, phase: mod8(cur.phase + (L - x)), flash: 0 });
        score += 1;
        Sound.place(); Sound.cut();
        buzz(35);
        musicDropUntil = placed() + 4; // music loses a layer for a few blocks
        shake = 2;
        const edge = leftCut ? L : R - 1;
        for (let k = 0; k < 4; k++) embers(edge, y + 1 + k * 2, 2, 25, 0.5);
        addFloat('+1', L + ow + 8, y, p.text, 1, 0.6);
      }

      if (!passedBest && runBest > 0 && placed() > runBest) {
        passedBest = true;
        Sound.saved();
        buzz([20, 40, 20]);
        addFloat('NEW HEIGHT!', W / 2, y - 14, p.accent, 1, 1.4);
      }

      if (placed() % ZONE_EVERY === 0) {
        zone++;
        zoneFlash = 0.12;
        Sound.zone();
        buzz([15, 30, 15, 30, 15]);
        addFloat('ZONE ' + (zone + 1), W / 2, y - 26, pal().accent, 2, 1.6);
      }
      // music builds with height and loses a layer after a cut
      const h = placed();
      let lvl = h >= 40 ? 3 : h >= 20 ? 2 : h >= 8 ? 1 : 0;
      if (h < musicDropUntil) lvl = Math.max(0, lvl - 1);
      Sound.musicLevel(lvl);
      Sound.musicTempo(Math.min(150, 120 + zone * 6));

      if (opts.onScore) opts.onScore(score);
      spawn();
    }

    function launchFireworks(row) {
      const n = 4, blocks = pal().blocks;
      for (let k = 0; k < n; k++) {
        const delay = k * 0.18;
        rockets.push({ x: 14 + ((k + Math.random()) * (W - 28)) / n, y: rowY(row) + BH,
                       vy: -(150 + Math.random() * 40), delay, color: blocks[k % blocks.length] });
        Sound.launch(delay);
      }
    }

    function burst(r) {
      const n = 26, accent = pal().accent;
      for (let a = 0; a < n; a++) {
        const ang = (a / n) * Math.PI * 2 + Math.random() * 0.1, sp = 42 + Math.random() * 14;
        const l = 1 + Math.random() * 0.4;
        fw.push({ x: r.x, y: r.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: l, max: l, color: r.color });
      }
      for (let a = 0; a < 10; a++) { // smaller inner ring
        const ang = (a / 10) * Math.PI * 2, l = 0.7;
        fw.push({ x: r.x, y: r.y, vx: Math.cos(ang) * 18, vy: Math.sin(ang) * 18, life: l, max: l, color: accent });
      }
      Sound.burst();
      buzz(12);
    }

    // abandoned = the player walked away mid-game; that run skips name entry
    function gameOver(x, y, abandoned) {
      debris.push({ x, y, w: cur.w, vx: cur.dir * 20, vy: -40,
                    set: PALETTES[cur.pi % PALETTES.length].sets[cur.ci], t: 0, burnT: 0, flip: 0 });
      cur = null; state = 'over'; overT = 0; shake = 5;
      Sound.musicStop();
      Sound.over();
      buzz([80, 50, 160]);
      if (score > best) { best = score; store.set('overstack.best', String(best)); }
      if (placed() > bestHeight) { bestHeight = placed(); store.set('overstack.bestHeight', String(bestHeight)); }
      entering = !abandoned && qualifies(score);
      autoFocused = false; newRank = -1;
      poke();
      if (entering) input.value = store.get('overstack.name') || '';
      if (opts.onGameOver) opts.onGameOver(score, best, placed());
    }

    function focusInput() {
      // re-focus so a tap always (re)opens the mobile keyboard
      if (document.activeElement === input) input.blur();
      input.focus({ preventScroll: true });
    }

    // auto = the name timer ran out; a blocked or empty name is then saved as ???
    function submitName(save, auto) {
      if (!entering) return;
      if (save) {
        let name = cleanName(input.value).trim();
        if (name && isBlocked(name, opts.blockedNames)) {
          if (!auto) {
            nameError = 2; input.value = '';
            Sound.error(); buzz(60); poke();
            return;
          }
          name = '';
        }
        name = name || '???';
        if (name !== '???') store.set('overstack.name', name);
        let i = scores.findIndex(e => score > e.score);
        if (i < 0) i = scores.length;
        scores.splice(i, 0, { name, score, t: Date.now() });
        if (scores.length > MAX_SCORES) scores.length = MAX_SCORES;
        newRank = i < MAX_SCORES ? i : -1;
        saveScores(scores);
        Sound.saved();
        if (opts.onHighScore) opts.onHighScore({ name, score, rank: i + 1 });
      }
      entering = false;
      input.blur();
      canvas.focus({ preventScroll: true });
      overT = 0;
      poke();
    }

    function action() {
      Sound.init();
      if (state === 'title' || (state === 'over' && !entering && overT > 0.5)) {
        state = 'play'; reset(); Sound.start();
        if (opts.music !== false) Sound.musicStart(120);
      } else if (state === 'play') drop();
    }

    // ---- hidden operator menu: type the operator code (default OPERATOR) on the keyboard
    const OPS_CODE = String(opts.operatorCode || 'OPERATOR').toUpperCase();
    const OPS_Y0 = 46, OPS_DY = 13;
    const NAME_T = [10, 20, 30, 60, 0], IDLE_T = [15, 30, 60, 120, 0];
    let opsOpen = false, opsSel = 0, opsArmed = -1, opsMsg = '', opsMsgT = 0, codeBuf = '';
    const cycle = (arr, v, d) => arr[(arr.indexOf(v) + d + arr.length) % arr.length];
    const fmtT = v => (v ? v + 'S' : 'OFF');
    const clamp10 = v => Math.max(0, Math.min(10, v));
    const opsSay = m => { opsMsg = m; opsMsgT = 2.5; };

    const OPS = [
      { label: 'MUSIC VOL', val: () => String(ops.music), step: d => { ops.music = clamp10(ops.music + d); } },
      { label: 'SOUND VOL', val: () => String(ops.sfx), step: d => { ops.sfx = clamp10(ops.sfx + d); } },
      { label: 'NAME TIMER', val: () => fmtT(ops.nameTimeout), step: d => { ops.nameTimeout = cycle(NAME_T, ops.nameTimeout, d); } },
      { label: 'IDLE TIMER', val: () => fmtT(ops.idleTimeout), step: d => { ops.idleTimeout = cycle(IDLE_T, ops.idleTimeout, d); } },
      { label: 'VIBRATION', val: () => (ops.vibrate ? 'ON' : 'OFF'), step: () => { ops.vibrate = !ops.vibrate; } },
      { label: 'DELETE NEWEST', confirm: true, run: deleteNewest },
      { label: 'CLEAR SCORES', confirm: true, run: clearAll },
      { label: 'EXIT', run: closeOps }
    ];

    function openOps() {
      Sound.init();
      opsOpen = true; opsSel = 0; opsArmed = -1; codeBuf = '';
      input.blur();
      canvas.focus({ preventScroll: true });
      Sound.blip();
    }
    function closeOps() {
      opsOpen = false; opsArmed = -1;
      poke();
      if (entering) focusInput();
    }
    function opsAdjust(d) {
      OPS[opsSel].step(d);
      saveOps(); applyOps();
      Sound.blip();
    }
    function opsActivate(i) {
      const it = OPS[i];
      if (it.step) return opsAdjust(1);
      if (it.confirm && opsArmed !== i) { opsArmed = i; Sound.blip(); return; }
      opsArmed = -1;
      it.run();
    }
    function deleteNewest() {
      if (!scores.length) return opsSay('NO SCORES');
      let k = 0;
      scores.forEach((e, i) => { if ((e.t || 0) > (scores[k].t || 0)) k = i; });
      const gone = scores.splice(k, 1)[0];
      saveScores(scores);
      best = scores.length ? scores[0].score : 0;
      store.set('overstack.best', String(best));
      newRank = -1;
      opsSay('DELETED ' + gone.name);
      Sound.cut();
    }
    function clearAll() {
      scores.length = 0; saveScores(scores);
      best = 0; store.set('overstack.best', '0');
      bestHeight = 0; runBest = 0; store.set('overstack.bestHeight', '0');
      newRank = -1;
      opsSay('SCORES CLEARED');
      Sound.cut();
    }
    function opsKey(e) {
      e.preventDefault();
      const n = OPS.length;
      switch (e.code) {
        case 'ArrowUp': opsSel = (opsSel + n - 1) % n; opsArmed = -1; break;
        case 'ArrowDown': opsSel = (opsSel + 1) % n; opsArmed = -1; break;
        case 'ArrowLeft': if (OPS[opsSel].step) opsAdjust(-1); break;
        case 'ArrowRight': if (OPS[opsSel].step) opsAdjust(1); break;
        case 'Enter': case 'Space': opsActivate(opsSel); break;
        case 'Escape': closeOps(); break;
      }
    }
    // returns true when this keypress completed the operator code
    function checkCode(e) {
      if (e.key && e.key.length === 1 && /[a-z0-9]/i.test(e.key)) {
        codeBuf = (codeBuf + e.key.toUpperCase()).slice(-OPS_CODE.length);
        if (codeBuf === OPS_CODE) { openOps(); return true; }
      }
      return false;
    }

    function toggleMute() {
      Sound.init();
      Sound.setMuted(!Sound.muted);
      if (!Sound.muted) Sound.blip();
    }

    // ---- update
    function update(dt) {
      time += dt;
      opsMsgT = Math.max(0, opsMsgT - dt);
      if (opsOpen) return; // the operator menu freezes the game
      nameError = Math.max(0, nameError - dt);

      // idle timeouts so an unattended kiosk never gets stuck
      const idle = time - lastInput;
      if (state === 'play' && cur && ops.idleTimeout && idle > ops.idleTimeout) {
        gameOver(Math.round(cur.x), rowY(tower.length), true);
      } else if (state === 'over' && entering && ops.nameTimeout && idle > ops.nameTimeout) {
        submitName(true, true);
      } else if (state === 'over' && !entering && ops.idleTimeout && idle > ops.idleTimeout) {
        state = 'title';
        reset();
      }

      if (cur) {
        cur.t += dt;
        const v = cur.speed * (cur.gust ? 1 + 0.75 * Math.sin(cur.t * 7) : 1);
        cur.x += cur.dir * v * dt;
        const maxX = W - cur.w;
        if (cur.x < 0) { cur.x = -cur.x; cur.dir = 1; }
        if (cur.x > maxX) { cur.x = 2 * maxX - cur.x; cur.dir = -1; }
        cur.x = Math.max(0, Math.min(maxX, cur.x));
      }

      if (state !== 'over') {
        const target = Math.max(0, CUR_SCREEN_Y - rowY(tower.length));
        cam += (target - cam) * Math.min(1, dt * 6);
      } else {
        overT += dt;
        // desktop: start typing right away (after a beat, so drop-key mashing isn't captured)
        if (entering && !autoFocused && !coarse && overT > 0.6) { autoFocused = true; focusInput(); }
      }

      // lit fuse on the top block
      const top = tower[tower.length - 1];
      if (state === 'play' && Math.random() < dt * 10) embers(top.x + top.w - 1, rowY(tower.length - 1) - 1, 1, 12, 0.35);

      for (let i = tower.length - 1; i >= Math.max(0, tower.length - 3); i--) {
        if (tower[i].flash > 0) tower[i].flash -= dt;
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.life <= 0) parts.splice(i, 1);
      }

      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.vy += 380 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.t += dt; d.burnT += dt;
        while (d.burnT > 0.03 && d.w > 0) {
          d.burnT -= 0.03;
          d.flip ^= 1;
          if (d.flip) { d.x += 1; embers(d.x, d.y + Math.random() * BH, 1, 20, 0.4); }
          else embers(d.x + d.w - 1, d.y + Math.random() * BH, 1, 20, 0.4);
          d.w -= 1;
        }
        if (d.w <= 0 || d.y + cam > H + 20) debris.splice(i, 1);
      }

      // spark running down the linked fuse
      for (let i = fuseRuns.length - 1; i >= 0; i--) {
        const f = fuseRuns[i];
        f.t += dt;
        const row = f.from - Math.floor(f.t * 18);
        if (row < f.to) { launchFireworks(f.to); fuseRuns.splice(i, 1); continue; }
        const b = tower[row];
        if (b && Math.random() < 0.8) embers(b.x + b.w - 1, rowY(row) + Math.random() * BH, 1, 25, 0.35);
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        if (r.delay > 0) { r.delay -= dt; continue; }
        r.vy += 160 * dt; r.y += r.vy * dt;
        if (Math.random() < 0.6) parts.push({ x: r.x, y: r.y + 2, vx: (Math.random() - 0.5) * 6, vy: 10, g: 40, life: 0.3, max: 0.3 });
        if (r.vy > -25) { burst(r); rockets.splice(i, 1); }
      }
      for (let i = fw.length - 1; i >= 0; i--) {
        const s = fw[i], drag = Math.max(0, 1 - 1.8 * dt);
        s.vx *= drag; s.vy = s.vy * drag + 30 * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        if (s.life <= 0) fw.splice(i, 1);
      }

      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.y -= 14 * dt; f.life -= dt;
        if (f.life <= 0) floats.splice(i, 1);
      }

      for (const c of clouds) {
        c.x += c.v * dt;
        if (c.x > W + 4) { c.x = -c.w - 4; }
      }

      shake = Math.max(0, shake - dt * 12);
      zoneFlash = Math.max(0, zoneFlash - dt);
    }

    // ---- draw helpers
    function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.floor(x), Math.floor(y), w, h); }

    function text(str, x, y, color, scale, align, shadow) {
      str = String(str); scale = scale || 1;
      const adv = 4 * scale, width = str.length * adv - scale;
      if (align === 'center') x -= Math.floor(width / 2);
      else if (align === 'right') x -= width;
      x = Math.floor(x); y = Math.floor(y);
      const pass = (ox, oy, col) => {
        g.fillStyle = col;
        for (let i = 0; i < str.length; i++) {
          const gl = FONT[str[i]] || FONT[str[i].toUpperCase()];
          if (!gl) continue;
          for (let b = 0; b < 15; b++) {
            if (gl[b] === '1') g.fillRect(x + ox + i * adv + (b % 3) * scale, y + oy + ((b / 3) | 0) * scale, scale, scale);
          }
        }
      };
      if (shadow) pass(scale, scale, shadow);
      pass(0, 0, color);
    }

    function drawBlock(x, y, w, set, row, phase, fuse) {
      x = Math.round(x); y = Math.round(y);
      if (w <= 0 || y > H || y < -BH) return;
      rect(x, y, w, BH, set.base);
      if (w >= 4) {
        // brick texture + a dithered bottom course
        rect(x, y + 4, w, 1, set.mortar);
        const off = row & 1 ? 4 : 0;
        for (let i = 1; i < w - 2; i++) {
          const u = mod8(i + phase + off);
          if (u === 0) rect(x + i, y + 1, 1, 3, set.mortar);
          if (u === 4) rect(x + i, y + 5, 1, 2, set.mortar);
          if (((i + phase) & 1) === 0) rect(x + i, y + 6, 1, 1, set.mortar);
        }
      }
      rect(x, y, w, 1, set.light);
      rect(x, y, 1, BH - 1, set.light);
      rect(x, y + BH - 1, w, 1, set.dark);
      if (fuse && w >= 4) {
        // striped fuse cord along the right edge
        rect(x + w - 2, y + 1, 1, BH - 2, set.dark);
        for (let r = 0; r < BH; r++) rect(x + w - 1, y + r, 1, 1, (r & 1) ? fuse[0] : fuse[1]);
      } else {
        rect(x + w - 1, y, 1, BH, set.dark);
      }
    }

    // small wooden height sign on whichever side of the block has room
    function drawSign(b, y, n) {
      const label = String(n), bw = label.length * 4 + 5, bh = 9;
      const roomL = b.x, roomR = W - (b.x + b.w);
      const left = roomL >= bw + 3 || roomL >= roomR;
      const sx = Math.max(0, Math.min(W - bw, left ? b.x - bw - 2 : b.x + b.w + 2));
      const sy = y - 1;
      rect(left ? sx + bw : b.x + b.w, y + 3, 2, 2, WOOD.dark); // bracket
      rect(sx, sy, bw, bh, WOOD.dark);
      rect(sx + 1, sy + 1, bw - 2, bh - 2, WOOD.base);
      rect(sx + 1, sy + 1, bw - 2, 1, WOOD.light);
      rect(sx + 1, sy + bh - 2, bw - 2, 1, WOOD.shade);
      text(label, sx + 3, sy + 2, WOOD.ink);
      rect(sx + 1, sy + 1, 1, 1, WOOD.nail);
      rect(sx + bw - 2, sy + 1, 1, 1, WOOD.nail);
    }

    function drawCloud(x, y, w, p) {
      rect(x + 3, y, w - 7, 2, p.cloud);
      rect(x, y + 2, w, 3, p.cloud);
      rect(x + 1, y + 5, w - 2, 1, p.cloudDark);
    }

    function drawSpeaker(x, y, col, shadow) {
      const pass = (ox, oy, c) => {
        g.fillStyle = c;
        SPEAKER.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') g.fillRect(x + ox + i, y + oy + r, 1, 1); });
        if (Sound.muted) {
          [[5, 2], [7, 2], [6, 3], [5, 4], [7, 4]].forEach(([a, b]) => g.fillRect(x + ox + a, y + oy + b, 1, 1));
        } else {
          [[5, 1], [6, 2], [6, 3], [6, 4], [5, 5], [7, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [7, 6]]
            .forEach(([a, b]) => g.fillRect(x + ox + a, y + oy + b, 1, 1));
        }
      };
      pass(1, 1, shadow);
      pass(0, 0, col);
    }

    // ---- draw
    function draw() {
      const p = pal(), c = Math.round(cam);

      // sky (pre-rendered flat bands with dithered seams)
      g.drawImage(skyCanvas(zone % PALETTES.length), 0, 0);

      // stars
      for (const s of stars) {
        const sy = Math.floor((s.y + c * 0.15) % H);
        if (sy < H / 2 && ((time * 1.5 + s.p) % 6) > 0.4) rect(s.x, sy, 1, 1, p.star);
      }
      // clouds
      for (const cl of clouds) {
        const cy = Math.floor(((cl.y + c * 0.3) % (H + 30)) - 15);
        drawCloud(Math.floor(cl.x), cy, cl.w, p);
      }
      // hills
      const hb = GROUND_Y + Math.round(c * 0.5);
      if (hb - 32 < H) for (let x = 0; x < W; x++) rect(x, hb - hills[x], 1, H, p.hill);
      // ground
      const gy = GROUND_Y + c;
      if (gy < H) {
        rect(0, gy, W, H - gy, p.ground);
        rect(0, gy, W, 1, p.grass);
        for (let x = 0; x < W; x++) if ((x * 7 + 3) % 5 === 0) rect(x, gy - 1, 1, 1, p.grass);
        for (let yy = 4; yy < 24; yy += 3) for (let x = (yy * 3) % 6; x < W; x += 6) rect(x, gy + yy, 1, 1, p.groundDot);
      }

      g.save();
      if (shake > 0) g.translate(Math.round((Math.random() * 2 - 1) * shake), Math.round((Math.random() * 2 - 1) * shake));

      const markerY = runBest > 0 && state !== 'title' ? rowY(runBest - 1) + c - 1 : null;
      const markerCol = passedBest ? p.text : p.accent;
      if (markerY !== null && markerY > -12 && markerY < H) {
        // dashed line just above your best block (drawn behind the tower)
        for (let x = 0; x < W; x += 4) { rect(x, markerY, 2, 1, markerCol); rect(x, markerY + 1, 2, 1, p.shadow); }
      }

      // fireworks live in the sky, behind the tower
      for (const r of rockets) {
        if (r.delay > 0) continue;
        rect(r.x, r.y + c, 1, 2, '#ffffff');
        rect(r.x, r.y + c + 2, 1, 1, SPARK[2 + (Math.floor(time * 30) % 2)]);
      }
      for (const s of fw) {
        const k = s.life / s.max;
        let col;
        if (k > 0.82) col = '#ffffff';
        else if (k > 0.35) col = s.color;
        else if (Math.random() < 0.55) col = SPARK[1 + ((Math.random() * 3) | 0)]; // crackle
        else continue;
        rect(s.x, s.y + c, 1, 1, col);
        if (k > 0.55) rect(s.x - s.vx * 0.04, s.y - s.vy * 0.04 + c, 1, 1, col); // short streak
      }

      // tower
      for (let i = 0; i < tower.length; i++) {
        const b = tower[i], y = rowY(i) + c;
        if (y > H || y < -BH) continue;
        drawBlock(b.x, y, b.w, b.flash > 0 ? FLASH : setOf(b), i, b.phase, fuseOf(b));
      }
      // height signs nailed to the tower
      for (let i = SIGN_EVERY; i < tower.length; i += SIGN_EVERY) {
        const y = rowY(i) + c;
        if (y > -10 && y < H) drawSign(tower[i], y, i);
      }
      // the burning spark travelling down a linked fuse
      for (const f of fuseRuns) {
        const prog = f.t * 18, row = f.from - Math.floor(prog), b = tower[row];
        if (!b) continue;
        const sy = rowY(row) + c + Math.floor((prog % 1) * BH);
        rect(b.x + b.w - 2, sy - 1, 2, 2, SPARK[Math.floor(time * 30) % 3]);
        rect(b.x + b.w - 1, sy - 2, 1, 1, '#ffffff');
      }
      // fuse spark on top block
      if (state === 'play') {
        const t = tower[tower.length - 1];
        rect(t.x + t.w - 1, rowY(tower.length - 1) + c - 1, 1, 1, SPARK[Math.floor(time * 20) % 3]);
      }

      // best-height flag + label (in front of the tower so it stays readable)
      if (markerY !== null && markerY > -12 && markerY < H + 12) {
        const fx = W - 10, wave = Math.floor(time * 4) % 2;
        rect(fx + 1, markerY - 10, 1, 11, p.shadow);
        rect(fx, markerY - 11, 1, 12, p.text);
        rect(fx + 1, markerY - 11, 7, 2, markerCol);
        rect(fx + 1, markerY - 9, 5 + wave, 1, markerCol);
        rect(fx + 1, markerY - 8, 3 + wave, 1, markerCol);
        text((passedBest ? 'OLD BEST ' : 'BEST ') + runBest, 3, markerY - 7, markerCol, 1, 'left', p.shadow);
      }

      // current block
      if (cur) {
        const y = rowY(tower.length) + c;
        drawBlock(cur.x, y, cur.w, PALETTES[cur.pi % PALETTES.length].sets[cur.ci], tower.length, cur.phase, PALETTES[cur.pi % PALETTES.length].fuse);
        if (cur.gust) {
          for (let k = 0; k < 3; k++) {
            const len = 3 + ((Math.floor(time * 18) + k) % 3);
            const lx = cur.dir > 0 ? cur.x - 3 - k * 2 - len : cur.x + cur.w + 3 + k * 2;
            rect(lx, y + 1 + k * 3, len, 1, p.text);
          }
        }
      }

      // burning debris
      for (const d of debris) {
        const y = d.y + c;
        const set = d.t < 0.06 ? FLASH : d.set;
        rect(d.x, y, d.w, BH, set.base);
        rect(d.x, y, d.w, 1, set.light);
        rect(d.x, y + BH - 1, d.w, 1, set.dark);
        for (let i = 0; i < d.w; i += 2) {
          if (Math.random() < 0.5) rect(d.x + i, y - 1 - ((Math.random() * 2) | 0), 1, 1, SPARK[2 + ((Math.random() * 2) | 0)]);
          if (Math.random() < 0.3) rect(d.x + i, y + 2 + ((Math.random() * 4) | 0), 1, 1, SPARK[3]);
        }
      }

      // particles
      for (const pt of parts) {
        const idx = Math.min(SPARK.length - 1, Math.floor((1 - pt.life / pt.max) * SPARK.length));
        rect(pt.x, pt.y + c, 1, 1, SPARK[idx]);
      }

      // floating text
      for (const f of floats) {
        if (f.life < 0.2 && blink(16)) continue;
        const half = (f.text.length * 4 * f.scale) / 2;
        const fx = Math.max(half + 1, Math.min(W - half - 1, f.x));
        text(f.text, fx, f.y + c, f.color, f.scale, 'center', p.shadow);
      }
      g.restore();

      if (zoneFlash > 0) rect(0, 0, W, H, p.text);

      // HUD
      text('HI ' + best, 4, 4, p.text, 1, 'left', p.shadow);
      drawSpeaker(W - 13, 3, p.text, p.shadow);

      if (state === 'title' && scores.length && Math.floor(time / 5) % 2 === 1) {
        // attract mode: alternate the logo with the high score table
        panel(14, 20, 132, 122, p);
        text('HIGH SCORES', W / 2, 30, p.accent, 2, 'center');
        drawScores(50, -1, p);
        if (blink(2)) text('TAP OR SPACE', W / 2, 152, p.accent, 1, 'center', p.shadow);
      } else if (state === 'title') {
        text('OVER', W / 2, 34, p.accent, 4, 'center', p.shadow);
        text('STACK', W / 2, 58, p.text, 4, 'center', p.shadow);
        text('LINE UP THE FUSES', W / 2, 92, p.text, 1, 'center', p.shadow);
        text('OVERHANG BURNS AWAY', W / 2, 100, p.text, 1, 'center', p.shadow);
        if (blink(2)) text('TAP OR SPACE', W / 2, 124, p.accent, 1, 'center', p.shadow);
      } else {
        text(String(score), W / 2, 10, p.text, 3, 'center', p.shadow);
        if (combo >= 2 && state === 'play') text('x' + combo, W / 2, 29, p.accent, 1, 'center', p.shadow);
      }

      if (state === 'over') drawGameOver(p);
      if (opsOpen) drawOps(p);

      if (opts.scanlines !== false) {
        g.globalAlpha = 0.07; g.fillStyle = '#000';
        for (let y = 1; y < H; y += 2) g.fillRect(0, y, W, 1);
        g.globalAlpha = 1;
      }
    }

    // double-bordered flat panel with a dithered drop shadow
    function panel(px, py, pw, ph, p) {
      g.fillStyle = p.shadow;
      for (let y = 2; y < ph + 3; y++) for (let x = pw + 1; x < pw + 3; x++) if (((x + y) & 1) === 0) g.fillRect(px + x, py + y, 1, 1);
      for (let y = ph + 1; y < ph + 3; y++) for (let x = 2; x < pw + 1; x++) if (((x + y) & 1) === 0) g.fillRect(px + x, py + y, 1, 1);
      rect(px - 1, py - 1, pw + 2, ph + 2, p.text);
      rect(px, py, pw, ph, p.shadow);
      rect(px + 2, py + 2, pw - 4, ph - 4, p.text);
      rect(px + 3, py + 3, pw - 6, ph - 6, p.shadow);
    }

    function drawScores(y0, hi, p) {
      if (!scores.length) { text('NO SCORES YET', W / 2, y0 + 30, p.text, 1, 'center'); return; }
      scores.forEach((e, i) => {
        const col = i === hi ? (blink(4) ? p.accent : p.text) : (i === 0 ? p.accent : p.text);
        const y = y0 + i * 8;
        text((i + 1) + '.', 32, y, col, 1, 'right');
        text(e.name, 36, y, col, 1, 'left');
        text(String(e.score), W - 24, y, col, 1, 'right');
      });
    }

    function drawOps(p) {
      panel(8, 14, 144, 212, p);
      text('OPERATOR', W / 2, 24, p.accent, 2, 'center');
      OPS.forEach((it, i) => {
        const y = OPS_Y0 + i * OPS_DY, sel = i === opsSel, col = sel ? p.accent : p.text;
        if (sel) text('>', 16, y, p.accent, 1, 'left');
        text(it.label, 22, y, col, 1, 'left');
        let v = it.val ? it.val() : '';
        if (it.step && sel) v = '<' + v + '>';
        if (opsArmed === i) v = blink(4) ? 'PRESS AGAIN' : '';
        if (v) text(v, W - 16, y, col, 1, 'right');
      });
      text('SCORES SAVED ' + scores.length, W / 2, 158, p.text, 1, 'center');
      if (opsMsgT > 0) text(opsMsg, W / 2, 172, p.accent, 1, 'center');
      text('ARROWS + ENTER', W / 2, 196, p.text, 1, 'center');
      text('ESC TO CLOSE', W / 2, 206, p.text, 1, 'center');
    }

    function drawGameOver(p) {
      const pw = 132, px = (W - pw) / 2, py = 36, ph = entering ? 126 : 156;
      panel(px, py, pw, ph, p);
      text('GAME OVER', W / 2, py + 10, p.accent, 2, 'center');
      text('SCORE ' + score + '  HEIGHT ' + placed(), W / 2, py + 28, p.text, 1, 'center');

      if (entering) {
        if (blink(4)) text('NEW HIGH SCORE!', W / 2, py + 42, p.accent, 1, 'center');
        text('ENTER YOUR NAME', W / 2, py + 56, p.text, 1, 'center');
        // name box with blinking block cursor
        const bx = W / 2 - 37, by = py + 66, bw = 74, bh = 13;
        rect(bx, by, bw, bh, p.text);
        rect(bx + 1, by + 1, bw - 2, bh - 2, p.shadow);
        const name = cleanName(input.value);
        text(name, bx + 5, by + 4, p.text, 1, 'left');
        if (name.length < MAX_NAME && blink(3)) rect(bx + 5 + name.length * 4, by + 4, 3, 5, p.accent);
        // OK button
        okBtn = { x: W / 2 - 16, y: py + 88, w: 32, h: 13 };
        rect(okBtn.x, okBtn.y, okBtn.w, okBtn.h, p.accent);
        rect(okBtn.x, okBtn.y + okBtn.h - 1, okBtn.w, 1, p.text);
        text('OK', W / 2, okBtn.y + 4, p.shadow, 1, 'center');
        const left = ops.nameTimeout ? ops.nameTimeout - (time - lastInput) : Infinity;
        if (nameError > 0) text('PICK ANOTHER NAME', W / 2, py + 110, p.accent, 1, 'center');
        else if (left <= 10) text('AUTO SAVE IN ' + Math.max(1, Math.ceil(left)), W / 2, py + 110, p.accent, 1, 'center');
        else text(coarse ? 'TAP BOX TO TYPE' : 'TYPE THEN ENTER', W / 2, py + 110, p.text, 1, 'center');
      } else {
        okBtn = null;
        text('HIGH SCORES', W / 2, py + 42, p.accent, 1, 'center');
        drawScores(py + 54, newRank, p);
        if (overT > 0.5 && blink(2)) text('TAP TO RETRY', W / 2, py + 144, p.text, 1, 'center');
      }
    }

    // ---- input
    function onPointer(e) {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
      if (opsOpen) {
        // tap a row to select + activate it
        const i = Math.floor((py - OPS_Y0 + 4) / OPS_DY);
        if (px > 8 && px < W - 8 && i >= 0 && i < OPS.length) { if (opsSel !== i) opsArmed = -1; opsSel = i; opsActivate(i); }
        return;
      }
      poke();
      if (entering) {
        if (okBtn && px >= okBtn.x - 2 && px < okBtn.x + okBtn.w + 2 && py >= okBtn.y - 2 && py < okBtn.y + okBtn.h + 2) submitName(true);
        else focusInput();
        return;
      }
      canvas.focus({ preventScroll: true });
      if (px > W - 18 && py < 14) toggleMute();
      else action();
    }
    // Touch only grants "user activation" on pointerup, which audio unlock and
    // opening the mobile keyboard both need.
    function onPointerUp() {
      Sound.init();
      if (entering) focusInput();
    }
    function onInput() {
      const v = cleanName(input.value);
      if (v !== input.value) input.value = v;
      nameError = 0;
      poke();
      Sound.tick();
    }
    function onInputKey(e) {
      e.stopPropagation();
      poke();
      if (checkCode(e)) { e.preventDefault(); input.value = ''; return; }
      if (e.key === 'Enter') { e.preventDefault(); submitName(true); }
      else if (e.key === 'Escape') { e.preventDefault(); submitName(false); }
    }
    function onKey(e) {
      if (e.target === input) return;
      if (opsOpen) return opsKey(e);
      if (checkCode(e)) { e.preventDefault(); return; }
      poke();
      if (entering) {
        if (e.code === 'Enter') { e.preventDefault(); submitName(true); }
        else focusInput();
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown') {
        e.preventDefault();
        if (!e.repeat) action();
      } else if (e.code === 'KeyM') toggleMute();
    }
    const keyTarget = opts.keys === 'window' ? root : canvas;
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('pointerup', onPointerUp);
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onInputKey);
    keyTarget.addEventListener('keydown', onKey);

    // ---- loop
    let last = performance.now(), raf = 0, alive = true;
    function frame(now) {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }
    reset();
    raf = requestAnimationFrame(frame);

    return {
      canvas,
      restart() { input.blur(); state = 'play'; reset(); },
      scores() { return scores.map(e => ({ name: e.name, score: e.score, t: e.t })); },
      clearScores: clearAll,
      openOperatorMenu: openOps,
      destroy() {
        alive = false;
        Sound.musicStop();
        cancelAnimationFrame(raf);
        canvas.removeEventListener('pointerdown', onPointer);
        canvas.removeEventListener('pointerup', onPointerUp);
        keyTarget.removeEventListener('keydown', onKey);
        root.removeEventListener('resize', fit);
        if (ro) ro.disconnect();
        wrap.remove();
      }
    };
  }

  const Overstack = { mount, version: '1.0.0' };
  root.Overstack = Overstack;
  if (typeof module === 'object' && module.exports) module.exports = Overstack;

  // auto-mount <div data-overstack></div>
  function auto() { document.querySelectorAll('[data-overstack]').forEach(el => { if (!el.__overstack) el.__overstack = mount(el); }); }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else auto();
  }
})(typeof window !== 'undefined' ? window : this);
