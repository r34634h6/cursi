(() => {
  const GLYPHS =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ*+-.:<=>[]｡｢｣､･ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";
  const LEVELS = ["#0f8a32", "#22d453", "#67ff8f", "#e9ffea", "#ffffff"];
  const ATLAS = 64;

  const view = document.getElementById("view");
  const gate = document.getElementById("gate");
  const hud = document.getElementById("hud");
  const writing = document.getElementById("writing");
  const errorEl = document.getElementById("error");
  const startBtn = document.getElementById("start");
  const demoBtn = document.getElementById("demo");
  const stopBtn = document.getElementById("stop");
  const fullBtn = document.getElementById("full");
  const cellInput = document.getElementById("cell");
  const cellWrap = document.getElementById("cell-wrap");
  const contrastInput = document.getElementById("contrast");
  const rainInput = document.getElementById("rain");
  const densityLabel = document.getElementById("density-label");
  const titleEl = document.getElementById("title");

  const ctx = view.getContext("2d", { alpha: false });
  const rainCanvas = document.createElement("canvas");
  const rainCtx = rainCanvas.getContext("2d");
  const figure = document.createElement("canvas");
  const figureCtx = figure.getContext("2d");
  const layer = document.createElement("canvas");
  const layerCtx = layer.getContext("2d");
  const bloom = document.createElement("canvas");
  const bloomCtx = bloom.getContext("2d");
  const sample = document.createElement("canvas");
  const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
  const demoCanvas = document.createElement("canvas");
  demoCanvas.width = 640;
  demoCanvas.height = 480;
  const demoCtx = demoCanvas.getContext("2d");
  const atlas = document.createElement("canvas");
  const atlasCtx = atlas.getContext("2d");

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute("playsinline", "");
  video.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(video);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let dpr = 1;
  let width = 0;
  let height = 0;
  let atlasReady = false;
  let mode = "gate";
  let stream = null;
  let reveal = 0;
  let last = performance.now();
  let depthScroll = 0;
  let columns = [];
  let vines = [];
  let sparks = [];
  let field = new Float32Array(0);
  let fieldPrev = new Float32Array(0);
  let glyphs = new Uint16Array(0);
  let ages = new Uint8Array(0);
  let cols = 0;
  let rows = 0;
  let exposure = { lo: 20, hi: 180 };
  let layout = null;
  let effect = "matrix";
  let wipe = true;
  const particles = [];
  let particleCursor = 0;
  const EFFECT_IDS = ["matrix", "plasma", "orbit", "glitch", "netz", "staub"];
  const EFFECT_TITLES = {
    matrix: "Der Code<br>erschafft dich",
    plasma: "Du<br>brennst",
    orbit: "Du gerätst<br>in den Orbit",
    glitch: "Das Signal<br>bricht auf",
    netz: "Du wirst<br>verbunden",
    staub: "Du löst<br>dich auf",
  };
  const EFFECT_COPY = {
    matrix: "Der Code schreibt dich",
    plasma: "Du brennst",
    orbit: "Du gerätst in den Orbit",
    glitch: "Das Signal bricht auf",
    netz: "Du wirst verbunden",
    staub: "Du löst dich auf",
  };
  const BACKDROP = {
    matrix: "#000400",
    plasma: "#140602",
    orbit: "#05010f",
    glitch: "#07040c",
    netz: "#02060e",
    staub: "#100c06",
  };

  for (let i = 0; i < 700; i += 1) particles.push({ life: 0 });

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function glyphFont(ch) {
    return ch.codePointAt(0) >= 0xff61 ? "MatrixKana" : "MatrixLatin";
  }

  async function loadFonts() {
    const latin = new FontFace("MatrixLatin", "url(fonts/matrix-latin.woff2)");
    const kana = new FontFace("MatrixKana", "url(fonts/matrix-kana.woff2)");
    const faces = await Promise.all([latin.load(), kana.load()]);
    faces.forEach((face) => document.fonts.add(face));
  }

  function buildAtlas() {
    atlas.width = GLYPHS.length * ATLAS;
    atlas.height = LEVELS.length * ATLAS;
    atlasCtx.clearRect(0, 0, atlas.width, atlas.height);
    atlasCtx.textAlign = "center";
    atlasCtx.textBaseline = "middle";
    const px = Math.floor(ATLAS * 0.72);
    for (let level = 0; level < LEVELS.length; level += 1) {
      for (let i = 0; i < GLYPHS.length; i += 1) {
        const ch = GLYPHS[i];
        const x = i * ATLAS + ATLAS / 2;
        const y = level * ATLAS + ATLAS / 2 + 1;
        atlasCtx.font = `400 ${px}px ${glyphFont(ch)}`;
        if (level >= 3) {
          atlasCtx.shadowColor = level === 4 ? "rgba(230,255,230,0.95)" : "rgba(90,255,140,0.95)";
          atlasCtx.shadowBlur = level === 4 ? 14 : 9;
        } else {
          atlasCtx.shadowBlur = 0;
        }
        atlasCtx.fillStyle = LEVELS[level];
        atlasCtx.fillText(ch, x, y);
        if (level === 4) {
          atlasCtx.shadowBlur = 0;
          atlasCtx.fillStyle = "#ffffff";
          atlasCtx.fillText(ch, x, y);
        }
      }
    }
    atlasCtx.shadowBlur = 0;
    atlasReady = true;
  }

  function blit(target, glyphIndex, level, x, y, size) {
    if (!atlasReady || size < 2) return;
    const gi = ((glyphIndex % GLYPHS.length) + GLYPHS.length) % GLYPHS.length;
    const lv = clamp(level, 0, LEVELS.length - 1);
    target.drawImage(atlas, gi * ATLAS, lv * ATLAS, ATLAS, ATLAS, x, y, size, size);
  }

  function randomGlyph() {
    return (Math.random() * GLYPHS.length) | 0;
  }

  function fitCanvas(canvas, w, h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  function buildVines() {
    vines = [];
    [0.06, 0.14, 0.22, 0.74, 0.84, 0.93].forEach((sx, index) => {
      const pts = [];
      let x = sx;
      let y = -0.02;
      const len = 7 + ((index * 3) % 6);
      for (let i = 0; i < len; i += 1) {
        x += Math.sin(index * 2.1 + i) * 0.012;
        y += 0.038 + (i % 3) * 0.006;
        pts.push({ x, y, g: randomGlyph() });
      }
      vines.push(pts);
    });
  }

  function buildSparks() {
    sparks = Array.from({ length: 70 }, () => spawnSpark(true));
  }

  function spawnSpark(anywhere) {
    return {
      x: Math.random(),
      y: anywhere ? Math.random() : Math.random() * 0.2,
      v: 0.02 + Math.random() * 0.08,
      s: Math.random(),
      life: Math.random(),
    };
  }

  function buildColumns() {
    const rain = Number(rainInput.value) / 100;
    const cssCell = Number(cellInput.value);
    const count = Math.max(24, Math.floor((width / dpr / cssCell) * (0.45 + rain)));
    columns = Array.from({ length: count }, (_, i) => ({
      x: ((i + 0.35) / count) * width,
      y: Math.random() * height,
      speed: (50 + Math.random() * 160) * (reduced ? 0.35 : 1),
      g: randomGlyph(),
      seed: Math.random(),
    }));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, Math.floor(window.innerWidth * dpr));
    height = Math.max(1, Math.floor(window.innerHeight * dpr));
    fitCanvas(view, width, height);
    fitCanvas(rainCanvas, width, height);
    fitCanvas(layer, width, height);
    fitCanvas(bloom, Math.max(1, Math.floor(width / 4)), Math.max(1, Math.floor(height / 4)));
    buildColumns();
    if (!vines.length) buildVines();
    if (!sparks.length) buildSparks();
  }

  function project(x, y, z) {
    const s = 0.48 / (0.48 + z);
    return {
      x: width * 0.5 + x * s * width * 1.2,
      y: height * 0.43 + y * s * height * 1.28,
      s,
    };
  }

  function drawTunnel(time, dt) {
    depthScroll = (depthScroll + dt * (reduced ? 0.12 : 0.32)) % 1;
    const zSteps = 20;
    const xSteps = 24;
    const ySteps = 11;
    for (let iz = 0; iz < zSteps; iz += 1) {
      const raw = (iz / zSteps + depthScroll) % 1;
      const z = 0.16 + (1 - raw) * 8.4;
      const near = 1 - Math.min(1, z / 6.2);
      const level = near > 0.72 ? 2 : near > 0.34 ? 1 : 0;
      for (let ix = 0; ix < xSteps; ix += 1) {
        const x = (ix / (xSteps - 1)) * 2 - 1;
        const floor = project(x, 0.98, z);
        const ceil = project(x, -0.92, z);
        const size = Math.max(6, floor.s * 78);
        if (floor.y < height + size && floor.x > -size && floor.x < width + size) {
          const g = (ix * 5 + iz * 3 + (time * 0.004) | 0) % GLYPHS.length;
          blit(ctx, g, level, floor.x - size * 0.5, floor.y - size * 0.5, size);
        }
        if (ceil.y > -size && ceil.y < height) {
          const g = (ix * 7 + iz * 2 + 13) % GLYPHS.length;
          blit(ctx, g, Math.max(0, level - 1), ceil.x - size * 0.45, ceil.y - size * 0.45, size * 0.92);
        }
      }
      for (let iy = 0; iy < ySteps; iy += 1) {
        const y = -0.82 + (iy / (ySteps - 1)) * 1.64;
        const g = (iy * 4 + iz * 5 + (time * 0.003) | 0) % GLYPHS.length;
        for (const side of [-1.12, 1.12]) {
          const wall = project(side, y, z);
          const size = Math.max(6, wall.s * 68);
          if (wall.x < -size || wall.x > width + size || wall.y < -size || wall.y > height + size) continue;
          blit(ctx, g + iy, level, wall.x - size * 0.5, wall.y - size * 0.5, size);
        }
      }
    }

    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.42, width * 0.05, width * 0.5, height * 0.42, width * 0.48);
    gradient.addColorStop(0, "rgba(50, 180, 80, 0.16)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawVines(time) {
    const sway = reduced ? 0 : Math.sin(time * 0.001) * 0.008;
    vines.forEach((pts, vineIndex) => {
      pts.forEach((pt, i) => {
        const x = (pt.x + sway * Math.sin(i + vineIndex)) * width;
        const y = pt.y * height;
        const size = (9 + i * 0.8) * dpr;
        if ((time * 0.002 + i) % 12 < 0.08) pt.g = randomGlyph();
        blit(ctx, pt.g, i % 5 === 0 ? 2 : 1, x, y, size);
      });
    });
  }

  function figureBox() {
    const figW = Math.round(width * 0.34);
    const figH = Math.round(height * 0.76);
    const figX = Math.round((width - figW) / 2);
    const figY = Math.round(height * 0.12);
    const echoScale = 0.42;
    const echoW = figW * echoScale;
    const echoH = figH * echoScale;
    return {
      figW,
      figH,
      figX,
      figY,
      echoScale,
      left: { x: Math.round(width * 0.07), y: Math.round(height * 0.2), w: echoW, h: echoH },
      right: {
        x: Math.round(width * 0.9 - echoW),
        y: Math.round(height * 0.2),
        w: echoW,
        h: echoH,
      },
    };
  }

  function ensureField(nextCols, nextRows) {
    const n = nextCols * nextRows;
    if (field.length === n && cols === nextCols && rows === nextRows) return;
    cols = nextCols;
    rows = nextRows;
    field = new Float32Array(n);
    fieldPrev = new Float32Array(n);
    glyphs = new Uint16Array(n);
    ages = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      glyphs[i] = randomGlyph();
      ages[i] = (Math.random() * 20) | 0;
    }
  }

  function paintDemo(time) {
    const w = demoCanvas.width;
    const h = demoCanvas.height;
    const t = time * 0.001;
    demoCtx.fillStyle = "#070a08";
    demoCtx.fillRect(0, 0, w, h);
    const cx = w * 0.5 + Math.sin(t * 0.8) * 14;
    const bob = Math.sin(t * 1.3) * 8;
    demoCtx.fillStyle = "#d5e4d8";
    demoCtx.beginPath();
    demoCtx.moveTo(cx - 78, h * 0.46 + bob);
    demoCtx.quadraticCurveTo(cx - 138, h * 0.74, cx - 96, h + 4);
    demoCtx.lineTo(cx + 96, h + 4);
    demoCtx.quadraticCurveTo(cx + 138, h * 0.74, cx + 78, h * 0.46 + bob);
    demoCtx.closePath();
    demoCtx.fill();
    demoCtx.fillStyle = "#f4fff6";
    demoCtx.beginPath();
    demoCtx.ellipse(cx, h * 0.3 + bob, 52, 64, 0, 0, Math.PI * 2);
    demoCtx.fill();
    demoCtx.fillStyle = "#e7f3ea";
    demoCtx.fillRect(cx - 18, h * 0.38 + bob, 36, 46);
    const wave = Math.sin(t * 1.1) * 26;
    demoCtx.strokeStyle = "#dceadf";
    demoCtx.lineWidth = 26;
    demoCtx.lineCap = "round";
    demoCtx.beginPath();
    demoCtx.moveTo(cx - 64, h * 0.5 + bob);
    demoCtx.quadraticCurveTo(cx - 150, h * 0.58, cx - 168, h * 0.78 + wave);
    demoCtx.moveTo(cx + 64, h * 0.5 + bob);
    demoCtx.quadraticCurveTo(cx + 150, h * 0.58, cx + 160, h * 0.74 - wave);
    demoCtx.stroke();
  }

  function sourceReady() {
    if (mode === "demo") return true;
    return mode === "live" && video.readyState >= 2;
  }

  function sampleFrame() {
    const box = layout;
    const cssCell = Number(cellInput.value);
    const cell = Math.max(6, cssCell * dpr);
    const nextCols = Math.max(12, Math.floor(box.figW / cell));
    const nextRows = Math.max(12, Math.floor(box.figH / cell));
    ensureField(nextCols, nextRows);
    if (sample.width !== nextCols || sample.height !== nextRows) {
      sample.width = nextCols;
      sample.height = nextRows;
    }

    const source = mode === "demo" ? demoCanvas : video;
    const sw = source.videoWidth || source.width;
    const sh = source.videoHeight || source.height;
    if (!sw || !sh) return;

    const scale = Math.max(nextCols / sw, nextRows / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (nextCols - dw) / 2;
    const dy = (nextRows - dh) / 2;
    sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
    sampleCtx.clearRect(0, 0, nextCols, nextRows);
    sampleCtx.save();
    sampleCtx.translate(nextCols, 0);
    sampleCtx.scale(-1, 1);
    sampleCtx.imageSmoothingEnabled = true;
    sampleCtx.drawImage(source, dx, dy, dw, dh);
    sampleCtx.restore();

    const data = sampleCtx.getImageData(0, 0, nextCols, nextRows).data;
    const luma = new Float32Array(nextCols * nextRows);
    for (let i = 0, p = 0; i < luma.length; i += 1, p += 4) {
      luma[i] = data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722;
    }

    const probe = [];
    const step = Math.max(1, Math.floor(luma.length / 420));
    for (let i = 0; i < luma.length; i += step) probe.push(luma[i]);
    probe.sort((a, b) => a - b);
    const lo = probe[Math.floor(probe.length * 0.4)] || 0;
    const hi = probe[Math.floor(probe.length * 0.94)] || 255;
    exposure.lo += (lo - exposure.lo) * 0.08;
    exposure.hi += (Math.max(hi, lo + 28) - exposure.hi) * 0.08;

    const contrast = Number(contrastInput.value) / 100;
    const span = Math.max(18, exposure.hi - exposure.lo);
    const next = fieldPrev;
    fieldPrev = field;
    field = next.length === luma.length ? next : new Float32Array(luma.length);

    const at = (x, y) => luma[clamp(y, 0, nextRows - 1) * nextCols + clamp(x, 0, nextCols - 1)];

    for (let y = 0; y < nextRows; y += 1) {
      for (let x = 0; x < nextCols; x += 1) {
        const i = y * nextCols + x;
        let n = (luma[i] - exposure.lo) / span;
        n = clamp(n, 0, 1);
        n = Math.pow(n, contrast);
        const edge = Math.min(1, (Math.abs(at(x + 1, y) - at(x - 1, y)) + Math.abs(at(x, y + 1) - at(x, y - 1))) / 78);
        let energy = n * 0.72 + edge * 1.15;
        const nx = (x + 0.5) / nextCols - 0.5;
        const ny = (y + 0.5) / nextRows - 0.5;
        const ax = Math.abs(nx) * 2;
        const ay = Math.abs(ny) * 2;
        const corner = Math.max(0, ax - 0.72) + Math.max(0, ay - 0.84);
        energy *= Math.max(0, 1 - corner * 2.8);
        if (y > nextRows * 0.92) energy *= (nextRows - y) / (nextRows * 0.08);
        energy = clamp(energy, 0, 1);
        field[i] = fieldPrev[i] * 0.38 + energy * 0.62;
      }
    }
  }

  function drawFigure(time) {
    fitCanvas(figure, layout.figW, layout.figH);
    figureCtx.clearRect(0, 0, layout.figW, layout.figH);
    if (!cols || !rows) return;
    const cellW = layout.figW / cols;
    const cellH = layout.figH / rows;
    const scan = reveal * (rows + 3);
    const dtFrames = reduced ? 0.4 : 1;
    for (let y = 0; y < rows; y += 1) {
      if (y > scan) continue;
      const hotRow = scan - y < 1.6 && reveal < 1;
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const e = field[i];
        if (e < 0.26 && !hotRow) continue;
        ages[i] = Math.max(0, ages[i] - dtFrames);
        if (ages[i] === 0) {
          glyphs[i] = randomGlyph();
          ages[i] = e > 0.75 ? 2 + ((Math.random() * 4) | 0) : 8 + ((Math.random() * 16) | 0);
        }
        let level = 1;
        if (e > 0.9 || hotRow) level = 4;
        else if (e > 0.68) level = 3;
        else if (e > 0.42) level = 2;
        const size = Math.max(cellW, cellH) * (1.05 + e * 0.25);
        blit(
          figureCtx,
          glyphs[i],
          level,
          x * cellW + (cellW - size) * 0.5,
          y * cellH + (cellH - size) * 0.5,
          size
        );
      }
    }
    void time;
  }

  function energyAtScreen(x, y) {
    if (mode === "gate" || !layout || !cols) return 0;
    const spots = [
      { x: layout.figX, y: layout.figY, w: layout.figW, h: layout.figH },
      layout.left,
      layout.right,
    ];
    for (let s = 0; s < spots.length; s += 1) {
      const spot = spots[s];
      if (x < spot.x || y < spot.y || x >= spot.x + spot.w || y >= spot.y + spot.h) continue;
      const gx = clamp(Math.floor(((x - spot.x) / spot.w) * cols), 0, cols - 1);
      const gy = clamp(Math.floor(((y - spot.y) / spot.h) * rows), 0, rows - 1);
      const damp = s === 0 ? 1 : 0.75;
      return field[gy * cols + gx] * damp;
    }
    return 0;
  }

  function drawRain(dt) {
    rainCtx.clearRect(0, 0, width, height);
    rainCtx.globalCompositeOperation = "source-over";
    const motion = reduced ? dt * 0.35 : dt;
    const cssCell = Number(cellInput.value);
    const rain = Number(rainInput.value) / 100;
    const tail = Math.round(12 + rain * 16);
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i];
      col.y += col.speed * motion;
      if (col.y > height + 40) {
        col.y = -Math.random() * height * 0.4;
        col.g = randomGlyph();
      }
      const dist = Math.abs(col.x - width * 0.5) / (width * 0.5);
      const size = cssCell * dpr * (0.78 + dist * 1.15);
      const step = size * 0.76;
      const headEnergy = energyAtScreen(col.x, col.y);
      for (let t = 0; t < tail; t += 1) {
        const y = col.y - t * step;
        if (y < -size || y > height + size) continue;
        let level = t === 0 ? 3 : t < 8 ? 2 : t < 16 ? 1 : 0;
        if (t < 2 && headEnergy > 0.35) level = 4;
        rainCtx.globalAlpha = t === 0 ? 1 : Math.max(0.48, 1 - t / (tail + 3));
        blit(rainCtx, col.g + t * 3, level, col.x - size * 0.5, y - size * 0.5, size);
      }
    }
    rainCtx.globalAlpha = 1;
  }

  function drawFrontHeads() {
    const cssCell = Number(cellInput.value);
    for (let i = 0; i < columns.length; i += 2) {
      const col = columns[i];
      const energy = energyAtScreen(col.x, col.y);
      if (energy < 0.28) continue;
      const size = cssCell * dpr * (1.05 + energy * 0.4);
      const step = size * 0.8;
      for (let t = 0; t < 7; t += 1) {
        const y = col.y - t * step;
        ctx.globalAlpha = Math.max(0.25, 0.95 - t * 0.12);
        blit(ctx, col.g + t * 5, t === 0 || energy > 0.75 ? 4 : 3, col.x - size * 0.5, y - size * 0.5, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFigures() {
    layerCtx.clearRect(0, 0, width, height);
    const glow = layerCtx.createRadialGradient(
      layout.figX + layout.figW * 0.5,
      layout.figY + layout.figH * 0.92,
      8,
      layout.figX + layout.figW * 0.5,
      layout.figY + layout.figH * 0.92,
      layout.figW * 0.7
    );
    glow.addColorStop(0, "rgba(70, 255, 120, 0.2)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    layerCtx.fillStyle = glow;
    layerCtx.fillRect(0, 0, width, height);

    layerCtx.save();
    layerCtx.globalAlpha = 0.34;
    layerCtx.drawImage(figure, layout.left.x, layout.left.y, layout.left.w, layout.left.h);
    layerCtx.drawImage(figure, layout.right.x, layout.right.y, layout.right.w, layout.right.h);
    layerCtx.restore();
    layerCtx.drawImage(figure, layout.figX, layout.figY, layout.figW, layout.figH);

    ctx.drawImage(layer, 0, 0);
    bloomCtx.filter = "none";
    bloomCtx.clearRect(0, 0, bloom.width, bloom.height);
    bloomCtx.filter = "blur(10px)";
    bloomCtx.drawImage(layer, 0, 0, bloom.width, bloom.height);
    bloomCtx.filter = "none";
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.8;
    ctx.drawImage(bloom, 0, 0, width, height);
    ctx.restore();
  }

  function drawSparks(dt) {
    ctx.save();
    sparks.forEach((spark) => {
      spark.y += spark.v * dt * (reduced ? 0.3 : 1);
      spark.life -= dt * 0.15;
      if (spark.y > 1 || spark.life <= 0) Object.assign(spark, spawnSpark(false));
      const x = spark.x * width;
      const y = spark.y * height;
      const r = (0.6 + spark.s * 1.8) * dpr;
      ctx.fillStyle = spark.s > 0.8 ? "rgba(255,255,255,0.85)" : "rgba(170,255,190,0.7)";
      ctx.fillRect(x, y, r, r);
    });
    ctx.restore();
  }

  function drawForeground(time) {
    const count = 10;
    for (let i = 0; i < count; i += 1) {
      const side = i < 5 ? -1 : 1;
      const z = 0.05 + ((i * 0.17 + depthScroll) % 1) * 0.55;
      const p = project(side * (0.82 + (i % 3) * 0.08), 0.2 + (i % 4) * 0.18, z);
      const size = Math.max(16, p.s * 120);
      if (p.x < -size || p.x > width + size) continue;
      const g = (i * 9 + (time * 0.01) | 0) % GLYPHS.length;
      ctx.globalAlpha = 0.28 + (1 - z) * 0.35;
      blit(ctx, g, z < 0.25 ? 3 : 2, p.x, p.y, size);
    }
    ctx.globalAlpha = 1;
  }

  function spotsFor(withEchoes) {
    const center = { x: layout.figX, y: layout.figY, w: layout.figW, h: layout.figH, gain: 1 };
    if (!withEchoes) return [center];
    return [
      center,
      { x: layout.left.x, y: layout.left.y, w: layout.left.w, h: layout.left.h, gain: 0.5 },
      { x: layout.right.x, y: layout.right.y, w: layout.right.w, h: layout.right.h, gain: 0.5 },
    ];
  }

  function takeParticle() {
    for (let n = 0; n < 16; n += 1) {
      const p = particles[particleCursor];
      particleCursor = (particleCursor + 1) % particles.length;
      if (p.life <= 0) return p;
    }
    if (particles.length < 2800) {
      const p = { life: 0 };
      particles.push(p);
      return p;
    }
    return particles[particleCursor];
  }

  function emit(x, y, kind, gain) {
    const p = takeParticle();
    p.x = x;
    p.y = y;
    p.kind = kind;
    p.life = 1;
    p.gain = gain;
    if (kind === "plasma") {
      p.vx = (Math.random() - 0.5) * 36;
      p.vy = -50 - Math.random() * 180;
      p.decay = 0.7 + Math.random() * 0.9;
      p.size = (1.6 + Math.random() * 4.2) * dpr * Math.max(0.4, gain);
      p.hue = 12 + Math.random() * 38;
      return;
    }
    if (kind === "orbit") {
      p.spin = (90 + Math.random() * 200) * (Math.random() < 0.5 ? -1 : 1);
      p.decay = 0.32 + Math.random() * 0.4;
      p.size = (1.3 + Math.random() * 2.6) * dpr;
      p.hue = (performance.now() * 0.04 + Math.random() * 90) % 360;
      p.vx = 0;
      p.vy = 0;
      return;
    }
    const angle = Math.random() * Math.PI * 2;
    const speed = 16 + Math.random() * 110;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed * 0.7;
    p.decay = 0.25 + Math.random() * 0.45;
    p.size = (1 + Math.random() * 2.4) * dpr;
    p.hue = Math.random() < 0.18 ? 0 : 34 + Math.random() * 22;
  }

  function spawnAmbient(kind, count) {
    for (let i = 0; i < count; i += 1) {
      emit(Math.random() * width, Math.random() * height, kind, 0.4);
    }
  }

  function spawnFromField(kind) {
    if (!cols || !rows) return;
    const spots = spotsFor(true);
    const center = spots[0];
    const density = Number(rainInput.value) / 100;
    const stride = density > 0.75 ? 2 : 3;
    const limit = Math.max(1, Math.floor(reveal * rows));
    let made = 0;
    const cap = reduced ? 220 : 640;
    for (let y = 0; y < limit; y += stride) {
      for (let x = 0; x < cols; x += stride) {
        const energy = field[y * cols + x];
        if (energy < 0.32 || Math.random() > 0.4 + density * 0.45) continue;
        const sx = center.x + ((x + 0.5) / cols) * center.w;
        const sy = center.y + ((y + 0.5) / rows) * center.h;
        emit(sx, sy, kind, 0.55 + energy * 0.8);
        if (Math.random() < 0.22) {
          const echo = spots[1 + ((Math.random() * 2) | 0)];
          emit(
            echo.x + ((x + 0.5) / cols) * echo.w,
            echo.y + ((y + 0.5) / rows) * echo.h,
            kind,
            echo.gain * energy
          );
        }
        made += 1;
        if (made >= cap) return;
      }
    }
  }

  function stepParticles(dt, now, kind) {
    const cx = layout.figX + layout.figW * 0.5;
    const cy = layout.figY + layout.figH * 0.4;
    const motion = reduced ? 0.4 : 1;
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (p.life <= 0 || p.kind !== kind) continue;
      if (kind === "plasma") {
        p.vy -= 70 * dt;
        p.x += (p.vx + Math.sin(now * 0.004 + p.y * 0.02) * 30) * dt * motion;
        p.y += p.vy * dt * motion;
      } else if (kind === "orbit") {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) + 16;
        p.x += ((-dy / len) * p.spin - dx * 0.28) * dt * motion;
        p.y += ((dx / len) * p.spin - dy * 0.28) * dt * motion;
      } else {
        p.vx += Math.sin(now * 0.0015 + p.y * 0.012) * 46 * dt;
        p.vy += Math.cos(now * 0.0012 + p.x * 0.01) * 32 * dt;
        p.x += p.vx * dt * motion;
        p.y += p.vy * dt * motion;
      }
      p.life -= p.decay * dt;
      if (p.y < -30 || p.y > height + 40 || p.x < -40 || p.x > width + 40) p.life = 0;
    }
  }

  function drawParticles(kind) {
    ctx.save();
    ctx.globalCompositeOperation = kind === "staub" ? "source-over" : "lighter";
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      if (p.life <= 0 || p.kind !== kind) continue;
      const light = kind === "plasma" ? 58 + p.life * 38 : kind === "staub" ? 70 : 64 + p.life * 18;
      const sat = kind === "staub" && p.hue < 1 ? 0 : 100;
      ctx.globalAlpha = Math.max(0, p.life) * Math.min(1, p.gain || 1);
      ctx.fillStyle = `hsl(${p.hue} ${sat}% ${light}%)`;
      const size = p.size * (kind === "plasma" ? 0.55 + p.life : 1);
      ctx.fillRect(p.x, p.y, size, size);
    }
    ctx.restore();
  }

  function drawGlitchAmbient(now) {
    ctx.save();
    for (let i = 0; i < 18; i += 1) {
      const y = (now * 0.05 * (i % 2 ? 1 : -1) + i * 67) % height;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = i % 2 ? "#ff2f86" : "#3dfff2";
      ctx.fillRect(-20, y < 0 ? y + height : y, width + 40, Math.max(1, dpr));
    }
    ctx.restore();
  }

  function drawGlitch(now) {
    if (!sample.width || !cols) return;
    const spots = spotsFor(true);
    const bands = 24;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    spots.forEach((spot, index) => {
      for (let i = 0; i < bands; i += 1) {
        const y0 = Math.floor((i * rows) / bands);
        if (y0 > reveal * rows) continue;
        const y1 = Math.min(rows, Math.max(y0 + 1, Math.floor(((i + 1) * rows) / bands)));
        let energy = 0;
        let seen = 0;
        for (let y = y0; y < y1; y += 1) {
          for (let x = 0; x < cols; x += 3) {
            energy += field[y * cols + x];
            seen += 1;
          }
        }
        energy = seen ? energy / seen : 0;
        const sy = Math.floor((i * sample.height) / bands);
        const sh = Math.max(1, Math.ceil(sample.height / bands));
        const dy = spot.y + (i * spot.h) / bands;
        const dh = spot.h / bands + dpr;
        const wild = energy > 0.18
          ? (Math.sin(now * 0.02 + i * 2.1) * 54 + (((now / 70) | 0) + i * 13) % 19 - 9) * dpr * spot.gain
          : Math.sin(now * 0.002 + i) * 8 * dpr;
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = index === 0 ? 0.92 : 0.38;
        ctx.drawImage(sample, 0, sy, sample.width, sh, spot.x + wild, dy, spot.w, dh);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = index === 0 ? 0.5 : 0.22;
        ctx.drawImage(sample, 0, sy, sample.width, sh, spot.x + wild + 12 * dpr, dy, spot.w, dh);
      }
    });
    const spot = spots[0];
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.85;
    for (let n = 0; n < 7; n += 1) {
      const sw = 3 + ((Math.random() * 16) | 0);
      const sh = 2 + ((Math.random() * 6) | 0);
      const sx = (Math.random() * Math.max(1, sample.width - sw)) | 0;
      const sy = (Math.random() * Math.max(1, sample.height - sh)) | 0;
      ctx.drawImage(
        sample,
        sx,
        sy,
        sw,
        sh,
        spot.x + Math.random() * spot.w,
        spot.y + Math.random() * spot.h * reveal,
        sw * (spot.w / sample.width),
        sh * (spot.h / sample.height)
      );
    }
    ctx.restore();
  }

  function drawNetzAmbient(now) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(130, 210, 255, 0.28)";
    ctx.lineWidth = Math.max(1, dpr);
    const cx = width * 0.5;
    const cy = height * 0.46;
    ctx.beginPath();
    for (let i = 0; i <= 22; i += 1) {
      const angle = (i / 22) * Math.PI * 2 + now * 0.00025;
      const radius = (0.16 + (i % 4) * 0.035) * Math.min(width, height);
      const x = cx + Math.cos(angle) * radius * 1.35;
      const y = cy + Math.sin(angle * 1.35) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawNetz() {
    if (!cols || !rows) return;
    const spot = spotsFor(false)[0];
    const nodes = [];
    const stepX = Math.max(1, Math.floor(cols / 22));
    const stepY = Math.max(1, Math.floor(rows / 30));
    const limit = Math.max(1, Math.floor(reveal * rows));
    for (let y = 0; y < limit; y += stepY) {
      for (let x = 0; x < cols; x += stepX) {
        const energy = field[y * cols + x];
        if (energy < 0.4) continue;
        nodes.push({
          x: spot.x + ((x + 0.5) / cols) * spot.w,
          y: spot.y + ((y + 0.5) / rows) * spot.h,
          e: energy,
        });
        if (nodes.length >= 100) break;
      }
      if (nodes.length >= 100) break;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = Math.max(1, dpr);
    const reach = 86 * dpr;
    const reachSq = reach * reach;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        if (dx * dx + dy * dy > reachSq) continue;
        ctx.strokeStyle = `rgba(160, 230, 255, ${0.12 + nodes[i].e * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
    const bolts = reduced ? 1 : 3;
    ctx.strokeStyle = "rgba(235, 250, 255, 0.9)";
    for (let b = 0; b < bolts && nodes.length > 2; b += 1) {
      const from = nodes[(Math.random() * nodes.length) | 0];
      const to = nodes[(Math.random() * nodes.length) | 0];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      for (let s = 1; s <= 6; s += 1) {
        const t = s / 6;
        ctx.lineTo(
          from.x + (to.x - from.x) * t + (Math.random() - 0.5) * 34 * dpr,
          from.y + (to.y - from.y) * t + (Math.random() - 0.5) * 34 * dpr
        );
      }
      ctx.stroke();
    }
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const size = (2.2 + node.e * 3.4) * dpr;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = node.e > 0.78 ? "#ffffff" : "#9be7ff";
      ctx.fillRect(node.x - size * 0.5, node.y - size * 0.5, size, size);
    }
    ctx.restore();
  }

  function setEffect(id) {
    if (!EFFECT_IDS.includes(id)) return;
    effect = id;
    wipe = true;
    for (let i = 0; i < particles.length; i += 1) particles[i].life = 0;
    document.body.className = `effect-${id}`;
    document.querySelectorAll("[data-effect]").forEach((button) => {
      const on = button.dataset.effect === id;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    titleEl.innerHTML = EFFECT_TITLES[id];
    writing.textContent = EFFECT_COPY[id];
    densityLabel.textContent = id === "matrix" ? "Regen" : "Dichte";
    cellWrap.hidden = id !== "matrix";
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    layout = figureBox();
    if (mode === "demo") paintDemo(now);
    if (sourceReady()) {
      reveal = Math.min(1, reveal + dt * (reduced ? 0.8 : 0.42));
      sampleFrame();
      drawFigure(now);
      if (writing.hidden === false && reveal >= 1) writing.hidden = true;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (wipe || effect !== "staub") {
      ctx.fillStyle = BACKDROP[effect];
      ctx.fillRect(0, 0, width, height);
      wipe = false;
    } else {
      ctx.fillStyle = "rgba(8, 6, 2, 0.2)";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;

    if (effect === "matrix") {
      drawTunnel(now, dt);
      drawVines(now);
      drawRain(dt);
      ctx.drawImage(rainCanvas, 0, 0);
      if (sourceReady()) {
        drawFigures();
        drawFrontHeads();
      }
      drawSparks(dt);
      drawForeground(now);
    } else if (effect === "glitch") {
      drawGlitchAmbient(now);
      if (sourceReady()) drawGlitch(now);
    } else if (effect === "netz") {
      drawNetzAmbient(now);
      if (sourceReady()) drawNetz();
    } else {
      const density = Number(rainInput.value) / 78;
      const ambient = Math.round((reduced ? 10 : 28) * density);
      spawnAmbient(effect, sourceReady() ? Math.round(ambient * 0.4) : ambient);
      if (sourceReady()) spawnFromField(effect);
      stepParticles(dt, now, effect);
      drawParticles(effect);
    }
    requestAnimationFrame(frame);
  }

  function showError(text) {
    errorEl.hidden = false;
    errorEl.textContent = text;
  }

  function messageFor(err) {
    if (!window.isSecureContext) {
      return "Die Kamera braucht eine sichere Seite. Öffne sie über localhost oder https.";
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return "Dieser Browser kann hier keine Kamera öffnen.";
    }
    if (err && err.name === "NotAllowedError") {
      return "Die Kamera bleibt blockiert. Erlaube den Zugriff in den Browser-Einstellungen und versuch es erneut.";
    }
    if (err && err.name === "NotFoundError") return "Keine Kamera gefunden.";
    if (err && err.name === "NotReadableError") {
      return "Die Kamera wird gerade von einem anderen Programm verwendet.";
    }
    return "Die Kamera konnte nicht gestartet werden.";
  }

  function openExperience() {
    gate.classList.add("out");
    window.setTimeout(() => {
      gate.hidden = true;
    }, reduced ? 0 : 520);
    hud.hidden = false;
    writing.hidden = false;
  }

  async function startCamera() {
    errorEl.hidden = true;
    startBtn.disabled = true;
    startBtn.textContent = "Warte auf Freigabe";
    try {
      if (stream) stopTracks();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      video.srcObject = stream;
      await video.play();
      mode = "live";
      reveal = 0;
      exposure = { lo: 20, hi: 180 };
      openExperience();
      stopBtn.textContent = "Kamera aus";
    } catch (err) {
      showError(messageFor(err));
      startBtn.disabled = false;
      startBtn.textContent = "Kamera freigeben";
    }
  }

  function startDemo() {
    errorEl.hidden = true;
    mode = "demo";
    reveal = 0;
    exposure = { lo: 20, hi: 180 };
    openExperience();
    stopBtn.textContent = "Zurück";
  }

  function stopTracks() {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  function stopExperience() {
    stopTracks();
    mode = "gate";
    reveal = 0;
    hud.hidden = true;
    writing.hidden = true;
    gate.hidden = false;
    gate.classList.remove("out");
    startBtn.disabled = false;
    startBtn.textContent = "Kamera freigeben";
  }

  async function toggleFull() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  }

  function bind() {
    startBtn.addEventListener("click", startCamera);
    demoBtn.addEventListener("click", startDemo);
    stopBtn.addEventListener("click", stopExperience);
    fullBtn.addEventListener("click", () => {
      toggleFull().catch(() => {});
    });
    cellInput.addEventListener("input", buildColumns);
    rainInput.addEventListener("input", buildColumns);
    window.addEventListener("resize", resize);
    window.addEventListener("pagehide", stopTracks);
    document.addEventListener("fullscreenchange", () => {
      fullBtn.textContent = document.fullscreenElement ? "Fenster" : "Vollbild";
    });
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-effect]") : null;
      if (!button) return;
      setEffect(button.dataset.effect);
    });
    window.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === "f" && mode !== "gate") {
        toggleFull().catch(() => {});
      }
      const index = Number(event.key) - 1;
      if (index >= 0 && index < EFFECT_IDS.length) setEffect(EFFECT_IDS[index]);
    });
  }

  async function main() {
    bind();
    resize();
    try {
      await loadFonts();
    } catch (err) {
      console.warn(err);
    }
    buildAtlas();
    const requested = new URLSearchParams(location.search).get("effect");
    if (requested) setEffect(requested);
    requestAnimationFrame(frame);
    if (location.hash === "#demo") startDemo();
  }

  main();
})();
