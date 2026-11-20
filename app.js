/* Retro Cam — a pocket Y2K digital camera.
 * No dependencies. Everything (live view, capture, roll) runs on-device. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const el = {
    video: $('video'), view: $('view'), lcd: $('lcd'), blink: $('blink'),
    hudFilter: $('hudFilter'), hudFlash: $('hudFlash'), note: $('note'),
    hudCount: $('hudCount'), hudFacing: $('hudFacing'),
    hudMsg: $('hudMsg'), battery: $('battery'),
    lcdState: $('lcdState'), stateTitle: $('stateTitle'), stateBody: $('stateBody'),
    retryBtn: $('retryBtn'), nativeBtn: $('nativeBtn'), nativeInput: $('nativeInput'),
    flipBtn: $('flipBtn'), flashBtn: $('flashBtn'), dateBtn: $('dateBtn'), frameBtn: $('frameBtn'),
    shutterBtn: $('shutterBtn'), rollBtn: $('rollBtn'),
    filterPrev: $('filterPrev'), filterNext: $('filterNext'),
    muteBtn: $('muteBtn'), installBtn: $('installBtn'), iosTip: $('iosTip'), iosTipClose: $('iosTipClose'),
    screenFlash: $('screenFlash'),
    modeBtn: $('modeBtn'), hudRec: $('hudRec'), hudRecText: $('hudRecText'),
    downloadLink: $('downloadLink'),
    rollSheet: $('rollSheet'), rollGrid: $('rollGrid'), rollCount: $('rollCount'), rollEmpty: $('rollEmpty'),
    closeRollBtn: $('closeRollBtn'), selectAllBtn: $('selectAllBtn'),
    deleteSelBtn: $('deleteSelBtn'), saveSelBtn: $('saveSelBtn'),
    toast: $('toast'),
  };

  const UA = navigator.userAgent;
  const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const IS_MOBILE = IS_IOS || /Android|Mobi/i.test(UA) || !!(navigator.userAgentData && navigator.userAgentData.mobile);
  const STANDALONE = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // Same query as the CSS that turns the app sideways on a phone held upright.
  const UI_ROTATED = matchMedia('(orientation: portrait) and (pointer: coarse)');

  /* ------------------------------------------------------------ settings */
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('retrocam.' + k); return v === null ? d : JSON.parse(v); } catch { return d; }
    },
    set(k, v) { try { localStorage.setItem('retrocam.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const COLOR_NAMES = {
    yellow: 'YELLOW', clear: 'CLEAR', red: 'RED', blue: 'BLUE', black: 'BLACK',
  };

  // Each filter: per-channel tone curve + saturation + grain + bloom + vignette.
  //   contrast  slope around mid-grey      lift/roll  black & white points (0..1)
  //   gain      per-channel multiply        shadow/high  tint added to shadows / highlights (0..255)
  //   noise     luma grain amplitude        chroma     colour-noise amplitude
  //   ca        red-channel offset in px at the full 1792 width (cheap-lens fringing)
  const FILTERS = [
    // the default look: hazy, washed-out early-2000s digicam (lifted shadows, blown soft highlights)
    { id: 'y2k', name: 'Y2K', exposure: 1.1, sat: 0.94, contrast: 0.8, lift: 0.075, roll: 0.97,
      gain: [1.03, 1.0, 0.98], shadow: [8, 2, 12], high: [8, 6, 0],
      noise: 9, chroma: 6, bloom: 0.5, vignette: 0.14, ca: 2 },
    { id: 'warm', name: 'WARM', exposure: 1.06, sat: 0.84, contrast: 0.82, lift: 0.1, roll: 0.95,
      gain: [1.09, 1.0, 0.85], shadow: [20, 8, -4], high: [12, 6, -14],
      noise: 10, chroma: 5, bloom: 0.45, vignette: 0.3, ca: 2 },
    { id: 'ccd', name: 'CCD', exposure: 1.04, sat: 1.12, contrast: 0.98, lift: 0.04, roll: 0.985,
      gain: [0.94, 1.0, 1.08], shadow: [-4, 6, 18], high: [-6, 4, 12],
      noise: 9, chroma: 8, bloom: 0.55, vignette: 0.18, ca: 3 },
    { id: 'bw', name: 'B&W', bw: true, exposure: 1.05, sat: 0, contrast: 1.2, lift: 0.05, roll: 0.97,
      gain: [1, 1, 1], shadow: [0, 0, 0], high: [0, 0, 0],
      noise: 16, chroma: 0, bloom: 0.3, vignette: 0.3, ca: 0 },
  ];

  const FRAMES = ['none', 'film', 'instant', 'round'];
  const FRAME_LABEL = { none: 'NO FRAME', film: 'FILM', instant: 'INSTANT', round: 'ROUND' };

  const state = {
    color: COLOR_NAMES[store.get('color', 'yellow')] ? store.get('color', 'yellow') : 'yellow',
    filter: Math.min(Math.max(0, store.get('filter', 0) | 0), FILTERS.length - 1),
    frame: FRAMES.includes(store.get('frame', 'film')) ? store.get('frame', 'film') : 'film',
    date: !!store.get('date', true),
    flash: !!store.get('flash', false),
    muted: !!store.get('muted', false),
    facing: store.get('facing', 'environment') === 'user' ? 'user' : 'environment',
    frameNo: store.get('frameNo', 0) | 0,
    mode: store.get('mode', 'photo') === 'video' ? 'video' : 'photo',
    recording: false, recorder: null, noMic: false,
    stream: null, track: null, mirror: false, torch: false,
    running: false, paused: false, busy: false, starting: false,
    cameraCount: 2, shots: 0, error: null,
  };

  /* ------------------------------------------------------------- helpers */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  function makeCanvas(w = 1, h = 1) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

  let toastTimer;
  function toast(msg, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }

  let msgTimer;
  function lcdMsg(text, ms = 900) {
    el.hudMsg.textContent = text;
    el.hudMsg.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => el.hudMsg.classList.remove('show'), ms);
  }

  /* --------------------------------------------------------- sound & feel */
  let actx = null;
  let noiseBuf = null;
  function audio() {
    if (state.muted) return null;
    try {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      if (!noiseBuf) {
        noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.25), actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return actx;
    } catch { return null; }
  }
  function noiseHit(a, t, freq, q, dur, gain) {
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(a, t, freq, dur, gain, type = 'square', endFreq) {
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // Early-2000s digital camera: focus-lock double beep, then a fake mechanical shutter.
  function soundShutter() {
    const a = audio(); if (!a) return;
    const t = a.currentTime + 0.01;
    tone(a, t, 2730, 0.035, 0.05);
    tone(a, t + 0.055, 2730, 0.035, 0.05);
    const s = t + 0.12;
    noiseHit(a, s, 4200, 0.9, 0.035, 0.9);        // blade snap
    tone(a, s, 190, 0.07, 0.35, 'sine', 70);      // body thunk
    noiseHit(a, s + 0.085, 2600, 1.4, 0.06, 0.55); // mirror/blade return
    tone(a, s + 0.085, 140, 0.06, 0.18, 'sine', 60);
  }
  function soundBlip(freq = 1900) {
    const a = audio(); if (!a) return;
    tone(a, a.currentTime + 0.005, freq, 0.03, 0.035);
  }

  // Android: Vibration API. iOS 18+: toggling a native switch control gives a haptic tick.
  let iosSwitch = null;
  function buzz(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
      return;
    }
    if (!IS_IOS) return;
    try {
      if (!iosSwitch) {
        iosSwitch = document.createElement('label');
        iosSwitch.setAttribute('aria-hidden', 'true');
        iosSwitch.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        iosSwitch.appendChild(input);
        document.head.appendChild(iosSwitch);
      }
      iosSwitch.click();
    } catch { /* ignore */ }
  }
  const press = () => { soundBlip(); buzz(8); };

  /* ------------------------------------------------------ image pipeline */
  const lutCache = new Map();
  function getLUT(f) {
    if (lutCache.has(f.id)) return lutCache.get(f.id);
    const out = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
    const knee = 0.76;
    const shoulder = (y) => {
      if (y <= knee) return y;
      const k = 1.7, span = 1 - knee;
      return knee + span * (1 - Math.exp(-((y - knee) / span) * k)) / (1 - Math.exp(-k));
    };
    for (let v = 0; v < 256; v++) {
      let y = (Math.min(1.2, (v / 255) * (f.exposure || 1)) - 0.5) * f.contrast + 0.5;
      y = Math.min(1.15, Math.max(0, y));
      y = Math.min(1, shoulder(y)); // soft digital highlight roll-off
      y = f.lift + y * (f.roll - f.lift);
      for (let c = 0; c < 3; c++) {
        out[c][v] = y * f.gain[c] * 255 + f.shadow[c] * (1 - y) * (1 - y) + f.high[c] * y * y;
      }
    }
    lutCache.set(f.id, out);
    return out;
  }

  const vigCache = new Map();
  function getVignette(w, h, amount) {
    const key = w + 'x' + h + ':' + amount;
    if (vigCache.has(key)) return vigCache.get(key);
    if (vigCache.size > 6) vigCache.clear();
    const v = new Float32Array(w * h);
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) {
      const dy = (y - cy) / cy;
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / cx;
        const r = Math.sqrt(dx * dx * 0.85 + dy * dy) / 1.2;
        const t = Math.min(1, Math.max(0, (r - 0.38) / 0.62));
        v[y * w + x] = 1 - amount * t * t * (3 - 2 * t);
      }
    }
    vigCache.set(key, v);
    return v;
  }

  let seed = 0x9e3779b9;
  function processPixels(ctx, w, h, f, scale) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const [lr, lg, lb] = getLUT(f);
    const vig = getVignette(w, h, f.vignette);
    const ca = Math.round(f.ca * scale) * 4;
    const sat = f.sat, bw = !!f.bw;
    const nAmp = f.noise / 128, cAmp = f.chroma / 128;
    let s = seed;
    for (let y = 0, i = 0, p = 0; y < h; y++) {
      const rowEnd = (y + 1) * w * 4;
      for (let x = 0; x < w; x++, i += 4, p++) {
        let r = i + ca < rowEnd ? d[i + ca] : d[i];
        let g = d[i + 1];
        let b = d[i + 2];
        const l = (r * 77 + g * 150 + b * 29) >> 8;
        if (bw) { r = g = b = l; } else {
          r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
          r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
          g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
          b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
        }
        r = lr[r]; g = lg[g]; b = lb[b];
        // xorshift32: one call → four random bytes (luma grain + 3 chroma)
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        const shade = 1.35 - l * 0.0028; // grain is stronger in the shadows
        const n = (((s & 255) - 128) * nAmp) * shade;
        const v = vig[p];
        d[i] = (r + n + (((s >>> 8) & 255) - 128) * cAmp) * v;
        d[i + 1] = (g + n + (((s >>> 16) & 255) - 128) * cAmp * 0.6) * v;
        d[i + 2] = (b + n + ((s >>> 24) - 128) * cAmp) * v;
      }
    }
    seed = s || 0x9e3779b9;
    ctx.putImageData(img, 0, 0);
  }

  // Highlight bloom without ctx.filter (Safari): threshold a tiny copy, scale it back up with 'screen'.
  const bloomA = makeCanvas(), bloomB = makeCanvas();
  const bloomActx = ctx2d(bloomA), bloomBctx = ctx2d(bloomB);
  function bloom(canvas, ctx, amount) {
    if (!amount) return;
    const w = canvas.width, h = canvas.height;
    const sw = Math.max(16, Math.round(w / 14)), sh = Math.max(12, Math.round((sw * h) / w));
    bloomA.width = sw; bloomA.height = sh;
    bloomActx.imageSmoothingEnabled = true;
    bloomActx.imageSmoothingQuality = 'high';
    bloomActx.drawImage(canvas, 0, 0, sw, sh);
    const id = bloomActx.getImageData(0, 0, sw, sh);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      const k = m > 168 ? Math.min(1, (m - 168) / 70) : 0;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
    bloomActx.putImageData(id, 0, 0);
    const bw = Math.max(6, Math.round(sw / 3)), bh = Math.max(4, Math.round(sh / 3));
    bloomB.width = bw; bloomB.height = bh;
    bloomBctx.imageSmoothingEnabled = true;
    bloomBctx.drawImage(bloomA, 0, 0, bw, bh);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = amount;
    ctx.drawImage(bloomA, 0, 0, w, h);
    ctx.globalAlpha = amount * 0.8;
    ctx.drawImage(bloomB, 0, 0, w, h);
    ctx.restore();
  }

  // Fill a w×h canvas with the source (cover crop), optionally turned ±90° and mirrored.
  // `turn` is used when the app is rotated sideways in a portrait browser: the camera
  // still delivers upright-portrait frames, so they're turned to match how the phone is held.
  function drawCover(ctx, w, h, src, srcW, srcH, mirror, turn) {
    const effW = turn ? srcH : srcW;
    const effH = turn ? srcW : srcH;
    const scale = Math.max(w / effW, h / effH);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (mirror) ctx.scale(-1, 1);
    if (turn) ctx.rotate((turn * Math.PI) / 2);
    ctx.drawImage(src, (-srcW * scale) / 2, (-srcH * scale) / 2, srcW * scale, srcH * scale);
    ctx.restore();
  }
  // How far to turn portrait camera frames when the app is shown sideways (phone top to the left):
  // the back camera's world-up is on the frame's right (turn -90°); the selfie camera's raw frame
  // is mirrored relative to that, so its world-up is on the left (turn +90°). 0 = no turn.
  const needsTurn = (w, h) => (UI_ROTATED.matches && h > w ? (state.mirror ? 1 : -1) : 0);

  /* ----- seven-segment red-orange date stamp */
  const SEGMENTS = {
    0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
    5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  };
  function digitPaths(ctx, ch, x, y, H) {
    const W = H * 0.5, gap = H * 0.08;
    const P = { TL: [0, 0], TR: [W, 0], ML: [0, H / 2], MR: [W, H / 2], BL: [0, H], BR: [W, H] };
    const S = { a: ['TL', 'TR'], b: ['TR', 'MR'], c: ['MR', 'BR'], d: ['BL', 'BR'], e: ['ML', 'BL'], f: ['TL', 'ML'], g: ['ML', 'MR'] };
    for (const seg of SEGMENTS[ch] || '') {
      const [p1, p2] = S[seg].map((k) => P[k]);
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      ctx.moveTo(x + p1[0] + ux * gap, y + p1[1] + uy * gap);
      ctx.lineTo(x + p2[0] - ux * gap, y + p2[1] - uy * gap);
    }
  }
  function dateString(d = new Date()) {
    return `${d.getFullYear()} ${pad(d.getMonth() + 1)} ${pad(d.getDate())}`;
  }
  // LED-style digits, right-aligned at (xRight, yBottom), digit height H.
  function drawSegText(ctx, text, xRight, yBottom, H) {
    const W = H * 0.5, adv = W + H * 0.32, space = H * 0.45;
    let total = 0;
    for (const ch of text) total += ch === ' ' ? space : adv;
    total -= H * 0.32;
    ctx.save();
    ctx.translate(xRight - total, yBottom - H);
    ctx.transform(1, 0, -0.08, 1, H * 0.08, 0); // slight italic
    ctx.beginPath();
    let x = 0;
    for (const ch of text) { if (ch === ' ') { x += space; continue; } digitPaths(ctx, ch, x, 0, H); x += adv; }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // glow
    ctx.shadowColor = 'rgba(255, 60, 20, 0.9)';
    ctx.shadowBlur = H * 0.45;
    ctx.strokeStyle = 'rgba(255, 78, 34, 0.95)';
    ctx.lineWidth = Math.max(1.2, H * 0.13);
    ctx.stroke();
    // hot core
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 170, 130, 0.9)';
    ctx.lineWidth = Math.max(0.6, H * 0.05);
    ctx.stroke();
    ctx.restore();
  }
  // Date inside the picture (used when the film border is off).
  function drawDateStamp(ctx, rect, text) {
    const H = Math.max(6, rect.h * 0.06);
    drawSegText(ctx, text, rect.x + rect.w * 0.955, rect.y + rect.h * 0.935, H);
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ----- film border: built AROUND the photo, date printed in the bottom band */
  function filmBorder(photo, frameNo, date) {
    const pw = photo.width, ph = photo.height;
    const side = Math.round(pw * 0.045);
    const band = Math.round(pw * 0.118);
    const W = pw + side * 2, H = ph + band * 2;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    // base: dark brown film base, slightly uneven
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2a2119');
    g.addColorStop(0.5, '#221a13');
    g.addColorStop(1, '#2b2017');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // photo window with softly rounded corners
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, side, band, pw, ph, pw * 0.012);
    ctx.clip();
    ctx.drawImage(photo, side, band);
    ctx.restore();
    // sprocket holes: dark, in a row next to the picture
    const hw = W * 0.046, hh = band * 0.44, step = W / 14;
    const yTop = band * 0.4, yBot = band + ph + band * 0.16;
    ctx.fillStyle = '#060504';
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const x = step * i + (step - hw) / 2;
      roundRect(ctx, x, yTop, hw, hh, hw * 0.18);
      roundRect(ctx, x, yBot, hw, hh, hw * 0.18);
    }
    ctx.fill();
    // edge print in amber
    const fs = Math.round(band * 0.26);
    ctx.fillStyle = '#f0b03c';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${fs}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    const n = ((frameNo - 1) % 36) + 1;
    const prev = n === 1 ? '00' : String(n - 1);
    const tY = band * 0.2, bY = H - band * 0.2;
    ctx.textAlign = 'left';
    ctx.fillText('RETRO', W * 0.035, tY);
    ctx.fillText(`${prev}A`, W * 0.07, bY);
    ctx.textAlign = 'center';
    ctx.fillText(String(n), W * 0.5, tY);
    ctx.fillText(String(n), W * 0.5, bY);
    ctx.textAlign = 'right';
    ctx.fillText('CAM', W * 0.965, tY);
    if (date) drawSegText(ctx, date, W * 0.965, bY + fs * 0.5, fs * 1.05);
    return c;
  }

  /* ----- overlay frames (drawn over the photo edges; returns the visible photo area) */
  function drawFrame(ctx, w, h, frame) {
    if (frame === 'instant') {
      const sx = w * 0.035, top = h * 0.07, bottom = h * 0.17;
      const r = { x: sx, y: top, w: w - sx * 2, h: h - top - bottom };
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.rect(r.x, r.y, r.w, r.h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#f8f6f0');
      g.addColorStop(1, '#ebe6da');
      ctx.fillStyle = g;
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = Math.max(1, w * 0.0015);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      return r;
    }
    if (frame === 'round') {
      const inset = h * 0.03, rad = h * 0.09;
      const r = { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 };
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      roundRect(ctx, r.x, r.y, r.w, r.h, rad);
      ctx.fillStyle = '#0b0b0c';
      ctx.fill('evenodd');
      ctx.restore();
      return r;
    }
    return { x: 0, y: 0, w, h };
  }

  // Live view: colour + grain + bloom; overlay frames; the date only when it lands in the picture.
  function develop(canvas, ctx, opts) {
    const f = FILTERS[opts.filter];
    const w = canvas.width, h = canvas.height;
    processPixels(ctx, w, h, f, w / 1792);
    bloom(canvas, ctx, f.bloom);
    if (opts.frame === 'film') return; // film border + date are added around the saved photo
    const rect = drawFrame(ctx, w, h, opts.frame);
    if (opts.date) drawDateStamp(ctx, rect, dateString(opts.when));
  }

  /* -------------------------------------------------------------- live */
  const viewCtx = ctx2d(el.view);
  const LIVE_FPS = 24;
  let lastFrame = 0;
  let rafId = 0;
  function loop(now) {
    rafId = 0;
    if (!state.running) return;
    rafId = requestAnimationFrame(loop);
    if (state.paused || now - lastFrame < 1000 / LIVE_FPS - 2) return;
    const v = el.video;
    if (v.readyState < 2 || !v.videoWidth) return;
    lastFrame = now;
    const turn = needsTurn(v.videoWidth, v.videoHeight);
    if (state.recording) {
      // develop the recording frame once, then show it on the LCD
      drawCover(recCtx, REC_W, REC_H, v, v.videoWidth, v.videoHeight, state.mirror, turn);
      const f = FILTERS[state.filter];
      processPixels(recCtx, REC_W, REC_H, f, REC_W / 1792);
      bloom(recCanvas, recCtx, f.bloom);
      if (state.date) drawDateStamp(recCtx, { x: 0, y: 0, w: REC_W, h: REC_H }, dateString());
      viewCtx.drawImage(recCanvas, 0, 0, el.view.width, el.view.height);
      updateRecClock();
      return;
    }
    drawCover(viewCtx, el.view.width, el.view.height, v, v.videoWidth, v.videoHeight, state.mirror, turn);
    develop(el.view, viewCtx, {
      filter: state.filter, frame: state.mode === 'video' ? 'none' : state.frame, date: state.date,
      frameNo: state.frameNo + 1, when: new Date(), live: true,
    });
  }

  /* ------------------------------------------------------------- video */
  // Lo-fi video like a 2000s digicam: 640×320, 24 fps, same colour/grain as photos.
  const REC_W = 640, REC_H = 320, REC_FPS = 24, REC_MAX_S = 60;
  const recCanvas = makeCanvas(REC_W, REC_H);
  const recCtx = ctx2d(recCanvas);
  let recStart = 0, recChunks = [], recMime = '', recTorch = false;

  function pickMime() {
    if (!window.MediaRecorder) return null;
    const list = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
    return '';
  }
  function updateRecClock() {
    const t = Math.floor((performance.now() - recStart) / 1000);
    el.hudRecText.textContent = `REC ${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
    if (t >= REC_MAX_S) stopRecording();
  }

  async function startRecording() {
    const mime = pickMime();
    if (mime === null || !recCanvas.captureStream) {
      lcdMsg('NO VIDEO');
      toast('This browser can’t record video.');
      return;
    }
    const stream = recCanvas.captureStream(REC_FPS);
    const audio = state.stream && state.stream.getAudioTracks()[0];
    if (audio) stream.addTrack(audio);
    let rec;
    try {
      rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_000_000 });
    } catch {
      rec = new MediaRecorder(stream);
    }
    recMime = rec.mimeType || mime || 'video/webm';
    recChunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    rec.onstop = finishRecording;
    // first frame before the recorder starts, so the file never opens on black
    const v = el.video;
    drawCover(recCtx, REC_W, REC_H, v, v.videoWidth, v.videoHeight, state.mirror, needsTurn(v.videoWidth, v.videoHeight));
    state.recorder = rec;
    state.recording = true;
    recStart = performance.now();
    rec.start(1000);
    if (state.flash && state.facing === 'environment' && state.torch) recTorch = await setTorch(true);
    soundBlip(2400);
    buzz(20);
    updateHud();
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    try { state.recorder.stop(); } catch { finishRecording(); }
    if (recTorch) { setTorch(false); recTorch = false; }
    soundBlip(1600);
    buzz([10, 40, 10]);
    updateHud();
  }

  async function finishRecording() {
    const chunks = recChunks;
    recChunks = [];
    state.recorder = null;
    if (!chunks.length) { toast('Nothing was recorded.'); return; }
    const blob = new Blob(chunks, { type: recMime.split(';')[0] });
    const th = 192;
    const t = makeCanvas(384, th);
    t.getContext('2d').drawImage(recCanvas, 0, 0, 384, th);
    const thumb = await canvasToBlob(t, 'image/jpeg', 0.75);
    state.frameNo += 1;
    store.set('frameNo', state.frameNo);
    const now = Date.now();
    const rec = {
      kind: 'video', created: now, filter: FILTERS[state.filter].name, n: state.frameNo,
      duration: Math.round((now - recStart) / 1000), blob, thumb,
    };
    rec.id = await roll.add(rec);
    state.shots += 1;
    updateHud();
    refreshRollThumb(rec);
    lcdMsg('→ ROLL');
  }

  function setMode(mode) {
    if (state.recording) stopRecording();
    state.mode = mode;
    store.set('mode', mode);
    updateHud();
    lcdMsg(mode === 'video' ? 'VIDEO' : 'PHOTO');
    // video needs the microphone too, so reopen the camera with audio (and drop it again for photos)
    if (state.running || state.error === 'busy' || state.error === 'error') startCamera();
  }
  function startLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }

  /* ------------------------------------------------------------ camera */
  const STATES = {
    starting: { title: 'ON', busy: true, body: '' },
    https: {
      title: 'HTTPS',
      body: 'The live camera only works on a secure page. Open <code>https://retro.sagunpradhan.com.np</code>, or shoot with your phone camera instead.',
      native: true,
    },
    noapi: {
      title: 'NO CAM',
      body: 'This browser can’t stream the camera. Shoot with your phone camera instead and the photo gets the same look.',
      native: true,
    },
    denied: {
      title: 'CAM OFF',
      body: IS_IOS
        ? 'Camera access is blocked. In Safari tap <b>aA</b> → Website Settings → Camera → Allow, then try again.'
        : 'Camera access is blocked. Tap the icon next to the address → Site settings → Camera → Allow, then try again.',
      retry: true, native: true,
    },
    notfound: { title: 'NO CAM', body: 'No camera was found on this device.', native: true },
    busy: { title: 'BUSY', body: 'Another app is using the camera. Close it, then try again.', retry: true, native: true },
    error: { title: 'ERROR', body: 'The camera didn’t start.', retry: true, native: true },
  };
  function showState(kind, extra) {
    const s = STATES[kind];
    state.error = kind === 'starting' ? null : kind;
    el.lcdState.hidden = false;
    el.lcdState.classList.toggle('busy', !!s.busy);
    el.stateTitle.textContent = s.title;
    el.note.hidden = !s.body;
    el.stateBody.innerHTML = s.body + (extra ? `<br><small>${extra}</small>` : '');
    el.retryBtn.hidden = !s.retry;
    el.nativeBtn.hidden = !s.native;
  }
  function hideState() {
    el.lcdState.hidden = true;
    el.note.hidden = true;
    state.error = null;
  }

  function stopCamera() {
    state.running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
    state.track = null;
    el.video.srcObject = null;
  }

  async function startCamera() {
    if (state.starting) return false;
    if (!window.isSecureContext) { showState('https'); return false; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showState('noapi'); return false; }
    state.starting = true;
    stopCamera();
    showState('starting');
    try {
      let stream;
      const wantAudio = state.mode === 'video' && !state.noMic;
      const video = { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      const get = (audio, v) => navigator.mediaDevices.getUserMedia({ audio, video: v });
      try {
        stream = await get(wantAudio, video);
      } catch (e) {
        if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
          stream = await get(wantAudio, { facingMode: state.facing });
        } else if (wantAudio && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')) {
          // mic refused or missing: carry on with silent video
          state.noMic = true;
          stream = await get(false, video);
        } else throw e;
      }
      state.stream = stream;
      state.track = stream.getVideoTracks()[0];
      el.video.srcObject = stream;
      await el.video.play().catch(() => {});
      if (!el.video.videoWidth) {
        await new Promise((r) => {
          el.video.addEventListener('loadedmetadata', r, { once: true });
          setTimeout(r, 2500);
        });
      }
      const settings = (state.track.getSettings && state.track.getSettings()) || {};
      // Laptops usually report no facingMode: they're front cameras, so mirror them.
      state.mirror = settings.facingMode ? settings.facingMode === 'user' : (state.facing === 'user' || !IS_MOBILE);
      const caps = (state.track.getCapabilities && state.track.getCapabilities()) || {};
      state.torch = !!caps.torch;
      hideState();
      state.running = true;
      startLoop();
      countCameras();
      updateHud();
      return true;
    } catch (e) {
      stopCamera();
      const n = e && e.name;
      if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') showState('denied');
      else if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') showState('notfound');
      else if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') showState('busy');
      else showState('error', e && e.message ? String(e.message).slice(0, 120) : '');
      return false;
    } finally {
      state.starting = false;
    }
  }

  async function countCameras() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      state.cameraCount = list.filter((d) => d.kind === 'videoinput').length || 1;
    } catch { state.cameraCount = 2; }
    el.flipBtn.classList.toggle('single', state.cameraCount < 2);
  }

  async function flipCamera() {
    press();
    if (state.cameraCount < 2 && state.running) { lcdMsg('1 CAMERA'); return; }
    const prev = state.facing;
    state.facing = prev === 'user' ? 'environment' : 'user';
    lcdMsg(state.facing === 'user' ? 'SELFIE' : 'REAR');
    const ok = await startCamera();
    if (!ok && state.error !== 'denied' && state.error !== 'https' && state.error !== 'noapi') {
      state.facing = prev;
      await startCamera();
      lcdMsg('NO SWITCH');
    }
    store.set('facing', state.facing);
    updateHud();
  }

  async function setTorch(on) {
    if (!state.track || !state.torch) return false;
    try { await state.track.applyConstraints({ advanced: [{ torch: on }] }); return true; } catch { return false; }
  }

  /* ----------------------------------------------------------- capture */
  const OUT_W = 1792, OUT_H = 896; // 1.6 MP, 2:1 (same shape as the LCD)
  // The "sensor": the picture is developed at ~0.3 MP and only then blown up to 1.6 MP,
  // the way cheap 2000s cameras interpolated a tiny sensor up to the number on the box.
  const SENSOR_W = 768, SENSOR_H = 384;
  const sensor = makeCanvas(SENSOR_W, SENSOR_H);
  const sensorCtx = ctx2d(sensor);
  const SHARPEN = 0.4;         // in-camera oversharpening → bright halos on edges
  const CRUNCH_QUALITY = 0.62; // in-camera JPEG → soft blocks and colour bleed
  const SAVE_QUALITY = 0.78;   // the file you get

  // 4-neighbour unsharp mask, applied at sensor resolution so the halos come out thick.
  function sharpen(ctx, w, h, amount) {
    const img = ctx.getImageData(0, 0, w, h);
    const src = img.data;
    const out = new Uint8ClampedArray(src);
    const row = w * 4;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1, i = y * row + 4; x < w - 1; x++, i += 4) {
        for (let c = 0; c < 3; c++) {
          const k = i + c;
          const v = src[k];
          out[k] = v + amount * (4 * v - src[k - 4] - src[k + 4] - src[k - row] - src[k + row]);
        }
      }
    }
    img.data.set(out);
    ctx.putImageData(img, 0, 0);
  }

  async function decodeImage(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch { /* fall back */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function canvasToBlob(c, type, q) {
    return new Promise((resolve, reject) => {
      if (c.toBlob) c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, q);
      else {
        const bin = atob(c.toDataURL(type, q).split(',')[1]);
        const a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        resolve(new Blob([a], { type }));
      }
    });
  }

  // Shared by live capture and the native-camera fallback.
  async function developPhoto(src, srcW, srcH, mirror, turn) {
    const f = FILTERS[state.filter];
    // 1. tiny sensor: colour, grain and vignette happen at ~0.3 MP, so grain is blotchy once enlarged
    sensorCtx.imageSmoothingEnabled = true;
    sensorCtx.imageSmoothingQuality = 'high';
    drawCover(sensorCtx, SENSOR_W, SENSOR_H, src, srcW, srcH, mirror, turn);
    processPixels(sensorCtx, SENSOR_W, SENSOR_H, f, SENSOR_W / OUT_W);
    // 2. the camera's own sharpening and 3. its JPEG engine
    sharpen(sensorCtx, SENSOR_W, SENSOR_H, SHARPEN);
    const crunched = await decodeImage(await canvasToBlob(sensor, 'image/jpeg', CRUNCH_QUALITY));
    // 4. interpolate up to 1.6 MP
    const out = makeCanvas(OUT_W, OUT_H);
    const octx = ctx2d(out);
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'medium';
    octx.drawImage(crunched, 0, 0, OUT_W, OUT_H);
    if (crunched.close) crunched.close();
    bloom(out, octx, f.bloom);

    state.frameNo += 1;
    store.set('frameNo', state.frameNo);
    const when = new Date();
    let final = out;
    if (state.frame === 'film') {
      final = filmBorder(out, state.frameNo, state.date ? dateString(when) : '');
    } else {
      const rect = drawFrame(octx, OUT_W, OUT_H, state.frame);
      if (state.date) drawDateStamp(octx, rect, dateString(when));
    }
    const meta = {
      created: when.getTime(), filter: f.name, frame: state.frame,
      date: state.date, n: state.frameNo,
    };
    const blob = await canvasToBlob(final, 'image/jpeg', SAVE_QUALITY);
    const th = Math.round((384 * final.height) / final.width);
    const t = makeCanvas(384, th);
    const tctx = t.getContext('2d');
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(final, 0, 0, 384, th);
    const thumb = await canvasToBlob(t, 'image/jpeg', 0.75);
    out.width = out.height = 1; // free memory early (iOS canvas limits)
    final.width = final.height = 1;
    return { ...meta, blob, thumb };
  }

  async function shoot() {
    if (state.busy) return;
    if (state.mode === 'video' && state.running) {
      if (state.recording) stopRecording(); else startRecording();
      return;
    }
    if (!state.running) {
      if (state.error && !el.nativeBtn.hidden) el.nativeInput.click();
      else if (!state.starting) startCamera();
      return;
    }
    const v = el.video;
    if (v.readyState < 2 || !v.videoWidth) { lcdMsg('WAIT'); return; }
    state.busy = true;
    el.shutterBtn.disabled = true;
    buzz([14, 50, 22]);
    soundShutter();
    let torchUsed = false;
    try {
      if (state.flash) {
        if (state.facing === 'environment' && state.torch) {
          torchUsed = await setTorch(true);
          if (torchUsed) await sleep(380);
        }
        if (!torchUsed) {
          el.screenFlash.classList.add('on');
          await sleep(260); // let auto-exposure catch the white screen
        }
      } else {
        await sleep(110); // land the capture on the shutter "snap"
      }
      // Grab the frame right now, then develop.
      const grab = makeCanvas(v.videoWidth, v.videoHeight);
      grab.getContext('2d').drawImage(v, 0, 0);
      el.screenFlash.classList.remove('on');
      if (torchUsed) setTorch(false);
      el.blink.classList.remove('go');
      void el.blink.offsetWidth;
      el.blink.classList.add('go');
      state.paused = true;
      const shot = await developPhoto(grab, grab.width, grab.height, state.mirror, needsTurn(grab.width, grab.height));
      grab.width = grab.height = 1;
      const id = await roll.add(shot);
      shot.id = id;
      state.shots += 1;
      updateHud();
      refreshRollThumb(shot);
      state.paused = false;
      lcdMsg('→ ROLL');
    } catch (e) {
      console.error(e);
      state.paused = false;
      toast('Couldn’t take that photo. Try again.');
    } finally {
      el.screenFlash.classList.remove('on');
      if (torchUsed) setTorch(false);
      state.busy = false;
      el.shutterBtn.disabled = false;
    }
  }

  async function shootFromFile(file) {
    if (!file) return;
    state.busy = true;
    try {
      let src, w, h;
      if (window.createImageBitmap) {
        try {
          src = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
          src = await createImageBitmap(file);
        }
        w = src.width; h = src.height;
      } else {
        src = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = rej;
          im.src = URL.createObjectURL(file);
        });
        w = src.naturalWidth; h = src.naturalHeight;
      }
      soundShutter();
      buzz([14, 50, 22]);
      const shot = await developPhoto(src, w, h, false, false);
      if (src.close) src.close();
      shot.id = await roll.add(shot);
      state.shots += 1;
      updateHud();
      refreshRollThumb(shot);
      lcdMsg('→ ROLL');
    } catch (e) {
      console.error(e);
      toast('That photo couldn’t be opened.');
    } finally {
      state.busy = false;
      el.nativeInput.value = '';
    }
  }

  /* ------------------------------------------------------- film roll DB */
  const roll = (() => {
    const mem = [];
    let memId = 1;
    let useMem = !('indexedDB' in window);
    let dbp = null;
    function open() {
      if (useMem) return Promise.resolve(null);
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          const req = indexedDB.open('retro-cam', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('shots', { keyPath: 'id', autoIncrement: true });
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
          req.onblocked = () => reject(new Error('blocked'));
        }).catch(() => { useMem = true; return null; });
      }
      return dbp;
    }
    async function run(mode, fn) {
      const db = await open();
      if (!db) return undefined;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('shots', mode);
        const req = fn(tx.objectStore('shots'));
        let result;
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
    return {
      async add(rec) {
        const { id, ...data } = rec;
        if (!useMem) {
          try { return await run('readwrite', (s) => s.add(data)); } catch { useMem = true; }
        }
        const nid = memId++;
        mem.push({ ...data, id: nid });
        return nid;
      },
      async all() {
        let list = mem.slice();
        if (!useMem) { try { list = (await run('readonly', (s) => s.getAll())) || []; } catch { /* fall through */ } }
        return list.sort((a, b) => b.id - a.id);
      },
      async del(id) {
        const i = mem.findIndex((r) => r.id === id);
        if (i >= 0) mem.splice(i, 1);
        if (!useMem) await run('readwrite', (s) => s.delete(id));
      },
      async clear() {
        mem.length = 0;
        if (!useMem) await run('readwrite', (s) => s.clear());
      },
      async count() {
        if (useMem) return mem.length;
        try { return (await run('readonly', (s) => s.count())) || 0; } catch { return mem.length; }
      },
    };
  })();

  function refreshRollThumb(rec) {
    if (!rec) return;
    el.rollBtn.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 350 });
  }
  async function syncRoll() {
    state.shots = await roll.count();
    updateHud();
  }

  /* ------------------------------------------------------- film roll */
  // Shots land here straight after capture. Select some, then save them to Photos in one go.
  let rollList = [];
  const selected = new Set();
  let gridUrls = [];

  function fileName(rec) {
    const d = new Date(rec.created);
    const ext = rec.kind === 'video' ? (rec.blob.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
    return `retro_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${rec.n || rec.id}.${ext}`;
  }
  function toFile(rec) {
    const type = rec.blob.type || (rec.kind === 'video' ? 'video/mp4' : 'image/jpeg');
    try { return new File([rec.blob], fileName(rec), { type, lastModified: rec.created }); } catch { return null; }
  }

  function updateRollBar() {
    const n = selected.size;
    const total = rollList.length;
    el.saveSelBtn.disabled = n === 0;
    el.deleteSelBtn.disabled = n === 0;
    el.saveSelBtn.textContent = n ? `Save ${n} to Photos` : 'Save to Photos';
    el.selectAllBtn.hidden = total === 0;
    el.selectAllBtn.textContent = total && n === total ? 'Select none' : 'Select all';
    el.saveSelBtn.hidden = el.deleteSelBtn.hidden = total === 0;
  }

  async function renderRoll() {
    gridUrls.forEach((u) => URL.revokeObjectURL(u));
    gridUrls = [];
    rollList = await roll.all();
    for (const id of [...selected]) if (!rollList.some((r) => r.id === id)) selected.delete(id);
    el.rollGrid.textContent = '';
    for (const rec of rollList) {
      const b = document.createElement('button');
      const u = URL.createObjectURL(rec.thumb || rec.blob);
      gridUrls.push(u);
      const img = document.createElement('img');
      img.src = u;
      img.alt = `${rec.kind === 'video' ? 'Video' : 'Photo'} ${rec.n || rec.id}`;
      img.loading = 'lazy';
      b.append(img);
      if (rec.kind === 'video') b.classList.add('vid');
      b.setAttribute('aria-pressed', String(selected.has(rec.id)));
      b.addEventListener('click', () => {
        buzz(6);
        if (selected.has(rec.id)) selected.delete(rec.id); else selected.add(rec.id);
        b.setAttribute('aria-pressed', String(selected.has(rec.id)));
        updateRollBar();
      });
      el.rollGrid.appendChild(b);
    }
    el.rollEmpty.hidden = rollList.length > 0;
    el.rollGrid.hidden = rollList.length === 0;
    el.rollCount.textContent = `${rollList.length} shot${rollList.length === 1 ? '' : 's'}`;
    updateRollBar();
  }

  async function saveSelected() {
    // Build the files synchronously so the share sheet still counts as a direct tap (iOS).
    const recs = rollList.filter((r) => selected.has(r.id));
    const files = recs.map(toFile).filter(Boolean);
    if (!files.length) return;
    press();
    if (IS_MOBILE && navigator.share && navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files });
        selected.clear();
        await renderRoll();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // closed the share sheet
        // otherwise fall back to downloading
      }
    }
    for (const f of files) {
      const u = URL.createObjectURL(f);
      el.downloadLink.href = u;
      el.downloadLink.download = f.name;
      el.downloadLink.click();
      setTimeout(() => URL.revokeObjectURL(u), 10000);
      await sleep(300);
    }
    toast(files.length > 1 ? `${files.length} files downloaded.` : 'Downloaded.');
  }

  async function deleteSelected() {
    const n = selected.size;
    if (!n || !confirm(`Delete ${n} shot${n === 1 ? '' : 's'} from the roll? This can’t be undone.`)) return;
    for (const id of selected) await roll.del(id).catch(() => {});
    selected.clear();
    await syncRoll();
    await renderRoll();
    toast(`Deleted ${n}.`);
  }

  async function openRoll() {
    press();
    if (state.recording) stopRecording();
    state.paused = true;
    selected.clear();
    el.rollSheet.hidden = false;
    await renderRoll();
  }
  function closeRoll() {
    el.rollSheet.hidden = true;
    gridUrls.forEach((u) => URL.revokeObjectURL(u));
    gridUrls = [];
    rollList = [];
    selected.clear();
    el.rollGrid.textContent = '';
    state.paused = false;
  }

  /* ---------------------------------------------------------------- HUD */
  function updateHud() {
    const f = FILTERS[state.filter];
    el.hudFilter.textContent = f.name;
    el.hudFlash.toggleAttribute('hidden', !state.flash);
    el.hudFacing.textContent = state.facing === 'user' ? 'SELFIE' : 'REAR';
    el.hudCount.textContent = pad(Math.min(999, state.shots), 3);
    const video = state.mode === 'video';
    el.modeBtn.setAttribute('aria-pressed', String(video));
    el.hudRec.hidden = !video;
    el.hudRec.classList.toggle('rec', state.recording);
    if (!state.recording) el.hudRecText.textContent = 'STBY';
    el.shutterBtn.classList.toggle('recording', state.recording);
    el.shutterBtn.setAttribute('aria-label', video ? (state.recording ? 'Stop recording' : 'Start recording') : 'Take photo');
    el.flashBtn.setAttribute('aria-pressed', String(state.flash));
    el.dateBtn.setAttribute('aria-pressed', String(state.date));
    el.frameBtn.setAttribute('aria-pressed', String(state.frame !== 'none'));
    el.muteBtn.setAttribute('aria-pressed', String(state.muted));
    el.muteBtn.setAttribute('aria-label', state.muted ? 'Sound off' : 'Sound on');
  }

  function setColor(c, announce) {
    if (!COLOR_NAMES[c]) return;
    state.color = c;
    document.body.dataset.color = c;
    document.querySelectorAll('[data-set-color]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.setColor === c));
    });
    store.set('color', c);
    if (announce) lcdMsg(COLOR_NAMES[c], 1100);
  }

  function setFilter(i) {
    state.filter = (i + FILTERS.length) % FILTERS.length;
    store.set('filter', state.filter);
    updateHud();
    lcdMsg(FILTERS[state.filter].name);
  }

  /* ------------------------------------------------------------ battery */
  function initBattery() {
    const bars = el.battery.querySelectorAll('i');
    const paint = (level, charging) => {
      const n = Math.max(1, Math.ceil(level * 4));
      bars.forEach((b, i) => b.classList.toggle('off', i >= n));
      el.battery.classList.toggle('low', level <= 0.2 && !charging);
    };
    paint(1, true);
    if (!navigator.getBattery) return;
    navigator.getBattery().then((b) => {
      const up = () => paint(b.level, b.charging);
      up();
      b.addEventListener('levelchange', up);
      b.addEventListener('chargingchange', up);
    }).catch(() => {});
  }

  /* ------------------------------------------------------------ install */
  let deferredPrompt = null;
  function initInstall() {
    if (STANDALONE) return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      el.installBtn.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      el.installBtn.hidden = true;
      toast('Installed! Open Retro Cam from your home screen.');
    });
    if (IS_IOS) el.installBtn.hidden = false;
    el.installBtn.addEventListener('click', async () => {
      press();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') el.installBtn.hidden = true;
        } catch { /* ignore */ }
        deferredPrompt = null;
      } else if (IS_IOS) {
        el.iosTip.hidden = !el.iosTip.hidden;
      } else {
        toast('Use your browser menu → “Install app” / “Add to Home screen”.', 3200);
      }
    });
    el.iosTipClose.addEventListener('click', (e) => { e.stopPropagation(); el.iosTip.hidden = true; });
    document.addEventListener('pointerdown', (e) => {
      if (!el.iosTip.hidden && !el.iosTip.contains(e.target) && !el.installBtn.contains(e.target)) el.iosTip.hidden = true;
    });
  }

  /* ------------------------------------------------------------- wiring */
  function bind() {
    el.shutterBtn.addEventListener('click', shoot);
    el.shutterBtn.addEventListener('pointerdown', () => { audio(); });
    el.lcd.addEventListener('pointerdown', () => { audio(); });
    el.flipBtn.addEventListener('click', flipCamera);
    el.flashBtn.addEventListener('click', () => {
      press();
      state.flash = !state.flash;
      store.set('flash', state.flash);
      updateHud();
      lcdMsg(state.flash ? (state.facing === 'environment' && state.torch ? 'FLASH ON' : 'SCREEN FLASH') : 'FLASH OFF');
    });
    el.dateBtn.addEventListener('click', () => {
      press();
      state.date = !state.date;
      store.set('date', state.date);
      updateHud();
      lcdMsg(state.date ? 'DATE ON' : 'DATE OFF');
    });
    el.frameBtn.addEventListener('click', () => {
      press();
      state.frame = FRAMES[(FRAMES.indexOf(state.frame) + 1) % FRAMES.length];
      store.set('frame', state.frame);
      updateHud();
      lcdMsg(FRAME_LABEL[state.frame]);
    });
    el.filterPrev.addEventListener('click', () => { press(); setFilter(state.filter - 1); });
    el.filterNext.addEventListener('click', () => { press(); setFilter(state.filter + 1); });
    el.muteBtn.addEventListener('click', () => {
      state.muted = !state.muted;
      store.set('muted', state.muted);
      updateHud();
      if (!state.muted) soundBlip(2400);
      buzz(8);
    });
    document.querySelectorAll('[data-set-color]').forEach((b) => {
      b.addEventListener('click', () => { press(); setColor(b.dataset.setColor, true); });
    });

    el.rollBtn.addEventListener('click', openRoll);
    el.closeRollBtn.addEventListener('click', () => { press(); closeRoll(); });
    el.rollSheet.addEventListener('click', (e) => { if (e.target === el.rollSheet) closeRoll(); });
    el.selectAllBtn.addEventListener('click', () => {
      press();
      if (selected.size === rollList.length) selected.clear();
      else rollList.forEach((r) => selected.add(r.id));
      el.rollGrid.querySelectorAll('button').forEach((b, i) => {
        b.setAttribute('aria-pressed', String(selected.has(rollList[i].id)));
      });
      updateRollBar();
    });
    el.saveSelBtn.addEventListener('click', saveSelected);
    el.deleteSelBtn.addEventListener('click', deleteSelected);
    el.modeBtn.addEventListener('click', () => { press(); setMode(state.mode === 'video' ? 'photo' : 'video'); });

    el.retryBtn.addEventListener('click', () => { press(); startCamera(); });
    el.nativeInput.addEventListener('change', () => shootFromFile(el.nativeInput.files && el.nativeInput.files[0]));

    // swipe the LCD to change filters
    let sx = null, sy = 0;
    el.lcd.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    el.lcd.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      let dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (UI_ROTATED.matches) [dx, dy] = [dy, -dx];
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && state.running) {
        press();
        setFilter(state.filter + (dx < 0 ? 1 : -1));
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && el.lcdState.hidden) {
        shoot();
      }
    });
    el.lcd.addEventListener('pointercancel', () => { sx = null; });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!el.rollSheet.hidden) closeRoll();
        else el.iosTip.hidden = true;
        return;
      }
      // Volume keys / Bluetooth selfie remotes (most send "volume up"). Browsers that pass
      // these keys to the page get a shutter; iPhone Safari never does.
      if (e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown' || e.key === 'VolumeUp' || e.key === 'VolumeDown') {
        e.preventDefault();
        if (el.rollSheet.hidden) shoot();
        return;
      }
      if (!el.rollSheet.hidden) return;
      const onButton = e.target instanceof HTMLElement && e.target.closest('button, a, input, label');
      if ((e.key === ' ' || e.key === 'Enter') && !onButton) { e.preventDefault(); shoot(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setFilter(state.filter - 1);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setFilter(state.filter + 1);
    });

    // Release the camera in the background; pick it back up on return.
    let resumeOnShow = false;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopRecording();
        resumeOnShow = state.running;
        stopCamera();
      } else if (resumeOnShow || (!state.running && !state.error)) {
        resumeOnShow = false;
        startCamera();
      }
    });
    window.addEventListener('pagehide', stopCamera);
  }

  /* --------------------------------------------------------------- boot */
  function boot() {
    setColor(state.color, false);
    updateHud();
    bind();
    initBattery();
    initInstall();
    syncRoll();
    startCamera();
    if ('serviceWorker' in navigator && window.isSecureContext) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
      });
    }
    // Ask the browser not to evict the roll under storage pressure.
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  boot();
})();
