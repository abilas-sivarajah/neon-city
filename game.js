// Neon City – Third-Person-Crime-Sandbox
// Eigene WebGL-Engine ohne externe Bibliotheken.
// buildGame(canvas, radarCanvas, rootElement, ui) startet das Spiel und gibt { start, resume, toggleMute, closeMenu, destroy } zurück.
// ui(patch) bekommt Zustandsänderungen für die Oberfläche (siehe index.html).

function buildGame(canvas, radar, root, ui) {
  // ================= Mathe & Helfer =================
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  let seed = 424242;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const sr = (a, b) => a + srand() * (b - a);
  const spick = (arr) => arr[Math.floor(srand() * arr.length)];
  function hexc(h, mat) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, mat || 0]; }
  function rgb(h) { const c = hexc(h); return [c[0], c[1], c[2]]; }

  // ================= Matrizen (column-major) =================
  const m4 = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
  const T16 = new Float32Array(16);
  function mIdent(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; }
  function mCopy(o, a) { o.set(a); return o; }
  function mMul(o, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      for (let r = 0; r < 4; r++) T16[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
    }
    o.set(T16); return o;
  }
  function mPersp(o, fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f); o.fill(0); o[0] = t / asp; o[5] = t; o[10] = (f + n) * nf; o[11] = -1; o[14] = 2 * f * n * nf; return o; }
  function mLookAt(o, ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz; let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * ex + xy * ey + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1; return o;
  }
  function tr(m, x, y, z) { for (let r = 0; r < 4; r++) m[12 + r] += m[r] * x + m[4 + r] * y + m[8 + r] * z; return m; }
  function ry(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let r = 0; r < 4; r++) { const a0 = m[r], a2 = m[8 + r]; m[r] = a0 * c - a2 * s; m[8 + r] = a0 * s + a2 * c; } return m; }
  function rx(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let r = 0; r < 4; r++) { const a1 = m[4 + r], a2 = m[8 + r]; m[4 + r] = a1 * c + a2 * s; m[8 + r] = -a1 * s + a2 * c; } return m; }
  function rz(m, a) { const c = Math.cos(a), s = Math.sin(a); for (let r = 0; r < 4; r++) { const a0 = m[r], a1 = m[4 + r]; m[r] = a0 * c + a1 * s; m[4 + r] = -a0 * s + a1 * c; } return m; }
  function sc(m, x, y, z) { for (let r = 0; r < 4; r++) { m[r] *= x; m[4 + r] *= y; m[8 + r] *= z; } return m; }

  // ================= Geometrie =================
  const geo = () => ({ d: [] });
  const FACES = [[0, 1, [1, 3, 7, 5]], [0, -1, [0, 4, 6, 2]], [1, 1, [2, 6, 7, 3]], [1, -1, [0, 1, 5, 4]], [2, 1, [4, 5, 7, 6]], [2, -1, [0, 2, 3, 1]]];
  const TRI = [0, 1, 2, 0, 2, 3];
  const BX = new Float32Array(24);
  const GM = m4();
  function boxM(g, m, c, noBottom) {
    for (let i = 0; i < 8; i++) {
      const lx = (i & 1) ? 0.5 : -0.5, ly = (i & 2) ? 0.5 : -0.5, lz = (i & 4) ? 0.5 : -0.5;
      BX[i * 3] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
      BX[i * 3 + 1] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
      BX[i * 3 + 2] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
    }
    for (const f of FACES) {
      const ax = f[0], sg = f[1], q = f[2];
      if (noBottom && ax === 1 && sg < 0) continue;
      let nx = m[ax * 4] * sg, ny = m[ax * 4 + 1] * sg, nz = m[ax * 4 + 2] * sg;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const k of TRI) { const v = q[k]; g.d.push(BX[v * 3], BX[v * 3 + 1], BX[v * 3 + 2], nx, ny, nz, c[0], c[1], c[2], c[3]); }
    }
  }
  function box(g, x0, y0, z0, x1, y1, z1, c, noBottom) {
    mIdent(GM); tr(GM, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); sc(GM, Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0));
    boxM(g, GM, c, noBottom);
  }
  function boxC(g, cx, cy, cz, sx, sy, sz, c, yaw, pitch) {
    mIdent(GM); tr(GM, cx, cy, cz); if (yaw) ry(GM, yaw); if (pitch) rx(GM, pitch); sc(GM, sx, sy, sz); boxM(g, GM, c);
  }
  function quad(g, x0, z0, x1, z1, y, c) {
    const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z0], [x1, z1], [x0, z1]];
    for (const v of p) g.d.push(v[0], y, v[1], 0, 1, 0, c[0], c[1], c[2], c[3]);
  }
  function cylGeo(seg, c) {
    const g = geo();
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
      const v = [[x0, 0, z0], [x1, 0, z1], [x1, 1, z1], [x0, 0, z0], [x1, 1, z1], [x0, 1, z0]];
      for (const p of v) g.d.push(p[0], p[1], p[2], p[0], 0, p[2], c[0], c[1], c[2], c[3]);
    }
    return g;
  }
  function diskGeo(seg, c) {
    const g = geo();
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      g.d.push(0, 0, 0, 0, 1, 0, c[0], c[1], c[2], c[3]);
      g.d.push(Math.cos(a0), 0, Math.sin(a0), 0, 1, 0, c[0], c[1], c[2], c[3]);
      g.d.push(Math.cos(a1), 0, Math.sin(a1), 0, 1, 0, c[0], c[1], c[2], c[3]);
    }
    return g;
  }
  // Drehkörper: rings = [y, rx, rz, farbe, zVersatz]; die Farbe gilt für das Band bis zum nächsten Ring
  function latheGeo(g, rings, seg) {
    const n = rings.length, slope = [];
    for (let i = 0; i < n; i++) {
      const a = rings[Math.max(0, i - 1)], b = rings[Math.min(n - 1, i + 1)], dy = b[0] - a[0];
      slope.push(Math.abs(dy) > 1e-6 ? ((b[1] + b[2]) - (a[1] + a[2])) / 2 / dy : 0);
    }
    const vtx = (i, k) => {
      const r = rings[i], an = k / seg * TAU, ca = Math.cos(an), sa = Math.sin(an);
      let nx = 0, ny, nz = 0;
      if (r[1] < 1e-4) ny = r[0] > rings[i === 0 ? 1 : i - 1][0] ? 1 : -1;
      else {
        nx = ca / r[1]; nz = sa / r[2]; const h = Math.hypot(nx, nz); nx /= h; nz /= h; ny = -slope[i];
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      }
      return [r[1] * ca, r[0], r[2] * sa + (r[4] || 0), nx, ny, nz];
    };
    for (let i = 0; i < n - 1; i++) {
      const c = rings[i][3];
      for (let k = 0; k < seg; k++) {
        const q = [vtx(i, k), vtx(i, k + 1), vtx(i + 1, k + 1), vtx(i + 1, k)];
        for (const t of TRI) { const v = q[t]; g.d.push(v[0], v[1], v[2], v[3], v[4], v[5], c[0], c[1], c[2], c[3]); }
      }
    }
  }
  function ellipGeo(g, cx, cy, cz, rx, ry, rz, c, seg) {
    const lat = Math.max(4, seg >> 1);
    const vtx = (i, k) => {
      const th = i / lat * Math.PI, ph = k / seg * TAU;
      const dx = Math.sin(th) * Math.cos(ph), dy = -Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
      let nx = dx / rx, ny = dy / ry, nz = dz / rz; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      return [cx + dx * rx, cy + dy * ry, cz + dz * rz, nx, ny, nz];
    };
    for (let i = 0; i < lat; i++) for (let k = 0; k < seg; k++) {
      const q = [vtx(i, k), vtx(i, k + 1), vtx(i + 1, k + 1), vtx(i + 1, k)];
      for (const t of TRI) { const v = q[t]; g.d.push(v[0], v[1], v[2], v[3], v[4], v[5], c[0], c[1], c[2], c[3]); }
    }
  }

  // ================= WebGL =================
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl');
  if (!gl) { ui({ error: 'Dein Browser unterstützt kein WebGL – das Spiel braucht 3D-Grafik.' }); return null; }
  const VS = 'attribute vec3 aP; attribute vec3 aN; attribute vec4 aC;\n' +
    'uniform mat4 uVP; uniform mat4 uM;\n' +
    'varying vec3 vN; varying vec3 vW; varying vec4 vC;\n' +
    'void main(){ vec4 w = uM*vec4(aP,1.0); vW = w.xyz; vN = (uM*vec4(aN,0.0)).xyz; vC = aC; gl_Position = uVP*w; }';
  const FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    'varying vec3 vN; varying vec3 vW; varying vec4 vC;\n' +
    'uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uAmb; uniform vec3 uFog; uniform vec3 uCam; uniform vec3 uPaint; uniform vec3 uPaint2;\n' +
    'uniform float uFogD; uniform float uNight; uniform float uAlpha;\n' +
    'float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }\n' +
    'void main(){\n' +
    ' float m = vC.a; vec3 c = vC.rgb; vec3 n = normalize(vN);\n' +
    ' if (m > 5.5) {\n' +
    '  vec3 v = normalize(vW - uCam); float t = clamp(v.y*1.6, 0.0, 1.0);\n' +
    '  vec3 s = mix(uFog, uPaint, sqrt(t)); float sd = max(dot(v, uSun), 0.0);\n' +
    '  s += uSunC*(smoothstep(0.9975, 0.999, sd)*1.5 + pow(sd, 48.0)*0.35)*(1.0 - uNight*0.7);\n' +
    '  gl_FragColor = vec4(s, 1.0); return;\n' +
    ' }\n' +
    ' if (m > 1.5 && m < 2.5) c = uPaint*c; else if (m > 2.5 && m < 3.5) c = uPaint2*c; else if (m > 4.5) c = uPaint*c;\n' +
    ' vec3 col;\n' +
    ' if (m > 3.5) { col = c; } else {\n' +
    '  float dif = max(dot(n, uSun), 0.0); float hemi = 0.75 + 0.25*n.y;\n' +
    '  col = c*(uAmb*hemi + uSunC*dif);\n' +
    '  if (m > 0.5 && m < 1.5 && abs(n.y) < 0.5 && vW.y > 1.0) {\n' +
    '   float along = abs(n.x) > 0.5 ? vW.z : vW.x;\n' +
    '   vec2 cell = vec2(along/2.8, vW.y/3.4); vec2 f = fract(cell);\n' +
    '   if (f.x > 0.2 && f.x < 0.8 && f.y > 0.28 && f.y < 0.82) {\n' +
    '    float r = h21(floor(cell) + floor(vW.xz/40.0));\n' +
    '    vec3 glass = mix(vec3(0.16,0.2,0.26), vec3(0.5,0.6,0.7), 0.35 + 0.3*r)*(uAmb*1.2 + uSunC*dif*0.6);\n' +
    '    vec3 lamp = vec3(1.0,0.82,0.5)*step(0.45, r)*(0.7 + 0.3*r);\n' +
    '    col = mix(glass, max(glass, lamp), uNight);\n' +
    '   }\n' +
    '  }\n' +
    ' }\n' +
    ' float d = length(vW - uCam); float fg = clamp((d - uFogD*0.3)/(uFogD*0.7), 0.0, 1.0);\n' +
    ' gl_FragColor = vec4(mix(col, uFog, fg*fg), uAlpha);\n' +
    '}';
  function shader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Programm: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const A = { P: gl.getAttribLocation(prog, 'aP'), N: gl.getAttribLocation(prog, 'aN'), C: gl.getAttribLocation(prog, 'aC') };
  gl.enableVertexAttribArray(A.P); gl.enableVertexAttribArray(A.N); gl.enableVertexAttribArray(A.C);
  const U = {};
  ['uVP', 'uM', 'uSun', 'uSunC', 'uAmb', 'uFog', 'uCam', 'uPaint', 'uPaint2', 'uFogD', 'uNight', 'uAlpha'].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  let curBuf = null;
  function upload(g) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.d), gl.STATIC_DRAW); curBuf = null;
    return { b: b, n: g.d.length / 10 };
  }
  function bindMesh(mh) {
    if (curBuf === mh.b) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, mh.b);
    gl.vertexAttribPointer(A.P, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(A.N, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(A.C, 4, gl.FLOAT, false, 40, 24);
    curBuf = mh.b;
  }
  const WHITE = [1, 1, 1];
  function drawMesh(mh, m, paint, paint2, alpha) {
    bindMesh(mh);
    gl.uniformMatrix4fv(U.uM, false, m);
    gl.uniform3fv(U.uPaint, paint || WHITE);
    gl.uniform3fv(U.uPaint2, paint2 || WHITE);
    gl.uniform1f(U.uAlpha, alpha == null ? 1 : alpha);
    gl.drawArrays(gl.TRIANGLES, 0, mh.n);
  }
  const IDM = m4(), MA = m4(), MB = m4(), MC = m4();
  const unitLit = (() => { const g = geo(); box(g, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1, 2]); return upload(g); })();
  const unitEmis = (() => { const g = geo(); box(g, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1, 5]); return upload(g); })();
  const cylMesh = upload(cylGeo(24, [1, 1, 1, 5]));
  const diskMesh = upload(diskGeo(16, [1, 1, 1, 5]));
  const skyMesh = (() => { const g = geo(); box(g, -400, -400, -400, 400, 400, 400, [1, 1, 1, 6]); return upload(g); })();
  // Teil einer Box (Einheitswürfel) mit Matrix zeichnen
  function part(m, paint, emissive, alpha) { drawMesh(emissive ? unitEmis : unitLit, m, paint, null, alpha); }

  // ================= Stadt =================
  const N = 7, ROAD = 14, BLOCK = 44, P = ROAD + BLOCK, W = N * P + ROAD, SW = 3, LANE = 3.4;
  const roadC = (k) => k * P + ROAD / 2;
  const blockRect = (i, j) => { const x0 = i * P + ROAD, z0 = j * P + ROAD; return { x0: x0, z0: z0, x1: x0 + BLOCK, z1: z0 + BLOCK, cx: x0 + BLOCK / 2, cz: z0 + BLOCK / 2 }; };
  const DNAMES = { downtown: 'Downtown', altstadt: 'Altstadt', palmen: 'Palmenhain', villen: 'Villenhügel', hafen: 'Hafenviertel' };
  function districtOf(i, j) {
    if (j === 0) return 'hafen';
    if (Math.abs(i - 3) <= 1 && Math.abs(j - 3) <= 1) return 'downtown';
    if (j === N - 1) return 'villen';
    if (i >= 5) return 'palmen';
    return 'altstadt';
  }
  function zoneAt(x, z) { return DNAMES[districtOf(clamp(Math.floor(x / P), 0, N - 1), clamp(Math.floor(z / P), 0, N - 1))]; }

  // ---- Kollision (Raster) ----
  const cols = [];
  const GN = N + 2;
  const grid = [];
  for (let i = 0; i < GN * GN; i++) grid.push([]);
  const cellOf = (v) => clamp(Math.floor(v / P) + 1, 0, GN - 1);
  function addCol(x0, z0, x1, z1, h) {
    const c = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h: h, st: 0 };
    cols.push(c);
    for (let cx = cellOf(c.x0); cx <= cellOf(c.x1); cx++) for (let cz = cellOf(c.z0); cz <= cellOf(c.z1); cz++) grid[cz * GN + cx].push(c);
    return c;
  }
  let stamp = 1;
  function forNear(x, z, r, fn) {
    stamp++;
    const ax = cellOf(x - r), bx = cellOf(x + r), az = cellOf(z - r), bz = cellOf(z + r);
    for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
      const L = grid[cz * GN + cx];
      for (let k = 0; k < L.length; k++) { const c = L[k]; if (c.st === stamp) continue; c.st = stamp; fn(c); }
    }
  }
  const HIT = { hit: false, nx: 0, nz: 0 };
  function circleCollide(o, r, y) {
    HIT.hit = false; HIT.nx = 0; HIT.nz = 0;
    const oy = y || 0;
    forNear(o.x, o.z, r + 1, (c) => {
      if (oy > c.h) return;
      const qx = clamp(o.x, c.x0, c.x1), qz = clamp(o.z, c.z0, c.z1);
      let dx = o.x - qx, dz = o.z - qz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2); dx /= d; dz /= d; o.x += dx * (r - d); o.z += dz * (r - d);
      } else {
        const pl = o.x - c.x0, pr = c.x1 - o.x, pb = o.z - c.z0, pt = c.z1 - o.z; const mn = Math.min(pl, pr, pb, pt);
        dx = 0; dz = 0;
        if (mn === pl) { dx = -1; o.x = c.x0 - r; } else if (mn === pr) { dx = 1; o.x = c.x1 + r; } else if (mn === pb) { dz = -1; o.z = c.z0 - r; } else { dz = 1; o.z = c.z1 + r; }
      }
      HIT.hit = true; HIT.nx += dx; HIT.nz += dz;
    });
    if (HIT.hit) { const l = Math.hypot(HIT.nx, HIT.nz) || 1; HIT.nx /= l; HIT.nz /= l; }
    return HIT;
  }
  function onBlock(x, z) {
    const i = Math.floor((x - ROAD) / P), j = Math.floor((z - ROAD) / P);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return (x - ROAD - i * P) <= BLOCK && (z - ROAD - j * P) <= BLOCK;
  }
  const groundY = (x, z) => onBlock(x, z) ? 0.15 : 0;
  function insideBuilding(x, y, z, pad) {
    let res = false;
    forNear(x, z, pad + 1, (c) => { if (!res && y < c.h && x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) res = true; });
    return res;
  }
  function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    let tmin = -Infinity, tmax = Infinity;
    const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return Infinity; continue; }
      let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
    if (tmax < 0) return Infinity;
    return tmin >= 0 ? tmin : 0;
  }
  function rayWorld(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT;
    for (let k = 0; k < cols.length; k++) {
      const c = cols[k];
      const t = rayBox(ox, oy, oz, dx, dy, dz, c.x0, -1, c.z0, c.x1, c.h, c.z1);
      if (t < best) best = t;
    }
    if (dy < -1e-4) { const t = (0 - oy) / dy; if (t > 0 && t < best) best = t; }
    return best;
  }
  function losClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz) || 1;
    return rayWorld(ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.6;
  }

  // ---- Weltgeometrie ----
  const wg = geo();
  const lamps = [];
  const shops = [];
  const parks = [];
  const C = {
    asphalt: hexc('#3a3d42'), side: hexc('#a9a59b'), line: hexc('#e8d27a'), zebra: hexc('#d9d9d2'),
    grass: hexc('#6a8a48'), concrete: hexc('#8c8c86'), old: hexc('#7d7a70'), port: hexc('#5b5e60'),
    pole: hexc('#3b3f45'), lamp: hexc('#ffe7b0', 4), trunk: hexc('#7a5a3a'), frond: hexc('#4f7f35'), frond2: hexc('#3f6b2c'),
    leaf: hexc('#3f6b35'), leaf2: hexc('#4d7d3c'), water: hexc('#2f6f8f'), barrier: hexc('#9a958a'), hill: hexc('#6f7a4a'), hill2: hexc('#5f6a3f')
  };
  function lamp(x, z, ax, az) {
    box(wg, x - 0.08, 0, z - 0.08, x + 0.08, 6.4, z + 0.08, C.pole);
    const ex = x + ax * 1.6, ez = z + az * 1.6;
    box(wg, Math.min(x, ex) - 0.06, 6.3, Math.min(z, ez) - 0.06, Math.max(x, ex) + 0.06, 6.42, Math.max(z, ez) + 0.06, C.pole);
    box(wg, ex - 0.25, 6.12, ez - 0.25, ex + 0.25, 6.3, ez + 0.25, C.lamp);
    lamps.push({ x: ex, z: ez });
  }
  function palm(x, z, h) {
    let px = x, pz = z; const lean = sr(-0.5, 0.5), lz = sr(-0.5, 0.5);
    for (let s = 0; s < 5; s++) {
      const y0 = s * h / 5, y1 = (s + 1) * h / 5, w = 0.42 - s * 0.04;
      box(wg, px - w / 2, y0, pz - w / 2, px + w / 2, y1 + 0.05, pz + w / 2, C.trunk);
      px += lean * 0.25; pz += lz * 0.25;
    }
    for (let f = 0; f < 7; f++) {
      const a = f / 7 * TAU + sr(0, 0.5);
      boxC(wg, px + Math.sin(a) * 1.4, h - 0.25, pz + Math.cos(a) * 1.4, 0.7, 0.08, 3.2, f % 2 ? C.frond : C.frond2, a, 0.32);
    }
    addCol(x - 0.3, z - 0.3, x + 0.3, z + 0.3, h);
  }
  function tree(x, z) {
    const h = sr(4, 6);
    box(wg, x - 0.2, 0, z - 0.2, x + 0.2, h * 0.5, z + 0.2, C.trunk);
    const s = sr(2.4, 3.2);
    box(wg, x - s / 2, h * 0.45, z - s / 2, x + s / 2, h * 0.85, z + s / 2, C.leaf);
    box(wg, x - s / 3, h * 0.8, z - s / 3, x + s / 3, h, z + s / 3, C.leaf2);
    addCol(x - 0.3, z - 0.3, x + 0.3, z + 0.3, h);
  }
  function building(x0, z0, x1, z1, h, col, windows) {
    box(wg, x0, 0.1, z0, x1, h, z1, hexc(col, windows ? 1 : 0), true);
    box(wg, x0 - 0.15, h, z0 - 0.15, x1 + 0.15, h + 0.5, z1 + 0.15, hexc('#5a5a58'));
    addCol(x0, z0, x1, z1, h + 0.5);
  }
  // Laden mit Front nach Süden (-z) zur Straße
  function shopBuilding(i, j, kind, name, wallCol, signCol, blip, w, d) {
    const b = blockRect(i, j); w = w || 18; d = d || 14;
    const x0 = b.cx - w / 2, x1 = b.cx + w / 2, z0 = b.z0 + SW + 1, z1 = z0 + d;
    building(x0, z0, x1, z1, 7, wallCol, false);
    box(wg, b.cx - w * 0.38, 4.8, z0 - 0.4, b.cx + w * 0.38, 6.4, z0 - 0.05, hexc(signCol, 4));
    box(wg, b.cx - 1.3, 0.15, z0 - 0.08, b.cx + 1.3, 3.0, z0 + 0.02, hexc('#1b1e22'));
    box(wg, b.cx - 4.5, 1.0, z0 - 0.06, b.cx - 2.0, 3.2, z0 + 0.02, hexc('#9fc4d6', 4));
    box(wg, b.cx + 2.0, 1.0, z0 - 0.06, b.cx + 4.5, 3.2, z0 + 0.02, hexc('#9fc4d6', 4));
    shops.push({ kind: kind, name: name, x: b.cx, z: b.z0 + 1.6, r: 1.6, color: rgb(signCol), blip: blip });
  }
  // Garage zum Reinfahren (offen nach Süden)
  function garage(i, j, kind, name, signCol, blip) {
    const b = blockRect(i, j);
    const x0 = b.cx - 8, x1 = b.cx + 8, z0 = b.z0 + SW + 2, z1 = z0 + 14, h = 6;
    const wc = hexc('#8d8a82');
    box(wg, x0, 0.1, z0, x0 + 0.6, h, z1, wc); addCol(x0, z0, x0 + 0.6, z1, h);
    box(wg, x1 - 0.6, 0.1, z0, x1, h, z1, wc); addCol(x1 - 0.6, z0, x1, z1, h);
    box(wg, x0, 0.1, z1 - 0.6, x1, h, z1, wc); addCol(x0, z1 - 0.6, x1, z1, h);
    box(wg, x0, h, z0, x1, h + 0.5, z1, hexc('#55524c'));
    box(wg, x0 + 0.6, 0.16, z0, x1 - 0.6, 0.18, z1 - 0.6, hexc('#4a4c50'));
    box(wg, b.cx - 6, h - 1.6, z0 - 0.35, b.cx + 6, h - 0.2, z0, hexc(signCol, 4));
    shops.push({ kind: kind, name: name, x: b.cx, z: z0 + 6, r: 4, color: rgb(signCol), blip: blip, drive: true });
  }

  // Boden, Wasser, Straßen
  quad(wg, -500, -1, 900, 900, -0.02, hexc('#7b8a52'));
  quad(wg, -500, -500, 900, -1, -0.6, C.water);
  quad(wg, 0, 0, W, W, 0, C.asphalt);
  box(wg, -1, -0.6, -1.2, W + 1, 0.0, 0, C.barrier);
  box(wg, 0, 0, -0.9, W, 0.9, -0.3, C.barrier); addCol(-2, -1.5, W + 2, -0.3, 0.9);
  box(wg, -1.2, 0, 0, -0.3, 0.9, W + 1, C.barrier); addCol(-3, -2, -0.3, W + 3, 0.9);
  box(wg, W + 0.3, 0, 0, W + 1.2, 0.9, W + 1, C.barrier); addCol(W + 0.3, -2, W + 3, W + 3, 0.9);
  box(wg, 0, 0, W + 0.3, W, 0.9, W + 1.2, C.barrier); addCol(-2, W + 0.3, W + 2, W + 3, 0.9);
  for (let k = 0; k < 26; k++) {
    const side = k % 3; const s = sr(30, 70), h = sr(14, 46);
    let x, z;
    if (side === 0) { x = sr(-40, W + 40); z = W + sr(50, 160); } else if (side === 1) { x = -sr(50, 150); z = sr(0, W + 60); } else { x = W + sr(50, 150); z = sr(0, W + 60); }
    box(wg, x - s, -0.5, z - s, x + s, h, z + s, k % 2 ? C.hill : C.hill2, true);
    box(wg, x - s * 0.6, h, z - s * 0.6, x + s * 0.6, h * 1.35, z + s * 0.6, k % 2 ? C.hill2 : C.hill, true);
  }
  // Fahrbahnmarkierungen
  for (let k = 0; k <= N; k++) {
    const rc = roadC(k);
    for (let m = 0; m < N; m++) {
      const s0 = m * P + ROAD, s1 = s0 + BLOCK;
      for (let s = s0 + 1.5; s < s1 - 3; s += 6) {
        quad(wg, s, rc - 0.12, s + 3, rc + 0.12, 0.02, C.line);
        quad(wg, rc - 0.12, s, rc + 0.12, s + 3, 0.02, C.line);
      }
    }
    for (let m = 0; m <= N; m++) {
      const ic = roadC(m);
      for (let st = -6; st < 6; st += 1.1) {
        if (m > 0) quad(wg, ic - ROAD / 2 - 3.2, rc + st, ic - ROAD / 2 - 0.8, rc + st + 0.55, 0.021, C.zebra);
        if (m < N) quad(wg, ic + ROAD / 2 + 0.8, rc + st, ic + ROAD / 2 + 3.2, rc + st + 0.55, 0.021, C.zebra);
        if (m > 0) quad(wg, rc + st, ic - ROAD / 2 - 3.2, rc + st + 0.55, ic - ROAD / 2 - 0.8, 0.021, C.zebra);
        if (m < N) quad(wg, rc + st, ic + ROAD / 2 + 0.8, rc + st + 0.55, ic + ROAD / 2 + 3.2, 0.021, C.zebra);
      }
    }
  }

  // Sonderblöcke
  const SPECIAL = {
    '1,2': () => shopBuilding(1, 2, 'waffen', 'Kugel & Co. – Waffen', '#7a5248', '#d2382b', 'W'),
    '4,1': () => shopBuilding(4, 1, 'spaeti', 'Späti 24/7', '#6d8a9a', '#33b36b', 'S', 14, 12),
    '0,3': () => garage(0, 3, 'lack', 'Spray & Weg – Lackiererei', '#2f86d6', 'L'),
    '4,5': () => shopBuilding(4, 5, 'kleider', 'Fresh Fits – Mode', '#b7a58c', '#c04fb3', 'K'),
    '5,3': () => shopBuilding(5, 3, 'hospital', 'St. Neon Klinik', '#e3e3de', '#e44848', '+', 26, 18),
    '1,5': () => shopBuilding(1, 5, 'police', 'Polizeiwache', '#5b6573', '#3557c8', 'P', 24, 16),
    '2,0': () => garage(2, 0, 'export', 'Export-Garage', '#e2a12b', 'G')
  };
  const LOTC = { downtown: C.concrete, altstadt: C.old, palmen: C.grass, villen: C.grass, hafen: C.port };
  const blocks = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const b = blockRect(i, j), dist = districtOf(i, j);
    const park = (i === 5 && j === 5) || (i === 2 && j === 5);
    b.i = i; b.j = j; b.dist = park ? 'park' : dist; blocks.push(b);
    box(wg, b.x0, 0, b.z0, b.x1, 0.15, b.z1, C.side, true);
    quad(wg, b.x0 + SW, b.z0 + SW, b.x1 - SW, b.z1 - SW, 0.151, park ? C.grass : LOTC[dist]);
    // Laternen
    const L = [[b.x0 + 0.6, b.z0 + 0.6, -0.7, -0.7], [b.x1 - 0.6, b.z0 + 0.6, 0.7, -0.7], [b.x1 - 0.6, b.z1 - 0.6, 0.7, 0.7], [b.x0 + 0.6, b.z1 - 0.6, -0.7, 0.7],
      [b.cx, b.z0 + 0.6, 0, -1], [b.cx, b.z1 - 0.6, 0, 1], [b.x0 + 0.6, b.cz, -1, 0], [b.x1 - 0.6, b.cz, 1, 0]];
    for (const l of L) lamp(l[0], l[1], l[2], l[3]);
    const lx0 = b.x0 + SW, lz0 = b.z0 + SW, lx1 = b.x1 - SW, lz1 = b.z1 - SW, half = (lx1 - lx0) / 2;
    const key = i + ',' + j;
    if (SPECIAL[key]) {
      SPECIAL[key]();
      if (dist === 'palmen' || dist === 'hafen') { palm(lx0 + 2, lz1 - 2, sr(7, 10)); palm(lx1 - 2, lz1 - 2, sr(7, 10)); }
      else { building(lx0 + 1, lz1 - 14, lx0 + 15, lz1 - 1, sr(8, 16), spick(['#a0573f', '#b98b62', '#8f6a4f']), true); building(lx1 - 15, lz1 - 14, lx1 - 1, lz1 - 1, sr(8, 16), spick(['#c9b38c', '#7c4a3a', '#d0c2a0']), true); }
      continue;
    }
    if (park) {
      parks.push(b);
      quad(wg, b.cx - 1.5, lz0, b.cx + 1.5, lz1, 0.16, hexc('#c2b08a'));
      quad(wg, lx0, b.cz - 1.5, lx1, b.cz + 1.5, 0.16, hexc('#c2b08a'));
      box(wg, b.cx - 4, 0.15, b.cz - 4, b.cx + 4, 0.7, b.cz + 4, hexc('#b8b2a4'));
      box(wg, b.cx - 3.4, 0.15, b.cz - 3.4, b.cx + 3.4, 0.62, b.cz + 3.4, hexc('#3d86a8'));
      box(wg, b.cx - 0.5, 0.15, b.cz - 0.5, b.cx + 0.5, 2.4, b.cz + 0.5, hexc('#b8b2a4'));
      addCol(b.cx - 4, b.cz - 4, b.cx + 4, b.cz + 4, 0.7);
      for (let t = 0; t < 9; t++) {
        const tx = sr(lx0 + 2, lx1 - 2), tz = sr(lz0 + 2, lz1 - 2);
        if (Math.abs(tx - b.cx) < 6 || Math.abs(tz - b.cz) < 6) continue;
        if (dist === 'palmen' && t % 2) palm(tx, tz, sr(7, 11)); else tree(tx, tz);
      }
      continue;
    }
    if (dist === 'downtown') {
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
        const sx = lx0 + a * half, sz = lz0 + c * half, fw = sr(12, 16), fd = sr(12, 16), h = sr(24, 72);
        const x0 = sx + (half - fw) / 2, z0 = sz + (half - fd) / 2;
        const col = spick(['#8a95a3', '#6f7c8c', '#a7a196', '#57606b', '#b3b8be', '#4f6d7a']);
        building(x0, z0, x0 + fw, z0 + fd, h, col, true);
        if (srand() < 0.6) { const h2 = h * sr(0.15, 0.35); box(wg, x0 + 2, h + 0.5, z0 + 2, x0 + fw - 2, h + 0.5 + h2, z0 + fd - 2, hexc(col, 1)); }
        box(wg, x0 + 1.5, h + 0.5, z0 + 1.5, x0 + 4, h + 2, z0 + 4, hexc('#6a6c70'));
      }
    } else if (dist === 'altstadt') {
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
        const sx = lx0 + a * half, sz = lz0 + c * half;
        if (srand() < 0.15) { tree(sx + half / 2, sz + half / 2); continue; }
        building(sx + 1.2, sz + 1.2, sx + half - 1.2, sz + half - 1.2, sr(8, 20), spick(['#a0573f', '#b98b62', '#c9b38c', '#8f6a4f', '#d0c2a0', '#7c4a3a']), true);
      }
    } else if (dist === 'palmen') {
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
        const sx = lx0 + a * half, sz = lz0 + c * half;
        building(sx + 4, sz + 4, sx + half - 4, sz + half - 5, sr(4, 7), spick(['#e8c1a0', '#a8d5c9', '#f0d9a8', '#d7a9b8', '#c3d3e8', '#f2e6d0']), true);
        palm(sx + 2, sz + 2, sr(7, 11));
      }
    } else if (dist === 'villen') {
      building(lx0 + 6, lz0 + 14, lx1 - 8, lz1 - 4, sr(6, 9), spick(['#f2efe6', '#e9dcc5', '#dfe7ea']), true);
      box(wg, lx0 + 6, 0.15, lz0 + 3, lx0 + 20, 0.2, lz0 + 10, hexc('#d7d2c4'));
      box(wg, lx0 + 7, 0.15, lz0 + 4, lx0 + 19, 0.21, lz0 + 9, hexc('#43b7d9', 4));
      palm(lx1 - 3, lz0 + 3, sr(8, 11)); palm(lx0 + 2.5, lz1 - 2.5, sr(8, 11)); palm(lx1 - 3, lz0 + 10, sr(8, 11));
    } else if (dist === 'hafen') {
      const col = spick(['#8a8f94', '#9c6b4e', '#5f7380']);
      building(lx0 + 2, lz0 + 12, lx0 + 24, lz1 - 2, 9, col, false);
      for (let s = 0; s < 4; s++) box(wg, lx0 + 2 - 0.05, 1.5 + s * 2, lz0 + 12 - 0.05, lx0 + 24 + 0.05, 1.7 + s * 2, lz1 - 2 + 0.05, hexc('#4a4d50'));
      for (let s = 0; s < 5; s++) {
        const cx = lx1 - 4, cz = lz0 + 3 + s * 3.1, st = randi(1, 3);
        for (let t = 0; t < st; t++) box(wg, cx - 3.4, 0.15 + t * 2.6, cz - 1.25, cx + 3.4, 0.15 + (t + 1) * 2.6, cz + 1.25, hexc(spick(['#b03a2e', '#2e6fb0', '#d68b2a', '#3a8a4f', '#7a3ab0', '#a8a8a8'])));
      }
      addCol(lx1 - 7.4, lz0 + 1.75, lx1 - 0.6, lz0 + 3 + 4 * 3.1 + 1.25, 7.8);
      if (i % 2 === 1) {
        const yc = hexc('#e0b12a');
        box(wg, lx0 + 4, 0, lz0 + 3, lx0 + 5, 22, lz0 + 4, yc); box(wg, lx0 + 4, 0, lz0 + 9, lx0 + 5, 22, lz0 + 10, yc);
        box(wg, lx0 + 3.5, 22, lz0 - 12, lx0 + 5.5, 23.5, lz0 + 12, yc);
        box(wg, lx0 + 3.8, 18, lz0 - 8, lx0 + 5.2, 20, lz0 - 6, hexc('#3a3d42'));
        addCol(lx0 + 4, lz0 + 3, lx0 + 5, lz0 + 10, 22);
      }
    }
  }
  const worldMesh = upload(wg);
  wg.d = null;
  const shopOf = (kind) => shops.find((s) => s.kind === kind);

  // ---- Minikarte vorrendern ----
  const MM = 70, MAPS = W + MM * 2;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = MAPS; mapCanvas.height = MAPS;
  const mapX = (x) => (W - x) + MM, mapY = (z) => (W - z) + MM;
  (() => {
    const c = mapCanvas.getContext('2d');
    c.fillStyle = '#56683f'; c.fillRect(0, 0, MAPS, MAPS);
    c.fillStyle = '#2c5f7c'; c.fillRect(0, mapY(0), MAPS, MAPS);
    c.fillStyle = '#2b2e33'; c.fillRect(mapX(W), mapY(W), W, W);
    const BC = { downtown: '#6b6e73', altstadt: '#6f665a', palmen: '#5d7a45', villen: '#5a7d44', hafen: '#55585c', park: '#4f8a3f' };
    for (const b of blocks) {
      c.fillStyle = BC[b.dist] || '#666'; c.fillRect(mapX(b.x1), mapY(b.z1), BLOCK, BLOCK);
    }
    c.fillStyle = 'rgba(20,20,22,0.55)';
    for (const k of cols) { if (k.h < 3 || k.x1 - k.x0 < 1.5) continue; c.fillRect(mapX(k.x1), mapY(k.z1), k.x1 - k.x0, k.z1 - k.z0); }
  })();

  // ---- Positionen ----
  function sidewalkCorner(i, j, k) {
    const b = blockRect(i, j), o = 1.5;
    return [[b.x0 + o, b.z0 + o], [b.x1 - o, b.z0 + o], [b.x1 - o, b.z1 - o], [b.x0 + o, b.z1 - o]][k];
  }
  function randomSidewalk() {
    const i = randi(0, N - 1), j = randi(0, N - 1), k = randi(0, 3), t = Math.random();
    const a = sidewalkCorner(i, j, k), b = sidewalkCorner(i, j, (k + 1) % 4);
    return { i: i, j: j, k: (k + 1) % 4, x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t) };
  }

  // ================= Fahrzeuge =================
  const CAR_TYPES = {
    sedan: { name: 'Limousine', L: 4.6, Wd: 1.9, H: 1.45, max: 34, acc: 11, grip: 7, colors: ['#8b1e1e', '#1f3d6b', '#d8d8d2', '#2a2a2a', '#5d6b3a', '#7a7f86', '#b58b3a'] },
    sport: { name: 'Sportwagen', L: 4.4, Wd: 2.0, H: 1.15, max: 52, acc: 20, grip: 8.5, colors: ['#d4201a', '#f2c230', '#111111', '#1d6fd1'] },
    taxi: { name: 'Taxi', L: 4.6, Wd: 1.9, H: 1.5, max: 33, acc: 11, grip: 7, colors: ['#f2c230'] },
    police: { name: 'Streifenwagen', L: 4.8, Wd: 1.95, H: 1.5, max: 47, acc: 16, grip: 8.5, colors: ['#15181d'] },
    van: { name: 'Lieferwagen', L: 5.3, Wd: 2.15, H: 2.35, max: 28, acc: 8, grip: 6, colors: ['#e8e8e2', '#3c5a8a', '#8a3c3c'] },
    pickup: { name: 'Pick-up', L: 5.0, Wd: 2.0, H: 1.75, max: 37, acc: 12, grip: 6.5, colors: ['#6b4a2a', '#2e5e3e', '#9a9a9a', '#a33a2a'] }
  };
  function buildCarMesh(key, T) {
    const g = geo(), hw = T.Wd / 2, hl = T.L / 2, H = T.H;
    const paint = [1, 1, 1, 2], glass = hexc('#1e2a33'), tire = hexc('#121212'), dark = hexc('#1c1d20');
    const head = hexc('#fff3c4', 4), tail = hexc('#ff2a1a', 4);
    const low = 0.32, top = key === 'sport' ? low + H * 0.38 : low + H * 0.4;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(g, sx * (hw - 0.17) - 0.17, 0.0, sz * hl * 0.63 - 0.36, sx * (hw - 0.17) + 0.17, 0.72, sz * hl * 0.63 + 0.36, tire);
    }
    box(g, -hw, low, -hl, hw, top, hl, paint);
    box(g, -hw - 0.02, low, hl - 0.12, hw + 0.02, low + 0.22, hl + 0.06, dark);
    box(g, -hw - 0.02, low, -hl - 0.06, hw + 0.02, low + 0.22, -hl + 0.12, dark);
    box(g, -hw + 0.15, top - 0.22, hl, -hw + 0.6, top - 0.06, hl + 0.03, head);
    box(g, hw - 0.6, top - 0.22, hl, hw - 0.15, top - 0.06, hl + 0.03, head);
    box(g, -hw + 0.12, top - 0.22, -hl - 0.03, -hw + 0.55, top - 0.08, -hl, tail);
    box(g, hw - 0.55, top - 0.22, -hl - 0.03, hw - 0.12, top - 0.08, -hl, tail);
    if (key === 'van') {
      box(g, -hw, top, -hl, hw, H, hl * 0.42, paint);
      box(g, -hw * 0.95, top, hl * 0.42, hw * 0.95, H * 0.86, hl * 0.72, glass);
      box(g, -hw * 0.95, H * 0.84, hl * 0.4, hw * 0.95, H * 0.9, hl * 0.72, paint);
    } else if (key === 'pickup') {
      box(g, -hw * 0.92, top, -hl * 0.02, hw * 0.92, H - 0.06, hl * 0.42, glass);
      box(g, -hw * 0.9, H - 0.08, -hl * 0.02, hw * 0.9, H, hl * 0.38, paint);
      box(g, -hw, top, -hl, -hw + 0.12, top + 0.45, -hl * 0.05, paint);
      box(g, hw - 0.12, top, -hl, hw, top + 0.45, -hl * 0.05, paint);
      box(g, -hw, top, -hl, hw, top + 0.45, -hl + 0.12, paint);
    } else {
      const zb = key === 'sport' ? -hl * 0.45 : -hl * 0.55, zf = key === 'sport' ? hl * 0.12 : hl * 0.25;
      box(g, -hw * 0.88, top, zb, hw * 0.88, H - 0.06, zf, glass);
      box(g, -hw * 0.86, H - 0.08, zb + 0.15, hw * 0.86, H + 0.01, zf - 0.2, paint);
      if (key === 'sport') {
        box(g, -hw * 0.7, top, -hl + 0.15, -hw * 0.6, top + 0.32, -hl + 0.3, dark);
        box(g, hw * 0.6, top, -hl + 0.15, hw * 0.7, top + 0.32, -hl + 0.3, dark);
        box(g, -hw * 0.95, top + 0.3, -hl + 0.05, hw * 0.95, top + 0.38, -hl + 0.45, paint);
      }
      if (key === 'police') {
        box(g, -hw - 0.012, low + 0.08, -hl * 0.32, -hw + 0.01, top - 0.04, hl * 0.32, [1, 1, 1, 3]);
        box(g, hw - 0.01, low + 0.08, -hl * 0.32, hw + 0.012, top - 0.04, hl * 0.32, [1, 1, 1, 3]);
        box(g, -0.62, H + 0.01, -0.12, -0.02, H + 0.15, 0.12, hexc('#ff2020', 4));
        box(g, 0.02, H + 0.01, -0.12, 0.62, H + 0.15, 0.12, hexc('#2050ff', 4));
      }
      if (key === 'taxi') box(g, -0.35, H + 0.01, -0.15, 0.35, H + 0.22, 0.15, hexc('#fff6c8', 4));
    }
    return upload(g);
  }
  const carMeshes = {};
  for (const k in CAR_TYPES) carMeshes[k] = buildCarMesh(k, CAR_TYPES[k]);
  const cars = [];
  let carId = 0;
  function spawnCar(type, x, z, yaw, mode) {
    const T = CAR_TYPES[type];
    const c = { id: ++carId, type: type, T: T, mesh: carMeshes[type], x: x, z: z, y: groundY(x, z), yaw: yaw, vx: 0, vz: 0, steer: 0, speed: 0, hp: 100,
      paint: rgb(pick(T.colors)), paint2: [0.95, 0.95, 0.95], driver: null, mode: mode || 'parked', ai: null, siren: false,
      burnT: 0, onFire: false, wreck: false, deadT: 0, honkT: 0, stuckT: 0, revT: 0, cruise: rand(9, 13), deployed: false, inp: { thr: 0, steer: 0, hb: false } };
    cars.push(c); return c;
  }
  const NOINP = { thr: 0, steer: 0, hb: false };
  function stepCar(c, dt, inp) {
    const T = c.T;
    if (c.wreck || c.onFire) inp = NOINP;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rxv = -fz, rzv = fx;
    let fs = c.vx * fx + c.vz * fz, ls = c.vx * rxv + c.vz * rzv;
    if (inp.thr > 0) {
      if (fs < -0.5) fs += 24 * dt * inp.thr; else fs += T.acc * inp.thr * dt * (1 - Math.max(0, fs) / T.max);
    } else if (inp.thr < 0) {
      if (fs > 0.5) fs += 24 * dt * inp.thr; else fs += T.acc * 0.6 * inp.thr * dt * (1 - Math.max(0, -fs) / (T.max * 0.35));
    }
    fs -= fs * (0.12 + (inp.thr === 0 ? 0.5 : 0)) * dt;
    if (inp.thr === 0 && Math.abs(fs) < 0.3) fs = 0;
    if (inp.hb) fs -= Math.sign(fs) * Math.min(Math.abs(fs), 7 * dt);
    ls *= Math.exp(-(inp.hb ? 1.4 : T.grip) * dt);
    const target = inp.steer * 0.62 / (1 + Math.abs(fs) * 0.03);
    c.steer += (target - c.steer) * Math.min(1, 9 * dt);
    c.yaw -= fs * Math.tan(c.steer) / (T.L * 0.62) * (inp.hb ? 1.4 : 1) * dt;
    const nfx = Math.sin(c.yaw), nfz = Math.cos(c.yaw);
    c.vx = nfx * fs + (-nfz) * ls; c.vz = nfz * fs + nfx * ls;
    c.x += c.vx * dt; c.z += c.vz * dt;
    c.speed = fs;
    c.y += (groundY(c.x, c.z) - c.y) * Math.min(1, 14 * dt);
    // Gebäude: drei Kreise entlang der Längsachse
    const r = T.Wd / 2, off = T.L / 2 - r;
    let impact = 0;
    for (const o of [-off, 0, off]) {
      const pt = { x: c.x + nfx * o, z: c.z + nfz * o };
      const h = circleCollide(pt, r, 0);
      if (h.hit) {
        c.x += pt.x - (c.x + nfx * o); c.z += pt.z - (c.z + nfz * o);
        const vn = c.vx * h.nx + c.vz * h.nz;
        if (vn < 0) { c.vx -= 1.35 * vn * h.nx; c.vz -= 1.35 * vn * h.nz; impact = Math.max(impact, -vn); }
      }
    }
    if (impact > 0) {
      const f2 = Math.sin(c.yaw) * c.vx + Math.cos(c.yaw) * c.vz; c.speed = f2;
      if (impact > 5) { if (c.driver === player) rumble(Math.min(1, impact / 15), 0.6, 160); damageCar(c, (impact - 5) * 2.2, c.driver === player); sfx('crash', Math.min(1, impact / 20), c.x, c.z); spawnSparks(c.x + nfx * off, 0.6, c.z + nfz * off, 6); }
    }
  }
  function damageCar(c, amt, byPlayer) {
    if (c.wreck) return;
    c.hp -= amt;
    if (c.hp <= 0 && !c.onFire) { c.onFire = true; c.burnT = 4; c.hp = 0; }
    if (byPlayer && c.type === 'police' && amt > 3) crime('copcar', null);
  }
  function explodeCar(c) {
    c.onFire = false; c.wreck = true; c.deadT = 0;
    c.paint = [0.12, 0.12, 0.12]; c.paint2 = [0.15, 0.15, 0.15]; c.siren = false;
    explosion(c.x, c.y + 0.8, c.z, c.driver === player ? 'player' : null);
    if (c.driver && c.driver !== player) { const d = c.driver; c.driver = null; d.inCar = null; d.x = c.x + 1.5; d.z = c.z; d.hp = 0; d.state = 'dead'; d.fall = 1; addPed(d); }
  }
  function explosion(x, y, z, src) {
    sfx('boom', 1, x, z);
    shake = Math.max(shake, clamp(1 - Math.hypot(x - camState.eye[0], z - camState.eye[2]) / 60, 0, 1) * 0.9);
    for (let i = 0; i < 40; i++) addParticle(x, y, z, rand(-7, 7), rand(2, 11), rand(-7, 7), rand(0.5, 1.2), rand(0.4, 1.0), Math.random() < 0.5 ? [1, 0.55, 0.1] : [1, 0.85, 0.3], -6);
    for (let i = 0; i < 20; i++) addParticle(x, y + 1, z, rand(-2, 2), rand(2, 5), rand(-2, 2), rand(1.5, 3), rand(0.8, 1.6), [0.15, 0.15, 0.15], 1);
    for (const p of peds) {
      if (p.state === 'dead') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 8) { const k = 1 - d / 8; damagePed(p, 140 * k + 20, (p.x - x) / (d || 1), (p.z - z) / (d || 1), src === 'player' ? 'player' : 'boom', 7 * k + 2); }
      else if (d < 30) panic(p, x, z);
    }
    if (!player.inCar) { const d = Math.hypot(player.x - x, player.z - z); if (d < 8) damagePlayer(90 * (1 - d / 8) + 10); }
    else if (player.inCar.wreck && Math.hypot(player.inCar.x - x, player.inCar.z - z) < 1) damagePlayer(999);
    for (const o of cars) { if (o.wreck) continue; const d = Math.hypot(o.x - x, o.z - z); if (d < 7 && d > 0.5) { damageCar(o, 60 * (1 - d / 7), src === 'player'); o.vx += (o.x - x) / d * 6; o.vz += (o.z - z) / d * 6; } }
  }

  // ================= Fußgänger =================
  const peds = [];
  const SKINS = ['#f1c7a5', '#e0ac83', '#c68a5e', '#8d5a3b', '#5e3a26', '#f5d6bf'];
  const SHIRTS = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1', '#2c3e50', '#d35400', '#16a085', '#e84393', '#555555'];
  const PANTS = ['#2c3e50', '#34495e', '#1b2631', '#5d4037', '#7f8c8d', '#212121', '#3e5c76', '#c8b78f'];
  const HAIRS = ['#1a1a1a', '#3b2a1a', '#6b4a2a', '#c9a96e', '#8a8a8a', '#2b1b10'];
  function makePed(kind, x, z) {
    const p = { kind: kind, x: x, z: z, y: groundY(x, z), vx: 0, vz: 0, vy: 0, yaw: rand(0, TAU), hp: 100, state: 'walk', stateT: 0, walkT: rand(0, 10), moving: 0,
      skin: rgb(pick(SKINS)), shirt: rgb(pick(SHIRTS)), pants: rgb(pick(PANTS)), hair: rgb(pick(HAIRS)), speed: rand(1.2, 1.7),
      bi: 0, bj: 0, k: 0, dir: Math.random() < 0.5 ? 1 : -1, tx: x, tz: z, fx: 0, fz: 0, shootT: rand(0.6, 1.4), armed: false,
      deadT: 0, spin: 0, spinV: 0, fall: 0, inCar: null, car: null, aim: false, punchT: 0, cash: randi(5, 60), arrestT: 0, name: null, hostile: false,
      hairStyle: Math.random() < 0.55 ? 0 : Math.random() < 0.8 ? 1 : 2, sleeve: Math.random() < 0.3, h: rand(0.94, 1.05), bw: rand(0.93, 1.1) };
    if (kind === 'cop') { p.shirt = rgb('#1f3a68'); p.sleeve = true; p.hairStyle = 0; p.pants = rgb('#1b2433'); p.hair = rgb('#111111'); p.armed = true; p.cash = randi(20, 80); }
    return p;
  }
  function addPed(p) { if (peds.indexOf(p) < 0) peds.push(p); return p; }
  function spawnWalker(kind) { const s = randomSidewalk(); const p = makePed(kind || 'civ', s.x, s.z); p.bi = s.i; p.bj = s.j; p.k = s.k; return addPed(p); }
  function rehome(p) {
    p.bi = clamp(Math.floor((p.x - ROAD / 2) / P), 0, N - 1); p.bj = clamp(Math.floor((p.z - ROAD / 2) / P), 0, N - 1);
    let best = 0, bd = 1e9;
    for (let k = 0; k < 4; k++) { const c = sidewalkCorner(p.bi, p.bj, k); const d = Math.hypot(c[0] - p.x, c[1] - p.z); if (d < bd) { bd = d; best = k; } }
    p.k = best; p.state = 'walk';
  }
  function moveTo(p, tx, tz, spd, dt) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { p.moving = Math.max(0, p.moving - dt * 4); return d; }
    const s = Math.min(spd, d / dt);
    p.x += dx / d * s * dt; p.z += dz / d * s * dt;
    p.yaw += angDiff(p.yaw, Math.atan2(dx, dz)) * Math.min(1, 10 * dt);
    p.moving = Math.min(1, s / 1.4); p.walkT += s * dt * 3.2;
    circleCollide(p, 0.35, 0);
    return d;
  }
  function panic(p, x, z) {
    if (p.state === 'dead' || p.state === 'ragdoll' || p.kind === 'giver') return;
    if (p.kind === 'cop' || p.hostile) return;
    p.state = 'flee'; p.fx = x; p.fz = z; p.stateT = rand(6, 11);
  }
  function panicAround(x, z, r) { for (const p of peds) if (Math.hypot(p.x - x, p.z - z) < r) panic(p, x, z); }
  function damagePed(p, dmg, dx, dz, src, knock) {
    if (p.state === 'dead') return;
    p.hp -= dmg;
    for (let i = 0; i < 5; i++) addParticle(p.x, p.y + 1.2, p.z, dx * 2 + rand(-1, 1), rand(0.5, 2.5), dz * 2 + rand(-1, 1), rand(0.3, 0.6), 0.12, [0.55, 0.02, 0.02], -9);
    if (knock) { p.state = 'ragdoll'; p.vx = dx * knock; p.vz = dz * knock; p.vy = 2 + knock * 0.4; p.spinV = rand(4, 8) * (Math.random() < 0.5 ? 1 : -1); p.spin = 0; }
    else if (p.hp <= 0) { p.state = 'ragdoll'; p.vx = dx * 1.5; p.vz = dz * 1.5; p.vy = 1.2; p.spinV = 3; p.spin = 0; }
    if (src === 'player') {
      crime(p.hp <= 0 ? 'kill' : 'hurt', p);
      if (p.kind === 'cop' || p.kind === 'guard' || p.kind === 'target') { if (p.state !== 'ragdoll') p.state = 'attack'; p.hostile = true; }
      else if (p.state !== 'ragdoll') panic(p, player.x, player.z);
    }
    if (p.hp <= 0) onPedKilled(p, src);
  }
  function crossFrom(p) {
    const k = p.k, di = (k === 0 || k === 3) ? -1 : 1, dj = (k === 0 || k === 1) ? -1 : 1;
    if (Math.random() < 0.5) {
      if (p.bi + di < 0 || p.bi + di >= N) return false;
      p.bi += di; p.k = [1, 0, 3, 2][k];
    } else {
      if (p.bj + dj < 0 || p.bj + dj >= N) return false;
      p.bj += dj; p.k = [3, 2, 1, 0][k];
    }
    const c = sidewalkCorner(p.bi, p.bj, p.k); p.tx = c[0]; p.tz = c[1]; p.state = 'cross'; return true;
  }
  function stepPed(p, dt) {
    p.punchT = Math.max(0, p.punchT - dt);
    p.aim = false;
    if (p.state === 'dead') { p.deadT += dt; p.fall = Math.min(1, p.fall + dt * 3); return; }
    if (p.state === 'ragdoll') {
      p.vy -= 20 * dt; p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt; p.spin += p.spinV * dt;
      circleCollide(p, 0.35, 0);
      const gy = groundY(p.x, p.z);
      if (p.y <= gy && p.vy < 0) {
        p.y = gy; p.vx *= 0.3; p.vz *= 0.3;
        if (Math.abs(p.vy) > 3) { p.vy = -p.vy * 0.25; return; }
        if (p.hp <= 0) { p.state = 'dead'; p.fall = 1; p.spin = 0; }
        else { p.spin = 0; if (p.kind === 'giver') p.state = 'stand'; else if (p.hostile) p.state = 'attack'; else { p.state = 'flee'; p.fx = p.x - p.vx; p.fz = p.z - p.vz; p.stateT = 8; } }
      }
      return;
    }
    p.y += (groundY(p.x, p.z) - p.y) * Math.min(1, 12 * dt);
    p.stateT -= dt;
    const st = p.state;
    if (st === 'walk') {
      const c = sidewalkCorner(p.bi, p.bj, p.k);
      if (moveTo(p, c[0], c[1], p.speed, dt) < 0.6) {
        const r = Math.random();
        if (r < 0.2 && crossFrom(p)) return;
        if (r < 0.3) { p.state = 'idle'; p.stateT = rand(1.5, 5); }
        if (r > 0.93) p.dir = -p.dir;
        p.k = (p.k + p.dir + 4) % 4;
      }
    } else if (st === 'cross') {
      if (moveTo(p, p.tx, p.tz, p.speed * 1.15, dt) < 0.6) { p.state = 'walk'; p.k = (p.k + p.dir + 4) % 4; }
    } else if (st === 'idle' || st === 'talk') {
      p.moving = Math.max(0, p.moving - dt * 4);
      if (st === 'talk') p.yaw += angDiff(p.yaw, Math.atan2(player.x - p.x, player.z - p.z)) * Math.min(1, 6 * dt);
      if (st === 'idle' && p.stateT <= 0) p.state = 'walk';
    } else if (st === 'stand') {
      p.moving = 0;
      const d = Math.hypot(player.x - p.x, player.z - p.z);
      if (d < 12) p.yaw += angDiff(p.yaw, Math.atan2(player.x - p.x, player.z - p.z)) * Math.min(1, 3 * dt);
      if (p.kind === 'guard' && d < 18 && !player.dead) { p.state = 'attack'; p.hostile = true; }
    } else if (st === 'flee') {
      let ax = p.x - p.fx, az = p.z - p.fz; const d = Math.hypot(ax, az) || 1;
      const t = p.x + ax / d * 5 + Math.sin(p.walkT * 0.3) * 2, u = p.z + az / d * 5 + Math.cos(p.walkT * 0.3) * 2;
      moveTo(p, t, u, 5.2, dt);
      if (p.stateT <= 0) rehome(p);
    } else if (st === 'attack') {
      stepAttacker(p, dt);
    } else if (st === 'return') {
      const c = p.car;
      if (!c || c.wreck || c.driver) { p.state = 'flee'; p.stateT = 3; p.fx = p.x; p.fz = p.z; p.kind = p.kind === 'cop' ? 'cop' : p.kind; return; }
      if (moveTo(p, c.x, c.z, 4.5, dt) < 2.5) { peds.splice(peds.indexOf(p), 1); c.driver = p; p.inCar = c; c.mode = 'traffic'; c.ai = null; c.siren = false; c.deployed = false; }
    }
  }

  // ================= Verkehrs-KI =================
  function nextIdx(pos, d) {
    if (d > 0) { for (let m = 0; m <= N; m++) if (roadC(m) > pos + 3) return m; return -1; }
    for (let m = N; m >= 0; m--) if (roadC(m) < pos - 3) return m; return -1;
  }
  function aiInit(c) {
    let dx = Math.round(Math.sin(c.yaw)), dz = Math.round(Math.cos(c.yaw));
    if (Math.abs(Math.sin(c.yaw)) > Math.abs(Math.cos(c.yaw))) dz = 0; else dx = 0;
    if (dx === 0 && dz === 0) dz = 1;
    let ti, tj;
    if (dx !== 0) { tj = clamp(Math.round((c.z - ROAD / 2) / P), 0, N); ti = nextIdx(c.x, dx); if (ti < 0) { dx = -dx; ti = nextIdx(c.x, dx); } }
    else { ti = clamp(Math.round((c.x - ROAD / 2) / P), 0, N); tj = nextIdx(c.z, dz); if (tj < 0) { dz = -dz; tj = nextIdx(c.z, dz); } }
    c.ai = { dx: dx, dz: dz, ti: ti, tj: tj, phase: 'approach', ndx: dx, ndz: dz, wx: 0, wz: 0 };
    aiSetApproach(c);
  }
  function laneOff(c) { return c.mode === 'chase' ? LANE * 0.4 : LANE; }
  function aiSetApproach(c) {
    const a = c.ai, cx = roadC(a.ti), cz = roadC(a.tj), lo = laneOff(c);
    a.wx = cx - a.dx * (ROAD / 2 + 1) + (-a.dz) * lo; a.wz = cz - a.dz * (ROAD / 2 + 1) + a.dx * lo; a.phase = 'approach';
  }
  function aiChooseTurn(c, tx, tz) {
    const a = c.ai, opts = [];
    for (const d of [[a.dx, a.dz], [-a.dz, a.dx], [a.dz, -a.dx]]) {
      const ni = a.ti + d[0], nj = a.tj + d[1];
      if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
      opts.push(d);
    }
    if (!opts.length) opts.push([-a.dx, -a.dz]);
    let ch;
    if (tx == null) ch = Math.random() < 0.55 && opts[0][0] === a.dx && opts[0][1] === a.dz ? opts[0] : pick(opts);
    else {
      let bd = 1e9; ch = opts[0];
      for (const d of opts) { const ex = roadC(a.ti + d[0]), ez = roadC(a.tj + d[1]); const dd = Math.hypot(ex - tx, ez - tz); if (dd < bd) { bd = dd; ch = d; } }
    }
    a.ndx = ch[0]; a.ndz = ch[1];
    const cx = roadC(a.ti), cz = roadC(a.tj), lo = laneOff(c);
    a.wx = cx + a.ndx * (ROAD / 2 + 1) + (-a.ndz) * lo; a.wz = cz + a.ndz * (ROAD / 2 + 1) + a.ndx * lo; a.phase = 'turn';
  }
  function obstacleAhead(c, range) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let best = range;
    const test = (x, z, w) => {
      const dx = x - c.x, dz = z - c.z, lz = dx * fx + dz * fz;
      if (lz <= 0 || lz >= best) return;
      const lx = dx * (-fz) + dz * fx;
      if (Math.abs(lx) < 1.3 + w) best = lz;
    };
    for (const o of cars) if (o !== c && !(o.wreck && o.deadT > 20)) test(o.x, o.z, o.T.Wd / 2);
    for (const p of peds) if (p.state !== 'dead') test(p.x, p.z, 0.3);
    if (!player.inCar && !player.dead) test(player.x, player.z, 0.3);
    return best;
  }
  function driveTo(c, tx, tz, tspeed, dt) {
    const want = Math.atan2(tx - c.x, tz - c.z), diff = angDiff(c.yaw, want);
    const inp = c.inp; inp.hb = false;
    if (c.revT > 0) { c.revT -= dt; inp.thr = -1; inp.steer = clamp(diff * 2, -1, 1); return; }
    inp.steer = clamp(-diff * 2.3, -1, 1);
    if (Math.abs(diff) > 1.3 && c.speed > 4) tspeed = Math.min(tspeed, 5);
    inp.thr = c.speed < tspeed - 0.5 ? clamp((tspeed - c.speed) * 0.4, 0.3, 1) : (c.speed > tspeed + 1.5 ? -0.7 : 0);
    if (inp.thr > 0.2 && Math.abs(c.speed) < 0.8) { c.stuckT += dt; if (c.stuckT > 2.2) { c.stuckT = 0; c.revT = 1.3; } } else c.stuckT = Math.max(0, c.stuckT - dt);
  }
  function aiTraffic(c, dt) {
    if (!c.ai) aiInit(c);
    const a = c.ai;
    const d = Math.hypot(a.wx - c.x, a.wz - c.z);
    if (a.phase === 'approach' && d < 3.2) aiChooseTurn(c);
    else if (a.phase === 'turn' && d < 3.2) { a.dx = a.ndx; a.dz = a.ndz; a.ti += a.dx; a.tj += a.dz; aiSetApproach(c); }
    let ts = a.phase === 'turn' ? (a.ndx === a.dx && a.ndz === a.dz ? c.cruise : 6) : (d < 14 ? Math.max(6, c.cruise * d / 14) : c.cruise);
    const ob = obstacleAhead(c, 14);
    if (ob < 14) { ts = Math.min(ts, Math.max(0, (ob - 5.5) * 1.3)); c.waitT = (c.waitT || 0) + dt; if (c.waitT > 4 && ob < 7 && !c.honkT) { c.honkT = 3; sfx('horn', 0.4, c.x, c.z); } }
    else c.waitT = 0;
    if ((c.waitT || 0) > 14) { ts = 4; }
    if (c.flee) ts = c.T.max * 0.8;
    driveTo(c, a.wx, a.wz, ts, dt);
    if (c.revT <= 0 && c.stuckT === 0 && Math.hypot(c.vx, c.vz) < 0.1 && (c.waitT || 0) > 25) aiInit(c);
  }
  function aiChase(c, dt) {
    if (!c.ai) aiInit(c);
    const a = c.ai;
    const tgt = player.inCar || player;
    const tx = tgt.x + (player.inCar ? player.inCar.vx * 0.5 : 0), tz = tgt.z + (player.inCar ? player.inCar.vz * 0.5 : 0);
    const dist = Math.hypot(tx - c.x, tz - c.z);
    c.siren = true;
    if (!player.inCar && dist < 16 && !c.deployed) {
      driveTo(c, tx, tz, 0, dt); c.inp.hb = true;
      if (Math.abs(c.speed) < 1.5) deployCops(c);
      return;
    }
    const fast = c.T.max * (0.72 + wanted * 0.05);
    if (dist < 45 && losClear(c.x, 1, c.z, tx, 1, tz)) { driveTo(c, tx, tz, dist < 10 ? 8 : fast, dt); c.ai = null; return; }
    const d = Math.hypot(a.wx - c.x, a.wz - c.z);
    if (a.phase === 'approach' && d < 4) aiChooseTurn(c, tx, tz);
    else if (a.phase === 'turn' && d < 4) { a.dx = a.ndx; a.dz = a.ndz; a.ti += a.dx; a.tj += a.dz; aiSetApproach(c); }
    driveTo(c, a.wx, a.wz, a.phase === 'turn' && (a.ndx !== a.dx || a.ndz !== a.dz) ? 9 : fast, dt);
  }
  function deployCops(c) {
    c.deployed = true; c.mode = 'police-parked';
    const lx = -Math.cos(c.yaw), lz = Math.sin(c.yaw);
    const out = [];
    if (c.driver && c.driver !== player) { out.push(c.driver); c.driver = null; }
    if (wanted >= 2 || Math.random() < 0.6) out.push(makePed('cop', 0, 0));
    out.forEach((p, i) => {
      const s = i === 0 ? 1 : -1;
      p.x = c.x + lx * s * (c.T.Wd / 2 + 0.7); p.z = c.z + lz * s * (c.T.Wd / 2 + 0.7); p.y = groundY(p.x, p.z);
      p.inCar = null; p.car = c; p.state = 'attack'; p.hostile = false; addPed(p);
    });
  }
  function updateCars(dt) {
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      c.honkT = Math.max(0, c.honkT - dt);
      if (c.onFire) {
        c.burnT -= dt;
        if (Math.random() < dt * 30) addParticle(c.x + rand(-0.6, 0.6), c.y + 1.2, c.z + rand(-1, 1), rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5), rand(0.4, 0.8), rand(0.3, 0.6), Math.random() < 0.6 ? [1, 0.5, 0.1] : [1, 0.8, 0.2], 1);
        if (c.burnT <= 0) explodeCar(c);
      } else if (!c.wreck && c.hp < 30 && Math.random() < dt * 8) addParticle(c.x + Math.sin(c.yaw) * c.T.L * 0.4, c.y + 1, c.z + Math.cos(c.yaw) * c.T.L * 0.4, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(1, 2), rand(0.4, 0.7), [0.3, 0.3, 0.3], 0.5);
      if (c.wreck) c.deadT += dt;
      let inp = NOINP;
      if (c.driver === player) inp = playerCarInput();
      else if (c.driver && !c.wreck) {
        if (c.mode === 'chase') aiChase(c, dt); else aiTraffic(c, dt);
        inp = c.inp;
      } else if (c.mode === 'police-parked') { c.siren = wanted > 0; }
      stepCar(c, dt, inp);
    }
  }
  function carCollisions() {
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        const dx0 = b.x - a.x, dz0 = b.z - a.z;
        if (Math.abs(dx0) > 6 || Math.abs(dz0) > 6) continue;
        const ra = a.T.Wd / 2, rb = b.T.Wd / 2, oa = a.T.L / 2 - ra, ob = b.T.L / 2 - rb;
        const afx = Math.sin(a.yaw), afz = Math.cos(a.yaw), bfx = Math.sin(b.yaw), bfz = Math.cos(b.yaw);
        for (const sa of [-oa, 0, oa]) for (const sb of [-ob, 0, ob]) {
          const ax = a.x + afx * sa, az = a.z + afz * sa, bx = b.x + bfx * sb, bz = b.z + bfz * sb;
          const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), m = ra + rb;
          if (d >= m || d < 1e-4) continue;
          const nx = dx / d, nz = dz / d, pen = (m - d) / 2;
          a.x -= nx * pen; a.z -= nz * pen; b.x += nx * pen; b.z += nz * pen;
          const vr = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (vr < 0) {
            const jv = -vr * 0.65;
            a.vx -= nx * jv; a.vz -= nz * jv; b.vx += nx * jv; b.vz += nz * jv;
            if (-vr > 4) {
              const dmg = (-vr - 4) * 2.4;
              damageCar(a, dmg, b.driver === player); damageCar(b, dmg, a.driver === player);
              sfx('crash', Math.min(1, -vr / 18), ax, az); spawnSparks((ax + bx) / 2, 0.7, (az + bz) / 2, 5);
              if (a.driver === player && b.driver && b.mode === 'traffic' && -vr > 8) b.flee = true;
              if (b.driver === player && a.driver && a.mode === 'traffic' && -vr > 8) a.flee = true;
            }
          }
        }
      }
      // Fahrzeug gegen Fußgänger
      const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), spd = Math.hypot(a.vx, a.vz);
      const hitTest = (p, isPlayer) => {
        const dx = p.x - a.x, dz = p.z - a.z;
        if (Math.abs(dx) > 4 || Math.abs(dz) > 4) return;
        const lz = dx * fx + dz * fz, lx = dx * (-fz) + dz * fx;
        if (Math.abs(lz) > a.T.L / 2 + 0.3 || Math.abs(lx) > a.T.Wd / 2 + 0.3) return;
        if (spd > 3.5 && p.y < a.y + 1.2) {
          const nx = dx / (Math.hypot(dx, dz) || 1), nz = dz / (Math.hypot(dx, dz) || 1);
          if (isPlayer) { damagePlayer(spd * 2.5); player.vx = a.vx * 0.8 + nx * 3; player.vz = a.vz * 0.8 + nz * 3; player.vy = 4; sfx('hit', 0.6, p.x, p.z); }
          else if (p.state !== 'dead' && p.state !== 'ragdoll') {
            sfx('hit', 0.7, p.x, p.z);
            const pv = Math.hypot(a.vx, a.vz) || 1;
            damagePed(p, spd * 6.5, a.vx / pv, a.vz / pv, a.driver === player ? 'player' : 'car', spd * 0.85);
          }
          a.vx *= 0.93; a.vz *= 0.93;
        } else {
          const ex = (a.T.Wd / 2 + 0.31) - Math.abs(lx), ez = (a.T.L / 2 + 0.31) - Math.abs(lz);
          if (ex < ez) { const s = Math.sign(lx) || 1; p.x += -fz * s * ex; p.z += fx * s * ex; }
          else { const s = Math.sign(lz) || 1; p.x += fx * s * ez; p.z += fz * s * ez; }
        }
      };
      for (const p of peds) if (p.state !== 'ragdoll') hitTest(p, false);
      if (!player.inCar && !player.dead) hitTest(player, true);
    }
  }

  // ================= Effekte =================
  const particles = [], tracers = [], pickups = [];
  function addParticle(x, y, z, vx, vy, vz, life, size, col, grav) {
    if (particles.length > 380) particles.shift();
    particles.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, max: life, size: size, col: col, grav: grav == null ? -9 : grav });
  }
  function spawnSparks(x, y, z, n) { for (let i = 0; i < n; i++) addParticle(x, y, z, rand(-4, 4), rand(1, 4), rand(-4, 4), rand(0.15, 0.35), 0.07, [1, 0.85, 0.4], -12); }
  function stepFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life -= dt; if (q.life <= 0) { particles.splice(i, 1); continue; }
      q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) { q.y = 0.05; q.vy = 0; q.vx *= 0.8; q.vz *= 0.8; }
      if (q.grav > 0) q.size += dt * 0.9;
    }
    for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; if (tracers[i].life <= 0) tracers.splice(i, 1); }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const k = pickups[i]; k.t += dt;
      if (k.t > 60) { pickups.splice(i, 1); continue; }
      if (!player.inCar && !player.dead && Math.hypot(player.x - k.x, player.z - k.z) < 1.2) {
        pickups.splice(i, 1);
        if (k.w) lootWeapon(k.w, k.ammo);
        else { player.money += k.amount; sfx('cash', 0.6); msg('+$' + k.amount, 1.2); }
      }
    }
  }

  // ================= Zeichnen von Figuren & Autos =================
  const SHADOW = [0, 0, 0];
  // Körperteile als runde Meshes. Farbe [1,1,1,2] = uPaint, [1,1,1,3] = uPaint2, Material 0 = feste Farbe.
  function buildBody(seg) {
    const P1 = [1, 1, 1, 2], P2 = [1, 1, 1, 3];
    const BELT = [0.09, 0.08, 0.07, 0], SHOE = [0.11, 0.1, 0.1, 0], SOLE = [0.78, 0.76, 0.72, 0];
    const EYE = [0.93, 0.93, 0.9, 0], IRIS = [0.13, 0.09, 0.06, 0], BROW = [0.12, 0.09, 0.07, 0], LIPS = [0.78, 0.55, 0.52, 2];
    const HAT = [0.1, 0.14, 0.25, 0], BRIM = [0.06, 0.07, 0.1, 0], BADGE = [0.9, 0.74, 0.28, 0];
    const mk = (fn) => { const g = geo(); fn(g); return upload(g); };
    const L = (g, rings) => latheGeo(g, rings, seg), E = (g, cx, cy, cz, rx, ry, rz, c) => ellipGeo(g, cx, cy, cz, rx, ry, rz, c, seg);
    // Oberarm: Ärmel (P1) und Haut (P2) bzw. durchgehend Ärmel
    const shoulder = [[0.05, 0, 0, P1], [0.035, 0.042, 0.042, P1], [0.005, 0.056, 0.054, P1], [-0.07, 0.054, 0.051, P1]];
    const upperArm = (long) => mk((g) => L(g, shoulder.concat(long
      ? [[-0.16, 0.05, 0.048, P1], [-0.25, 0.047, 0.046, P1], [-0.29, 0.035, 0.034, P1], [-0.31, 0, 0, P1]]
      : [[-0.13, 0.054, 0.051, P1], [-0.131, 0.043, 0.042, P2], [-0.21, 0.042, 0.041, P2], [-0.27, 0.037, 0.036, P2], [-0.3, 0.025, 0.025, P2], [-0.31, 0, 0, P2]])));
    // Unterarm mit Hand: Haut (P1), Ärmel (P2)
    const foreArm = (sleeve) => mk((g) => {
      const S = sleeve ? P2 : P1, d = sleeve ? 0.008 : 0;
      L(g, [[0.03, 0, 0, S], [0.015, 0.033 + d, 0.032 + d, S], [0, 0.038 + d, 0.036 + d, S], [-0.08, 0.041 + d, 0.037 + d, S], [-0.18, 0.032 + d, 0.029 + d, S],
        [-0.225, 0.03 + d, 0.028 + d, sleeve ? P2 : P1], [-0.226, 0.026, 0.024, P1], [-0.24, 0.026, 0.024, P1], [-0.25, 0, 0, P1]]);
      E(g, 0, -0.3, 0.006, 0.022, 0.062, 0.04, P1);
      E(g, 0.012, -0.262, 0.035, 0.012, 0.03, 0.012, P1);
    });
    return {
      torso: mk((g) => L(g, [[0.8, 0, 0, P2], [0.83, 0.1, 0.07, P2], [0.88, 0.155, 0.105, P2, -0.005], [0.96, 0.172, 0.115, P2, -0.01],
        [1.02, 0.168, 0.11, BELT, -0.005], [1.045, 0.172, 0.112, P1], [1.12, 0.158, 0.104, P1, 0.005], [1.22, 0.168, 0.11, P1, 0.012],
        [1.32, 0.188, 0.12, P1, 0.018], [1.4, 0.2, 0.118, P1, 0.012], [1.46, 0.19, 0.105, P1], [1.505, 0.14, 0.085, P1, -0.005],
        [1.535, 0.07, 0.06, P1, -0.005], [1.55, 0, 0, P1]])),
      head: mk((g) => {
        L(g, [[1.49, 0.052, 0.056, P1], [1.58, 0.054, 0.058, P1], [1.588, 0.07, 0.078, P1, 0.022], [1.61, 0.082, 0.094, P1, 0.022],
          [1.64, 0.09, 0.102, P1, 0.016], [1.68, 0.095, 0.107, P1, 0.01], [1.72, 0.097, 0.11, P1, 0.004], [1.76, 0.092, 0.104, P1],
          [1.795, 0.072, 0.085, P1, -0.004], [1.818, 0.038, 0.048, P1, -0.006], [1.826, 0, 0, P1, -0.006]]);
        E(g, 0, 1.674, 0.112, 0.012, 0.022, 0.016, P1);
        E(g, 0, 1.627, 0.11, 0.021, 0.006, 0.007, LIPS);
        for (const s of [-1, 1]) {
          E(g, s * 0.034, 1.704, 0.102, 0.013, 0.008, 0.008, EYE);
          E(g, s * 0.034, 1.704, 0.108, 0.0065, 0.0065, 0.004, IRIS);
          E(g, s * 0.036, 1.724, 0.105, 0.02, 0.005, 0.007, BROW);
          E(g, s * 0.096, 1.68, -0.005, 0.014, 0.03, 0.022, P1);
        }
      }),
      hairShort: mk((g) => E(g, 0, 1.738, -0.012, 0.106, 0.096, 0.118, P1)),
      hairLong: mk((g) => {
        E(g, 0, 1.738, -0.012, 0.108, 0.098, 0.12, P1);
        E(g, 0, 1.62, -0.06, 0.1, 0.14, 0.065, P1);
        for (const s of [-1, 1]) E(g, s * 0.088, 1.66, -0.012, 0.03, 0.095, 0.065, P1);
      }),
      hat: mk((g) => {
        L(g, [[1.735, 0.108, 0.121, HAT, -0.01], [1.8, 0.11, 0.122, HAT, -0.01], [1.835, 0.102, 0.112, HAT, -0.01], [1.848, 0, 0, HAT, -0.01]]);
        E(g, 0, 1.75, 0.1, 0.095, 0.012, 0.07, BRIM);
        E(g, 0, 1.79, 0.112, 0.018, 0.02, 0.008, BADGE);
      }),
      thigh: mk((g) => L(g, [[0.05, 0, 0, P1], [0.035, 0.06, 0.065, P1], [0, 0.088, 0.095, P1], [-0.12, 0.083, 0.09, P1, 0.005],
        [-0.28, 0.068, 0.074, P1, 0.005], [-0.4, 0.058, 0.062, P1], [-0.44, 0.054, 0.058, P1], [-0.47, 0.03, 0.035, P1], [-0.48, 0, 0, P1]])),
      shin: mk((g) => {
        L(g, [[0.04, 0, 0, P1], [0.025, 0.045, 0.05, P1], [0, 0.058, 0.062, P1], [-0.1, 0.06, 0.068, P1, -0.006], [-0.22, 0.056, 0.062, P1, -0.004],
          [-0.36, 0.058, 0.062, P1], [-0.37, 0, 0, P1]]);
        E(g, 0, -0.415, 0.035, 0.05, 0.05, 0.12, SHOE);
        E(g, 0, -0.455, 0.035, 0.053, 0.018, 0.126, SOLE);
      }),
      armShort: upperArm(false), armLong: upperArm(true),
      fore: foreArm(false), foreSleeve: foreArm(true),
    };
  }
  const bodyHi = buildBody(16), bodyLo = buildBody(7);
  const GUN = [0.08, 0.08, 0.09];
  function drawHuman(p) {
    const B = Math.hypot(p.x - camState.eye[0], p.z - camState.eye[2]) < 40 ? bodyHi : bodyLo;
    const m = p.moving, wt = p.walkT, h = p.h || 1;
    mIdent(MA); tr(MA, p.x, p.y, p.z); ry(MA, p.yaw);
    if (p.state === 'dead') { tr(MA, 0, 0.14, 0); rx(MA, Math.PI / 2 * p.fall); }
    else if (p.state === 'ragdoll') { tr(MA, 0, 0.9, 0); rx(MA, p.spin); tr(MA, 0, -0.9, 0); }
    sc(MA, h * (p.bw || 1), h, h);
    drawMesh(B.torso, MA, p.shirt, p.pants, 1);
    // Beine: Hüfte schwingt, das Knie beugt sich beim Vorschwingen
    for (const s of [-1, 1]) {
      const knee = m * (0.08 + 0.95 * Math.max(0, -s * Math.cos(wt)));
      mCopy(MB, MA); tr(MB, s * 0.095, 0.92, 0); rx(MB, Math.sin(wt) * 0.5 * m * s); drawMesh(B.thigh, MB, p.pants);
      tr(MB, 0, -0.44, 0); rx(MB, knee); drawMesh(B.shin, MB, p.pants);
    }
    // Arme: Schulter, Ellbogen, Hand
    for (const s of [-1, 1]) {
      const isRight = s < 0;
      let a = -Math.sin(wt) * 0.52 * m * s, elbow = -(0.15 + Math.max(0, -a) * 0.8), spread = s * 0.07;
      if (isRight && (p.aim || p.punchT > 0)) { a = -Math.PI / 2 + (p.aimPitch || 0); elbow = 0; spread = 0; }
      if (!isRight && p.aim && p.twoHand) { a = -Math.PI / 2 + (p.aimPitch || 0) + 0.15; elbow = -0.25; spread = -s * 0.45; }
      mCopy(MB, MA); tr(MB, s * 0.2, 1.45, 0); rz(MB, spread); rx(MB, a);
      drawMesh(p.sleeve ? B.armLong : B.armShort, MB, p.shirt, p.skin);
      tr(MB, 0, -0.29, 0); rx(MB, elbow);
      drawMesh(p.sleeve ? B.foreSleeve : B.fore, MB, p.skin, p.shirt);
      if (isRight && p.aim && p.gunLen) {
        mCopy(MC, MB); tr(MC, 0, -0.27 - p.gunLen / 2, 0.05); sc(MC, 0.06, p.gunLen, 0.1); part(MC, GUN);
        mCopy(MC, MB); tr(MC, 0, -0.3, -0.01); sc(MC, 0.045, 0.05, 0.1); part(MC, GUN);
      }
    }
    drawMesh(B.head, MA, p.skin);
    if (p.kind === 'cop') { drawMesh(B.hairShort, MA, p.hair); drawMesh(B.hat, MA); }
    else if (p.hairStyle === 1) drawMesh(B.hairLong, MA, p.hair);
    else if (p.hairStyle !== 2) drawMesh(B.hairShort, MA, p.hair);
  }
  function drawCar(c) {
    mIdent(MA); tr(MA, c.x, c.y, c.z); ry(MA, c.yaw);
    drawMesh(c.mesh, MA, c.paint, c.paint2, 1);
    if (c.siren && c.type === 'police' && Math.floor(nowT * 6) % 2 === 0) {
      mCopy(MB, MA); tr(MB, (Math.floor(nowT * 3) % 2 ? 0.32 : -0.32), c.T.H + 0.1, 0); sc(MB, 0.7, 0.28, 0.4);
      part(MB, Math.floor(nowT * 3) % 2 ? [0.3, 0.45, 1] : [1, 0.2, 0.2], true);
    }
  }

  // ================= Spieler & Waffen =================
  const WEAPONS = {
    fist: { name: 'FAUST', dmg: 15, range: 2.0, rate: 0.42 },
    pistol: { name: 'PISTOLE', dmg: 30, range: 75, rate: 0.26, spread: 0.01, price: 250, ammoPrice: 60, ammoAmt: 36, start: 48, gun: 0.22, clip: 12, reload: 1.1, driveby: true },
    uzi: { name: 'UZI', dmg: 17, range: 55, rate: 0.075, auto: true, spread: 0.04, price: 800, ammoPrice: 120, ammoAmt: 120, start: 150, gun: 0.3, clip: 30, reload: 1.4, driveby: true },
    shotgun: { name: 'SCHROT', dmg: 14, pellets: 8, range: 30, rate: 0.95, spread: 0.09, price: 1200, ammoPrice: 100, ammoAmt: 16, start: 24, gun: 0.6, two: true, clip: 6, reload: 2.0 },
    rifle: { name: 'GEWEHR', dmg: 34, range: 110, rate: 0.11, auto: true, spread: 0.016, price: 2500, ammoPrice: 200, ammoAmt: 90, start: 120, gun: 0.7, two: true, clip: 30, reload: 1.7 }
  };
  function ammoTotal(k) { return k === 'fist' ? Infinity : (player.weapons[k] || 0) + (player.clip[k] || 0); }
  function fillClip(k) {
    const w = WEAPONS[k], take = Math.min(w.clip - (player.clip[k] || 0), player.weapons[k] || 0);
    player.clip[k] = (player.clip[k] || 0) + take; player.weapons[k] -= take;
  }
  function giveAmmo(k, n) {
    if (player.weapons[k] == null) { player.weapons[k] = 0; player.clip[k] = 0; }
    player.weapons[k] += n; if (!player.clip[k]) fillClip(k);
  }
  // Aufgesammelte Waffe: neue Waffe oder nur Munition, falls man sie schon hat
  function lootWeapon(k, n) {
    const isNew = player.weapons[k] == null;
    giveAmmo(k, n); sfx('reload', 0.6);
    msg(isNew ? WLABEL[k] + ' erbeutet (+' + n + ' Schuss)' : 'Munition ' + WLABEL[k] + ' +' + n, 2);
  }
  function startReload() {
    const k = player.cur;
    if (k === 'fist' || player.reloadT > 0 || player.dead) return;
    if ((player.clip[k] || 0) >= WEAPONS[k].clip || !(player.weapons[k] > 0)) return;
    player.reloadT = WEAPONS[k].reload; sfx('reload', 0.6);
  }
  function updateReload(dt) {
    if (player.reloadT <= 0) return;
    player.reloadT -= dt;
    if (player.reloadT <= 0) { player.reloadT = 0; if (player.cur !== 'fist') fillClip(player.cur); }
  }
  const WORDER = ['fist', 'pistol', 'uzi', 'shotgun', 'rifle'];
  const WLABEL = { pistol: 'Pistole', uzi: 'Uzi', shotgun: 'Schrotflinte', rifle: 'Sturmgewehr' };
  const player = makePed('player', 0, 0);
  Object.assign(player, { hp: 100, armor: 0, money: 500, weapons: { fist: Infinity }, clip: {}, reloadT: 0, cur: 'fist', inCar: null, dead: false, grounded: true,
    shootT: 0, aimHold: 0, arrestT: 0, state: 'walk', skin: rgb('#c68a5e'), shirt: rgb('#f2f2f2'), pants: rgb('#2b4a7a'), hair: rgb('#1a1a1a'), hairStyle: 0, sleeve: false, h: 1, bw: 1 });
  const keys = {};
  const mouse = { l: false, r: false, clicked: false };
  let wanted = 0, evadeT = 0, seen = false, losT = 0, dispatchT = 0;
  let paused = false, menu = null, talkPed = null, respawnT = 0, respawnAt = null;
  let shake = 0, nowT = 0, lackCool = 0, exportCool = 0, inLack = false, inExport = false;

  function switchWeapon(dir) {
    let i = WORDER.indexOf(player.cur);
    for (let n = 0; n < WORDER.length; n++) {
      i = (i + dir + WORDER.length) % WORDER.length;
      const w = WORDER[i];
      if (player.weapons[w] != null && ammoTotal(w) > 0) { if (w !== player.cur) player.reloadT = 0; player.cur = w; return; }
    }
  }
  function selectWeapon(n) { const w = WORDER[n]; if (w && player.weapons[w] != null && ammoTotal(w) > 0) { if (w !== player.cur) player.reloadT = 0; player.cur = w; } }
  function tryFire() {
    if (player.dead || paused || wheelOpen) return;
    const w = WEAPONS[player.cur];
    if (player.inCar && !(ctl.aim && w.driveby)) return;
    if (player.shootT > 0 || player.reloadT > 0) return;
    if (!w.auto && !mouse.clicked) return;
    mouse.clicked = false;
    player.shootT = w.rate;
    if (player.cur === 'fist') punch(); else fireGun(w);
  }
  function punch() {
    player.punchT = 0.25; player.yaw = camState.yaw;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    let best = null, bd = 2.1;
    for (const p of peds) {
      if (p.state === 'dead' || p.kind === 'giver') continue;
      const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.35) { bd = d; best = p; }
    }
    sfx(best ? 'punch' : 'swing', 0.6);
    if (best) damagePed(best, WEAPONS.fist.dmg, fx, fz, 'player', Math.random() < 0.3 ? 3 : 0);
  }
  function raycastAll(ox, oy, oz, dx, dy, dz, maxT, minT) {
    const res = { t: rayWorld(ox, oy, oz, dx, dy, dz, maxT), ped: null, car: null };
    const a = dx * dx + dz * dz;
    if (a > 1e-6) for (const p of peds) {
      if (p.state === 'dead' || p.kind === 'giver') continue;
      const px = p.x - ox, pz = p.z - oz, t0 = (px * dx + pz * dz) / a;
      if (t0 < minT || t0 > res.t + 1) continue;
      const r = 0.42 + t0 * 0.006, ex = px - dx * t0, ez = pz - dz * t0, d2 = ex * ex + ez * ez;
      if (d2 > r * r) continue;
      const t = t0 - Math.sqrt((r * r - d2) / a), y = oy + dy * t;
      if (t > minT && t < res.t && y > p.y - 0.1 && y < p.y + 1.95) { res.t = t; res.ped = p; res.car = null; }
    }
    for (const c of cars) {
      if (c === player.inCar) continue;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rxv = -fz, rzv = fx;
      const lx = (ox - c.x) * rxv + (oz - c.z) * rzv, lz = (ox - c.x) * fx + (oz - c.z) * fz;
      const ldx = dx * rxv + dz * rzv, ldz = dx * fx + dz * fz;
      const t = rayBox(lx, oy, lz, ldx, dy, ldz, -c.T.Wd / 2, c.y + 0.1, -c.T.L / 2, c.T.Wd / 2, c.y + c.T.H, c.T.L / 2);
      if (t > minT && t < res.t) { res.t = t; res.car = c; res.ped = null; }
    }
    return res;
  }
  function fireGun(w) {
    const cur = player.cur;
    if (!(player.clip[cur] > 0)) {
      if (player.weapons[cur] > 0) startReload();
      else { msg('Keine Munition!', 1.2); sfx('click', 0.5); switchWeapon(-1); }
      return;
    }
    player.clip[cur]--;
    player.aimHold = 0.9;
    const e = camState.eye, d = camState.dir;
    let mx, my, mz;
    if (player.inCar) {
      const c = player.inCar; mx = c.x + d[0] * 1.3; mz = c.z + d[2] * 1.3; my = c.y + 1.3;
    } else {
      player.yaw = camState.yaw;
      const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
      mx = player.x + fx * 0.75 - fz * 0.3; mz = player.z + fz * 0.75 + fx * 0.3; my = player.y + 1.42;
    }
    rumble(w.pellets ? 0.8 : 0.35, 0.5, w.pellets ? 140 : 70);
    if (player.clip[cur] === 0 && player.weapons[cur] > 0) setTimeout(() => { if (player.cur === cur) startReload(); }, 150);
    const minT = camState.dist + 0.3;
    const n = w.pellets || 1;
    for (let k = 0; k < n; k++) {
      let dx = d[0] + rand(-w.spread, w.spread), dy = d[1] + rand(-w.spread, w.spread) * 0.7, dz = d[2] + rand(-w.spread, w.spread);
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const maxT = w.range + camState.dist;
      const h = raycastAll(e[0], e[1], e[2], dx, dy, dz, maxT, minT);
      const hx = e[0] + dx * h.t, hy = e[1] + dy * h.t, hz = e[2] + dz * h.t;
      tracers.push({ x0: mx, y0: my, z0: mz, x1: hx, y1: hy, z1: hz, life: 0.07 });
      if (h.ped) damagePed(h.ped, w.dmg, dx, dz, 'player', (w.pellets && h.t - camState.dist < 7) ? 4 : 0);
      else if (h.car) {
        damageCar(h.car, w.dmg * 0.22, true); spawnSparks(hx, hy, hz, 4);
        if (h.car.driver && h.car.driver !== player && h.car.mode === 'traffic') h.car.flee = true;
      } else if (h.t < maxT - 0.01) for (let i = 0; i < 3; i++) addParticle(hx, hy, hz, rand(-1, 1), rand(0.5, 2), rand(-1, 1), 0.4, 0.08, [0.6, 0.58, 0.52], -6);
    }
    addParticle(mx, my, mz, 0, 0, 0, 0.05, 0.28, [1, 0.9, 0.5], 0);
    sfx(cur, 0.8);
    crime('shoot', null);
    panicAround(player.x, player.z, 28);
  }

  // ================= Fahndung & Polizei =================
  function copSees(r) {
    const px = player.inCar ? player.inCar.x : player.x, pz = player.inCar ? player.inCar.z : player.z;
    for (const p of peds) {
      if (p.kind !== 'cop' || p.state === 'dead' || p.state === 'ragdoll') continue;
      if (Math.hypot(p.x - px, p.z - pz) < r && losClear(p.x, 1.6, p.z, px, 1.4, pz)) return true;
    }
    for (const c of cars) {
      if (c.type !== 'police' || !c.driver || c.driver === player || c.wreck) continue;
      if (Math.hypot(c.x - px, c.z - pz) < r * 1.15 && losClear(c.x, 1.4, c.z, px, 1.4, pz)) return true;
    }
    return false;
  }
  function setWanted(n) {
    n = clamp(n, 0, 5);
    if (n > wanted) { sfx('wanted', 0.5); }
    wanted = n; evadeT = 0;
  }
  function crime(kind, victim) {
    if (player.dead) return;
    const sees = copSees(kind === 'shoot' ? 40 : 55);
    const cop = victim && victim.kind === 'cop';
    let target = wanted;
    if (kind === 'kill') { if (cop) target = Math.max(wanted + 1, 2); else if (sees || Math.random() < 0.3) target = wanted >= 2 ? wanted + (Math.random() < 0.4 ? 1 : 0) : wanted + 1; }
    else if (kind === 'hurt') { if (cop) target = Math.max(wanted, 1); else if (sees) target = Math.max(wanted, 1); }
    else if (kind === 'shoot' || kind === 'steal' || kind === 'rob') { if (sees) target = Math.max(wanted, 1); }
    else if (kind === 'copcar') target = Math.max(wanted, 1);
    else if (kind === 'stealcop') target = Math.max(wanted, 2);
    if (target > wanted) setWanted(Math.min(5, target));
    if (sees && wanted > 0) evadeT = 0;
  }
  function calmPolice() {
    for (const c of cars) if (c.mode === 'chase') { c.mode = 'traffic'; c.ai = null; c.siren = false; }
    for (const p of peds) if (p.kind === 'cop' && p.state === 'attack') { if (p.car && !p.car.wreck && !p.car.driver) p.state = 'return'; else rehome(p); }
  }
  function roadSpawnPoint(minD, maxD) {
    for (let tries = 0; tries < 40; tries++) {
      const k = randi(0, N), m = randi(0, N - 1), t = rand(0.15, 0.85), dirn = Math.random() < 0.5 ? 1 : -1, horiz = Math.random() < 0.5;
      const s = m * P + ROAD + t * BLOCK;
      let x, z, yaw;
      if (horiz) { x = s; z = roadC(k) + dirn * LANE; yaw = dirn > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { x = roadC(k) - dirn * LANE; z = s; yaw = dirn > 0 ? 0 : Math.PI; }
      const d = Math.hypot(x - player.x, z - player.z);
      if (d < minD || d > maxD) continue;
      if (cars.some((c) => Math.hypot(c.x - x, c.z - z) < 8)) continue;
      return { x: x, z: z, yaw: yaw };
    }
    return null;
  }
  function spawnTraffic(minD, maxD) {
    const sp = roadSpawnPoint(minD, maxD); if (!sp) return null;
    const r = Math.random();
    const type = r < 0.4 ? 'sedan' : r < 0.55 ? 'taxi' : r < 0.7 ? 'van' : r < 0.85 ? 'pickup' : r < 0.94 ? 'sport' : 'police';
    const c = spawnCar(type, sp.x, sp.z, sp.yaw, 'traffic');
    c.driver = makePed(type === 'police' ? 'cop' : 'civ', sp.x, sp.z); c.driver.inCar = c;
    return c;
  }
  function spawnChaser() {
    const sp = roadSpawnPoint(70, 150); if (!sp) return;
    const c = spawnCar('police', sp.x, sp.z, sp.yaw, 'chase');
    c.driver = makePed('cop', sp.x, sp.z); c.driver.inCar = c; c.siren = true;
  }
  function updateWanted(dt) {
    dispatchT -= dt; losT -= dt;
    if (wanted <= 0) { seen = false; return; }
    if (losT <= 0) {
      losT = 0.3; seen = copSees(65);
      const px = player.inCar ? player.inCar.x : player.x, pz = player.inCar ? player.inCar.z : player.z;
      for (const p of peds) if (p.kind === 'cop' && (p.state === 'walk' || p.state === 'idle' || p.state === 'cross' || p.state === 'talk') && Math.hypot(p.x - px, p.z - pz) < 45) p.state = 'attack';
    }
    if (seen) evadeT = 0; else evadeT += dt;
    if (evadeT > 7 + wanted * 3.5) {
      wanted--; evadeT = 0;
      if (wanted === 0) { msg('Die Polizei hat dich aus den Augen verloren.', 3); calmPolice(); }
    }
    const want = Math.min(6, wanted + 1);
    let have = 0; for (const c of cars) if (c.mode === 'chase' && !c.wreck) have++;
    if (have < want && dispatchT <= 0) { dispatchT = 4 - wanted * 0.4; spawnChaser(); }
  }
  function stepAttacker(p, dt) {
    if (player.dead) { p.moving = Math.max(0, p.moving - dt * 4); return; }
    const tx = player.inCar ? player.inCar.x : player.x, tz = player.inCar ? player.inCar.z : player.z;
    const d = Math.hypot(tx - p.x, tz - p.z);
    if (p.kind === 'cop') {
      if (wanted === 0) { if (p.car && !p.car.wreck && !p.car.driver) p.state = 'return'; else rehome(p); return; }
      if (d > 75) { if (p.car && !p.car.wreck && !p.car.driver) p.state = 'return'; else moveTo(p, tx, tz, 5, dt); return; }
      if (wanted <= 1) {
        if (d > 1.3) moveTo(p, tx, tz, 5.2, dt); else p.moving = Math.max(0, p.moving - dt * 4);
        p.yaw += angDiff(p.yaw, Math.atan2(tx - p.x, tz - p.z)) * Math.min(1, 8 * dt);
        if (d < (player.inCar ? 3 : 1.8) && (!player.inCar || Math.abs(player.inCar.speed) < 1.5)) { player.arrestT += dt; p.punchT = 0.2; }
        return;
      }
    }
    p.hostile = true;
    p.yaw += angDiff(p.yaw, Math.atan2(tx - p.x, tz - p.z)) * Math.min(1, 8 * dt);
    p.losT = (p.losT || 0) - dt;
    if (p.losT <= 0) { p.losT = 0.4; p.los = losClear(p.x, 1.5, p.z, tx, 1.3, tz); }
    if (d > 13 || !p.los) moveTo(p, tx, tz, 4.8, dt);
    else if (d < 5) moveTo(p, p.x - (tx - p.x), p.z - (tz - p.z), 2.5, dt);
    else p.moving = Math.max(0, p.moving - dt * 4);
    p.yaw += angDiff(p.yaw, Math.atan2(tx - p.x, tz - p.z)) * Math.min(1, 10 * dt);
    p.aim = true; p.aimPitch = 0; p.gunLen = 0.22;
    p.shootT -= dt;
    if (p.shootT <= 0 && d < 45 && p.los) { p.shootT = rand(0.8, 1.5) - wanted * 0.07; npcShoot(p, tx, tz, d); }
  }
  function npcShoot(p, tx, tz, d) {
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const mx = p.x + fx * 0.75 - fz * 0.3, mz = p.z + fz * 0.75 + fx * 0.3, my = p.y + 1.42;
    const moving = player.inCar ? Math.abs(player.inCar.speed) : Math.hypot(player.vx, player.vz);
    const hit = Math.random() < clamp(0.62 - d * 0.012 - (moving > 5 ? 0.22 : 0), 0.08, 0.75);
    const ox = hit ? 0 : rand(-1.5, 1.5), oz = hit ? 0 : rand(-1.5, 1.5);
    tracers.push({ x0: mx, y0: my, z0: mz, x1: tx + ox, y1: player.y + 1.2 + rand(-0.4, 0.4), z1: tz + oz, life: 0.07 });
    addParticle(mx, my, mz, 0, 0, 0, 0.05, 0.25, [1, 0.9, 0.5], 0);
    sfx('pistol', 0.5, p.x, p.z);
    if (hit) { if (player.inCar) damageCar(player.inCar, 3, false); else damagePlayer(p.kind === 'cop' ? 5 + wanted : 7); }
  }
  function damagePlayer(amt) {
    if (player.dead) return;
    if (player.armor > 0) { const a = Math.min(player.armor, amt); player.armor -= a; amt -= a; }
    player.hp -= amt; shake = Math.max(shake, 0.15); rumble(0.6, 0.4, 140);
    if (player.hp <= 0) { player.hp = 0; wasted(); }
  }
  function leaveCarForce() {
    const c = player.inCar; if (!c) return;
    c.driver = null; c.mode = 'parked'; player.inCar = null;
    player.x = c.x + Math.cos(c.yaw) * (c.T.Wd / 2 + 0.7); player.z = c.z - Math.sin(c.yaw) * (c.T.Wd / 2 + 0.7); player.y = groundY(player.x, player.z);
  }
  function wasted() {
    leaveCarForce();
    player.dead = true; player.state = 'dead'; player.fall = 0; player.moving = 0;
    big('WASTED', 'Krankenhausrechnung: $100', '#c9c9c9', 4);
    sfx('wasted', 0.7);
    endPursuit(); failMission('Du bist gestorben.', true);
    player.money = Math.max(0, player.money - 100);
    respawnT = 4.2; respawnAt = 'hospital';
  }
  function busted() {
    if (player.dead) return;
    leaveCarForce();
    player.dead = true; player.state = 'idle'; player.moving = 0;
    big('BUSTED', 'Waffen beschlagnahmt · Kaution $100', '#5b8cff', 4);
    sfx('wasted', 0.7);
    player.weapons = { fist: Infinity }; player.clip = {}; player.reloadT = 0; player.cur = 'fist';
    endPursuit(); failMission('Du wurdest verhaftet.', true);
    player.money = Math.max(0, player.money - 100);
    respawnT = 4.2; respawnAt = 'police';
  }
  function endPursuit() { wanted = 0; evadeT = 0; calmPolice(); player.arrestT = 0; }
  function respawn() {
    const s = shopOf(respawnAt === 'police' ? 'police' : 'hospital');
    player.x = s.x + 2; player.z = s.z - 0.5; player.y = groundY(player.x, player.z);
    player.vx = player.vz = player.vy = 0; player.hp = 100; player.armor = 0; player.dead = false; player.state = 'walk'; player.fall = 0;
    player.yaw = Math.PI; camState.yaw = Math.PI; camState.pitch = 0.25;
    respawnAt = null;
  }

  // ================= Interaktion =================
  function nearShop() {
    for (const s of shops) if (!s.drive && s.kind !== 'export' && Math.hypot(player.x - s.x, player.z - s.z) < s.r + 0.5) return s;
    return null;
  }
  function nearCar() {
    let best = null, bd = 1e9;
    for (const c of cars) {
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < c.T.L / 2 + 1.6 && d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function nearPed() {
    let best = null, bd = 2.4;
    for (const p of peds) {
      if (p.state === 'dead' || p.state === 'ragdoll' || p.state === 'attack' || p.hostile) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function enterCar(c) {
    if (c.wreck || c.onFire) { msg('Die Karre ist Schrott.', 1.5); return; }
    if (c.driver && c.driver !== player) {
      const d = c.driver; c.driver = null; d.inCar = null;
      d.x = c.x + Math.cos(c.yaw) * (c.T.Wd / 2 + 0.8); d.z = c.z - Math.sin(c.yaw) * (c.T.Wd / 2 + 0.8); d.y = groundY(d.x, d.z);
      addPed(d);
      if (d.kind === 'cop') { d.state = 'attack'; d.car = null; crime('stealcop', d); }
      else { panic(d, player.x, player.z); crime('steal', d); }
      sfx('hit', 0.4);
    } else if (c.type === 'police' && !c.playerOwned) crime('stealcop', null);
    player.inCar = c; c.driver = player; c.mode = 'player'; c.ai = null; c.flee = false; c.deployed = false;
    if (c.type !== 'police') c.siren = false;
    // Einen geklauten Streifenwagen meldet die Polizei nur einmal; die Schrotflinte im Kofferraum gibt es auch nur einmal
    if (c.type === 'police') {
      c.playerOwned = true;
      if (!c.looted) { c.looted = true; lootWeapon('shotgun', randi(8, 16)); }
    }
    vehicleT = 3; ui({ vehicle: c.T.name.toUpperCase(), vehicleOn: true });
    sfx('door', 0.5);
  }
  function exitCar() {
    const c = player.inCar; if (!c) return;
    if (Math.abs(c.speed) > 9) { msg('Zu schnell zum Aussteigen!', 1.2); return; }
    leaveCarForce();
    if (insideBuilding(player.x, 1, player.z, 0.3)) { player.x = c.x - Math.cos(c.yaw) * (c.T.Wd / 2 + 0.7); player.z = c.z + Math.sin(c.yaw) * (c.T.Wd / 2 + 0.7); }
    player.yaw = c.yaw; player.vx = player.vz = 0;
    if (c.type === 'police') c.siren = false;
    sfx('door', 0.5);
  }
  function pressF() {
    if (player.dead || paused) return;
    if (player.inCar) { exitCar(); return; }
    const c = nearCar(); if (c) enterCar(c);
  }
  function pressE() {
    if (menu) { closeMenu(); return; }
    if (player.dead) return;
    if (player.inCar) {
      const c = player.inCar;
      if (c.type === 'police') { c.siren = !c.siren; msg(c.siren ? 'Sirene an' : 'Sirene aus', 1); } else sfx('horn', 0.6);
      return;
    }
    const s = nearShop(); if (s) { openShop(s); return; }
    if (tony && Math.hypot(tony.x - player.x, tony.z - player.z) < 2.6) { talkTony(); return; }
    const p = nearPed(); if (p) talkTo(p);
  }
  let menuSel = 0;
  function menuUi() {
    if (!menu) return;
    const cl = inputMode === 'pad' ? 'Verlassen (B)' : 'Verlassen (E / Esc)';
    if (menu.type === 'shop') ui({ shop: Object.assign({}, menu.view, { sel: menuSel }), dialog: null, closeLabel: cl });
    else ui({ dialog: Object.assign({}, menu.view, { sel: menuSel }), shop: null });
  }
  function menuMove(d) {
    if (!menu) return;
    const n = (menu.type === 'shop' ? menu.items : menu.options).length;
    if (n) { menuSel = (menuSel + d + n) % n; menuUi(); }
  }
  function openMenu(m, keep) {
    menu = m; paused = true; if (!keep) menuSel = 0;
    mouse.l = mouse.r = false;
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* egal */ }
  }
  function closeMenu() {
    menu = null; paused = false;
    if (talkPed && talkPed.state === 'talk') talkPed.state = 'walk';
    talkPed = null;
    ui({ shop: null, dialog: null });
    try { root.focus(); } catch (e) { /* egal */ }
  }
  function menuKey(n) {
    if (!menu) return;
    const list = menu.type === 'shop' ? menu.items : menu.options;
    const it = list[n];
    if (!it) return;
    if (menu.type === 'shop') { if (!it.disabled) it.buy(); } else it.pick();
  }
  const fmt = (n) => '$' + n;
  function shopItems(s) {
    const items = [];
    const add = (label, price, ok, fn) => items.push({ label: label, price: price ? fmt(price) : '', disabled: !ok || player.money < price, act: fn, cost: price });
    if (s.kind === 'waffen') {
      for (const k of WORDER) {
        if (k === 'fist') continue;
        const w = WEAPONS[k];
        if (player.weapons[k] == null) add(WLABEL[k] + ' kaufen', w.price, true, () => { giveAmmo(k, w.start); player.cur = k; player.reloadT = 0; });
        else add('Munition ' + WLABEL[k] + ' +' + w.ammoAmt, w.ammoPrice, true, () => { giveAmmo(k, w.ammoAmt); });
      }
      add('Schutzweste', 200, player.armor < 100, () => { player.armor = 100; });
    } else if (s.kind === 'spaeti') {
      add('Energy-Drink (+15 Gesundheit)', 5, player.hp < 100, () => { player.hp = Math.min(100, player.hp + 15); });
      add('Döner (+40 Gesundheit)', 15, player.hp < 100, () => { player.hp = Math.min(100, player.hp + 40); });
      add('Erste-Hilfe-Kasten (voll)', 60, player.hp < 100, () => { player.hp = 100; });
    } else if (s.kind === 'kleider') {
      const outfits = [['Lässig', 50, '#f2f2f2', '#2b4a7a'], ['Hawaii', 90, '#e67e22', '#d8c9a3'], ['Ganove', 120, '#2e7d32', '#1b1b1b'], ['Sportlich', 80, '#c0392b', '#222222'], ['Anzug', 300, '#1d2733', '#1d2733']];
      for (const o of outfits) add(o[0], o[1], true, () => { player.shirt = rgb(o[2]); player.pants = rgb(o[3]); });
    } else if (s.kind === 'hospital') {
      add('Behandlung (volle Gesundheit)', 80, player.hp < 100, () => { player.hp = 100; });
    } else if (s.kind === 'police') {
      add('Kaution zahlen: Fahndung löschen', 250 * Math.max(1, wanted), wanted > 0, () => { endPursuit(); });
    }
    return items;
  }
  const SHOPSUB = { waffen: 'Alles, was knallt. Keine Fragen.', spaeti: 'Rund um die Uhr geöffnet.', kleider: 'Neuer Look, neues Glück.', hospital: 'Wir flicken dich zusammen.', police: 'Was können wir für Sie tun?' };
  function openShop(s, keep) {
    const items = shopItems(s);
    items.forEach((it) => { it.buy = () => { if (it.disabled) return; player.money -= it.cost; it.act(); sfx('cash', 0.6); rumble(0.1, 0.3, 60); openShop(s, true); }; });
    openMenu({ type: 'shop', items: items, shop: s, view: { title: s.name, sub: SHOPSUB[s.kind] + '  Dein Geld: ' + fmt(Math.floor(player.money)), items: items } }, keep);
    menuUi();
  }
  function openDialog(name, text, options) {
    options.forEach((o) => { o.pick = () => { if (o.act) o.act(); else closeMenu(); }; });
    openMenu({ type: 'dialog', options: options, view: { name: name, text: text, options: options } });
    menuUi();
  }
  const LINES = ['Na, alles klar bei dir?', 'Heißer Tag heute, was?', 'Ich hab gehört, Tony am Hafen sucht Leute für krumme Dinger.', 'Pass auf, die Bullen sind heute überall.',
    'Der Döner im Späti ist der beste der Stadt.', 'Wenn dich die Polizei sucht: Spray & Weg in der Altstadt. Neue Farbe, keine Fragen.', 'Lass mich in Ruhe, ich hab einen schlechten Tag.',
    'Schicke Klamotten. Nicht.', 'Bei Kugel & Co. gibt es alles, was knallt.', 'Die Export-Garage am Hafen kauft geklaute Karren. Hab ich zumindest gehört.',
    'Weißt du, wie spät es ist? Egal, ich hab eh nichts vor.', 'Mein Cousin fährt Taxi. Fährt wie ein Irrer.', 'Downtown wird jedes Jahr teurer. Ich zieh nach Palmenhain.'];
  function talkTo(p) {
    talkPed = p; p.state = 'talk';
    if (p.kind === 'cop') {
      openDialog('Polizist', pick(['Weitergehen, hier gibt es nichts zu sehen.', 'Schönen Tag noch, Bürger.', 'Halten Sie sich von Ärger fern.']), [{ label: 'Tschüss' }]);
      return;
    }
    openDialog('Passant', pick(LINES), [{ label: 'Weiter quatschen', act: () => talkTo(p) }, { label: 'Ausrauben', act: () => rob(p) }, { label: 'Tschüss' }]);
  }
  function rob(p) {
    closeMenu();
    if (player.cur === 'fist' && Math.random() < 0.55) { msg('"Mit den Fäusten? Vergiss es!"', 2); panic(p, player.x, player.z); return; }
    const amt = Math.min(p.cash, randi(15, 90)); p.cash -= amt;
    player.money += amt; sfx('cash', 0.6); msg('Ausgeraubt: +' + fmt(amt), 2);
    panic(p, player.x, player.z); crime('rob', p);
  }

  // ================= Aufträge =================
  let tony = null, mission = null, missionIdx = 0, missionLevel = 1;
  const MISSIONS = [
    { id: 'export', title: 'Exportgeschäft', text: 'Ein Kunde aus Übersee will einen Sportwagen. Am Palmenhain parkt ein roter Flitzer. Klau ihn und bring ihn heil in die Export-Garage hier am Hafen.', reward: 1500 },
    { id: 'courier', title: 'Heiße Ware', text: 'Hol ein Paket am Späti ab und bring es zum Villenhügel. Du hast 90 Sekunden. Keine Fragen, keine Umwege.', reward: 900 },
    { id: 'hit', title: 'Alte Rechnung', text: 'Vito schuldet mir viel Geld. Er hängt mit zwei Leibwächtern in der Altstadt rum. Erledige das. Ohne Knarre brauchst du gar nicht erst hinfahren.', reward: 2000 }
  ];
  function talkTony() {
    if (mission) { openDialog('Tony', 'Was stehst du hier noch rum? Du hast einen Job zu erledigen.', [{ label: 'Bin schon weg' }, { label: 'Auftrag abbrechen', act: () => { closeMenu(); failMission('Auftrag abgebrochen.'); } }]); return; }
    const m = MISSIONS[missionIdx % MISSIONS.length], reward = Math.round(m.reward * missionLevel);
    openDialog('Tony – ' + m.title, m.text + '  Bezahlung: ' + fmt(reward) + '.', [{ label: 'Auftrag annehmen', act: () => { closeMenu(); startMission(m, reward); } }, { label: 'Später' }]);
  }
  function startMission(m, reward) {
    mission = { def: m, reward: reward, stage: 0, timer: 0, car: null, peds: [], target: null };
    if (m.id === 'export') {
      const b = blockRect(6, 3);
      const c = spawnCar('sport', roadC(6) + 5.6, b.cz, 0, 'parked');
      c.paint = rgb('#d4201a'); mission.car = c;
      setObjective('Klau den roten Sportwagen am Palmenhain.');
    } else if (m.id === 'courier') {
      const s = shopOf('spaeti'); mission.target = { x: s.x + 5, z: s.z };
      setObjective('Hol das Paket am Späti ab.');
    } else if (m.id === 'hit') {
      const b = blockRect(2, 1), z = b.z0 + 1.6;
      const v = addPed(makePed('target', b.cx, z));
      Object.assign(v, { name: 'Vito', hp: 150, state: 'stand', armed: true, shirt: rgb('#7a1f2b'), pants: rgb('#1b1b1b'), hair: rgb('#2b1b10'), cash: 400 });
      mission.peds.push(v); mission.vito = v;
      for (const o of [-2.5, 2.5]) {
        const g = addPed(makePed('guard', b.cx + o, z + 0.6));
        Object.assign(g, { hp: 110, state: 'stand', armed: true, shirt: rgb('#151515'), pants: rgb('#151515'), cash: 80 });
        mission.peds.push(g);
      }
      setObjective('Erledige Vito in der Altstadt.');
    }
    msg(m.title, 3); sfx('mission', 0.5);
  }
  function setObjective(t) { objective = t; }
  function cleanupMission() {
    if (!mission) return;
    for (const p of mission.peds) if (p.state !== 'dead') { p.kind = 'civ'; p.hostile = false; rehome(p); }
    mission = null; setObjective(''); ui({ timer: '' });
  }
  function passMission() {
    const r = mission.reward;
    player.money += r; big('AUFTRAG ERFÜLLT!', '+' + fmt(r), '#f2c94c', 4); sfx('mission', 0.8);
    cleanupMission();
    missionIdx++; if (missionIdx % MISSIONS.length === 0) missionLevel *= 1.5;
  }
  function failMission(reason, silent) {
    if (!mission) return;
    if (!silent) big('AUFTRAG GESCHEITERT', reason, '#e05a4f', 3.5);
    cleanupMission();
  }
  function updateMission(dt) {
    if (!mission) return;
    const m = mission, id = m.def.id;
    if (id === 'export') {
      const c = m.car;
      if (c.wreck || c.onFire) { failMission('Der Sportwagen ist Schrott.'); return; }
      if (m.stage === 0 && player.inCar === c) { m.stage = 1; const g = shopOf('export'); m.target = { x: g.x, z: g.z }; setObjective('Bring den Wagen in die Export-Garage am Hafen.'); }
      if (m.stage === 1 && player.inCar !== c && !player.dead) setObjective('Steig wieder in den Sportwagen.');
      if (m.stage === 1 && player.inCar === c) {
        setObjective(wanted > 0 ? 'Hänge erst die Polizei ab!' : 'Bring den Wagen in die Export-Garage am Hafen.');
        if (Math.hypot(c.x - m.target.x, c.z - m.target.z) < 4 && Math.abs(c.speed) < 3 && wanted === 0) {
          m.reward = Math.round(m.reward * (0.5 + 0.5 * c.hp / 100));
          leaveCarForce(); cars.splice(cars.indexOf(c), 1); passMission();
        }
      }
    } else if (id === 'courier') {
      const px = player.inCar ? player.inCar.x : player.x, pz = player.inCar ? player.inCar.z : player.z;
      if (m.stage === 0 && Math.hypot(px - m.target.x, pz - m.target.z) < 3) {
        m.stage = 1; m.timer = 90; const b = blockRect(3, 6); m.target = { x: b.cx, z: b.z0 + 1.6 };
        setObjective('Bring das Paket zum Villenhügel!'); sfx('cash', 0.5);
      } else if (m.stage === 1) {
        m.timer -= dt;
        if (m.timer <= 0) { failMission('Zu spät! Das Paket ist wertlos.'); return; }
        if (Math.hypot(px - m.target.x, pz - m.target.z) < 3.5) passMission();
      }
    } else if (id === 'hit') {
      if (m.vito.state === 'dead') { passMission(); return; }
      if (m.peds.some((p) => p.hostile || p.state === 'attack')) for (const p of m.peds) if (p.state === 'stand') { p.state = 'attack'; p.hostile = true; }
    }
  }
  function onPedKilled(p, src) {
    if (p.cash > 0) { pickups.push({ x: p.x + rand(-0.4, 0.4), z: p.z + rand(-0.4, 0.4), amount: p.cash, t: 0 }); p.cash = 0; }
    // Polizisten lassen ihre Dienstwaffe fallen: meist eine Pistole, bei hoher Fahndung auch mal eine Schrotflinte
    if (p.kind === 'cop' && !p.dropped) {
      p.dropped = true;
      const w = wanted >= 3 && Math.random() < 0.35 ? 'shotgun' : 'pistol';
      pickups.push({ x: p.x + rand(-0.5, 0.5), z: p.z + rand(-0.5, 0.5), w: w, ammo: w === 'shotgun' ? randi(6, 12) : randi(12, 30), t: 0 });
    }
    if (src === 'player') panicAround(p.x, p.z, 30);
  }
  let objective = '', vehicleT = 0;

  // ================= Kamera & Tageszeit =================
  const camState = { yaw: Math.PI, pitch: 0.25, dist: 4.2, curDist: 4.2, eye: [0, 5, 0], dir: [0, 0, 1], lastInput: 0, aimT: 0, mode: 1 };
  const CAM_MODES = [{ n: 'Nah', k: 0.72 }, { n: 'Mittel', k: 1 }, { n: 'Weit', k: 1.45 }];
  let clockH = 13.0, started = false, attractA = 0, gamePaused = false;
  function cycleCam() { camState.mode = (camState.mode + 1) % CAM_MODES.length; msg('Kamera: ' + CAM_MODES[camState.mode].n, 1.2); }
  function updateCamera(dt) {
    let tx, ty, tz, dist;
    const c = player.inCar;
    const aimingNow = started && !player.dead && !wheelOpen && ctl.aim && (c ? !!WEAPONS[player.cur].driveby : player.cur !== 'fist');
    camState.aimT += ((aimingNow ? 1 : 0) - camState.aimT) * Math.min(1, 10 * dt);
    const mk = CAM_MODES[camState.mode].k, at = camState.aimT;
    if (!started) {
      attractA += dt * 0.05;
      const cx = W / 2 + Math.cos(attractA) * 150, cz = W / 2 + Math.sin(attractA) * 150;
      camState.eye[0] = cx; camState.eye[1] = 70; camState.eye[2] = cz;
      const dx = W / 2 - cx, dy = 8 - 70, dz = W / 2 - cz, l = Math.hypot(dx, dy, dz);
      camState.dir[0] = dx / l; camState.dir[1] = dy / l; camState.dir[2] = dz / l; camState.dist = 0;
      return;
    }
    if (c) {
      tx = c.x; ty = c.y + 1.7; tz = c.z; dist = lerp((6.5 + c.T.L * 0.55) * mk, 4.6, at * 0.7);
      if (nowT - camState.lastInput > 1.2 && Math.abs(c.speed) > 2 && at < 0.1) {
        const want = c.speed >= 0 ? c.yaw : c.yaw + Math.PI;
        camState.yaw += angDiff(camState.yaw, want) * Math.min(1, 2.2 * dt);
        camState.pitch += (0.2 - camState.pitch) * Math.min(1, 1.5 * dt);
      }
    } else {
      const rxv = -Math.cos(camState.yaw), rzv = Math.sin(camState.yaw);
      const sh = player.dead ? 0 : lerp(0.55, 0.78, at);
      tx = player.x + rxv * sh; ty = player.y + lerp(1.65, 1.58, at); tz = player.z + rzv * sh; dist = player.dead ? 7 : lerp(4.2 * mk, 2.1, at);
    }
    camState.pitch = clamp(camState.pitch, -0.45, 1.2);
    const yaw = camState.yaw + (ctl.lookBack && !aimingNow ? Math.PI : 0);
    const cp = Math.cos(camState.pitch), sp = Math.sin(camState.pitch);
    const dx = Math.sin(yaw) * cp, dy = -sp, dz = Math.cos(yaw) * cp;
    let dd = dist;
    for (let s = 0.4; s <= dist; s += 0.35) {
      const ex = tx - dx * s, ey = ty - dy * s, ez = tz - dz * s;
      if (ey < 0.35 || insideBuilding(ex, ey, ez, 0.25)) { dd = Math.max(0.5, s - 0.35); break; }
    }
    camState.curDist += (dd - camState.curDist) * Math.min(1, (dd < camState.curDist ? 18 : 3) * dt);
    camState.dist = camState.curDist;
    const sx = shake > 0 ? rand(-shake, shake) * 0.3 : 0, sy = shake > 0 ? rand(-shake, shake) * 0.3 : 0;
    camState.eye[0] = tx - dx * camState.curDist + sx; camState.eye[1] = ty - dy * camState.curDist + sy; camState.eye[2] = tz - dz * camState.curDist;
    camState.dir[0] = dx; camState.dir[1] = dy; camState.dir[2] = dz;
  }
  const L3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const SKY = { dayTop: [0.30, 0.55, 0.90], dayFog: [0.74, 0.82, 0.90], duskTop: [0.32, 0.30, 0.55], duskFog: [0.98, 0.58, 0.36], nightTop: [0.02, 0.03, 0.08], nightFog: [0.06, 0.07, 0.12] };
  const light = { sun: [0, 1, 0], sunC: [1, 1, 1], amb: [0.4, 0.4, 0.4], fog: [0.7, 0.8, 0.9], top: [0.3, 0.5, 0.9], night: 0 };
  function updateLight() {
    const ang = (clockH - 6) / 12 * Math.PI, el = Math.sin(ang);
    const day = clamp(el * 3 + 0.2, 0, 1), dusk = clamp(1 - Math.abs(el) * 3.2, 0, 1);
    light.night = clamp(-el * 4 + 0.35, 0, 1);
    let sx = Math.cos(ang) * 0.75, sy = Math.max(0.08, Math.abs(el)), sz = 0.45;
    if (el < 0) { sx = -sx; }
    const l = Math.hypot(sx, sy, sz); light.sun = [sx / l, sy / l, sz / l];
    const top = L3(L3(SKY.nightTop, SKY.dayTop, day), SKY.duskTop, dusk * 0.7);
    const fog = L3(L3(SKY.nightFog, SKY.dayFog, day), SKY.duskFog, dusk * 0.75);
    light.top = top; light.fog = fog;
    light.sunC = el > 0 ? L3([1.0, 0.95, 0.85], [1.0, 0.6, 0.35], dusk) : [0.22, 0.27, 0.42];
    if (el > 0) light.sunC = light.sunC.map((v) => v * (0.55 + 0.45 * day));
    light.amb = L3([0.10, 0.11, 0.18], [0.42, 0.45, 0.52], day);
  }

  // ================= Rendering =================
  const VP = m4(), PR = m4(), VW = m4();
  let cw = 0, chh = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr)), h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (w !== cw || h !== chh) { cw = w; chh = h; canvas.width = w; canvas.height = h; }
  }
  function visible(x, z, r) {
    const e = camState.eye, d = camState.dir;
    const dx = x - e[0], dz = z - e[2], dist = Math.hypot(dx, dz);
    if (dist > 230 + r) return false;
    if (dist < 12 + r) return true;
    return (dx * d[0] + dz * d[2]) / dist > 0.35;
  }
  function render() {
    resize();
    gl.viewport(0, 0, cw, chh);
    gl.clearColor(light.fog[0], light.fog[1], light.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const e = camState.eye, d = camState.dir;
    mPersp(PR, (player.inCar ? 64 - 10 * camState.aimT : 58 - 12 * camState.aimT) * Math.PI / 180, cw / chh, 0.15, 900);
    mLookAt(VW, e[0], e[1], e[2], e[0] + d[0], e[1] + d[1], e[2] + d[2]);
    mMul(VP, PR, VW);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uVP, false, VP);
    gl.uniform3fv(U.uSun, light.sun); gl.uniform3fv(U.uSunC, light.sunC); gl.uniform3fv(U.uAmb, light.amb);
    gl.uniform3fv(U.uFog, light.fog); gl.uniform3fv(U.uCam, e);
    gl.uniform1f(U.uFogD, lerp(330, 230, light.night)); gl.uniform1f(U.uNight, light.night);
    // Himmel
    gl.depthMask(false);
    mIdent(MA); tr(MA, e[0], e[1], e[2]); drawMesh(skyMesh, MA, light.top, null, 1);
    gl.depthMask(true);
    drawMesh(worldMesh, IDM, null, null, 1);
    for (const c of cars) if (visible(c.x, c.z, 4)) drawCar(c);
    for (const p of peds) if (visible(p.x, p.z, 2)) drawHuman(p);
    if (started && !player.inCar) drawHuman(player);
    if (tony) { mIdent(MA); tr(MA, tony.x, tony.y + 2.35 + Math.sin(nowT * 3) * 0.12, tony.z); ry(MA, nowT * 2); sc(MA, 0.35, 0.35, 0.35); part(MA, [1, 0.8, 0.15], true); }
    for (const k of pickups) {
      mIdent(MA); tr(MA, k.x, groundY(k.x, k.z) + 0.45 + Math.sin(nowT * 4 + k.x) * 0.08, k.z); ry(MA, nowT * 2.5);
      if (!k.w) { sc(MA, 0.42, 0.24, 0.12); part(MA, [0.25, 0.8, 0.3], true); continue; }
      // Waffe: Lauf und Griff, leuchtend blau
      const len = k.w === 'shotgun' ? 0.8 : 0.42, col = [0.35, 0.7, 1];
      mCopy(MB, MA); sc(MB, len, 0.11, 0.08); part(MB, col, true);
      mCopy(MB, MA); tr(MB, -len * 0.3, -0.11, 0); rz(MB, -0.25); sc(MB, 0.09, 0.2, 0.07); part(MB, col, true);
    }
    // Transparentes
    gl.enable(gl.BLEND); gl.depthMask(false);
    for (const c of cars) if (visible(c.x, c.z, 4)) { mIdent(MA); tr(MA, c.x, c.y + 0.03, c.z); ry(MA, c.yaw); sc(MA, c.T.Wd * 0.62, 1, c.T.L * 0.58); drawMesh(diskMesh, MA, SHADOW, null, 0.4); }
    const shadowP = (p) => { mIdent(MA); tr(MA, p.x, groundY(p.x, p.z) + 0.03, p.z); sc(MA, p.state === 'dead' ? 0.9 : 0.45, 1, p.state === 'dead' ? 0.9 : 0.45); drawMesh(diskMesh, MA, p.state === 'dead' ? [0.35, 0.02, 0.02] : SHADOW, null, p.state === 'dead' ? 0.6 : 0.35); };
    for (const p of peds) if (visible(p.x, p.z, 2)) shadowP(p);
    if (started && !player.inCar) shadowP(player);
    if (light.night > 0.05) for (const l of lamps) if (visible(l.x, l.z, 6)) { mIdent(MA); tr(MA, l.x, 0.04, l.z); sc(MA, 4.5, 1, 4.5); drawMesh(diskMesh, MA, [1, 0.8, 0.45], null, 0.22 * light.night); }
    const marker = (x, z, r, col, h) => { mIdent(MA); tr(MA, x, groundY(x, z), z); sc(MA, r, h || 1.1, r); drawMesh(cylMesh, MA, col, null, 0.38 + Math.sin(nowT * 4) * 0.08); };
    if (started) {
      for (const s of shops) {
        if (s.kind === 'export' && !(mission && mission.def.id === 'export' && mission.stage === 1) && !(player.inCar && !mission)) continue;
        marker(s.x, s.z, s.r * (s.drive ? 1 : 0.8), s.color, s.drive ? 0.6 : 1.1);
      }
      if (tony && !mission) marker(tony.x, tony.z, 1.1, [1, 0.8, 0.15], 0.5);
      if (mission && mission.target && !(mission.def.id === 'export' && mission.stage === 0)) marker(mission.target.x, mission.target.z, 2.6, [1, 0.85, 0.2], 1.6);
    }
    for (const t of tracers) {
      const dx = t.x1 - t.x0, dy = t.y1 - t.y0, dz = t.z1 - t.z0, l = Math.hypot(dx, dy, dz) || 1;
      mIdent(MA); tr(MA, (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, (t.z0 + t.z1) / 2); ry(MA, Math.atan2(dx, dz)); rx(MA, -Math.asin(clamp(dy / l, -1, 1))); sc(MA, 0.035, 0.035, l);
      part(MA, [1, 0.9, 0.55], true, 0.7);
    }
    for (const q of particles) {
      mIdent(MA); tr(MA, q.x, q.y, q.z); ry(MA, q.x * 3); sc(MA, q.size, q.size, q.size);
      part(MA, q.col, true, clamp(q.life / q.max, 0, 1) * (q.grav > 0 ? 0.55 : 0.95));
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  // ================= Radar =================
  const rctx = radar.getContext('2d');
  function blipPos(x, z, px, pz, zoom, R) {
    let dx = (mapX(x) - mapX(px)) * zoom, dy = (mapY(z) - mapY(pz)) * zoom;
    const c = Math.cos(camState.yaw), s = Math.sin(camState.yaw);
    let bx = dx * c - dy * s, by = dx * s + dy * c;
    const d = Math.hypot(bx, by), edge = d > R;
    if (edge) { bx = bx / d * R; by = by / d * R; }
    return [100 + bx, 100 + by, edge];
  }
  function drawRadar() {
    const g = rctx, R = 88;
    const px = player.inCar ? player.inCar.x : player.x, pz = player.inCar ? player.inCar.z : player.z;
    const zoom = player.inCar ? 0.75 : 1.15;
    g.clearRect(0, 0, 200, 200);
    g.save();
    g.beginPath(); g.arc(100, 100, 96, 0, TAU); g.fillStyle = '#000'; g.fill();
    g.beginPath(); g.arc(100, 100, 92, 0, TAU); g.clip();
    g.translate(100, 100); g.rotate(camState.yaw); g.scale(zoom, zoom); g.translate(-mapX(px), -mapY(pz));
    g.drawImage(mapCanvas, 0, 0);
    g.restore();
    const blip = (x, z, col, label, size) => {
      const b = blipPos(x, z, px, pz, zoom, R);
      g.beginPath(); g.arc(b[0], b[1], size || 7, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke();
      if (label) { g.fillStyle = '#fff'; g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, b[0], b[1] + 0.5); }
    };
    for (const s of shops) { const c = s.color; blip(s.x, s.z, 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')', s.blip); }
    if (tony && !mission) blip(tony.x, tony.z, '#e2a12b', 'T');
    for (const c of cars) if (c.type === 'police' && c.driver && c.driver !== player && !c.wreck && (wanted > 0 || Math.hypot(c.x - px, c.z - pz) < 80)) blip(c.x, c.z, Math.floor(nowT * 4) % 2 ? '#2f5cff' : '#ff3030', null, 4);
    for (const p of peds) if (p.hostile && p.state !== 'dead') blip(p.x, p.z, '#ff3030', null, 4);
    if (mission) {
      if (mission.def.id === 'export' && mission.stage === 0) blip(mission.car.x, mission.car.z, '#f2c94c', null, 6);
      else if (mission.vito) blip(mission.vito.x, mission.vito.z, '#ff3030', null, 6);
      else if (mission.target) blip(mission.target.x, mission.target.z, '#f2c94c', null, 6);
    }
    // Spielerpfeil
    const py = player.inCar ? player.inCar.yaw : player.yaw;
    g.save(); g.translate(100, 100); g.rotate(camState.yaw - py);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke(); g.restore();
    const n = blipPos(px, pz + 1000, px, pz, 1, 86);
    g.fillStyle = '#fff'; g.font = '700 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', n[0], n[1]);
  }

  // ================= Sound (synthetisch) =================
  let AC = null, master = null, noiseBuf = null, eng = null, siren = null, muted = false;
  function initAudio() {
    if (AC) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const mk = (type) => { const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o.type = type; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0; o.connect(f); f.connect(g); g.connect(master); o.start(); return { o: o, f: f, g: g }; };
      eng = mk('sawtooth'); siren = mk('square'); siren.f.frequency.value = 2500;
    } catch (e) { AC = null; }
  }
  function env(node, t, a, peak, dec) { node.gain.setValueAtTime(0.0001, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  function noise(vol, dur, freq, type) {
    const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.value = freq; s.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.003, vol, dur); s.start(t); s.stop(t + dur + 0.05);
  }
  function tone(freq, vol, dur, type, slide) {
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    o.connect(g); g.connect(master); env(g, t, 0.005, vol, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  function sfx(name, vol, x, z) {
    if (!AC || muted) return;
    vol = vol == null ? 1 : vol;
    if (x != null) { const d = Math.hypot(x - camState.eye[0], z - camState.eye[2]); vol *= clamp(1 - d / 120, 0, 1); if (vol < 0.02) return; }
    try {
      switch (name) {
        case 'pistol': noise(0.5 * vol, 0.16, 2200); tone(160, 0.25 * vol, 0.1, 'square', 60); break;
        case 'uzi': noise(0.35 * vol, 0.08, 2600); break;
        case 'shotgun': noise(0.8 * vol, 0.35, 1200); tone(90, 0.4 * vol, 0.2, 'square', 40); break;
        case 'rifle': noise(0.5 * vol, 0.12, 3200); tone(200, 0.2 * vol, 0.08, 'square', 80); break;
        case 'boom': noise(1.0 * vol, 1.3, 500); tone(70, 0.7 * vol, 0.9, 'sine', 30); break;
        case 'crash': noise(0.6 * vol, 0.3, 900); break;
        case 'hit': noise(0.4 * vol, 0.12, 600); break;
        case 'punch': noise(0.35 * vol, 0.08, 500); tone(120, 0.3 * vol, 0.08, 'sine', 60); break;
        case 'swing': noise(0.1 * vol, 0.1, 1500, 'bandpass'); break;
        case 'cash': tone(1320, 0.18 * vol, 0.09, 'square'); setTimeout(() => { if (AC) tone(1760, 0.18 * vol, 0.14, 'square'); }, 80); break;
        case 'click': tone(900, 0.12 * vol, 0.03, 'square'); break;
        case 'reload': tone(700, 0.12 * vol, 0.04, 'square'); setTimeout(() => { if (AC) tone(480, 0.14 * vol, 0.05, 'square'); }, 260); break;
        case 'door': noise(0.25 * vol, 0.1, 400); break;
        case 'horn': tone(392, 0.2 * vol, 0.35, 'square'); tone(494, 0.15 * vol, 0.35, 'square'); break;
        case 'spray': noise(0.3 * vol, 1.0, 4000, 'highpass'); break;
        case 'wanted': tone(660, 0.15 * vol, 0.12, 'triangle'); setTimeout(() => { if (AC) tone(880, 0.15 * vol, 0.18, 'triangle'); }, 120); break;
        case 'mission': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { if (AC) tone(f, 0.18 * vol, 0.25, 'triangle'); }, i * 120)); break;
        case 'wasted': tone(220, 0.3 * vol, 1.6, 'sawtooth', 55); break;
      }
    } catch (e) { /* Ton ist optional */ }
  }
  function updateAudio() {
    if (!AC || !eng) return;
    const t = AC.currentTime;
    const c = player.inCar;
    const engVol = muted || !c ? 0 : 0.09, freq = c ? 42 + Math.abs(c.speed) * 3.4 + (ctl.thr > 0 ? 12 : 0) : 40;
    eng.g.gain.setTargetAtTime(engVol, t, 0.08); eng.o.frequency.setTargetAtTime(freq, t, 0.05);
    let sv = 0;
    if (!muted) for (const k of cars) if (k.siren && !k.wreck) { const d = Math.hypot(k.x - camState.eye[0], k.z - camState.eye[2]); sv = Math.max(sv, clamp(1 - d / 140, 0, 1) * 0.05); }
    siren.g.gain.setTargetAtTime(sv, t, 0.1);
    siren.o.frequency.setTargetAtTime(700 + Math.sin(nowT * 4.2) * 220, t, 0.03);
  }

  // ================= HUD =================
  let msgText = '', msgT = 0, bigT = 0, hudT = 0, zoneName = '', zoneT = 0, hintT = 0;
  function msg(t, d) { msgText = t; msgT = d || 2.5; }
  function big(t, sub, col, d) { bigT = d || 3; ui({ big: t, bigSub: sub || '', bigColor: col || '#ffffff' }); }
  const K = (k, p) => '[' + (inputMode === 'pad' ? p : k) + '] ';
  function hudTick(dt) {
    msgT -= dt; vehicleT -= dt; zoneT -= dt; hintT -= dt;
    if (bigT > 0) { bigT -= dt; if (bigT <= 0) ui({ big: '' }); }
    hudT -= dt; if (hudT > 0) return; hudT = 0.1;
    const z = zoneAt(player.x, player.z);
    if (z !== zoneName) { zoneName = z; zoneT = 3.5; }
    const cur = player.cur, w = WEAPONS[cur];
    const stars = [];
    const blink = wanted > 0 && !seen && Math.floor(nowT * 3) % 2 === 0;
    for (let i = 0; i < 5; i++) stars.push({ fill: i < wanted ? (blink ? '#7a6a3a' : '#e8c34a') : 'rgba(0,0,0,0.35)' });
    let prompt = '';
    if (!player.dead && !paused && !gamePaused) {
      if (player.inCar) {
        const L = [K('F', 'Y') + 'Aussteigen', K('E', 'L3') + (player.inCar.type === 'police' ? 'Sirene' : 'Hupe')];
        if (w.driveby) L.push(K('Rechte Maus', 'LB') + 'Zielen  ' + K('Linke Maus', 'RB') + 'Drive-by');
        prompt = L.join('\n');
      } else {
        const L = [], s = nearShop();
        if (s) L.push(K('E', '→') + s.name);
        else if (tony && Math.hypot(tony.x - player.x, tony.z - player.z) < 2.6) L.push(K('E', '→') + 'Mit Tony reden');
        else { const p = nearPed(); if (p) L.push(K('E', '→') + 'Ansprechen'); }
        const c = nearCar(); if (c && !c.wreck) L.push(K('F', 'Y') + (c.driver ? 'Auto klauen' : 'Einsteigen'));
        prompt = L.join('\n');
      }
    }
    const hh = Math.floor(clockH), mm = Math.floor((clockH - hh) * 60);
    let timer = '';
    if (mission && mission.def.id === 'courier' && mission.stage === 1) { const s = Math.max(0, Math.ceil(mission.timer)); timer = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    const ammo = cur === 'fist' ? '' : (player.reloadT > 0 ? 'LÄDT…' : (player.clip[cur] || 0) + ' / ' + (player.weapons[cur] || 0));
    const aimVis = cur !== 'fist' && (camState.aimT > 0.5 || player.aimHold > 0) && (!player.inCar || (w.driveby && ctl.aim));
    ui({
      money: '$' + String(Math.floor(player.money)).padStart(8, '0'), hp: Math.round(player.hp), armor: Math.round(player.armor),
      weapon: w.name, ammo: ammo, stars: stars, clock: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'),
      prompt: prompt, message: msgT > 0 ? msgText : '', objective: objective, timer: timer,
      zone: zoneName, zoneOn: zoneT > 0, vehicleOn: vehicleT > 0,
      speed: player.inCar ? Math.round(Math.abs(player.inCar.speed) * 3.6) + ' km/h' : '',
      crosshair: started && !player.dead && aimVis,
      hint: hintT > 0 ? 'Die Maus wird hier nicht eingefangen: Maustaste gedrückt halten und ziehen, um dich umzusehen.' : '', muted: muted
    });
  }

  // ================= Steuerung: Tastatur, Maus & Controller =================
  let locked = false, wasLocked = false, lockFailed = false, inputMode = 'kbm', jumpReq = false;
  const ctl = { mx: 0, mz: 0, mag: 0, sprint: false, aim: false, fire: false, thr: 0, steer: 0, hb: false, lookBack: false };
  const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const pad = { b: [], pb: [], ax: [0, 0, 0, 0], pax1: 0, connected: false, gp: null };
  const DZ = 0.2;
  const dz = (v) => { const a = Math.abs(v); return a < DZ ? 0 : Math.sign(v) * Math.min(1, (a - DZ) / (1 - DZ)); };
  const held = (n) => (pad.b[n] || 0) > 0.4;
  const pressed = (n) => (pad.b[n] || 0) > 0.4 && !((pad.pb[n] || 0) > 0.4);
  function pollPad() {
    let gp = null;
    try { const list = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < list.length; i++) if (list[i] && list[i].connected) { gp = list[i]; break; } } catch (e) { gp = null; }
    pad.pb = pad.b; pad.b = []; pad.pax1 = pad.ax[1];
    if (!gp) {
      if (pad.connected) { pad.connected = false; pad.gp = null; if (started) msg('Controller getrennt.', 2); else ui({ padStatus: '' }); }
      pad.ax = [0, 0, 0, 0]; return;
    }
    if (!pad.connected) { pad.connected = true; if (started) msg('Controller verbunden.', 2.5); else ui({ padStatus: 'Controller erkannt: A oder Start drücken' }); }
    pad.gp = gp;
    for (let i = 0; i < 17; i++) { const b = gp.buttons[i]; pad.b[i] = b ? (typeof b === 'object' ? (b.pressed ? Math.max(b.value, 0.5) : b.value) : b) : 0; }
    pad.ax = [dz(gp.axes[0] || 0), dz(gp.axes[1] || 0), dz(gp.axes[2] || 0), dz(gp.axes[3] || 0)];
    if (pad.b.some((v) => v > 0.4) || pad.ax.some((v) => Math.abs(v) > 0.3)) inputMode = 'pad';
  }
  function rumble(strong, weak, ms) {
    try { const a = pad.gp && pad.gp.vibrationActuator; if (a && inputMode === 'pad') a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* optional */ }
  }
  function readControls() {
    const kx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), kz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    let x = kx, z = kz;
    if (pad.ax[0] || pad.ax[1]) { x = pad.ax[0]; z = -pad.ax[1]; }
    const m = Math.hypot(x, z); if (m > 1) { x /= m; z /= m; }
    ctl.mx = x; ctl.mz = z; ctl.mag = Math.min(1, m);
    const inCar = !!player.inCar;
    ctl.sprint = !!(keys.ShiftLeft || keys.ShiftRight) || held(PB.A);
    ctl.aim = mouse.r || (inCar ? held(PB.LB) : held(PB.LT));
    ctl.fire = mouse.l || (inCar ? (held(PB.LB) && held(PB.RB)) : (pad.b[PB.RT] || 0) > 0.5);
    ctl.thr = clamp(kz + (pad.b[PB.RT] || 0) - (pad.b[PB.LT] || 0), -1, 1);
    ctl.steer = clamp(kx + pad.ax[0], -1, 1);
    ctl.hb = !!keys.Space || (held(PB.RB) && !held(PB.LB));
    ctl.lookBack = !!keys.KeyC || held(PB.R3);
  }
  function look(dx, dy) { camState.yaw -= dx * 0.0032; camState.pitch += dy * 0.0028; camState.lastInput = nowT; }
  function playerCarInput() {
    const c = player.inCar.inp;
    c.thr = ctl.thr; c.steer = ctl.steer; c.hb = ctl.hb;
    if (paused || gamePaused || player.dead) { c.thr = 0; c.steer = 0; c.hb = true; }
    return c;
  }
  // Waffenrad
  let wheelOpen = false, wheelSel = -1, wheelVX = 0, wheelVY = 0;
  function wheelUi() {
    const slots = WORDER.map((k) => ({ name: WEAPONS[k].name, ammo: k === 'fist' ? '' : (player.weapons[k] == null ? '–' : String(ammoTotal(k))), owned: player.weapons[k] != null && ammoTotal(k) > 0 }));
    const k = WORDER[wheelSel];
    ui({ wheel: { sel: wheelSel, slots: slots, label: k ? (WLABEL[k] || 'Fäuste') : '' } });
  }
  function openWheel() {
    if (wheelOpen || player.dead || menu || gamePaused || player.inCar) return;
    wheelOpen = true; wheelVX = wheelVY = 0; wheelSel = WORDER.indexOf(player.cur); mouse.l = false; wheelUi();
  }
  function closeWheel() {
    if (!wheelOpen) return;
    wheelOpen = false; if (wheelSel >= 0) selectWeapon(wheelSel);
    ui({ wheel: null });
  }
  function wheelAim(x, y, th) {
    if (Math.hypot(x, y) < th) return;
    let a = Math.atan2(x, -y); if (a < 0) a += TAU;
    const i = Math.round(a / TAU * WORDER.length) % WORDER.length, k = WORDER[i];
    if (player.weapons[k] != null && ammoTotal(k) > 0 && i !== wheelSel) { wheelSel = i; wheelUi(); rumble(0, 0.25, 30); }
  }
  // Zielhilfe (Controller, wie GTA)
  let lockTarget = null;
  function findLockTarget() {
    const e = camState.eye, d = camState.dir; let best = null, bs = 1e9;
    for (const p of peds) {
      if (p.state === 'dead' || p.kind === 'giver') continue;
      const dx = p.x - e[0], dy = p.y + 1.2 - e[1], dz2 = p.z - e[2], dist = Math.hypot(dx, dy, dz2);
      if (dist > 50 || dist < 1) continue;
      const cos = (dx * d[0] + dy * d[1] + dz2 * d[2]) / dist;
      if (cos < 0.9) continue;
      const score = (1 - cos) * 60 + dist * 0.04 - (p.hostile || (p.kind === 'cop' && wanted > 0) ? 3 : 0);
      if (score < bs && losClear(e[0], e[1], e[2], p.x, p.y + 1.2, p.z)) { bs = score; best = p; }
    }
    return best;
  }
  function updateLockOn(dt) {
    if (inputMode !== 'pad' || player.inCar || player.dead || !held(PB.LT) || player.cur === 'fist' || wheelOpen) { lockTarget = null; return; }
    if (pressed(PB.LT)) lockTarget = findLockTarget();
    if (!lockTarget) return;
    if (lockTarget.state === 'dead' || Math.hypot(pad.ax[2], pad.ax[3]) > 0.75) { lockTarget = null; return; }
    const e = camState.eye, dx = lockTarget.x - e[0], dy = lockTarget.y + 1.25 - e[1], dz2 = lockTarget.z - e[2], l = Math.hypot(dx, dy, dz2) || 1;
    camState.yaw += angDiff(camState.yaw, Math.atan2(dx, dz2)) * Math.min(1, 12 * dt);
    camState.pitch += (-Math.asin(clamp(dy / l, -1, 1)) - camState.pitch) * Math.min(1, 12 * dt);
  }
  function togglePause(force) {
    if (!started || menu || player.dead) return;
    gamePaused = force != null ? force : !gamePaused;
    mouse.l = mouse.r = false;
    if (gamePaused) { closeWheel(); try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* egal */ } }
    ui({ paused: gamePaused, pauseHint: inputMode === 'pad' ? 'Start oder A zum Weiterspielen' : 'P drücken oder auf WEITER klicken' });
  }
  function padFrame(dt) {
    pollPad();
    if (!pad.connected) return;
    if (!started) { if (pressed(PB.A) || pressed(PB.START)) startGame(true); return; }
    if (menu) {
      const up = pressed(PB.UP) || (pad.ax[1] < -0.6 && pad.pax1 >= -0.6), down = pressed(PB.DOWN) || (pad.ax[1] > 0.6 && pad.pax1 <= 0.6);
      if (up) menuMove(-1); if (down) menuMove(1);
      if (pressed(PB.A)) menuKey(menuSel);
      if (pressed(PB.B)) closeMenu();
      return;
    }
    if (pressed(PB.START)) { togglePause(); return; }
    if (gamePaused) { if (pressed(PB.A) || pressed(PB.B)) togglePause(false); return; }
    if (player.dead) return;
    if (pressed(PB.Y)) pressF();
    if (pressed(PB.RIGHT)) pressE();
    if (player.inCar && pressed(PB.L3)) pressE();
    if (!player.inCar && pressed(PB.B)) startReload();
    if (pressed(PB.LEFT)) switchWeapon(1);
    if (pressed(PB.BACK)) cycleCam();
    if (!player.inCar && pressed(PB.X)) jumpReq = true;
    if (player.inCar ? (held(PB.LB) && pressed(PB.RB)) : pressed(PB.RT)) mouse.clicked = true;
    if (!player.inCar) { if (held(PB.LB) && !wheelOpen) openWheel(); else if (!held(PB.LB) && wheelOpen && !keys.Tab) closeWheel(); }
    if (wheelOpen) {
      const useR = Math.abs(pad.ax[2]) + Math.abs(pad.ax[3]) > 0.3;
      wheelAim(useR ? pad.ax[2] : pad.ax[0], useR ? pad.ax[3] : pad.ax[1], 0.5);
      return;
    }
    const lx = pad.ax[2], ly = pad.ax[3];
    if (lx || ly) {
      const s = camState.aimT > 0.5 ? 0.45 : 1;
      camState.yaw -= Math.sign(lx) * lx * lx * 3.2 * s * dt; camState.pitch += Math.sign(ly) * ly * ly * 2.2 * s * dt; camState.lastInput = nowT;
    }
  }
  const GAMEKEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyC', 'KeyV', 'KeyP', 'KeyM', 'ShiftLeft', 'ShiftRight', 'Tab', 'Enter', 'Backspace'];
  function onKeyDown(e) {
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (err) { /* egal */ } }
    if (!started) { if (e.code === 'Enter') { e.preventDefault(); startGame(false); } return; }
    if (GAMEKEYS.indexOf(e.code) >= 0 || /^Digit/.test(e.code)) e.preventDefault();
    inputMode = 'kbm';
    if (e.repeat) return;
    keys[e.code] = true;
    if (menu) {
      if (/^Digit[1-9]$/.test(e.code)) menuKey(parseInt(e.code.slice(5), 10) - 1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') menuMove(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') menuMove(1);
      else if (e.code === 'Enter' || e.code === 'Space') menuKey(menuSel);
      else if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Backspace') closeMenu();
      return;
    }
    if (e.code === 'KeyP' || (e.code === 'Escape' && gamePaused)) { togglePause(); return; }
    if (gamePaused || player.dead) return;
    if (e.code === 'KeyE') pressE();
    else if (e.code === 'KeyF' || e.code === 'Enter') pressF();
    else if (e.code === 'KeyR') startReload();
    else if (e.code === 'KeyQ') switchWeapon(1);
    else if (e.code === 'Tab') openWheel();
    else if (/^Digit[1-5]$/.test(e.code)) selectWeapon(parseInt(e.code.slice(5), 10) - 1);
    else if (e.code === 'KeyV') cycleCam();
    else if (e.code === 'KeyM') toggleMute();
  }
  function onKeyUp(e) { keys[e.code] = false; if (e.code === 'Tab') closeWheel(); }
  function requestLock() {
    if (locked || menu || gamePaused) return;
    try {
      const r = canvas.requestPointerLock && canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { if (!lockFailed) { lockFailed = true; hintT = 7; } });
    } catch (err) { if (!lockFailed) { lockFailed = true; hintT = 7; } }
  }
  function onMouseDown(e) {
    if (AC && AC.state === 'suspended') { try { AC.resume(); } catch (err) { /* egal */ } }
    if (!started || menu || gamePaused) return;
    inputMode = 'kbm';
    try { root.focus(); } catch (err) { /* egal */ }
    requestLock();
    if (e.button === 0) { mouse.l = true; mouse.clicked = true; }
    if (e.button === 2) mouse.r = true;
    e.preventDefault();
  }
  function onMouseUp(e) { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; }
  function onMouseMove(e) {
    if (!started || menu || gamePaused) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (wheelOpen) { wheelVX = clamp(wheelVX + mx, -120, 120); wheelVY = clamp(wheelVY + my, -120, 120); wheelAim(wheelVX, wheelVY, 30); return; }
    if (locked || mouse.r || mouse.l) { const s = camState.aimT > 0.5 ? 0.6 : 1; look(mx * s, my * s); }
  }
  function onWheel(e) { if (!started || menu || gamePaused) return; e.preventDefault(); switchWeapon(e.deltaY > 0 ? 1 : -1); }
  function onCtx(e) { e.preventDefault(); }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (locked) { wasLocked = true; lockFailed = false; hintT = 0; }
    else if (wasLocked && started && !menu && !gamePaused && !player.dead) togglePause(true);
  }
  function onLockError() { if (!lockFailed) { lockFailed = true; hintT = 7; } }
  function onBlur() { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; closeWheel(); }
  root.tabIndex = 0;
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('keyup', onKeyUp);
  root.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onMouseDown);
  root.addEventListener('mouseup', onMouseUp);
  root.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onCtx);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('pointerlockerror', onLockError);
  function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.45; hudT = 0; }

  // ================= Spielablauf =================
  function populate() {
    for (let i = 0; i < 30; i++) spawnTraffic(0, 9999);
    for (let i = 0; i < 2; i++) { const c = spawnTraffic(0, 9999); if (c && c.type !== 'police') { c.type = 'police'; c.T = CAR_TYPES.police; c.mesh = carMeshes.police; c.paint = rgb('#15181d'); Object.assign(c.driver, makePed('cop', 0, 0), { inCar: c }); } }
    for (let i = 0; i < 14; i++) {
      const sp = roadSpawnPoint(0, 9999); if (!sp) continue;
      const ox = Math.round(Math.cos(sp.yaw)) * -2.2, oz = Math.round(Math.sin(sp.yaw)) * 2.2;
      spawnCar(pick(['sedan', 'sedan', 'pickup', 'van', 'sport', 'taxi']), sp.x + ox, sp.z + oz, sp.yaw, 'parked');
    }
    for (let i = 0; i < 64; i++) spawnWalker(i % 13 === 0 ? 'cop' : 'civ');
    const b = blockRect(5, 0);
    tony = addPed(makePed('giver', b.cx + 4, b.z0 + 1.6));
    Object.assign(tony, { name: 'Tony', hp: 1e9, state: 'stand', shirt: rgb('#f4f1ea'), pants: rgb('#f4f1ea'), hair: rgb('#111111'), cash: 0, hairStyle: 0, sleeve: true, h: 1.02, bw: 1.12 });
  }
  function placePlayer() {
    const s = shopOf('waffen');
    player.x = s.x + 5; player.z = s.z; player.y = groundY(player.x, player.z); player.yaw = 1.1;
    camState.yaw = 1.1; camState.pitch = 0.2;
    const c = spawnCar('sedan', s.x + 12, roadC(2) + LANE + 2.0, Math.PI / 2, 'parked'); c.paint = rgb('#1f3d6b');
  }
  function recycle() {
    const px = player.x, pz = player.z;
    let civs = 0, traffic = 0;
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      if (p === tony || (mission && mission.peds.indexOf(p) >= 0)) continue;
      const far = Math.hypot(p.x - px, p.z - pz) > 70;
      if (p.state === 'dead' && p.deadT > 40 && far) { peds.splice(i, 1); continue; }
      if (p.state !== 'dead') civs++;
    }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (c === player.inCar || (mission && mission.car === c)) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (c.wreck && c.deadT > 45 && d > 70) { cars.splice(i, 1); continue; }
      if (c.mode === 'parked' && !c.driver && d > 260) { cars.splice(i, 1); continue; }
      if (c.driver && c.mode === 'traffic') traffic++;
    }
    if (civs < 60) spawnWalker(Math.random() < 0.08 ? 'cop' : 'civ');
    if (traffic < 30) spawnTraffic(90, 400);
  }
  let recycleT = 0;
  function update(dt) {
    nowT += dt;
    clockH = (clockH + dt / 40) % 24;
    shake = Math.max(0, shake - dt * 1.5);
    const frozen = paused || gamePaused;
    if (started && !frozen) {
      if (respawnT > 0) { respawnT -= dt; if (respawnT <= 0) respawn(); }
      updateReload(dt);
      updatePlayerFoot(dt);
      updateWanted(dt);
      updateMission(dt);
      updateGarages(dt);
      if (player.arrestT > 1.3) busted();
      player.arrestT = Math.max(0, player.arrestT - dt * 0.4);
      recycleT -= dt; if (recycleT <= 0) { recycleT = 0.5; recycle(); }
    }
    if (!frozen) {
      updateCars(dt);
      for (let i = peds.length - 1; i >= 0; i--) stepPed(peds[i], dt);
      carCollisions();
      stepFx(dt);
    }
    if (started && !frozen && !player.dead && !wheelOpen) {
      if (keys.ArrowLeft) look(-dt * 500, 0); if (keys.ArrowRight) look(dt * 500, 0);
    }
  }
  function updatePlayerFoot(dt) {
    if (player.dead) { player.fall = Math.min(1, (player.fall || 0) + dt * 2.5); return; }
    player.shootT -= dt; player.aimHold -= dt; player.punchT = Math.max(0, player.punchT - dt);
    if (ctl.fire && !menu) tryFire();
    const c = player.inCar;
    if (c) {
      player.x = c.x; player.z = c.z; player.y = c.y;
      if (c.wreck) leaveCarForce();
      return;
    }
    const cy = camState.yaw, fwx = Math.sin(cy), fwz = Math.cos(cy), rgx = -Math.cos(cy), rgz = Math.sin(cy);
    let mx = fwx * ctl.mz + rgx * ctl.mx, mz = fwz * ctl.mz + rgz * ctl.mx; const ml = Math.hypot(mx, mz);
    const gun = player.cur !== 'fist';
    const aiming = gun && !wheelOpen && (ctl.aim || ctl.fire || player.aimHold > 0);
    let tvx = 0, tvz = 0;
    if (ml > 0.01) {
      mx /= ml; mz /= ml;
      const s = aiming ? 3.2 : (ctl.sprint ? 7.4 : (ctl.mag < 0.5 ? 1.8 : 4.3));
      tvx = mx * s; tvz = mz * s;
      if (!aiming) player.yaw += angDiff(player.yaw, Math.atan2(mx, mz)) * Math.min(1, 12 * dt);
    }
    if (aiming) player.yaw += angDiff(player.yaw, cy) * Math.min(1, 20 * dt);
    const k = player.grounded ? 12 : 1.5;
    player.vx += (tvx - player.vx) * Math.min(1, k * dt); player.vz += (tvz - player.vz) * Math.min(1, k * dt);
    player.x += player.vx * dt; player.z += player.vz * dt;
    const gy = groundY(player.x, player.z);
    if ((keys.Space || jumpReq) && player.grounded) { player.vy = 6.2; player.grounded = false; }
    jumpReq = false;
    player.vy -= 18 * dt; player.y += player.vy * dt;
    if (player.y <= gy) { player.y = gy; player.vy = 0; player.grounded = true; }
    else if (player.y - gy > 0.2) player.grounded = false;
    circleCollide(player, 0.35, player.y);
    for (const p of peds) {
      if (p.state === 'dead') continue;
      const dx = player.x - p.x, dz2 = player.z - p.z, d = Math.hypot(dx, dz2);
      if (d < 0.65 && d > 1e-4) { const push = (0.65 - d) / 2; player.x += dx / d * push; player.z += dz2 / d * push; p.x -= dx / d * push; p.z -= dz2 / d * push; }
    }
    const sp = Math.hypot(player.vx, player.vz);
    player.moving = Math.min(1, sp / 4); player.walkT += sp * dt * 3.0;
    player.aim = aiming && player.reloadT <= 0; player.aimPitch = camState.pitch; player.gunLen = gun ? WEAPONS[player.cur].gun : 0; player.twoHand = gun && WEAPONS[player.cur].two;
  }
  function updateGarages(dt) {
    lackCool -= dt; exportCool -= dt;
    const c = player.inCar;
    const lack = shopOf('lack'), exp = shopOf('export');
    const nowLack = !!c && Math.hypot(c.x - lack.x, c.z - lack.z) < lack.r;
    if (nowLack && !inLack && lackCool <= 0) {
      if (player.money >= 100) {
        player.money -= 100; c.paint = rgb(pick(['#8b1e1e', '#1f3d6b', '#d8d8d2', '#2a2a2a', '#5d6b3a', '#b58b3a', '#6b2a8a', '#1e7a6a']));
        c.hp = 100; c.onFire = false; endPursuit(); msg('Spray & Weg: neue Farbe, neue Identität! -$100', 3); sfx('spray', 0.7); lackCool = 6;
      } else msg('Neue Farbe kostet $100. Komm wieder, wenn du flüssig bist.', 3);
    }
    inLack = nowLack;
    const nowExp = !!c && Math.hypot(c.x - exp.x, c.z - exp.z) < exp.r;
    if (nowExp && !inExport && exportCool <= 0 && !(mission && mission.car === c)) {
      if (wanted > 0) msg('Die Garage nimmt keine heißen Karren. Hänge erst die Polizei ab.', 3);
      else {
        const base = { sport: 900, police: 600, pickup: 350, van: 300, sedan: 250, taxi: 220 }[c.type] || 200;
        const v = Math.round(base * (0.3 + 0.7 * c.hp / 100));
        leaveCarForce(); cars.splice(cars.indexOf(c), 1);
        player.money += v; sfx('cash', 0.8); msg('Export-Garage: Wagen verkauft für $' + v, 3); exportCool = 4;
      }
    }
    inExport = nowExp;
  }

  // ================= Schleife =================
  populate();
  placePlayer();
  updateLight();
  let raf = 0, last = performance.now(), radarT = 0, destroyed = false;
  function startGame(fromPad) {
    if (started) return;
    started = true; initAudio();
    zoneName = ''; hudT = 0;
    if (fromPad) inputMode = 'pad';
    msg('Willkommen in Neon City. Kugel & Co. ist direkt hier, Tony wartet am Hafen.', 6);
    ui({ started: true });
    try { root.focus(); } catch (e) { /* egal */ }
    if (!fromPad) requestLock();
  }
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    if (document.hidden) return;
    padFrame(dt);
    readControls();
    if (started) updateLockOn(dt);
    update(wheelOpen ? dt * 0.25 : dt);
    updateLight();
    updateCamera(dt);
    render();
    if (started) {
      radarT -= dt; if (radarT <= 0) { radarT = 1 / 30; drawRadar(); }
      hudTick(dt); updateAudio();
    }
  }
  raf = requestAnimationFrame(frame);
  return {
    start() { startGame(false); },
    resume() { togglePause(false); try { root.focus(); } catch (e) { /* egal */ } requestLock(); },
    toggleMute: toggleMute,
    closeMenu: closeMenu,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      root.removeEventListener('keydown', onKeyDown); root.removeEventListener('keyup', onKeyUp); root.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown); root.removeEventListener('mouseup', onMouseUp); root.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('contextmenu', onCtx);
      document.removeEventListener('pointerlockchange', onLockChange); document.removeEventListener('pointerlockerror', onLockError);
      try { if (AC) AC.close(); } catch (e) { /* egal */ }
    }
  };
}
