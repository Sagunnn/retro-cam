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
    flashBtn: $('flashBtn'), hqBtn: $('hqBtn'), dateBtn: $('dateBtn'), frameBtn: $('frameBtn'),
    shutterBtn: $('shutterBtn'), rollBtn: $('rollBtn'),
    filterPrev: $('filterPrev'), filterNext: $('filterNext'),
    muteBtn: $('muteBtn'), installBtn: $('installBtn'), iosTip: $('iosTip'), iosTipClose: $('iosTipClose'),
    screenFlash: $('screenFlash'),
    modeBtn: $('modeBtn'), rollBtn2: $('rollBtn2'), shutterV: $('shutterV'), shutterH: $('shutterH'), saveRollBtn: $('saveRollBtn'), modeBtn2: $('modeBtn2'),
    viewer: $('viewer'), viewerScreen: $('viewerScreen'), viewerTrack: $('viewerTrack'), viewerTag: $('viewerTag'),
    viewerClose: $('viewerClose'), viewerSave: $('viewerSave'), pbZoom: $('pbZoom'),
    pb: $('pb'), pbImg: $('pbImg'), pbVid: $('pbVid'), pbTag: $('pbTag'), pbAll: $('pbAll'), pbSave: $('pbSave'), hudRec: $('hudRec'), hudRecText: $('hudRecText'), led: $('led'),
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
  // The camera is horizontal whichever way the phone is held, so pictures are always 2:1
  // (an upright phone's portrait camera frame is cropped to the same wide shape).
  const VERTICAL = matchMedia('(orientation: portrait)');
  const shape = (long, short) => [long, short];
  // Horizontal layout in an upright browser = the camera is flipped 90° (body.flip).
  const flipped = () => document.body.classList.contains('flip');
  // How far to turn the camera's portrait frames while flipped (phone held top-to-the-left):
  // the back camera's world-up is on the frame's right (−90°); the selfie camera's frame is
  // mirrored relative to that, so its world-up is on the left (+90°). 0 = no turn.
  const needsTurn = (w, h) => (flipped() && h > w ? (state.mirror ? 1 : -1) : 0);

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
      noise: 3, chroma: 2.5, bloom: 0.5, vignette: 0.14, ca: 2 },
    { id: 'warm', name: 'WARM', exposure: 1.06, sat: 0.84, contrast: 0.82, lift: 0.1, roll: 0.95,
      gain: [1.09, 1.0, 0.85], shadow: [20, 8, -4], high: [12, 6, -14],
      noise: 3.5, chroma: 2, bloom: 0.45, vignette: 0.3, ca: 2 },
    { id: 'ccd', name: 'CCD', exposure: 1.04, sat: 1.12, contrast: 0.98, lift: 0.04, roll: 0.985,
      gain: [0.94, 1.0, 1.08], shadow: [-4, 6, 18], high: [-6, 4, 12],
      noise: 3, chroma: 3, bloom: 0.55, vignette: 0.18, ca: 3 },
    { id: 'bw', name: 'B&W', bw: true, exposure: 1.05, sat: 0, contrast: 1.2, lift: 0.05, roll: 0.97,
      gain: [1, 1, 1], shadow: [0, 0, 0], high: [0, 0, 0],
      noise: 6, chroma: 0, bloom: 0.3, vignette: 0.3, ca: 0 },
  ];

  const FRAMES = ['none', 'film', 'instant', 'round'];
  const FRAME_LABEL = { none: 'NO FRAME', film: 'FILM', instant: 'INSTANT', round: 'ROUND' };

  const state = {
    color: COLOR_NAMES[store.get('color', 'yellow')] ? store.get('color', 'yellow') : 'yellow',
    filter: Math.min(Math.max(0, store.get('filter', 0) | 0), FILTERS.length - 1),
    frame: FRAMES.includes(store.get('frame', 'film')) ? store.get('frame', 'film') : 'film',
    hq: !!store.get('hq', false),
    lensOnly: !!store.get('lensOnly', false),
    wide: !!store.get('wide', false), // rear ultra-wide (0.5×) lens when the phone has one // selfie camera: show the camera's front (lens) instead of its screen // false = vintage (lo-fi 1.6 MP), true = high quality
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
    const m = Math.min(rect.w, rect.h);
    drawSegText(ctx, text, rect.x + rect.w - m * 0.09, rect.y + rect.h - m * 0.065, Math.max(6, m * 0.06));
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

  function filmBase(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2a2119');
    g.addColorStop(0.5, '#221a13');
    g.addColorStop(1, '#2b2017');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  /* ----- overlay frames (drawn over the photo edges; returns the visible photo area) */
  function drawFrame(ctx, w, h, frame) {
    if (frame === 'instant') {
      const m = Math.min(w, h);
      const sx = m * 0.07, top = m * 0.07, bottom = m * 0.17;
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
      const m = Math.min(w, h);
      const inset = m * 0.03, rad = m * 0.09;
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
  // HQ keeps a look's colours but drops the cheap-camera damage (grain, colour noise, fringing).
  function lookFor(i) {
    const f = FILTERS[i];
    return state.hq ? { ...f, id: f.id, noise: 0, chroma: 0, ca: 0, bloom: f.bloom * 0.6, vignette: f.vignette * 0.6 } : f;
  }
  function develop(canvas, ctx, opts) {
    const f = lookFor(opts.filter);
    const w = canvas.width, h = canvas.height;
    processPixels(ctx, w, h, f, Math.max(w, h) / 1792);
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
    if (watchdog(v, now)) return;
    if (v.readyState < 2 || !v.videoWidth) return;
    lastFrame = now;
    const turn = needsTurn(v.videoWidth, v.videoHeight);
    if (state.recording) {
      // develop the recording frame once, then show it on the LCD
      const rw = recCanvas.width, rh = recCanvas.height;
      drawCover(recCtx, rw, rh, v, v.videoWidth, v.videoHeight, state.mirror, turn);
      const f = lookFor(state.filter);
      processPixels(recCtx, rw, rh, f, Math.max(rw, rh) / 1792);
      bloom(recCanvas, recCtx, f.bloom);
      if (state.date) drawDateStamp(recCtx, { x: 0, y: 0, w: rw, h: rh }, dateString());
      present(recCanvas);
      updateRecClock();
      return;
    }
    drawCover(viewCtx, el.view.width, el.view.height, v, v.videoWidth, v.videoHeight, state.mirror, turn);
    develop(el.view, viewCtx, {
      filter: state.filter, frame: state.mode === 'video' ? 'none' : state.frame, date: state.date,
      frameNo: state.frameNo + 1, when: new Date(), live: true,
    });
  }
  function present(src) {
    viewCtx.drawImage(src, 0, 0, el.view.width, el.view.height);
  }

  /* ------------------------------------------------------------- video */
  // Lo-fi video like a 2000s digicam: 640×320, 24 fps, same colour/grain as photos.
  // 640×320 horizontal, 320×640 vertical
  const REC_FPS = 24, REC_MAX_S = 60;
  const recCanvas = makeCanvas(640, 320);
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
    [recCanvas.width, recCanvas.height] = state.hq ? shape(960, 480) : shape(640, 320);
    const stream = recCanvas.captureStream(REC_FPS);
    const audio = state.stream && state.stream.getAudioTracks()[0];
    if (audio) stream.addTrack(audio);
    let rec;
    try {
      rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: state.hq ? 5_000_000 : 2_000_000 });
    } catch {
      rec = new MediaRecorder(stream);
    }
    recMime = rec.mimeType || mime || 'video/webm';
    recChunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    rec.onstop = finishRecording;
    // first frame before the recorder starts, so the file never opens on black
    const v = el.video;
    drawCover(recCtx, recCanvas.width, recCanvas.height, v, v.videoWidth, v.videoHeight, state.mirror, needsTurn(v.videoWidth, v.videoHeight));
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
    const k = 384 / Math.max(recCanvas.width, recCanvas.height);
    const t = makeCanvas(Math.round(recCanvas.width * k), Math.round(recCanvas.height * k));
    t.getContext('2d').drawImage(recCanvas, 0, 0, t.width, t.height);
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
    startReview(rec);
  }

  function setMode(mode) {
    if (lcdShow.mode !== 'live') hideLcdShow();
    if (state.recording) stopRecording();
    state.mode = mode;
    store.set('mode', mode);
    updateHud();
    lcdMsg(mode === 'video' ? 'VIDEO' : 'PHOTO');
    // video needs the microphone too, so reopen the camera with audio (and drop it again for photos)
    if (state.running || state.error === 'busy' || state.error === 'error') startCamera();
  }
  function startLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }

  // iPhone Safari can pause the camera's video (share sheet, notifications, power saving) and
  // never resume it, which freezes the LCD. If the feed stops moving, nudge it; if it's still
  // stuck a few seconds later, restart the camera (what flipping the camera used to fix).
  let lastVideoTime = -1, stalledSince = 0;
  function watchdog(v, now) {
    if (v.paused && v.srcObject) v.play().catch(() => {});
    const t = v.currentTime;
    if (t !== lastVideoTime) { lastVideoTime = t; stalledSince = 0; return false; }
    if (!stalledSince) { stalledSince = now; return false; }
    const stuck = now - stalledSince;
    if (stuck > 1000) v.play().catch(() => {});
    if (stuck > 3500 && !state.recording && !state.starting) {
      stalledSince = 0;
      startCamera();
      return true;
    }
    return false;
  }
  function resetWatchdog() { lastVideoTime = -1; stalledSince = 0; }
  function setLayout(vertical) {
    document.body.classList.toggle('v', vertical);
    document.body.classList.toggle('flip', !vertical && VERTICAL.matches);
    document.querySelectorAll('.layout-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(vertical));
      b.setAttribute('aria-label', vertical ? 'Vertical layout (tap for horizontal)' : 'Horizontal layout (tap for vertical)');
    });
  }
  function fitView() {
    const w = 320, h = 160;
    if (el.view.width !== w || el.view.height !== h) { el.view.width = w; el.view.height = h; }
  }

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
      const video = state.hq
        ? { facingMode: { ideal: state.facing }, width: { ideal: 3840 }, height: { ideal: 2160 } }
        : { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      // Wide (0.5×): pick the rear ultra-wide camera by name (iPhone: "Back Ultra Wide Camera").
      state.wideActive = false;
      if (state.wide && state.facing === 'environment') {
        const uw = await findUltraWide();
        if (uw) { delete video.facingMode; video.deviceId = { exact: uw }; state.wideActive = true; }
      }
      // Wide selfie: the front camera has no wider lens and Safari won't zoom it below 1×, but its
      // 16:9 picture is cut from the middle of a 4:3 sensor. Asking for 4:3 gets the full sensor,
      // about a third wider side to side when the phone is upright.
      if (state.wide && state.facing === 'user') {
        video.width = { ideal: state.hq ? 4032 : 1920 };
        video.height = { ideal: state.hq ? 3024 : 1440 };
        video.aspectRatio = { ideal: 4 / 3 };
      }
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
      resetWatchdog();
      // the feed was cut off (another app took the camera, etc.): start it again
      state.track.addEventListener('ended', () => {
        if (state.stream === stream && state.running && !document.hidden) startCamera();
      });
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
      // Wide selfie: did we get the full 4:3 sensor?
      if (state.wide && state.facing === 'user') {
        const w = settings.width || el.video.videoWidth, h = settings.height || el.video.videoHeight;
        if (w && h && Math.max(w, h) / Math.min(w, h) < 1.5) state.wideActive = true;
      }
      // Still not wide: zoom out as far as the browser allows (some Android phones)
      if (state.wide && !state.wideActive) {
        const cur = (settings.zoom || 1);
        if (caps.zoom && caps.zoom.min < cur) {
          try { await state.track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }); state.wideActive = true; } catch { /* not allowed */ }
        }
        if (!state.wideActive) setTimeout(() => lcdMsg('NO WIDE', 1200), 400);
      }
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

  // Device labels are only filled in once camera permission has been given.
  async function findUltraWide() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cam = list.find((d) => d.kind === 'videoinput' && /ultra\s*wide|0[.,]5|ultrawide/i.test(d.label));
      return cam ? cam.deviceId : null;
    } catch { return null; }
  }

  async function countCameras() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      state.cameraCount = list.filter((d) => d.kind === 'videoinput').length || 1;
    } catch { state.cameraCount = 2; }
    document.querySelectorAll('.flip-btn').forEach((b) => b.classList.toggle('single', state.cameraCount < 2));
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
  // Output: 1.6 MP in the LCD's shape: 1792×896 horizontal, 896×1792 vertical.
  // The "sensor": the picture is developed at ~0.3 MP and only then blown up to 1.6 MP,
  // the way cheap 2000s cameras interpolated a tiny sensor up to the number on the box.
  const sensor = makeCanvas(768, 384);
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
  // HQ: the largest 2:1 crop of the camera's own frame (up to 3840 wide), the look's colours,
  // no grain or crunch.
  function developHQ(src, srcW, srcH, mirror, turn) {
    const f = lookFor(state.filter);
    const effW = turn ? srcH : srcW, effH = turn ? srcW : srcH;
    let W = Math.min(effW, effH * 2, 3840);
    W = Math.max(2, Math.round(W / 2) * 2);
    const H = W / 2;
    const out = makeCanvas(W, H);
    const octx = ctx2d(out);
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    drawCover(octx, W, H, src, srcW, srcH, mirror, turn);
    processPixels(octx, W, H, f, W / 1792);
    bloom(out, octx, f.bloom);
    return { out, octx, OUT_W: W, OUT_H: H };
  }

  async function developPhoto(src, srcW, srcH, mirror, turn) {
    const f = FILTERS[state.filter];
    let out, octx, OUT_W, OUT_H;
    if (state.hq) {
      ({ out, octx, OUT_W, OUT_H } = developHQ(src, srcW, srcH, mirror, turn));
    } else {
    // 1. tiny sensor: colour, grain and vignette happen at ~0.3 MP, so grain is blotchy once enlarged
    sensorCtx.imageSmoothingEnabled = true;
    sensorCtx.imageSmoothingQuality = 'high';
    [OUT_W, OUT_H] = shape(1792, 896);
    const [SENSOR_W, SENSOR_H] = shape(768, 384);
    if (sensor.width !== SENSOR_W || sensor.height !== SENSOR_H) { sensor.width = SENSOR_W; sensor.height = SENSOR_H; }
    sensorCtx.imageSmoothingEnabled = true;
    sensorCtx.imageSmoothingQuality = 'high';
    drawCover(sensorCtx, SENSOR_W, SENSOR_H, src, srcW, srcH, mirror, turn);
    processPixels(sensorCtx, SENSOR_W, SENSOR_H, f, 768 / 1792);
    // 2. the camera's own sharpening and 3. its JPEG engine
    sharpen(sensorCtx, SENSOR_W, SENSOR_H, SHARPEN);
    const crunched = await decodeImage(await canvasToBlob(sensor, 'image/jpeg', CRUNCH_QUALITY));
    // 4. interpolate up to 1.6 MP
    out = makeCanvas(OUT_W, OUT_H);
    octx = ctx2d(out);
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'medium';
    octx.drawImage(crunched, 0, 0, OUT_W, OUT_H);
    if (crunched.close) crunched.close();
    bloom(out, octx, f.bloom);
    }

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
    const blob = await canvasToBlob(final, 'image/jpeg', state.hq ? 0.92 : SAVE_QUALITY);
    const k = 384 / Math.max(final.width, final.height);
    const t = makeCanvas(Math.round(final.width * k), Math.round(final.height * k));
    const tctx = t.getContext('2d');
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(final, 0, 0, t.width, t.height);
    const thumb = await canvasToBlob(t, 'image/jpeg', 0.75);
    out.width = out.height = 1; // free memory early (iOS canvas limits)
    final.width = final.height = 1;
    return { ...meta, blob, thumb };
  }

  async function shoot() {
    if (lcdShow.mode === 'review') { endReview(); return; } // capture again = back to live
    if (lcdShow.mode === 'play') { exitPlay(); return; }
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
      const fl = document.querySelector('.f-flash');
      fl.classList.remove('snap');
      void fl.offsetWidth;
      fl.classList.add('snap');
      state.paused = true;
      const shot = await developPhoto(grab, grab.width, grab.height, state.mirror, needsTurn(grab.width, grab.height));
      grab.width = grab.height = 1;
      const id = await roll.add(shot);
      shot.id = id;
      state.shots += 1;
      updateHud();
      refreshRollThumb(shot);
      startReview(shot);
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
      startReview(shot);
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
    const recs = rollList.filter((r) => selected.has(r.id));
    if (await saveRecords(recs)) { selected.clear(); await renderRoll(); }
  }
  // Share sheet on phones (→ "Save Images"), downloads elsewhere. Returns true if shared.
  async function saveRecords(recs) {
    // Build the files synchronously so the share sheet still counts as a direct tap (iOS).
    const files = recs.map(toFile).filter(Boolean);
    if (!files.length) return false;
    press();
    if (IS_MOBILE && navigator.share && navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files });
        return true;
      } catch (err) {
        if (err && err.name === 'AbortError') return false; // closed the share sheet
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
    return false;
  }

  /* ------------------------------------------- the camera's screen: review + playback */
  // lcdShow.mode: 'live' | 'review' (5 s after a shot) | 'play' (browsing with ▶ and ▲▼)
  const lcdShow = { mode: 'live', url: null, timer: 0, list: [], index: 0 };
  const REVIEW_MS = 5000;

  function showOnLcd(rec, tag) {
    if (lcdShow.url) URL.revokeObjectURL(lcdShow.url);
    lcdShow.url = URL.createObjectURL(rec.blob);
    const isVideo = rec.kind === 'video';
    el.pbImg.hidden = isVideo;
    el.pbVid.hidden = !isVideo;
    if (isVideo) {
      el.pbImg.removeAttribute('src');
      el.pbVid.src = lcdShow.url;
      el.pbVid.play().catch(() => {});
    } else {
      el.pbVid.pause();
      el.pbVid.removeAttribute('src');
      el.pbImg.src = lcdShow.url;
    }
    el.pbTag.textContent = tag || '';
    el.pb.hidden = false;
    state.paused = true;
  }
  function hideLcdShow() {
    resetWatchdog();
    if (viewer.open) closeViewerNow();
    clearTimeout(lcdShow.timer);
    el.pb.hidden = true;
    el.pb.classList.remove('review');
    el.pbVid.pause();
    el.pbVid.removeAttribute('src');
    el.pbImg.removeAttribute('src');
    if (lcdShow.url) { URL.revokeObjectURL(lcdShow.url); lcdShow.url = null; }
    lcdShow.mode = 'live';
    lcdShow.list = [];
    if (el.rollSheet.hidden) state.paused = false;
    updateHud();
  }

  function startReview(rec) {
    if (lcdShow.mode === 'play') hideLcdShow();
    lcdShow.mode = 'review';
    el.pb.classList.add('review');
    showOnLcd(rec, '');
    updateHud(); // Lens view: turn round to show the shot
    clearTimeout(lcdShow.timer);
    lcdShow.timer = setTimeout(endReview, REVIEW_MS);
  }
  function endReview() {
    if (lcdShow.mode !== 'review') return;
    hideLcdShow();
  }

  async function enterPlay() {
    if (state.recording) stopRecording();
    if (lcdShow.mode === 'review') hideLcdShow();
    const list = await roll.all(); // newest first
    if (!list.length) { lcdMsg('NO SHOTS'); return; }
    lcdShow.mode = 'play';
    lcdShow.list = list;
    lcdShow.index = 0;
    el.pb.classList.remove('review');
    showPlay();
    updateHud();
  }
  function showPlay() {
    const rec = lcdShow.list[lcdShow.index];
    showOnLcd(rec, `▶ ${lcdShow.index + 1}/${lcdShow.list.length}`);
  }
  // +1 = older, -1 = newer
  function playStep(d) {
    const i = lcdShow.index + d;
    if (i < 0 || i >= lcdShow.list.length) { lcdMsg(i < 0 ? 'NEWEST' : 'OLDEST', 600); return; }
    lcdShow.index = i;
    showPlay();
  }
  function exitPlay() {
    if (lcdShow.mode !== 'play') return;
    hideLcdShow();
  }
  /* ----- full-screen viewer: the LCD "zoomed in", swipe through every shot */
  const viewer = { list: [], index: 0, urls: [], open: false };
  function lcdBox() {
    // the LCD's box in the viewer's own coordinates (the app may be flipped 90°)
    const app = el.viewer.getBoundingClientRect(), r = el.lcd.getBoundingClientRect();
    if (!flipped()) return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height };
    // flipped: screen y → app x, screen x → app y (mirrored)
    return { x: r.top - app.top, y: app.right - r.right, w: r.height, h: r.width };
  }
  function screenBox() {
    const s = el.viewerScreen, v = el.viewer;
    return { x: s.offsetLeft, y: s.offsetTop, w: s.offsetWidth, h: s.offsetHeight, vw: v.offsetWidth };
  }
  function zoomFrames() {
    const a = lcdBox(), b = screenBox();
    const dx = a.x + a.w / 2 - (b.x + b.w / 2), dy = a.y + a.h / 2 - (b.y + b.h / 2);
    return [{ transform: `translate(${dx}px, ${dy}px) scale(${a.w / b.w}, ${a.h / b.h})` }, { transform: 'none' }];
  }
  function openViewer(list, index) {
    if (!list.length) return;
    closeViewerNow();
    viewer.list = list;
    viewer.index = index;
    viewer.open = true;
    const frag = document.createDocumentFragment();
    for (const rec of list) {
      const slide = document.createElement('div');
      slide.className = 'viewer-slide';
      const url = URL.createObjectURL(rec.blob);
      viewer.urls.push(url);
      let media;
      if (rec.kind === 'video') {
        media = document.createElement('video');
        media.playsInline = true;
        media.loop = true;
        media.muted = true;
        media.preload = 'metadata';
        media.addEventListener('click', () => { media.muted = !media.muted; });
      } else {
        media = document.createElement('img');
        media.decoding = 'async';
        media.loading = 'lazy';
        media.alt = `Shot ${rec.n || rec.id}`;
      }
      media.src = url;
      slide.append(media);
      frag.append(slide);
    }
    el.viewerTrack.textContent = '';
    el.viewerTrack.append(frag);
    el.viewer.hidden = false;
    el.viewerTrack.scrollLeft = index * el.viewerTrack.clientWidth;
    viewerSync();
    if (el.viewerScreen.animate) {
      el.viewerScreen.animate(zoomFrames(), { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      el.viewer.animate([{ backgroundColor: 'rgba(0,0,0,0)' }, { backgroundColor: '#000' }], { duration: 320 });
    }
  }
  function viewerSync() {
    const w = el.viewerTrack.clientWidth || 1;
    const i = Math.max(0, Math.min(viewer.list.length - 1, Math.round(el.viewerTrack.scrollLeft / w)));
    viewer.index = i;
    el.viewerTag.textContent = `${i + 1}/${viewer.list.length}`;
    el.viewerTrack.querySelectorAll('video').forEach((v, k) => {
      const slideIndex = [...el.viewerTrack.children].indexOf(v.parentElement);
      if (slideIndex === i) v.play().catch(() => {}); else v.pause();
    });
  }
  function closeViewerNow() {
    el.viewer.hidden = true;
    el.viewerTrack.querySelectorAll('video').forEach((v) => v.pause());
    el.viewerTrack.textContent = '';
    viewer.urls.forEach((u) => URL.revokeObjectURL(u));
    viewer.urls = [];
    viewer.open = false;
  }
  function closeViewer() {
    if (!viewer.open) return;
    // back on the camera's screen at the shot you stopped on
    if (lcdShow.mode === 'play' && lcdShow.list === viewer.list) { lcdShow.index = viewer.index; showPlay(); }
    const done = () => closeViewerNow();
    if (el.viewerScreen.animate) {
      const frames = zoomFrames().reverse();
      el.viewer.animate([{ backgroundColor: '#000' }, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: 260, fill: 'forwards' });
      el.viewerScreen.animate(frames, { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.8, 0.4)', fill: 'forwards' }).onfinish = () => {
        el.viewer.getAnimations().forEach((a) => a.cancel());
        el.viewerScreen.getAnimations().forEach((a) => a.cancel());
        done();
      };
    } else done();
  }

  function togglePlay() {
    press();
    if (lcdShow.mode === 'play') exitPlay(); else enterPlay();
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
    if (lcdShow.mode !== 'live') hideLcdShow();
    if (state.recording) stopRecording();
    state.paused = true;
    selected.clear();
    el.rollSheet.hidden = false;
    await renderRoll();
  }
  function closeRoll() {
    resetWatchdog();
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
    el.hudFilter.textContent = state.hq ? `${f.name} HQ` : f.name;
    el.hqBtn.setAttribute('aria-pressed', String(state.hq));
    el.hqBtn.setAttribute('aria-label', state.hq ? 'High quality on (tap for vintage)' : 'Vintage quality (tap for high quality)');
    el.hudFlash.toggleAttribute('hidden', !state.flash);
    el.hudFacing.textContent = state.facing === 'user'
      ? (state.wideActive ? 'SELFIE WIDE' : 'SELFIE')
      : (state.wideActive ? 'REAR 0.5×' : 'REAR');
    document.querySelectorAll('.wide-btn').forEach((b) => b.setAttribute('aria-pressed', String(state.wide)));
    el.hudCount.textContent = pad(Math.min(999, state.shots), 3);
    const video = state.mode === 'video';
    el.modeBtn.setAttribute('aria-pressed', String(video));
    el.modeBtn.setAttribute('aria-label', video ? 'Video mode on' : 'Video mode off');
    el.led.className = 'led' + (video ? ' video' : '') + (state.recording ? ' rec' : '');
    el.hudRec.hidden = !video;
    el.hudRec.classList.toggle('rec', state.recording);
    if (!state.recording) el.hudRecText.textContent = 'STBY';
    el.shutterBtn.classList.toggle('recording', state.recording);
    el.rollBtn2.dataset.on = String(lcdShow.mode === 'play');
    // selfie camera + "Lens": the camera turns round to show its front (not while browsing shots)
    const selfie = state.facing === 'user';
    document.body.classList.toggle('selfie', selfie);
    // (the 5-second review after a shot and playback turn it back so you can see the photo)
    document.body.classList.toggle('lens-view', state.lensOnly && selfie && lcdShow.mode === 'live');
    document.body.classList.toggle('rec', state.recording);
    document.querySelectorAll('.lens-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(state.lensOnly));
      b.setAttribute('aria-label', state.lensOnly ? 'Lens view on (tap to see the screen)' : 'Lens view off (tap to see only the lens)');
    });
    $('rollBtn3').dataset.on = String(lcdShow.mode === 'play');
    for (const b of [el.shutterV, el.shutterH]) {
      b.classList.toggle('recording', state.recording);
      b.setAttribute('aria-label', video ? (state.recording ? 'Stop recording' : 'Start recording') : 'Take photo');
    }
    el.modeBtn2.setAttribute('aria-pressed', String(video));
    el.modeBtn2.setAttribute('aria-label', video ? 'Video mode on' : 'Video mode off');
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
    for (const b of [el.shutterBtn, el.shutterV, el.shutterH]) {
      b.addEventListener('click', shoot);
      b.addEventListener('pointerdown', () => { audio(); });
    }
    el.saveRollBtn.addEventListener('click', openRoll);
    document.querySelectorAll('.lens-btn').forEach((b) => b.addEventListener('click', () => {
      press();
      state.lensOnly = !state.lensOnly;
      store.set('lensOnly', state.lensOnly);
      updateHud();
    }));
    $('front').addEventListener('click', shoot);
    document.querySelectorAll('.wide-btn').forEach((b) => b.addEventListener('click', () => {
      press();
      state.wide = !state.wide;
      store.set('wide', state.wide);
      updateHud();
      lcdMsg(state.wide ? '0.5×' : '1×');
      if (state.recording) stopRecording();
      if (state.running) startCamera();
    }));
    el.hqBtn.addEventListener('click', () => {
      press();
      state.hq = !state.hq;
      store.set('hq', state.hq);
      updateHud();
      lcdMsg(state.hq ? 'HQ' : 'VINTAGE');
      if (state.recording) stopRecording();
      if (state.running) startCamera(); // ask the camera for the matching resolution
    });
    el.lcd.addEventListener('pointerdown', () => { audio(); });
    document.querySelectorAll('.flip-btn').forEach((b) => b.addEventListener('click', flipCamera));
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
    // ▲ / ▼: change the look, or (in playback) go to a newer / older shot
    const step = (d) => { press(); if (lcdShow.mode === 'play') playStep(d); else setFilter(state.filter + d); };
    el.filterPrev.addEventListener('click', () => step(-1));
    el.filterNext.addEventListener('click', () => step(1));
    // the extra ▲ ▼ beside / under the camera do the same
    document.querySelectorAll('.arrow-btn').forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.step))));
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

    el.rollBtn.addEventListener('click', togglePlay);
    el.rollBtn2.addEventListener('click', togglePlay);
    $('rollBtn3').addEventListener('click', togglePlay);
    el.pbAll.addEventListener('click', (e) => { e.stopPropagation(); exitPlay(); openRoll(); });
    el.pbZoom.addEventListener('click', (e) => { e.stopPropagation(); press(); openViewer(lcdShow.list, lcdShow.index); });
    el.viewerClose.addEventListener('click', () => { press(); closeViewer(); });
    el.viewerSave.addEventListener('click', () => {
      const rec = viewer.list[viewer.index];
      if (rec) saveRecords([rec]);
    });
    let scrollTimer = 0;
    el.viewerTrack.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(viewerSync, 90);
    }, { passive: true });
    // keep the same shot in view if the screen size changes (turning the phone, layout toggle)
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        if (viewer.open) el.viewerTrack.scrollLeft = viewer.index * el.viewerTrack.clientWidth;
      }).observe(el.viewerTrack);
    }
    el.pbSave.addEventListener('click', (e) => {
      e.stopPropagation();
      const rec = lcdShow.list[lcdShow.index];
      if (rec) saveRecords([rec]);
    });
    ['pointerup', 'pointerdown'].forEach((t) => {
      el.pbAll.addEventListener(t, (e) => e.stopPropagation());
      el.pbSave.addEventListener(t, (e) => e.stopPropagation());
      el.pbZoom.addEventListener(t, (e) => e.stopPropagation());
    });
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
    document.querySelectorAll('.layout-btn').forEach((b) => b.addEventListener('click', () => {
      press();
      const v = !document.body.classList.contains('v');
      setLayout(v);
      lcdMsg(v ? 'VERTICAL' : 'HORIZONTAL');
    }));
    el.modeBtn2.addEventListener('click', () => { press(); setMode(state.mode === 'video' ? 'photo' : 'video'); });

    el.retryBtn.addEventListener('click', () => { press(); startCamera(); });
    el.nativeInput.addEventListener('change', () => shootFromFile(el.nativeInput.files && el.nativeInput.files[0]));

    // swipe the LCD to change filters
    let sx = null, sy = 0;
    el.lcd.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    el.lcd.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      let dx = e.clientX - sx, dy = e.clientY - sy;
      if (flipped()) [dx, dy] = [dy, -dx]; // screen axes → the flipped camera's axes
      sx = null;
      const swipe = Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5;
      const tap = Math.abs(dx) < 10 && Math.abs(dy) < 10;
      if (lcdShow.mode === 'play') {
        if (swipe) { press(); playStep(dx < 0 ? 1 : -1); } // swipe left = older
        else if (tap) openViewer(lcdShow.list, lcdShow.index);
      } else if (lcdShow.mode === 'review') {
        if (tap) endReview();
      } else if (swipe && state.running) {
        press();
        setFilter(state.filter + (dx < 0 ? 1 : -1));
      } else if (tap && el.lcdState.hidden) {
        shoot();
      }
    });
    el.lcd.addEventListener('pointercancel', () => { sx = null; });

    document.addEventListener('keydown', (e) => {
      if (viewer.open) {
        if (e.key === 'Escape') closeViewer();
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') el.viewerTrack.scrollBy({ left: el.viewerTrack.clientWidth, behavior: 'smooth' });
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') el.viewerTrack.scrollBy({ left: -el.viewerTrack.clientWidth, behavior: 'smooth' });
        return;
      }
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
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { if (lcdShow.mode === 'play') playStep(-1); else setFilter(state.filter - 1); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { if (lcdShow.mode === 'play') playStep(1); else setFilter(state.filter + 1); }
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
    // back from the app switcher / back-forward cache: make sure the camera is live again
    window.addEventListener('pageshow', () => { if (!state.running && !state.starting && !state.error) startCamera(); });
    window.addEventListener('focus', () => { if (state.running && el.video.paused) el.video.play().catch(() => {}); });
  }

  /* ---------------------------------------------------------- life-size */
  // The camera is drawn at its real size (58 × 24.5 mm). Browsers don't expose physical pixel
  // density, so use Apple's figures per iPhone screen (points per inch), and Android's nominal
  // 160 dp per inch otherwise. Computers keep the fill-the-window size.
  function lifeSize() {
    if (!matchMedia('(pointer: coarse)').matches) return;
    const w = Math.min(window.screen.width, window.screen.height), h = Math.max(window.screen.width, window.screen.height);
    const IPHONE_PPI = {
      '375x812': 476 / 3,                   // 12 mini / 13 mini (also X / XS / 11 Pro, 458/3)
      '390x844': 460 / 3, '393x852': 460 / 3, '402x874': 460 / 3, // 12–16 / Pro
      '428x926': 458 / 3, '430x932': 460 / 3, '440x956': 460 / 3, // Max / Plus
      '414x896': 326 / 2,                   // XR / 11
      '375x667': 326 / 2, '320x568': 326 / 2, // SE
    };
    const ppi = (IS_IOS && IPHONE_PPI[`${w}x${h}`]) || (IS_IOS ? 460 / 3 : 160);
    document.documentElement.style.setProperty('--mm', `${(ppi / 25.4).toFixed(3)}px`);
  }

  /* --------------------------------------------------------------- boot */
  function boot() {
    lifeSize();
    fitView();
    // Vertical layout follows the phone (upright = vertical) until the toggle says otherwise.
    const onTurn = () => { if (state.recording) stopRecording(); fitView(); setLayout(VERTICAL.matches); };
    setLayout(VERTICAL.matches);
    if (VERTICAL.addEventListener) VERTICAL.addEventListener('change', onTurn);
    else if (VERTICAL.addListener) VERTICAL.addListener(onTurn);
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
