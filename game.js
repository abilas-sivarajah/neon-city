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
  let loftA = 4; // Bogenschritte je Ecke bei loftGeo (weniger für die vereinfachte Fernversion der Autos)
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
  // Punktlichter für Neon und Laternen: so viele, wie die Grafikkarte an Uniforms erlaubt
  const NL = (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 16) >= 80 ? 24 : 8;
  const FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
    '#define NL ' + NL + '\n' +
    'uniform vec4 uLP[NL]; uniform vec3 uLC[NL];\n' +
    'varying vec3 vN; varying vec3 vW; varying vec4 vC;\n' +
    'uniform vec3 uSun; uniform vec3 uSunC; uniform vec3 uAmb; uniform vec3 uFog; uniform vec3 uCam; uniform vec3 uPaint; uniform vec3 uPaint2;\n' +
    'uniform float uFogD; uniform float uNight; uniform float uAlpha;\n' +
    'float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }\n' +
    'void main(){\n' +
    ' float m = vC.a; vec3 c = vC.rgb; vec3 n = normalize(vN);\n' +
    ' if (m > 6.5) {\n' +
    '  float gd = length(vW - uCam); float gf = clamp((gd - uFogD*0.3)/(uFogD*0.7), 0.0, 1.0);\n' +
    '  gl_FragColor = vec4(c*uPaint*(1.0 - gf*gf), uAlpha); return;\n' +
    ' }\n' +
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
    '  vec3 pl = vec3(0.0);\n' +
    '  for (int i = 0; i < NL; i++) {\n' +
    '   vec3 L = uLP[i].xyz - vW; float d2 = dot(L, L); float r = uLP[i].w;\n' +
    '   if (d2 < r*r) { float dl = sqrt(d2); float f = 1.0 - dl/r; pl += uLC[i]*f*f*max(dot(n, L/max(dl, 0.001))*0.6 + 0.4, 0.0); }\n' +
    '  }\n' +
    '  col += c*pl;\n' +
    '  if (m > 0.5 && m < 1.5 && abs(n.y) < 0.5 && vW.y > 1.0) {\n' +
    '   float along = abs(n.x) > 0.5 ? vW.z : vW.x;\n' +
    '   vec2 cell = vec2(along/2.8, vW.y/3.4); vec2 f = fract(cell);\n' +
    '   if (f.x > 0.2 && f.x < 0.8 && f.y > 0.28 && f.y < 0.82) {\n' +
    '    float r = h21(floor(cell) + floor(vW.xz/40.0));\n' +
    '    vec3 glass = mix(vec3(0.12,0.16,0.24), vec3(0.45,0.58,0.72), 0.35 + 0.3*r)*(uAmb*1.2 + uSunC*dif*0.6);\n' +
    '    float r2 = h21(floor(cell)*1.7 + vec2(3.1, 7.7));\n' +
    '    vec3 lc = r2 < 0.5 ? vec3(1.0,0.8,0.55) : (r2 < 0.75 ? vec3(0.35,0.9,1.0) : vec3(1.0,0.4,0.85));\n' +
    '    vec3 lamp = lc*step(0.45, r)*(0.7 + 0.3*r);\n' +
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
  U.uLP = gl.getUniformLocation(prog, 'uLP[0]'); U.uLC = gl.getUniformLocation(prog, 'uLC[0]');
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
  const IDM = m4(), MA = m4(), MB = m4(), MC = m4(), MU = m4();
  const unitLit = (() => { const g = geo(); box(g, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1, 2]); return upload(g); })();
  const unitEmis = (() => { const g = geo(); box(g, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1, 5]); return upload(g); })();
  const unitGlow = (() => { const g = geo(); box(g, -0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1, 7]); return upload(g); })();
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
  function zoneAt(x, z) {
    if (x >= 0 && x <= W && z >= -2 && z <= W) return DNAMES[districtOf(clamp(Math.floor(x / P), 0, N - 1), clamp(Math.floor(z / P), 0, N - 1))];
    // außerhalb der Stadt (Landschaft weiter unten)
    if (terrH(x, z) < -0.6 && distLine(BRIDGE, x, z) > 8) return 'Meer';
    if (x > 490 && z > 70 && z < 470) return 'Flughafen';
    if (Math.hypot(x + 130, z - 260) < 75) return 'Arena';
    if (x < -110 && z > 0 && z < 140) return 'Jachthafen';
    if (sdPoly(ISLE, x, z) > -10 || distLine(BRIDGE, x, z) < 8) return 'Leuchtturm-Insel';
    if (Math.hypot(x + 118, z - 420) < 60) return 'Hügelsiedlung';
    if (Math.hypot((x - LAKE.x) / (LAKE.rx + 40), (z - LAKE.z) / (LAKE.rz + 40)) < 1) return 'Kristallsee';
    if (z > 540 || terrH(x, z) > 1.5) return 'Neon Hills';
    return 'Ringstraße';
  }

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
    forNear(o.x, o.z, r + 1, (c) => { if (oy <= c.h) pushOut(o, r, c.x0, c.z0, c.x1, c.z1); });
    // Gelände: gesperrte Rasterzellen (Hänge, Wasser) und alles außerhalb des Rasters wirken wie Wände
    const i0 = Math.floor((o.x - r - TX0) / TG), i1 = Math.floor((o.x + r - TX0) / TG), j0 = Math.floor((o.z - r - TZ0) / TG), j1 = Math.floor((o.z + r - TZ0) / TG);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i >= 0 && j >= 0 && i < TNX && j < TNZ && !terrBl[j * TNX + i]) continue;
      pushOut(o, r, TX0 + i * TG, TZ0 + j * TG, TX0 + (i + 1) * TG, TZ0 + (j + 1) * TG);
    }
    if (HIT.hit) { const l = Math.hypot(HIT.nx, HIT.nz) || 1; HIT.nx /= l; HIT.nz /= l; }
    return HIT;
  }
  function pushOut(o, r, x0, z0, x1, z1) {
    const qx = clamp(o.x, x0, x1), qz = clamp(o.z, z0, z1);
    let dx = o.x - qx, dz = o.z - qz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2); dx /= d; dz /= d; o.x += dx * (r - d); o.z += dz * (r - d);
    } else {
      const pl = o.x - x0, pr = x1 - o.x, pb = o.z - z0, pt = z1 - o.z; const mn = Math.min(pl, pr, pb, pt);
      dx = 0; dz = 0;
      if (mn === pl) { dx = -1; o.x = x0 - r; } else if (mn === pr) { dx = 1; o.x = x1 + r; } else if (mn === pb) { dz = -1; o.z = z0 - r; } else { dz = 1; o.z = z1 + r; }
    }
    HIT.hit = true; HIT.nx += dx; HIT.nz += dz;
  }
  function onBlock(x, z) {
    const i = Math.floor((x - ROAD) / P), j = Math.floor((z - ROAD) / P);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return (x - ROAD - i * P) <= BLOCK && (z - ROAD - j * P) <= BLOCK;
  }
  const groundY = (x, z) => onBlock(x, z) ? 0.15 : 0;
  function insideBuilding(x, y, z, pad) {
    let res = y < terrH(x, z) + 0.3;
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
    asphalt: hexc('#2a2c33'), side: hexc('#7d7f86'), line: hexc('#e8d27a'), zebra: hexc('#c9cbd2'),
    grass: hexc('#4f7a45'), concrete: hexc('#5d6068'), old: hexc('#5f5a58'), port: hexc('#46494e'),
    pole: hexc('#2b2f36'), lamp: hexc('#c8f6ff', 4), trunk: hexc('#6a4e36'), frond: hexc('#3f7a3a'), frond2: hexc('#33662f'),
    leaf: hexc('#35603a'), leaf2: hexc('#407045'), water: hexc('#1d4a66'), barrier: hexc('#6d6e74'), hill: hexc('#3d4440'), hill2: hexc('#333a37')
  };

  // ---- Neon: Leuchtröhren mit Glüh-Halo ----
  // Röhren landen in eigenen Meshes (neonT), der Halo in einem additiv gezeichneten Mesh (neonG). Flackernde Schilder getrennt.
  const NEON = ['#ff2bd6', '#22e6ff', '#a14bff', '#ffe14d', '#39ff88', '#ff3355', '#ff8a1f', '#3d7bff'];
  const neonT = geo(), neonG = geo(), flickT = geo(), flickG = geo();
  let nseed = 777, flick = false;
  // eigener Zufall, damit die Stadtaufteilung (srand) unverändert bleibt
  const nr = () => { nseed = (nseed * 16807) % 2147483647; return (nseed - 1) / 2147483646; };
  const nrr = (a, b) => a + nr() * (b - a), npick = (arr) => arr[Math.floor(nr() * arr.length)];
  const ncol = () => hexc(npick(NEON));
  // Lichtquellen, die farbiges Licht auf die Umgebung werfen (Auswahl der nächsten pro Bild in updatePointLights)
  const lightSrc = [];
  function addLight(x, y, z, col, r, k, lamp) { lightSrc.push({ x: x, y: y, z: z, r: r, c: [col[0] * k, col[1] * k, col[2] * k], neon: !lamp }); }
  function tube(ax, ay, az, bx, by, bz, t, col) {
    const T = flick ? flickT : neonT, G = flick ? flickG : neonG;
    tubeTo(T, G, ax, ay, az, bx, by, bz, t, col);
  }
  function tubeTo(T, G, ax, ay, az, bx, by, bz, t, col) {
    lineBox(T, ax, ay, az, bx, by, bz, t, t, [lerp(col[0], 1, 0.5), lerp(col[1], 1, 0.5), lerp(col[2], 1, 0.5), 4]);
    lineBox(G, ax, ay, az, bx, by, bz, t * 3.2, t * 3, [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, 7]);
    lineBox(G, ax, ay, az, bx, by, bz, t * 8, t * 7, [col[0] * 0.2, col[1] * 0.2, col[2] * 0.2, 7]);
  }
  // Balken von a nach b mit quadratischem Querschnitt w, um ext verlängert
  function lineBox(g, ax, ay, az, bx, by, bz, w, ext, c) {
    let dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz) || 1e-3; dx /= len; dy /= len; dz /= len;
    let px = 1, pz = 0;
    if (Math.abs(dy) < 0.9) { px = -dz; pz = dx; const l = Math.hypot(px, pz); px /= l; pz /= l; }
    const qx = dy * pz, qy = dz * px - dx * pz, qz = -dy * px;
    GM[0] = dx * (len + ext); GM[1] = dy * (len + ext); GM[2] = dz * (len + ext); GM[3] = 0;
    GM[4] = px * w; GM[5] = 0; GM[6] = pz * w; GM[7] = 0;
    GM[8] = qx * w; GM[9] = qy * w; GM[10] = qz * w; GM[11] = 0;
    GM[12] = (ax + bx) / 2; GM[13] = (ay + by) / 2; GM[14] = (az + bz) / 2; GM[15] = 1;
    boxM(g, GM, c);
  }
  // Röhrenschrift: Zeichen im Raster 2×4, Linienzüge mit Punkten "xy", Züge durch | getrennt
  const FONT = {
    A: '00 03 14 23 20|02 22', B: '00 04 14 23 12 21 10 00|02 12', C: '20 00 04 24', D: '00 04 14 23 21 10 00', E: '20 00 04 24|02 12',
    F: '00 04 24|02 12', G: '24 04 00 20 22 12', H: '00 04|20 24|02 22', I: '00 20|04 24|10 14', J: '04 24|14 10 00 01',
    K: '00 04|24 02 20', L: '04 00 20', M: '00 04 12 24 20', N: '00 04 20 24', O: '00 04 24 20 00', P: '00 04 24 22 02',
    Q: '00 04 24 21 10 00|11 20', R: '00 04 24 22 02 20', S: '24 04 02 22 20 00', T: '04 24|14 10', U: '04 00 20 24',
    V: '04 10 24', W: '04 00 12 20 24', X: '00 24|04 20', Y: '04 12 24|12 10', Z: '04 24 00 20',
    0: '00 04 24 20 00', 1: '03 14 10|00 20', 2: '04 24 22 02 00 20', 3: '04 24 20 00|02 22', 4: '04 02 22|24 20',
    5: '24 04 02 22 20 00', 6: '24 04 00 20 22 02', 7: '04 24 10', 8: '00 04 24 20 00|02 22', 9: '20 24 04 02 22',
    '/': '00 24', '+': '02 22|13 11', '-': '02 22', '.': '10 11', '!': '14 12|10 11', '$': '24 04 02 22 20 00|14 10'
  };
  const textUnits = (str) => str.length * 3 - 1;
  // Schriftzug mittig bei (cx,cy,cz), Leserichtung (rx,rz), Buchstabenhöhe h
  function neonText(str, cx, cy, cz, rx, rz, h, col, t) {
    const s = h / 4, w = textUnits(str) * s; t = t || Math.max(0.035, h * 0.055);
    let ox = cx - rx * w / 2, oz = cz - rz * w / 2; const oy = cy - h / 2;
    for (const ch of str) {
      const f = FONT[ch];
      if (f) for (const line of f.split('|')) {
        const pts = line.split(' ');
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], b = pts[k + 1];
          tube(ox + rx * a[0] * s, oy + a[1] * s, oz + rz * a[0] * s, ox + rx * b[0] * s, oy + b[1] * s, oz + rz * b[0] * s, t, col);
        }
      }
      ox += rx * 3 * s; oz += rz * 3 * s;
    }
  }
  // Rechteckrahmen in der Ebene aus Leserichtung (rx,rz) und Senkrechter
  function neonRect(cx, cy, cz, rx, rz, w, h, t, col) {
    const ax = cx - rx * w / 2, az = cz - rz * w / 2, bx = cx + rx * w / 2, bz = cz + rz * w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
    tube(ax, y0, az, bx, y0, bz, t, col); tube(ax, y1, az, bx, y1, bz, t, col);
    tube(ax, y0, az, ax, y1, az, t, col); tube(bx, y0, bz, bx, y1, bz, t, col);
  }
  // Dunkle Tafel hinter einem Schild, achsparallel: Breite w entlang (rx,rz), Tiefe d entlang der Normalen
  function signPanel(cx, cy, cz, rx, rz, w, h, d) {
    const hx = Math.abs(rx) > 0.5 ? w / 2 : d / 2, hz = Math.abs(rx) > 0.5 ? d / 2 : w / 2;
    box(wg, cx - hx, cy - h / 2, cz - hz, cx + hx, cy + h / 2, cz + hz, hexc('#0d0f15'));
  }
  // Leuchtschild an einer Fassade: Punkt (fx,fz) auf der Fassade, Normale (nx,nz)
  function facadeSign(fx, fz, nx, nz, y, text, h, col, panel) {
    const rx = nz, rz = -nx, w = textUnits(text) * h / 4;
    if (panel) { signPanel(fx + nx * 0.15, y, fz + nz * 0.15, rx, rz, w + h * 1.1, h * 1.9, 0.25); neonRect(fx + nx * 0.3, y, fz + nz * 0.3, rx, rz, w + h * 0.9, h * 1.7, Math.max(0.035, h * 0.045), col); }
    neonText(text, fx + nx * 0.34, y, fz + nz * 0.34, rx, rz, h, col);
    addLight(fx + nx * 1.6, y, fz + nz * 1.6, col, 8 + h * 4, 1.6);
  }
  // Senkrechtes Hängeschild, das von der Fassade absteht (lesbar von beiden Straßenseiten)
  function bladeSign(fx, fz, nx, nz, top, text, h, col) {
    const rx = nz, rz = -nx, L = text.length * h * 1.35, cx = fx + nx * 0.95, cz = fz + nz * 0.95, cy = top - L / 2;
    const hx = Math.abs(nx) > 0.5 ? 0.6 : 0.06, hz = Math.abs(nx) > 0.5 ? 0.06 : 0.6;
    box(wg, cx - hx, top - L - 0.25, cz - hz, cx + hx, top + 0.25, cz + hz, hexc('#0d0f15'));
    box(wg, fx + nx * 0.3 - 0.04, top - 0.05, fz + nz * 0.3 - 0.04, fx + nx * 0.3 + 0.04 + nx * 0.4, top + 0.05, fz + nz * 0.3 + 0.04 + nz * 0.4, C.pole);
    neonRect(cx, cy, cz, nx, nz, 1.4, L + 0.7, 0.04, col);
    addLight(cx + nx * 0.6, cy, cz + nz * 0.6, col, 10, 1.6);
    for (const sd of [-1, 1]) for (let k = 0; k < text.length; k++) {
      neonText(text[k], cx + rx * sd * 0.09, top - h / 2 - 0.1 - k * h * 1.35, cz + rz * sd * 0.09, -nx * sd, -nz * sd, h, col);
    }
  }
  // Leuchtkante um ein Dach (achsparallel)
  function roofLine(x0, z0, x1, z1, y, col, t) {
    t = t || 0.06;
    tube(x0, y, z0, x1, y, z0, t, col); tube(x0, y, z1, x1, y, z1, t, col);
    tube(x0, y, z0, x0, y, z1, t, col); tube(x1, y, z0, x1, y, z1, t, col);
  }
  const holos = [];
  function lamp(x, z, ax, az) {
    box(wg, x - 0.08, 0, z - 0.08, x + 0.08, 6.4, z + 0.08, C.pole);
    const ex = x + ax * 1.6, ez = z + az * 1.6;
    box(wg, Math.min(x, ex) - 0.06, 6.3, Math.min(z, ez) - 0.06, Math.max(x, ex) + 0.06, 6.42, Math.max(z, ez) + 0.06, C.pole);
    box(wg, ex - 0.25, 6.12, ez - 0.25, ex + 0.25, 6.3, ez + 0.25, C.lamp);
    lamps.push({ x: ex, z: ez });
    addLight(ex, 5.6, ez, [0.62, 0.86, 1], 14, 1.25, true);
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
  const SHOP_SIGN = { waffen: 'WAFFEN', spaeti: '24/7', lack: 'SPRAY+WEG', kleider: 'FRESH FITS', hospital: 'KLINIK', police: 'POLIZEI', export: 'EXPORT' };
  const SHOP_NEON = { waffen: '#ff3355', spaeti: '#39ff88', lack: '#22e6ff', kleider: '#ff2bd6', hospital: '#ff4060', police: '#3d7bff', export: '#ff8a1f' };
  // Laden mit Front nach Süden (-z) zur Straße
  function shopBuilding(i, j, kind, name, wallCol, signCol, blip, w, d) {
    const b = blockRect(i, j); w = w || 18; d = d || 14;
    const x0 = b.cx - w / 2, x1 = b.cx + w / 2, z0 = b.z0 + SW + 1, z1 = z0 + d;
    building(x0, z0, x1, z1, 7, wallCol, false);
    // Neonschild über dem Eingang
    const nc = hexc(SHOP_NEON[kind]), text = SHOP_SIGN[kind], avail = w * 0.8 - 1.2;
    const lh = Math.min(1.1, avail * 4 / textUnits(text));
    signPanel(b.cx, 5.6, z0 - 0.2, 1, 0, w * 0.8, 2.0, 0.3);
    neonRect(b.cx, 5.6, z0 - 0.4, -1, 0, w * 0.8 - 0.3, 1.75, 0.055, nc);
    neonText(text, b.cx, 5.6, z0 - 0.45, -1, 0, lh, nc);
    addLight(b.cx, 5.2, z0 - 2.2, nc, 17, 1.6);
    if (kind === 'hospital') for (const sx of [-1, 1]) { const px = b.cx + sx * (w * 0.4 - 1.4); tube(px - 0.45, 5.6, z0 - 0.45, px + 0.45, 5.6, z0 - 0.45, 0.07, nc); tube(px, 5.15, z0 - 0.45, px, 6.05, z0 - 0.45, 0.07, nc); }
    // Leuchtkante am Dach und über den Schaufenstern
    roofLine(x0 - 0.15, z0 - 0.15, x1 + 0.15, z1 + 0.15, 7.55, nc, 0.05);
    tube(b.cx - 4.6, 3.35, z0 - 0.1, b.cx + 4.6, 3.35, z0 - 0.1, 0.04, hexc('#22e6ff'));
    box(wg, b.cx - 1.3, 0.15, z0 - 0.08, b.cx + 1.3, 3.0, z0 + 0.02, hexc('#14161c'));
    box(wg, b.cx - 4.5, 1.0, z0 - 0.06, b.cx - 2.0, 3.2, z0 + 0.02, hexc('#2c6f8c', 4));
    box(wg, b.cx + 2.0, 1.0, z0 - 0.06, b.cx + 4.5, 3.2, z0 + 0.02, hexc('#2c6f8c', 4));
    if (kind === 'spaeti' || kind === 'waffen') { flick = kind === 'spaeti'; neonText('OPEN', b.cx - 3.25, 2.3, z0 - 0.12, -1, 0, 0.45, hexc('#ff2bd6')); flick = false; }
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
    const nc = hexc(SHOP_NEON[kind]), text = SHOP_SIGN[kind];
    signPanel(b.cx, h - 0.9, z0 - 0.18, 1, 0, 12, 1.5, 0.35);
    neonText(text, b.cx, h - 0.9, z0 - 0.42, -1, 0, Math.min(0.95, 11 * 4 / textUnits(text)), nc);
    addLight(b.cx, h - 1.2, z0 - 2, nc, 15, 1.6);
    // Leuchtrahmen um die Einfahrt
    tube(x0 + 0.3, 0.2, z0 - 0.05, x0 + 0.3, h, z0 - 0.05, 0.06, nc); tube(x1 - 0.3, 0.2, z0 - 0.05, x1 - 0.3, h, z0 - 0.05, 0.06, nc);
    tube(x0 + 0.3, h + 0.55, z0 - 0.05, x1 - 0.3, h + 0.55, z0 - 0.05, 0.06, nc);
    shops.push({ kind: kind, name: name, x: b.cx, z: z0 + 6, r: 4, color: rgb(signCol), blip: blip, drive: true });
  }

  // Neon-Deko an normalen Gebäuden
  const WORDS = ['BAR', 'HOTEL', 'RAMEN', 'CYBER', 'CLUB', 'SUSHI', '24H', 'TECH', 'DATA', 'OPEN', 'PIZZA', 'DRINKS', 'ROBO', 'NOODLES', 'CASINO',
    'VR', 'NEON', 'KARAOKE', 'DISCO', 'KEBAB', 'PIXEL', 'SYNTH', 'MOTEL', 'TATTOO', 'ARCADE', 'BYTE', 'NOVA', 'ZERO', 'LOUNGE', 'CHROME', 'IMBISS', 'KINO'];
  const BLADE = ['BAR', 'HOTEL', 'RAMEN', 'CLUB', 'SUSHI', 'NEON', 'MOTEL', 'KINO', 'DISCO', 'TECH', 'VR', '24H'];
  const BRANDS = ['ZENTEK', 'NOVA CORP', 'SYNTHCO', 'HYPERION', 'OMNI', 'KAIRO', 'NEUROLINK', 'ARASHI', 'VOLTA', 'HELIX'];
  // zur Straße zeigende Fassaden eines Gebäudes im Block b: [Mitte x, Mitte z, nx, nz, Breite]
  function facades(b, x0, z0, x1, z1) {
    const out = [];
    if (z0 - b.z0 < 9) out.push([(x0 + x1) / 2, z0, 0, -1, x1 - x0]);
    if (b.z1 - z1 < 9) out.push([(x0 + x1) / 2, z1, 0, 1, x1 - x0]);
    if (x0 - b.x0 < 9) out.push([x0, (z0 + z1) / 2, -1, 0, z1 - z0]);
    if (b.x1 - x1 < 9) out.push([x1, (z0 + z1) / 2, 1, 0, z1 - z0]);
    return out;
  }
  // dens: Anteil der Fassaden mit Schild (kleine Zeilenhäuser bekommen weniger); top: Dachdeko (Kanten, Billboards, Hologramme)
  function decorate(b, x0, z0, x1, z1, h, dist, dens, top) {
    const fs = facades(b, x0, z0, x1, z1);
    if (dens == null) dens = 1;
    if (top == null) top = true;
    if (dens > 0 && (dist === 'downtown' || dist === 'altstadt' || dist === 'hafen')) {
      for (const f of fs) {
        const fx = f[0], fz = f[1], nx = f[2], nz = f[3], fw = f[4], rx = nz, rz = -nx, r = nr() / dens;
        if (r < 0.5) {
          const word = dist === 'hafen' ? 'DOCK ' + Math.floor(nrr(1, 10)) : npick(WORDS), lh = nrr(0.8, 1.5), tw = textUnits(word) * lh / 4;
          if (tw > fw - 2.5) continue;
          const y = Math.min(h - lh * 1.2, nrr(4.7, 9)), off = nrr(-1, 1) * (fw - tw - 2.5) / 2;
          flick = nr() < 0.12;
          facadeSign(fx + rx * off, fz + rz * off, nx, nz, y, word, lh, ncol(), nr() < 0.55);
          flick = false;
        } else if (r < 0.8 && h > 9 && dist !== 'hafen') {
          const word = npick(BLADE), lh = nrr(0.6, 0.85), L = word.length * lh * 1.35;
          const off = (nr() < 0.5 ? -1 : 1) * (fw / 2 - 1.6), top = Math.min(h - 0.8, nrr(L + 3, L + 7));
          flick = nr() < 0.1;
          bladeSign(fx + rx * off, fz + rz * off, nx, nz, top, word, lh, ncol());
          flick = false;
        }
      }
    }
    if (!top) return;
    if (dist === 'downtown') {
      const c = ncol(), corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      // leuchtende Gebäudekanten und Dachkante
      const k0 = Math.floor(nr() * 4);
      for (let k = 0; k < (nr() < 0.5 ? 2 : 4); k++) { const p = corners[(k0 + k * 2) % 4]; tube(p[0], 1.2, p[1], p[0], h, p[1], 0.07, c); }
      roofLine(x0 - 0.16, z0 - 0.16, x1 + 0.16, z1 + 0.16, h + 0.55, c, 0.07);
      if (nr() < 0.45) { const c2 = ncol(), n = 1 + Math.floor(nr() * 3); for (let k = 1; k <= n; k++) roofLine(x0 - 0.05, z0 - 0.05, x1 + 0.05, z1 + 0.05, h * k / (n + 1), c2, 0.05); }
      // Dach-Billboard oder Hologramm
      const f = fs[0];
      if (f && nr() < 0.45) {
        const fx = f[0] - f[2] * 2, fz = f[1] - f[3] * 2, nx = f[2], nz = f[3], rx = nz, rz = -nx;
        const word = npick(BRANDS), bw = Math.min(f[4] - 3, 13), bh = 4.5, by = h + 0.5 + 1.6 + bh / 2;
        if (bw > 6) {
          for (const sd of [-1, 1]) { const lx = fx + rx * sd * bw * 0.35, lz = fz + rz * sd * bw * 0.35; box(wg, lx - 0.15, h + 0.5, lz - 0.15, lx + 0.15, by - bh / 2, lz + 0.15, C.pole); }
          signPanel(fx, by, fz, rx, rz, bw, bh, 0.3);
          const bc = ncol();
          neonRect(fx + nx * 0.2, by, fz + nz * 0.2, rx, rz, bw - 0.3, bh - 0.3, 0.08, bc);
          addLight(fx + nx * 3, by, fz + nz * 3, bc, 22, 1.8);
          neonText(word, fx + nx * 0.24, by + 0.35, fz + nz * 0.24, rx, rz, Math.min(2.0, (bw - 1.5) * 4 / textUnits(word)), bc);
          tube(fx + nx * 0.24 - rx * bw * 0.3, by - 1.45, fz + nz * 0.24 - rz * bw * 0.3, fx + nx * 0.24 + rx * bw * 0.3, by - 1.45, fz + nz * 0.24 + rz * bw * 0.3, 0.06, ncol());
        }
      } else if (h > 40 && nr() < 0.6) {
        const hl = { x: (x0 + x1) / 2, y: h + 7, z: (z0 + z1) / 2, s: nrr(3, 4.5), col: rgb(npick(NEON)), sp: nrr(0.4, 0.9) };
        holos.push(hl); addLight(hl.x, hl.y, hl.z, hl.col, 22, 1.8);
      }
    } else if (dist === 'altstadt') {
      if (nr() < 0.4) roofLine(x0 - 0.16, z0 - 0.16, x1 + 0.16, z1 + 0.16, h + 0.55, ncol(), 0.05);
    } else if (dist === 'palmen' || dist === 'villen') {
      if (nr() < 0.8) roofLine(x0 - 0.16, z0 - 0.16, x1 + 0.16, z1 + 0.16, h + 0.55, hexc(nr() < 0.5 ? '#ff2bd6' : '#22e6ff'), 0.06);
      if (nr() < 0.5) roofLine(x0 - 0.04, z0 - 0.04, x1 + 0.04, z1 + 0.04, 0.5, hexc(nr() < 0.5 ? '#a14bff' : '#22e6ff'), 0.04);
    }
  }

  // Boden, Wasser, Straßen
  // Gelände und Meer baut der Abschnitt „Landschaft“ weiter unten; hier nur Stadtfläche und Kaimauer im Süden
  quad(wg, 0, 0, W, W, 0, C.asphalt);
  box(wg, -1, -0.6, -1.2, W + 1, 0.0, 0, C.barrier);
  box(wg, 0, 0, -0.9, W, 0.9, -0.3, C.barrier); addCol(-2, -1.5, W + 2, -0.3, 0.9);
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

  // ---- Stadtleben: Läden im Erdgeschoss, Balkone, Straßenmöbel, Szenen für Passanten ----
  // spots: Plätze, an denen in Spielernähe Passanten sitzen, warten, plaudern oder am Imbiss stehen (siehe updateSpots)
  const spots = [], vents = [];
  function addSpot(x, z, yaw, act, look) { spots.push({ x: x, z: z, yaw: yaw, act: act, look: look || null, ped: null, cool: 0 }); }
  const yawOf = (nx, nz) => Math.atan2(nx, nz);
  // Quader relativ zu einer Fassade: entlang der Fassade a0..a1, Höhe y0..y1, nach außen d0..d1 (Normale nx,nz)
  function faceBox(fx, fz, nx, nz, a0, a1, y0, y1, d0, d1, c) {
    const rx = nz, rz = -nx, xs = [], zs = [];
    for (const a of [a0, a1]) for (const d of [d0, d1]) { xs.push(fx + rx * a + nx * d); zs.push(fz + rz * a + nz * d); }
    box(wg, Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs), c);
  }
  const SHOPLIGHT = ['#ffcf8a', '#6fe0ff', '#ff8ad8', '#e8f4ff', '#b8ff9a', '#ffd76a'];
  const AWNING = ['#8b1e3a', '#1f5a7a', '#2f6b3a', '#6b2a8a', '#a8541e', '#22313f'];
  // Ladenfront im Erdgeschoss: Rahmen, leuchtendes Schaufenster, Tür, Markise, manchmal Neonleiste und Licht auf die Straße
  function storefront(fx, fz, nx, nz, w) {
    if (w < 4.5) return;
    const lc = hexc(nr() < 0.5 ? npick(SHOPLIGHT) : npick(NEON)), win = [lc[0] * 0.8, lc[1] * 0.8, lc[2] * 0.8, 4];
    faceBox(fx, fz, nx, nz, -w / 2 + 0.2, w / 2 - 0.2, 0.15, 3.75, 0, 0.06, hexc('#15171d'));
    faceBox(fx, fz, nx, nz, -w / 2 + 0.6, w / 2 - 2.0, 0.6, 3.2, 0.06, 0.1, win);
    faceBox(fx, fz, nx, nz, w / 2 - 1.7, w / 2 - 0.6, 0.15, 2.75, 0.06, 0.11, hexc('#2a2d35'));
    faceBox(fx, fz, nx, nz, w / 2 - 1.7, w / 2 - 0.6, 2.85, 3.05, 0.06, 0.12, win);
    if (nr() < 0.55) {
      const ac = hexc(npick(AWNING));
      faceBox(fx, fz, nx, nz, -w / 2 + 0.4, w / 2 - 0.4, 3.5, 3.68, 0.06, 1.45, ac);
      faceBox(fx, fz, nx, nz, -w / 2 + 0.4, w / 2 - 0.4, 3.22, 3.68, 1.38, 1.5, [ac[0] * 0.75, ac[1] * 0.75, ac[2] * 0.75, 0]);
    } else if (nr() < 0.5) {
      const rx = nz, rz = -nx;
      tube(fx - rx * (w / 2 - 0.5) + nx * 0.14, 3.45, fz - rz * (w / 2 - 0.5) + nz * 0.14, fx + rx * (w / 2 - 0.5) + nx * 0.14, 3.45, fz + rz * (w / 2 - 0.5) + nz * 0.14, 0.04, ncol());
    }
    if (nr() < 0.4) addLight(fx + nx * 1.4, 2.4, fz + nz * 1.4, lc, 7, 1.0);
  }
  // Balkone an einer Fassade
  function balconies(fx, fz, nx, nz, w, h) {
    const rail = hexc('#1b1d22'), slab = hexc('#6d6a66');
    for (let y = 4.6; y < h - 2.5; y += 3.4) for (const a of [-w / 4, w / 4]) {
      if (nr() < 0.3) continue;
      faceBox(fx, fz, nx, nz, a - 1.1, a + 1.1, y, y + 0.15, 0, 0.95, slab);
      faceBox(fx, fz, nx, nz, a - 1.1, a + 1.1, y + 0.15, y + 1.0, 0.88, 0.95, rail);
    }
  }
  // Dachaufbauten: Lüftung, Wassertank
  function roofStuff(x0, z0, x1, z1, h) {
    if (nr() < 0.5) { const x = lerp(x0 + 1.5, x1 - 3, nr()), z = lerp(z0 + 1.5, z1 - 3, nr()); roundBox(wg, x, h + 0.5, z, x + 1.8, h + 1.6, z + 1.4, 0.2, hexc('#5a5c62')); }
    if (nr() < 0.3) { const x = lerp(x0 + 2, x1 - 2, nr()), z = lerp(z0 + 2, z1 - 2, nr()); latheAt(wg, [[0, 1.1, 1.1, hexc('#6b4a32')], [2.2, 1.1, 1.1, hexc('#6b4a32')], [2.9, 0, 0, hexc('#3d3d40')]], 8, x, h + 1.6, z); for (const s of [-1, 1]) lineBox(wg, x + s * 0.7, h + 0.5, z, x + s * 0.7, h + 1.6, z, 0.12, 0, hexc('#2c2f36')); }
  }
  function rowColor() { return npick(['#6e4a3e', '#5c4b45', '#7a6250', '#4f3f3a', '#6b5a55', '#58443f', '#4a5260', '#5e4f6b', '#3f4a52']); }
  // Altstadt: geschlossene Häuserzeilen am Blockrand mit Läden unten, Hinterhof in der Mitte
  function rowBlock(b) {
    const lx0 = b.x0 + SW, lz0 = b.z0 + SW, lx1 = b.x1 - SW, lz1 = b.z1 - SW, D = sr(9.5, 12);
    const sides = [
      { a0: lx0, a1: lx1, mk: (p, q) => [p, lz0, q, lz0 + D], n: [0, -1] },
      { a0: lx0, a1: lx1, mk: (p, q) => [p, lz1 - D, q, lz1], n: [0, 1] },
      { a0: lz0 + D, a1: lz1 - D, mk: (p, q) => [lx0, p, lx0 + D, q], n: [-1, 0] },
      { a0: lz0 + D, a1: lz1 - D, mk: (p, q) => [lx1 - D, p, lx1, q], n: [1, 0] }
    ];
    for (const s of sides) {
      let p = s.a0;
      while (p < s.a1 - 4) {
        if (p > s.a0 + 6 && srand() < 0.08) { p += 3; continue; } // Durchgang
        let w = sr(7, 12); if (s.a1 - (p + w) < 6) w = s.a1 - p;
        const r = s.mk(p, p + w), h = sr(9, 21), nx = s.n[0], nz = s.n[1];
        building(r[0], r[1], r[2], r[3], h, rowColor(), true);
        const fx = nx < 0 ? r[0] : nx > 0 ? r[2] : (r[0] + r[2]) / 2, fz = nz < 0 ? r[1] : nz > 0 ? r[3] : (r[1] + r[3]) / 2;
        storefront(fx, fz, nx, nz, w);
        if (nr() < 0.3) balconies(fx, fz, nx, nz, w, h);
        roofStuff(r[0], r[1], r[2], r[3], h);
        decorate(b, r[0], r[1], r[2], r[3], h, 'altstadt', 0.35, nr() < 0.25);
        p += w;
      }
    }
    // Hinterhof: Baum und Wäscheleinen-Atmosphäre sparsam
    if (srand() < 0.6) tree(b.cx + sr(-4, 4), b.cz + sr(-4, 4));
  }
  // Stadtbaum im Pflanzkübel
  function streetTree(x, z) {
    box(wg, x - 0.55, 0.15, z - 0.55, x + 0.55, 0.45, z + 0.55, hexc('#3a3d45'));
    lineBox(wg, x, 0.45, z, x, 2.6, z, 0.16, 0, C.trunk);
    ellipGeo(wg, x, 3.3, z, 1.25, 1.1, 1.25, C.leaf2, 8);
    ellipGeo(wg, x + 0.3, 3.9, z - 0.2, 0.85, 0.75, 0.85, C.leaf, 8);
    addCol(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0.6);
  }
  // Bank (Sitzfläche zur Straße), optional mit sitzender Person
  function bench(x, z, nx, nz) {
    const W = hexc('#6b4a32'), M = hexc('#22252b');
    faceBox(x, z, nx, nz, -0.9, 0.9, 0.42, 0.5, -0.25, 0.25, W);
    faceBox(x, z, nx, nz, -0.9, 0.9, 0.5, 0.95, -0.3, -0.22, W);
    for (const a of [-0.75, 0.75]) faceBox(x, z, nx, nz, a - 0.05, a + 0.05, 0.15, 0.42, -0.2, 0.2, M);
    const ex = Math.abs(nx) > 0.5 ? 0.3 : 0.95, ez = Math.abs(nx) > 0.5 ? 0.95 : 0.3;
    addCol(x - ex, z - ez, x + ex, z + ez, 0.5);
    if (nr() < 0.6) addSpot(x + nx * 0.05 + nz * 0.35, z + nz * 0.05 - nx * 0.35, yawOf(nx, nz), 'sit');
  }
  // Bushaltestelle: Leuchtwerbung an der Bordsteinkante, Schild, wartende Leute
  function busStop(x, z, nx, nz) {
    const rx = nz, rz = -nx, ad = ncol();
    faceBox(x, z, -nx, -nz, -1.2, 1.2, 0.15, 2.4, -0.12, 0.12, hexc('#1b1d22'));
    faceBox(x, z, -nx, -nz, -1.05, 1.05, 0.35, 2.25, -0.16, 0.16, [ad[0] * 0.8, ad[1] * 0.8, ad[2] * 0.8, 4]);
    lineBox(wg, x + rx * 1.8, 0.15, z + rz * 1.8, x + rx * 1.8, 3.0, z + rz * 1.8, 0.08, 0, hexc('#2c2f36'));
    neonText('BUS', x + rx * 1.8 - nx * 0.1, 3.25, z + rz * 1.8 - nz * 0.1, -rx, -rz, 0.32, hexc('#ffe14d'));
    const ex = Math.abs(nx) > 0.5 ? 0.2 : 1.25, ez = Math.abs(nx) > 0.5 ? 1.25 : 0.2;
    addCol(x - ex, z - ez, x + ex, z + ez, 2.4);
    addLight(x - nx * 1, 2, z - nz * 1, ad, 6, 1.1);
    const n = 1 + Math.floor(nr() * 3);
    for (let k = 0; k < n; k++) addSpot(x - rx * (k - 1) * 1.1 - nx * 0.85, z - rz * (k - 1) * 1.1 - nz * 0.85, yawOf(nx, nz) + nrr(-0.5, 0.5), nr() < 0.5 ? 'phone' : 'wait');
  }
  // Imbissstand mit Schirm, Verkäufer und Kundschaft
  function foodStall(x, z, nx, nz) {
    const col = ncol(), rx = nz, rz = -nx;
    roundBox(wg, x - 1.1, 0.15, z - 1.1, x + 1.1, 1.1, z + 1.1, 0.12, hexc('#c9ccd2'));
    lineBox(wg, x, 1.1, z, x, 2.9, z, 0.08, 0, hexc('#2c2f36'));
    ellipGeo(wg, x, 3.0, z, 1.9, 0.35, 1.9, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85, 4], 10);
    neonText('FOOD', x + nx * 1.13, 0.7, z + nz * 1.13, rx, rz, 0.32, hexc('#ffe14d'));
    addCol(x - 1.1, z - 1.1, x + 1.1, z + 1.1, 1.1);
    addLight(x + nx * 1.5, 2.2, z + nz * 1.5, col, 8, 1.3);
    addSpot(x - nx * 1.55, z - nz * 1.55, yawOf(nx, nz), 'vendor');
    for (const a of [-0.7, 0.7]) addSpot(x + nx * 2.1 + rx * a, z + nz * 2.1 + rz * a, yawOf(-nx, -nz) + a * 0.3, 'wait');
  }
  // Gruppe, die zusammensteht und redet
  function chatGroup(x, z) {
    const n = 2 + Math.floor(nr() * 2), a0 = nr() * TAU;
    for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU, px = x + Math.sin(a) * 0.7, pz = z + Math.cos(a) * 0.7; addSpot(px, pz, Math.atan2(x - px, z - pz), 'chat'); }
  }
  // Straßenmöbel entlang der Gehwege eines Blocks (Bäume an der Bordsteinkante, Bänke an der Hauswand, Haltestelle)
  function streetFurniture(b, dist, special) {
    const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const busSide = !special && (dist === 'downtown' || dist === 'altstadt') && nr() < 0.5 ? Math.floor(nr() * 4) : -1;
    sides.forEach((n, si) => {
      // Punkt auf dem Gehweg: t entlang der Seite (-1..1), o = Abstand von der Bordsteinkante
      const at = (t, o) => n[0] ? [n[0] < 0 ? b.x0 + o : b.x1 - o, b.cz + t * BLOCK / 2] : [b.cx + t * BLOCK / 2, n[1] < 0 ? b.z0 + o : b.z1 - o];
      if (dist !== 'hafen' && dist !== 'villen') for (const t of [-0.52, 0.52]) { const p = at(t, 0.62); streetTree(p[0], p[1]); }
      if (si === busSide) { const p = at(0.32, 0.3); busStop(p[0], p[1], n[0], n[1]); }
      else if (!special && dist !== 'hafen' && nr() < 0.5) { const p = at(nr() < 0.5 ? -0.25 : 0.25, 2.6); bench(p[0], p[1], n[0], n[1]); }
    });
    // Dampf aus Gullydeckeln auf der Straße vor dem Block
    if (nr() < 0.35) {
      const vx = b.cx + nrr(-12, 12), vz = b.z0 - ROAD / 2 + nrr(-2, 2);
      quad(wg, vx - 0.45, vz - 0.45, vx + 0.45, vz + 0.45, 0.03, hexc('#1a1b1f'));
      vents.push({ x: vx, z: vz, t: nr() });
    }
  }
  // Platz in Downtown: Pflaster, Brunnen mit Leuchtring, Bänke, Imbiss, Gruppe
  function plaza(x0, z0, x1, z1, b) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    quad(wg, x0, z0, x1, z1, 0.153, hexc('#4c4f57'));
    latheAt(wg, [[0, 3.2, 3.2, hexc('#7a7d84')], [0.6, 3.2, 3.2, hexc('#7a7d84')], [0.6, 2.9, 2.9, hexc('#2a5f8a', 4)], [0.62, 0, 0, hexc('#2a5f8a', 4)]], 16, cx, 0.15, cz);
    latheAt(wg, [[0, 0.5, 0.5, hexc('#7a7d84')], [2.4, 0.35, 0.35, hexc('#7a7d84')], [2.4, 0.9, 0.9, hexc('#7a7d84')], [2.7, 0, 0, hexc('#7a7d84')]], 10, cx, 0.75, cz);
    roofLine(cx - 2.6, cz - 2.6, cx + 2.6, cz + 2.6, 0.78, hexc('#22e6ff'), 0.04);
    addCol(cx - 3.2, cz - 3.2, cx + 3.2, cz + 3.2, 0.6);
    addLight(cx, 2, cz, rgb('#22e6ff'), 9, 1.2);
    const fs = facades(b, x0, z0, x1, z1);
    const f = fs[0] || [cx, z0, 0, -1];
    foodStall(cx + f[2] * 6 + f[3] * 5.5, cz + f[3] * 6 - f[2] * 5.5, f[2], f[3]);
    for (const [dx, dz, nx, nz] of [[0, 5.5, 0, 1], [0, -5.5, 0, -1], [5.5, 0, 1, 0], [-5.5, 0, -1, 0]]) if (nr() < 0.6) bench(cx + dx, cz + dz, -nx, -nz);
    chatGroup(cx - f[3] * 6 - f[2] * 4, cz + f[2] * 6 - f[3] * 4);
    streetTree(x0 + 2, z0 + 2); streetTree(x1 - 2, z1 - 2);
  }
  // Downtown: Ladensockel mit Schaufenstern und darüber gestufte Türme mit Leuchtkanten und Antennen
  function towerBlock(b) {
    const lx0 = b.x0 + SW, lz0 = b.z0 + SW, half = (BLOCK - 2 * SW) / 2;
    const plazaQ = srand() < 0.55 ? Math.floor(srand() * 4) : -1;
    for (let q = 0; q < 4; q++) {
      const a = q % 2, c = q >> 1, x0 = lx0 + a * half + 0.6, z0 = lz0 + c * half + 0.6, x1 = x0 + half - 1.2, z1 = z0 + half - 1.2;
      if (q === plazaQ) { plaza(x0, z0, x1, z1, b); continue; }
      const hp = 7.4;
      building(x0, z0, x1, z1, hp, '#20242c', false);
      for (const f of facades(b, x0, z0, x1, z1)) {
        // zwei Läden je Straßenseite, darüber ein beleuchtetes Glasband
        for (const s of [-1, 1]) storefront(f[0] + f[3] * s * f[4] / 4, f[1] - f[2] * s * f[4] / 4, f[2], f[3], f[4] / 2 - 0.3);
        faceBox(f[0], f[1], f[2], f[3], -f[4] / 2 + 0.3, f[4] / 2 - 0.3, 4.5, 6.6, 0, 0.05, hexc('#3d5a78', 4));
      }
      decorate(b, x0, z0, x1, z1, hp, 'downtown', 0.6, false);
      // Turm mit bis zu drei Stufen
      const H = sr(32, 96), col = spick(['#3a4250', '#2c3442', '#454a5c', '#262c38', '#4a5566', '#363048', '#2f3b45']);
      let ti = sr(1.6, 3.0), tx0 = x0 + ti, tz0 = z0 + ti, tx1 = x1 - ti, tz1 = z1 - ti;
      const h1 = H * sr(0.55, 0.75);
      building(tx0, tz0, tx1, tz1, h1, col, true);
      roofLine(tx0 - 0.16, tz0 - 0.16, tx1 + 0.16, tz1 + 0.16, h1 + 0.55, ncol(), 0.06);
      let top = h1 + 0.5;
      if (H - h1 > 8) {
        const k = sr(1.4, 2.6); tx0 += k; tz0 += k; tx1 -= k; tz1 -= k;
        box(wg, tx0, top, tz0, tx1, H, tz1, hexc(col, 1));
        box(wg, tx0 - 0.12, H, tz0 - 0.12, tx1 + 0.12, H + 0.45, tz1 + 0.12, hexc('#2a2c31'));
        roofLine(tx0 - 0.14, tz0 - 0.14, tx1 + 0.14, tz1 + 0.14, H + 0.5, ncol(), 0.06);
        top = H + 0.45;
      }
      if (srand() < 0.4) {
        const sx = (tx0 + tx1) / 2, sz = (tz0 + tz1) / 2, sh = sr(7, 16);
        lineBox(wg, sx, top, sz, sx, top + sh, sz, 0.3, 0, hexc('#4a4e58'));
        tube(sx, top + sh, sz, sx, top + sh + 0.8, sz, 0.14, hexc('#ff3355'));
      }
      decorate(b, tx0, tz0, tx1, tz1, top - 0.5, 'downtown', 0, true);
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
  const CURB = { downtown: '#22e6ff', altstadt: '#ff2bd6', palmen: '#ff6ad5', villen: '#3ff5d0', hafen: '#ff8a1f', park: '#39ff88' };
  const blocks = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const b = blockRect(i, j), dist = districtOf(i, j);
    const park = (i === 5 && j === 5) || (i === 2 && j === 5);
    b.i = i; b.j = j; b.dist = park ? 'park' : dist; blocks.push(b);
    box(wg, b.x0, 0, b.z0, b.x1, 0.15, b.z1, C.side, true);
    roofLine(b.x0 - 0.03, b.z0 - 0.03, b.x1 + 0.03, b.z1 + 0.03, 0.12, hexc(CURB[park ? 'park' : dist]), 0.03);
    quad(wg, b.x0 + SW, b.z0 + SW, b.x1 - SW, b.z1 - SW, 0.151, park ? C.grass : LOTC[dist]);
    // Laternen
    const L = [[b.x0 + 0.6, b.z0 + 0.6, -0.7, -0.7], [b.x1 - 0.6, b.z0 + 0.6, 0.7, -0.7], [b.x1 - 0.6, b.z1 - 0.6, 0.7, 0.7], [b.x0 + 0.6, b.z1 - 0.6, -0.7, 0.7],
      [b.cx, b.z0 + 0.6, 0, -1], [b.cx, b.z1 - 0.6, 0, 1], [b.x0 + 0.6, b.cz, -1, 0], [b.x1 - 0.6, b.cz, 1, 0]];
    for (const l of L) lamp(l[0], l[1], l[2], l[3]);
    const lx0 = b.x0 + SW, lz0 = b.z0 + SW, lx1 = b.x1 - SW, lz1 = b.z1 - SW, half = (lx1 - lx0) / 2;
    const key = i + ',' + j;
    if (!park) streetFurniture(b, dist, !!SPECIAL[key]);
    if (SPECIAL[key]) {
      SPECIAL[key]();
      if (dist === 'palmen' || dist === 'hafen') { palm(lx0 + 2, lz1 - 2, sr(7, 10)); palm(lx1 - 2, lz1 - 2, sr(7, 10)); }
      else { const ha = sr(8, 16), ca = spick(['#6e4a3e', '#7a6250', '#58443f']), hb = sr(8, 16), cb = spick(['#5c4b45', '#4f3f3a', '#6b5a55']); building(lx0 + 1, lz1 - 14, lx0 + 15, lz1 - 1, ha, ca, true); building(lx1 - 15, lz1 - 14, lx1 - 1, lz1 - 1, hb, cb, true);
        decorate(b, lx0 + 1, lz1 - 14, lx0 + 15, lz1 - 1, ha, 'altstadt'); decorate(b, lx1 - 15, lz1 - 14, lx1 - 1, lz1 - 1, hb, 'altstadt'); }
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
      // Leben im Park: Bänke am Weg, eine Gruppe auf der Wiese
      bench(b.cx + 3, lz0 + 8, -1, 0); bench(b.cx - 3, lz1 - 8, 1, 0); bench(lx0 + 8, b.cz - 3, 0, 1);
      chatGroup(b.cx + 9, b.cz + 9);
      continue;
    }
    if (dist === 'downtown') {
      towerBlock(b);
    } else if (dist === 'altstadt') {
      rowBlock(b);
    } else if (dist === 'palmen') {
      for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) {
        const sx = lx0 + a * half, sz = lz0 + c * half;
        const h = sr(4, 7);
        building(sx + 4, sz + 4, sx + half - 4, sz + half - 5, h, spick(['#e8c1a0', '#a8d5c9', '#f0d9a8', '#d7a9b8', '#c3d3e8', '#f2e6d0']), true);
        decorate(b, sx + 4, sz + 4, sx + half - 4, sz + half - 5, h, 'palmen');
        palm(sx + 2, sz + 2, sr(7, 11));
      }
    } else if (dist === 'villen') {
      const h = sr(6, 9);
      building(lx0 + 6, lz0 + 14, lx1 - 8, lz1 - 4, h, spick(['#f2efe6', '#e9dcc5', '#dfe7ea']), true);
      decorate(b, lx0 + 6, lz0 + 14, lx1 - 8, lz1 - 4, h, 'villen');
      box(wg, lx0 + 6, 0.15, lz0 + 3, lx0 + 20, 0.2, lz0 + 10, hexc('#d7d2c4'));
      box(wg, lx0 + 7, 0.15, lz0 + 4, lx0 + 19, 0.21, lz0 + 9, hexc('#43b7d9', 4));
      palm(lx1 - 3, lz0 + 3, sr(8, 11)); palm(lx0 + 2.5, lz1 - 2.5, sr(8, 11)); palm(lx1 - 3, lz0 + 10, sr(8, 11));
    } else if (dist === 'hafen') {
      const col = spick(['#8a8f94', '#9c6b4e', '#5f7380']);
      building(lx0 + 2, lz0 + 12, lx0 + 24, lz1 - 2, 9, col, false);
      decorate(b, lx0 + 2, lz0 + 12, lx0 + 24, lz1 - 2, 9, 'hafen');
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
        // Warnlichter und Leuchtkante am Kran
        tube(lx0 + 3.5, 23.6, lz0 - 12, lx0 + 3.5, 23.6, lz0 + 12, 0.06, hexc('#ff8a1f'));
        tube(lx0 + 5.5, 23.6, lz0 - 12, lx0 + 5.5, 23.6, lz0 + 12, 0.06, hexc('#ff8a1f'));
        for (const zz of [lz0 - 11.6, lz0 + 11.6]) tube(lx0 + 4.5, 23.6, zz, lx0 + 4.5, 24.0, zz, 0.18, hexc('#ff3355'));
      }
    }
  }
  // ================= Landschaft: Insel, Berge, Küste =================
  // +x zeigt nach Westen, +z nach Norden (wie auf dem Radar); die Stadt liegt auf [0, W]².
  // Fahrbares Land bleibt flach (y ≈ 0), damit Fahrphysik und KI unverändert bleiben. Berge und Wasser sperrt ein grobes Raster (tb).
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const smooth = (e0, e1, v) => { const t = clamp((v - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const hash2 = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  function vnoise(x, z) {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return lerp(lerp(hash2(i, j), hash2(i + 1, j), u), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), u), v);
  }
  const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5.2, z * 2.1 + 1.3) * 0.3 + vnoise(x * 4.3 + 9.1, z * 4.3 + 3.7) * 0.15;
  // Abstand zu einem Polygon (innen positiv) bzw. zu einer offenen Linie
  function sdPoly(poly, x, z) {
    let d = Infinity, inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], az = poly[j][1], ex = poly[i][0] - ax, ez = poly[i][1] - az;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
      d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
      if ((az > z) !== (poly[i][1] > z) && x < ax + (z - az) / ez * ex) inside = !inside;
    }
    return inside ? d : -d;
  }
  function distLine(line, x, z) {
    let d = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const ax = line[i][0], az = line[i][1], ex = line[i + 1][0] - ax, ez = line[i + 1][1] - az;
      const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
      d = Math.min(d, Math.hypot(x - ax - ex * t, z - az - ez * t));
    }
    return d;
  }
  // Linienzug mit abgerundeten Ecken (quadratische Bézierbögen)
  function roundPath(pts, radii) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], a = pts[i - 1], b = pts[i + 1];
      const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]), ra = Math.min(radii[i], la / 2), rb = Math.min(radii[i], lb / 2);
      const t1 = [p[0] + (a[0] - p[0]) / la * ra, p[1] + (a[1] - p[1]) / la * ra], t2 = [p[0] + (b[0] - p[0]) / lb * rb, p[1] + (b[1] - p[1]) / lb * rb];
      for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push([u * u * t1[0] + 2 * u * t * p[0] + t * t * t2[0], u * u * t1[1] + 2 * u * t * p[1] + t * t * t2[1]]); }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  const ISLAND = [[-25, -1], [445, -1], [520, -25], [610, -35], [700, 10], [760, 110], [790, 240], [790, 380], [760, 500], [700, 590], [610, 660], [500, 720],
    [380, 750], [260, 755], [140, 735], [40, 700], [-60, 650], [-150, 580], [-205, 480], [-225, 360], [-220, 240], [-205, 140], [-185, 60], [-150, 5], [-90, -25]];
  const ISLE_C = [-185, -165], ISLE = [];
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; ISLE.push([ISLE_C[0] + Math.cos(a) * 62 * (1 + 0.12 * Math.sin(a * 3)), ISLE_C[1] + Math.sin(a) * 52 * (1 + 0.1 * Math.cos(a * 2))]); }
  const RIDGE = [[760, 520], [650, 630], [520, 690], [390, 715], [270, 715], [150, 700], [40, 665], [-70, 610], [-160, 530], [-200, 440]];
  const LAKE = { x: 130, z: 600, rx: 50, rz: 28 };
  const BRIDGE = [[-38, 2], [-150, -125]];
  const PIERS = [[-172, 45, -218], [-185, 75, -230], [-192, 100, -236]]; // Jachthafen: [Landseite x, z, Wasserseite x]
  // Straßen außerhalb der Stadt: Ringstraße, Zubringer zu den Rasterstraßen und Stichstraßen
  const RING = roundPath([[0, 7], [-60, 7], [-60, 480], [480, 480], [480, 7], [420, 7]], [0, 22, 70, 70, 22, 0]);
  const ROADS = [RING];
  for (const k of [1, 3, 5]) ROADS.push([[roadC(k), W], [roadC(k), 480]]);
  for (const k of [2, 4, 6]) { ROADS.push([[W, roadC(k)], [480, roadC(k)]]); ROADS.push([[0, roadC(k)], [-60, roadC(k)]]); }
  ROADS.push([[480, 239], [505, 239]], [[-60, 260], [-78, 260]], [[-60, 80], [-150, 80]], [[-60, 420], [-150, 420]], [[140, 480], [140, 548]]);
  const FLAT_RECTS = [[-22, -1, 442, 442, 22], [495, 80, 720, 465, 25], [-200, 25, -110, 135, 18]];
  const FLAT_CIRC = [[-130, 260, 62, 22], [-118, 420, 46, 20], [140, 545, 14, 10]];
  function flatW(x, z) {
    let w = 0;
    for (const r of FLAT_RECTS) { const dx = Math.max(r[0] - x, 0, x - r[2]), dz = Math.max(r[1] - z, 0, z - r[3]); w = Math.max(w, 1 - smooth(0, r[4], Math.hypot(dx, dz))); }
    for (const c of FLAT_CIRC) w = Math.max(w, 1 - smooth(c[2], c[2] + c[3], Math.hypot(x - c[0], z - c[1])));
    if (w >= 1) return 1;
    for (const l of ROADS) w = Math.max(w, 1 - smooth(14, 34, distLine(l, x, z)));
    return w;
  }
  function mountainH(x, z) {
    const d = distLine(RIDGE, x, z), n = fbm(x / 70, z / 70), w = 95 + 40 * n;
    if (d > w) return 0;
    const t = 1 - d / w;
    return (35 + 60 * n) * t * t * (3 - 2 * t) * (0.85 + 0.3 * fbm(x / 18, z / 18));
  }
  // Geländehöhe: Meer, Strand, flaches Land, Berge, See; Straßen und Plätze werden eingeebnet
  function terrainH(x, z) {
    const d = Math.max(sdPoly(ISLAND, x, z), sdPoly(ISLE, x, z));
    if (d < 0) return Math.max(-8, -0.7 + d * 0.12);
    let h = -0.7 + Math.min(1, d / 26) * 0.67;
    h += (fbm(x / 45, z / 45) - 0.5) * 0.22 * smooth(26, 60, d);
    h += mountainH(x, z) * smooth(10, 60, d);
    const ih = Math.hypot(x - ISLE_C[0], z - ISLE_C[1]);
    if (ih < 30) h += 9 * (1 - (ih / 30) * (ih / 30));
    const le = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    if (le < 1.6) h = lerp(-2.5, h, smooth(0.85, 1.6, le));
    return lerp(h, -0.03, flatW(x, z) * clamp(d / 12, 0, 1));
  }
  // Kollisionsraster (4 m): gesperrt sind Hänge und Wasser – außer Stadt, Brücke und Stege
  const TG = 4, TX0 = -320, TZ0 = -280, TNX = 300, TNZ = 280, TX1 = TX0 + TNX * TG, TZ1 = TZ0 + TNZ * TG;
  const terrHt = new Float32Array(TNX * TNZ), terrBl = new Uint8Array(TNX * TNZ);
  function walkable(x, z) {
    if (x > -3 && x < W + 3 && z > -0.5 && z < W + 3) return true;
    if (distLine(BRIDGE, x, z) < 4.6) return true;
    for (const p of PIERS) if (z > p[1] - 1.6 && z < p[1] + 1.6 && x < p[0] + 4 && x > p[2]) return true;
    return false;
  }
  for (let j = 0; j < TNZ; j++) for (let i = 0; i < TNX; i++) {
    const x = TX0 + (i + 0.5) * TG, z = TZ0 + (j + 0.5) * TG, h = terrainH(x, z), k = j * TNX + i;
    terrHt[k] = h; terrBl[k] = (h > 0.3 || h < -0.32) && !walkable(x, z) ? 1 : 0;
  }
  function terrH(x, z) {
    const i = Math.floor((x - TX0) / TG), j = Math.floor((z - TZ0) / TG);
    return i < 0 || j < 0 || i >= TNX || j >= TNZ ? -8 : terrHt[j * TNX + i];
  }

  // ---- Geländenetz (10 m) mit Farben nach Höhe, Hang und Küstennähe ----
  const terrG = geo();
  (() => {
    const TM = 10, MNX = 120, MNZ = 112, MX0 = -320, MZ0 = -280, S1 = MNX + 1;
    const HV = new Float32Array(S1 * (MNZ + 1));
    for (let j = 0; j <= MNZ; j++) for (let i = 0; i <= MNX; i++) HV[j * S1 + i] = terrainH(MX0 + i * TM, MZ0 + j * TM);
    const hv = (i, j) => HV[clamp(j, 0, MNZ) * S1 + clamp(i, 0, MNX)];
    const T = { sand: rgb('#a8946c'), grass: rgb('#45663b'), grass2: rgb('#36552f'), forest: rgb('#2a4530'), rock: rgb('#5d5955'), rock2: rgb('#7b766f'), bed: rgb('#2f3d40') };
    const VN = [], VC = [];
    for (let j = 0; j <= MNZ; j++) for (let i = 0; i <= MNX; i++) {
      const x = MX0 + i * TM, z = MZ0 + j * TM, h = hv(i, j);
      let nx = hv(i - 1, j) - hv(i + 1, j), ny = 2 * TM, nz = hv(i, j - 1) - hv(i, j + 1); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      let c;
      if (h < -0.45) c = T.bed;
      else {
        const d = Math.max(sdPoly(ISLAND, x, z), sdPoly(ISLE, x, z)), n = fbm(x / 30, z / 30);
        c = mix3(T.grass, T.grass2, n);
        if (d < 30 && h < 0.2) c = mix3(T.sand, c, smooth(18, 30, d));
        if (h > 0.4) c = mix3(c, T.forest, smooth(0.4, 4, h));
        if (h > 26) c = mix3(c, T.rock, smooth(26, 50, h));
        if (h > 52) c = mix3(c, T.rock2, smooth(52, 80, h));
        if (ny < 0.75) c = mix3(c, T.rock, smooth(0.75, 0.55, ny));
      }
      VN.push([nx, ny, nz]); VC.push([c[0], c[1], c[2], 0]);
    }
    const put = (i, j) => { const k = j * S1 + i, n = VN[k], c = VC[k]; terrG.d.push(MX0 + i * TM, HV[k], MZ0 + j * TM, n[0], n[1], n[2], c[0], c[1], c[2], c[3]); };
    for (let j = 0; j < MNZ; j++) for (let i = 0; i < MNX; i++) {
      const x0 = MX0 + i * TM, z0 = MZ0 + j * TM;
      if (Math.max(hv(i, j), hv(i + 1, j), hv(i, j + 1), hv(i + 1, j + 1)) < -0.66) continue; // liegt unter der Wasserfläche
      if (x0 >= 2 && x0 + TM <= W - 2 && z0 >= 2 && z0 + TM <= W - 2) continue;                  // von der Stadt verdeckt
      put(i, j); put(i + 1, j); put(i + 1, j + 1); put(i, j); put(i + 1, j + 1); put(i, j + 1);
    }
  })();
  quad(wg, -1500, -1500, 2200, 2200, -0.6, C.water);

  // ---- Straßen außerhalb der Stadt ----
  function ribbon(g, pts, off0, off1, y, c) {
    const n = pts.length, NS = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      NS.push([-dz / l, dx / l]);
    }
    for (let i = 0; i < n - 1; i++) {
      const p = pts[i], q = pts[i + 1], a = NS[i], b = NS[i + 1];
      const v = [[p[0] + a[0] * off0, p[1] + a[1] * off0], [p[0] + a[0] * off1, p[1] + a[1] * off1], [q[0] + b[0] * off1, q[1] + b[1] * off1], [q[0] + b[0] * off0, q[1] + b[1] * off0]];
      for (const t of TRI) g.d.push(v[t][0], y, v[t][1], 0, 1, 0, c[0], c[1], c[2], c[3]);
    }
  }
  function dashes(g, pts, w, y, c, dash, gap) {
    let phase = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], dx = pts[i + 1][0] - p[0], dz = pts[i + 1][1] - p[1], L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      const ux = dx / L, uz = dz / L, nx = -uz * w / 2, nz = ux * w / 2;
      let s = 0;
      while (s < L - 1e-6) {
        const inDash = phase < dash, step = Math.min(L - s, inDash ? dash - phase : dash + gap - phase);
        if (inDash) {
          const ax = p[0] + ux * s, az = p[1] + uz * s, bx = ax + ux * step, bz = az + uz * step;
          const v = [[ax + nx, az + nz], [ax - nx, az - nz], [bx - nx, bz - nz], [bx + nx, bz + nz]];
          for (const t of TRI) g.d.push(v[t][0], y, v[t][1], 0, 1, 0, c[0], c[1], c[2], c[3]);
        }
        s += step; phase = (phase + step) % (dash + gap);
      }
    }
  }
  const EDGE = hexc('#1fb5d0', 4), LINEY = C.line;
  ROADS.forEach((r, k) => {
    const y = k === 0 ? 0.026 : 0.022;
    ribbon(wg, r, -6, 6, y, C.asphalt);
    dashes(wg, r, 0.25, y + 0.004, LINEY, 3, 3);
    ribbon(wg, r, 5.2, 5.4, y + 0.004, EDGE); ribbon(wg, r, -5.4, -5.2, y + 0.004, EDGE);
  });
  // Laternen entlang der Ringstraße
  (() => {
    let next = 20, run = 0;
    for (let i = 0; i < RING.length - 1; i++) {
      const p = RING[i], dx = RING[i + 1][0] - p[0], dz = RING[i + 1][1] - p[1], L = Math.hypot(dx, dz);
      if (L < 1e-3) continue;
      const ux = dx / L, uz = dz / L;
      while (next <= run + L) { const s = next - run; lamp(p[0] + ux * s - uz * 7.4, p[1] + uz * s + ux * 7.4, uz, -ux); next += 48; }
      run += L;
    }
  })();

  // ---- Flughafen (Westen) ----
  quad(wg, 530, 170, 606, 320, 0.02, hexc('#4a4d55'));
  quad(wg, 645, 100, 675, 450, 0.025, hexc('#23252b'));
  quad(wg, 605, 110, 619, 440, 0.022, C.asphalt);
  quad(wg, 600, 135, 645, 149, 0.023, C.asphalt); quad(wg, 600, 401, 645, 415, 0.023, C.asphalt);
  dashes(wg, [[660, 118], [660, 432]], 0.9, 0.03, hexc('#e8e8e2'), 12, 8);
  for (let k = -5; k <= 5; k++) if (k) { quad(wg, 660 + k * 2.4 - 0.7, 104, 660 + k * 2.4 + 0.7, 114, 0.03, hexc('#e8e8e2')); quad(wg, 660 + k * 2.4 - 0.7, 436, 660 + k * 2.4 + 0.7, 446, 0.03, hexc('#e8e8e2')); }
  for (let z = 104; z <= 446; z += 24) for (const s of [-1, 1]) {
    box(wg, 660 + s * 15.6 - 0.25, 0, z - 0.25, 660 + s * 15.6 + 0.25, 0.35, z + 0.25, hexc('#bfeaff', 4));
    box(wg, 612 + s * 7.4 - 0.2, 0, z - 0.2, 612 + s * 7.4 + 0.2, 0.25, z + 0.2, hexc('#3d7bff', 4));
  }
  building(505, 190, 530, 300, 11, '#2e3644', true);
  roofLine(504.85, 189.85, 530.15, 300.15, 11.55, hexc('#22e6ff'), 0.07);
  facadeSign(505, 245, -1, 0, 8.4, 'AIRPORT', 2.2, hexc('#22e6ff'), true);
  facadeSign(530, 245, 1, 0, 8.4, 'GATE 1-6', 1.4, hexc('#ff2bd6'), false);
  roundBox(wg, 516, 0, 322, 524, 26, 330, 0.6, hexc('#3a3f4a'));
  roundBox(wg, 513, 26, 319, 527, 30, 333, 0.8, hexc('#5fc8e8', 4));
  roundBox(wg, 512.5, 30, 318.5, 527.5, 31.2, 333.5, 0.4, hexc('#1c1e24'));
  tube(520, 31.2, 326, 520, 33.5, 326, 0.12, hexc('#ff3355'));
  addCol(516, 322, 524, 330, 31);
  for (const z0 of [350, 405]) {
    building(505, z0, 540, z0 + 45, 13, '#3d4250', false);
    tube(540.1, 0.3, z0 + 4, 540.1, 10, z0 + 4, 0.08, hexc('#ff8a1f')); tube(540.1, 0.3, z0 + 41, 540.1, 10, z0 + 41, 0.08, hexc('#ff8a1f'));
    tube(540.1, 10, z0 + 4, 540.1, 10, z0 + 41, 0.08, hexc('#ff8a1f'));
  }
  // Flugzeug: steht als fliegbarer Jet auf dem Vorfeld (siehe spawnPlane)
  addLight(565, 8, 245, rgb('#bfeaff'), 30, 1.2);

  // ---- Stadion (Osten) ----
  function bandGeo(g, cx, cz, asp, ra, ya, rb, yb, dirH, dirY, c, seg) {
    for (let k = 0; k < seg; k++) {
      const a0 = k / seg * TAU, a1 = (k + 1) / seg * TAU, am = (a0 + a1) / 2;
      const P = (r, y, a) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r * asp];
      const v = [P(ra, ya, a0), P(ra, ya, a1), P(rb, yb, a1), P(rb, yb, a0)];
      const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[3][0] - v[0][0], v[3][1] - v[0][1], v[3][2] - v[0][2]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (nx * Math.cos(am) * dirH + ny * dirY + nz * Math.sin(am) * dirH < 0) { nx = -nx; ny = -ny; nz = -nz; }
      for (const t of TRI) g.d.push(v[t][0], v[t][1], v[t][2], nx, ny, nz, c[0], c[1], c[2], c[3]);
    }
  }
  (() => {
    const cx = -130, cz = 260, A = 0.82, SEG = 40;
    bandGeo(wg, cx, cz, A, 48, 0, 51, 15, 1, 0, hexc('#454a55'), SEG);
    bandGeo(wg, cx, cz, A, 48.65, 3.2, 48.75, 3.7, 1, 0, hexc('#22e6ff', 4), SEG);
    bandGeo(wg, cx, cz, A, 50.42, 11.8, 50.55, 12.5, 1, 0, hexc('#ff2bd6', 4), SEG);
    bandGeo(wg, cx, cz, A, 51, 15, 46, 15.4, 0, 1, hexc('#2c2f36'), SEG);
    for (let k = 0; k < 6; k++) {
      const t0 = k / 6, t1 = (k + 1) / 6;
      bandGeo(wg, cx, cz, A, lerp(46, 32, t0), lerp(15.4, 2, t0), lerp(46, 32, t1), lerp(15.4, 2, t1), -1, 1, hexc(k % 2 ? '#3b2a52' : '#5a3d7a'), SEG);
    }
    bandGeo(wg, cx, cz, A, 32, 2, 31, 0.5, -1, 0, hexc('#2c2f36'), SEG);
    bandGeo(wg, cx, cz, A, 31, 0.5, 0, 0.5, 0, 1, hexc('#2f7a3f'), SEG);
    bandGeo(wg, cx, cz, A, 22.4, 0.52, 22, 0.52, 0, 1, hexc('#d8e0d8'), SEG);
    addCol(cx - 51, cz - 42, cx + 51, cz + 42, 15);
    facadeSign(cx + 49.6, cz, 1, 0, 9, 'ARENA', 3, hexc('#ff2bd6'), true);
    for (const a of [0.6, 2.55, 3.75, 5.7]) {
      const x = cx + Math.cos(a) * 56, z = cz + Math.sin(a) * 56 * A;
      lineBox(wg, x, 0, z, x, 32, z, 0.7, 0, hexc('#3a3d45'));
      roundBox(wg, x - 2.4, 31, z - 1.2, x + 2.4, 33.4, z + 1.2, 0.3, hexc('#f4fbff', 4));
      addLight(lerp(x, cx, 0.25), 30, lerp(z, cz, 0.25), rgb('#dff4ff'), 55, 1.4);
    }
  })();

  // ---- Jachthafen mit Riesenrad (Osten, an der Küste) ----
  for (const p of PIERS) {
    box(wg, p[2], 0, p[1] - 1.5, p[0] + 2, 0.3, p[1] + 1.5, hexc('#5a4632'));
    for (let x = p[2] + 1; x < p[0]; x += 6) for (const s of [-1, 1]) box(wg, x - 0.2, -1.6, p[1] + s * 1.5 - 0.2, x + 0.2, 0.45, p[1] + s * 1.5 + 0.2, hexc('#3d3024'));
    tube(p[2] + 0.5, 0.35, p[1] - 1.45, p[2] + 0.5, 0.35, p[1] + 1.45, 0.05, hexc('#22e6ff'));
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const bx = p[2] + 7 + k * 11, bz = p[1] + s * 4.2;
      ellipGeo(wg, bx, -0.35, bz, 4.4, 0.95, 1.55, hexc(k % 2 ? '#e8eef2' : '#c9d4dc'), 10);
      roundBox(wg, bx - 1.6, 0.4, bz - 0.9, bx + 1.2, 1.5, bz + 0.9, 0.25, hexc('#1c2430'));
    }
  }
  const FW = { x: -163, y: 22, z: 112, r: 17 };
  const fwT = geo(), fwG = geo();
  (() => {
    for (const s of [-1, 1]) for (const dz of [-9, 9]) lineBox(wg, FW.x + s * 3, 0, FW.z + dz, FW.x + s * 1.1, FW.y, FW.z, 0.6, 0, hexc('#3a3d45'));
    roundBox(wg, FW.x - 4, 0, FW.z - 11, FW.x + 4, 0.6, FW.z + 11, 0.3, hexc('#2c2f36'));
    addCol(FW.x - 4, FW.z - 11, FW.x + 4, FW.z + 11, 30);
    const RIM = hexc('#ff2bd6'), SP = hexc('#22e6ff'), n = 36;
    for (let k = 0; k < n; k++) {
      const a0 = k / n * TAU, a1 = (k + 1) / n * TAU;
      for (const sx of [-0.9, 0.9]) tubeTo(fwT, fwG, sx, Math.cos(a0) * FW.r, Math.sin(a0) * FW.r, sx, Math.cos(a1) * FW.r, Math.sin(a1) * FW.r, 0.12, RIM);
    }
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; tubeTo(fwT, fwG, 0, 0, 0, 0, Math.cos(a) * FW.r, Math.sin(a) * FW.r, 0.07, SP); }
    tubeTo(fwT, fwG, -1.2, 0, 0, 1.2, 0, 0, 0.3, SP);
  })();
  addLight(FW.x + 6, FW.y, FW.z, rgb('#ff2bd6'), 45, 1.6);

  // ---- Leuchtturm auf der kleinen Insel und Brücke dorthin ----
  function latheAt(g, rings, seg, ox, oy, oz) {
    const t = geo(); latheGeo(t, rings, seg);
    for (let k = 0; k < t.d.length; k += 10) { t.d[k] += ox; t.d[k + 1] += oy; t.d[k + 2] += oz; }
    for (const v of t.d) g.d.push(v);
  }
  const LH = { x: ISLE_C[0], z: ISLE_C[1], y: terrainH(ISLE_C[0], ISLE_C[1]) - 0.3 };
  (() => {
    const Wc = hexc('#e8e8e2'), Rc = hexc('#c0392b'), rings = [];
    for (let k = 0; k < 6; k++) rings.push([k * 3.6, 3.2 - k * 0.22, 3.2 - k * 0.22, k % 2 ? Rc : Wc]);
    rings.push([21.6, 1.9, 1.9, hexc('#2c2f36')], [21.6, 2.6, 2.6, hexc('#2c2f36')], [22.1, 2.6, 2.6, hexc('#2c2f36')], [22.1, 1.6, 1.6, hexc('#fff2b0', 4)],
      [25, 1.6, 1.6, hexc('#2c2f36')], [25, 2.0, 2.0, hexc('#2c2f36')], [26.6, 0, 0, hexc('#2c2f36')]);
    latheAt(wg, rings, 14, LH.x, LH.y, LH.z);
    addLight(LH.x, LH.y + 23.5, LH.z, rgb('#fff2b0'), 40, 1.6);
  })();
  (() => {
    const ax = BRIDGE[0][0], az = BRIDGE[0][1], bx = BRIDGE[1][0], bz = BRIDGE[1][1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const px = Math.cos(yaw), pz = -Math.sin(yaw), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    boxC(wg, mx, -0.22, mz, 9, 0.5, L, hexc('#3a3d45'), yaw);
    boxC(wg, mx, 0.032, mz, 7.6, 0.01, L, C.asphalt, yaw);
    for (const s of [-1, 1]) {
      boxC(wg, mx + px * s * 4.35, 0.55, mz + pz * s * 4.35, 0.18, 1.0, L, hexc('#2c2f36'), yaw);
      tube(ax + px * s * 4.35, 1.1, az + pz * s * 4.35, bx + px * s * 4.35, 1.1, bz + pz * s * 4.35, 0.06, hexc('#22e6ff'));
    }
    for (let s = 12; s < L - 6; s += 18) boxC(wg, ax + dx / L * s, -2.5, az + dz / L * s, 2.2, 4.2, 2.2, hexc('#2c2f36'), yaw);
  })();

  // ---- Süden: Piers und Frachter im Hafen ----
  for (const x of [60, 262, 362]) {
    box(wg, x - 3, -0.6, -42, x + 3, 0.32, -1.2, hexc('#5d6068'));
    for (let z = -6; z > -42; z -= 9) box(wg, x - 3.3, -2, z - 0.3, x + 3.3, 0.33, z + 0.3, hexc('#3a3d45'));
  }
  (() => {
    roundBox(wg, 118, -3, -66, 205, 4.5, -50, 2, hexc('#6b2a2a'));
    roundBox(wg, 190, 4.5, -64, 203, 13, -52, 1, hexc('#d8d8d2'));
    for (let k = 0; k < 6; k++) for (let t = 0; t < 2; t++) box(wg, 124 + k * 10.5, 4.5 + t * 2.6, -63, 133 + k * 10.5, 7.1 + t * 2.6, -53, hexc(['#b03a2e', '#2e6fb0', '#d68b2a', '#3a8a4f', '#7a3ab0', '#a8a8a8'][(k + t * 3) % 6]));
    tube(118.5, 4.6, -58, 205, 4.6, -58, 0.08, hexc('#ff8a1f'));
  })();

  // ---- Wohnsiedlung im Nordosten ----
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const x = -82 - k * 18, z = 420 + s * 16, h = sr(5, 8);
    building(x - 6, z - 5, x + 6, z + 5, h, spick(['#e8c1a0', '#a8d5c9', '#f0d9a8', '#d7a9b8', '#c3d3e8']), true);
    roofLine(x - 6.16, z - 5.16, x + 6.16, z + 5.16, h + 0.55, hexc(k % 2 ? '#ff2bd6' : '#22e6ff'), 0.05);
  }

  // ---- Schriftzug am Berg und Sendemast ----
  (() => {
    const text = 'NEON CITY', h = 9, s = h / 4, w = textUnits(text) * s, z = 650, col = hexc('#ff2bd6');
    for (let k = 0; k < text.length; k++) {
      const x = 240 + w / 2 - k * 3 * s - s, base = terrainH(x, z);
      if (text[k] !== ' ') neonText(text[k], x, base + h / 2 + 0.6, z, -1, 0, h, col, 0.42);
    }
    const tx = 330, tz = 712, ty = terrainH(tx, tz) - 0.5;
    for (const [ox, oz] of [[-4, -4], [4, -4], [4, 4], [-4, 4]]) lineBox(wg, tx + ox, ty, tz + oz, tx + ox * 0.12, ty + 48, tz + oz * 0.12, 0.35, 0, hexc('#4a4e58'));
    for (const y of [16, 32]) { const k = 1 - y / 48 * 0.88; roofLine(tx - 4 * k, tz - 4 * k, tx + 4 * k, tz + 4 * k, ty + y, hexc('#ff3355'), 0.08); }
    tube(tx, ty + 48, tz, tx, ty + 50, tz, 0.25, hexc('#ff3355'));
  })();

  // ---- Bäume: Laubbäume und Palmen im Flachland, Nadelbäume an den Hängen ----
  function pine(x, y, z, s) {
    latheAt(wg, [[0, 0.22 * s, 0.22 * s, C.trunk], [1.2 * s, 0.22 * s, 0.22 * s, C.trunk], [1.2 * s, 2.1 * s, 2.1 * s, C.leaf], [4.2 * s, 1.2 * s, 1.2 * s, C.leaf],
      [4.2 * s, 1.6 * s, 1.6 * s, C.leaf2], [7.8 * s, 0, 0, C.leaf2]], 6, x, y, z);
  }
  for (let k = 0, placed = 0; k < 900 && placed < 70; k++) {
    const x = sr(-220, 780), z = sr(-40, 700), h = terrainH(x, z), d = sdPoly(ISLAND, x, z);
    if (h < -0.1 || h > 0.25 || d < 8 || flatW(x, z) > 0.15) continue;
    if (x > -10 && x < W + 10 && z > -10 && z < W + 10) continue;
    if (ROADS.some((r) => distLine(r, x, z) < 18)) continue;
    if (d < 70) palm(x, z, sr(7, 11)); else tree(x, z);
    placed++;
  }
  for (let k = 0, placed = 0; k < 2500 && placed < 260; k++) {
    const x = sr(-230, 790), z = sr(380, 760), h = terrainH(x, z);
    if (h < 2.5 || h > 45) continue;
    const g = Math.hypot(terrainH(x + 3, z) - terrainH(x - 3, z), terrainH(x, z + 3) - terrainH(x, z - 3)) / 6;
    if (g > 0.9) continue;
    pine(x, h - 0.4, z, sr(0.8, 1.35));
    placed++;
  }

  const worldMesh = upload(wg);
  wg.d = null;
  const terrainMesh = upload(terrG), fwTubes = upload(fwT), fwGlow = upload(fwG);
  terrG.d = fwT.d = fwG.d = null;
  const neonTubes = upload(neonT), neonGlow = upload(neonG), flickTubes = upload(flickT), flickGlow = upload(flickG);
  neonT.d = neonG.d = flickT.d = flickG.d = null;
  const shopOf = (kind) => shops.find((s) => s.kind === kind);

  // ---- Minikarte vorrendern ----
  // 1 Pixel = 1 Meter über das ganze Geländeraster; x ist gespiegelt, damit Westen links liegt
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = TX1 - TX0; mapCanvas.height = TZ1 - TZ0;
  const mapX = (x) => TX1 - x, mapY = (z) => TZ1 - z;
  (() => {
    const c = mapCanvas.getContext('2d');
    // Gelände aus dem Höhenraster: Wasser, Strand, Land, Berge
    const small = document.createElement('canvas'); small.width = TNX; small.height = TNZ;
    const sc2 = small.getContext('2d'), img = sc2.createImageData(TNX, TNZ);
    for (let j = 0; j < TNZ; j++) for (let i = 0; i < TNX; i++) {
      const h = terrHt[j * TNX + i], p = ((TNZ - 1 - j) * TNX + (TNX - 1 - i)) * 4;
      const col = h < -0.6 ? [34, 78, 108] : h < -0.2 ? [140, 126, 92] : h < 0.4 ? [74, 104, 62] : h < 25 ? [58, 86, 56] : h < 50 ? [92, 96, 84] : [128, 126, 118];
      img.data[p] = col[0]; img.data[p + 1] = col[1]; img.data[p + 2] = col[2]; img.data[p + 3] = 255;
    }
    sc2.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true; c.drawImage(small, 0, 0, mapCanvas.width, mapCanvas.height);
    // Straßen außerhalb der Stadt, Flughafen, Stadion, Brücke
    c.strokeStyle = '#2b2e33'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of ROADS) { c.lineWidth = 12; c.beginPath(); r.forEach((p, k) => (k ? c.lineTo : c.moveTo).call(c, mapX(p[0]), mapY(p[1]))); c.stroke(); }
    c.lineWidth = 9; c.beginPath(); c.moveTo(mapX(BRIDGE[0][0]), mapY(BRIDGE[0][1])); c.lineTo(mapX(BRIDGE[1][0]), mapY(BRIDGE[1][1])); c.stroke();
    c.fillStyle = '#2b2e33'; c.fillRect(mapX(675), mapY(450), 30, 350); c.fillRect(mapX(619), mapY(440), 14, 330); c.fillRect(mapX(606), mapY(320), 76, 150);
    c.fillStyle = '#5a3d7a'; c.beginPath(); c.ellipse(mapX(-130), mapY(260), 51, 42, 0, 0, TAU); c.fill();
    c.fillStyle = '#2f7a3f'; c.beginPath(); c.ellipse(mapX(-130), mapY(260), 31, 25, 0, 0, TAU); c.fill();
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
    pickup: { name: 'Pick-up', L: 5.0, Wd: 2.0, H: 1.75, max: 37, acc: 12, grip: 6.5, colors: ['#6b4a2a', '#2e5e3e', '#9a9a9a', '#a33a2a'] },
    plane: { name: 'Neon Jet', L: 14, Wd: 3.0, H: 4.4, span: 13, max: 12, acc: 4, grip: 6, colors: ['#e8ecf2'] }
  };
  // ---- Autos: Karosserie als Folge abgerundeter Querschnitte entlang der Länge (+z = vorn) ----
  // sec: { z, x (Mitte), wb/wt (halbe Breite unten/oben), yb/yt (Unter-/Oberkante), r (Eckradius) }
  // col(x, y, z, nx, ny, nz) liefert die Farbe je Viereck, capCol die Farbe der Deckel vorn und hinten
  function loftGeo(g, secs, col, capCol) {
    const A = loftA, P = [];
    for (const s of secs) {
      const r = Math.max(0.002, Math.min(s.r, (s.yt - s.yb) / 2 - 0.001, s.wb, s.wt)), sx = s.x || 0;
      const cs = [[s.wb - r, s.yb + r, -90], [s.wt - r, s.yt - r, 0], [-(s.wt - r), s.yt - r, 90], [-(s.wb - r), s.yb + r, 180]];
      const ring = [];
      for (const c of cs) for (let k = 0; k <= A; k++) { const a = (c[2] + 90 * k / A) * Math.PI / 180; ring.push([sx + c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), s.z]); }
      P.push(ring);
    }
    const n = P.length, m = P[0].length, N = [];
    for (let i = 0; i < n; i++) {
      const row = [], s = secs[i], cy = (s.yb + s.yt) / 2;
      for (let j = 0; j < m; j++) {
        const a = P[i][(j + 1) % m], b = P[i][(j + m - 1) % m], c = P[Math.min(n - 1, i + 1)][j], d = P[Math.max(0, i - 1)][j];
        const t1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], t2 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
        let nx = t1[1] * t2[2] - t1[2] * t2[1], ny = t1[2] * t2[0] - t1[0] * t2[2], nz = t1[0] * t2[1] - t1[1] * t2[0];
        const ox = P[i][j][0] - (s.x || 0), oy = P[i][j][1] - cy;
        let l = Math.hypot(nx, ny, nz);
        if (l < 1e-9) { nx = ox; ny = oy; nz = 0; l = Math.hypot(nx, ny) || 1; }
        nx /= l; ny /= l; nz /= l;
        if (nx * ox + ny * oy < 0) { nx = -nx; ny = -ny; nz = -nz; }
        row.push([nx, ny, nz]);
      }
      N.push(row);
    }
    const put = (v, nn, c) => g.d.push(v[0], v[1], v[2], nn[0], nn[1], nn[2], c[0], c[1], c[2], c[3]);
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
      const q = [[i, j], [i, (j + 1) % m], [i + 1, (j + 1) % m], [i + 1, j]];
      let cx = 0, cy = 0, cz = 0, fx = 0, fy = 0, fz = 0;
      for (const v of q) { const p = P[v[0]][v[1]], nn = N[v[0]][v[1]]; cx += p[0] / 4; cy += p[1] / 4; cz += p[2] / 4; fx += nn[0]; fy += nn[1]; fz += nn[2]; }
      const fl = Math.hypot(fx, fy, fz) || 1, c = col(cx, cy, cz, fx / fl, fy / fl, fz / fl);
      for (const t of TRI) { const v = q[t]; put(P[v[0]][v[1]], N[v[0]][v[1]], c); }
    }
    for (const i of [0, n - 1]) {
      const s = secs[i], ctr = [s.x || 0, (s.yb + s.yt) / 2, s.z], nn = [0, 0, i === 0 ? -1 : 1];
      const c = capCol || col(ctr[0], ctr[1], s.z, 0, 0, nn[2]);
      for (let j = 0; j < m; j++) { put(ctr, nn, c); put(P[i][j], nn, c); put(P[i][(j + 1) % m], nn, c); }
    }
  }
  // Abgerundeter Quader (Spoiler, Ladefläche, Dachschild …)
  function roundBox(g, x0, y0, z0, x1, y1, z1, r, c) {
    r = Math.min(r, (z1 - z0) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
    const hw = (x1 - x0) / 2, cx = (x0 + x1) / 2, secs = [];
    for (const [z, e] of [[z0, 0.45], [z0 + r * 0.3, 0.85], [z0 + r, 1], [z1 - r, 1], [z1 - r * 0.3, 0.85], [z1, 0.45]]) {
      const ins = r * (1 - e);
      secs.push({ z: z, x: cx, wb: hw - ins, wt: hw - ins, yb: y0 + ins, yt: y1 - ins, r: r });
    }
    loftGeo(g, secs, () => c, c);
  }
  // Rad: Reifen mit gerundeter Lauffläche und Felge; side = +1 rechts, -1 links (Felge zeigt nach außen)
  function wheelGeo(g, cx, cy, cz, R, w, side, tire, rim, seg) {
    const t = geo();
    latheGeo(t, [[-w / 2, 0, 0, tire], [-w / 2, R * 0.8, R * 0.8, tire], [-w / 2 + 0.04, R * 0.98, R * 0.98, tire], [w / 2 - 0.04, R * 0.98, R * 0.98, tire],
      [w / 2, R * 0.8, R * 0.8, tire], [w / 2 + 0.004, R * 0.62, R * 0.62, rim], [w / 2 - 0.035, R * 0.55, R * 0.55, rim], [w / 2 - 0.02, R * 0.2, R * 0.2, rim],
      [w / 2 + 0.012, 0, 0, rim]], seg || 16);
    // Achse der Drehfigur (y) wird zur Querachse x
    for (let k = 0; k < t.d.length; k += 10) {
      const d = t.d;
      g.d.push(cx + d[k + 1] * side, cy + d[k], cz + d[k + 2], d[k + 4] * side, d[k + 3], d[k + 5], d[k + 6], d[k + 7], d[k + 8], d[k + 9]);
    }
    // fünf Speichen
    for (let s = 0; s < 5; s++) {
      const a = s / 5 * TAU;
      mIdent(GM); tr(GM, cx + side * (w / 2 - 0.02), cy, cz); rx(GM, a); tr(GM, 0, R * 0.36, 0); sc(GM, 0.03, R * 0.38, 0.06); boxM(g, GM, rim);
    }
  }
  // Karosserieformen je Typ: gb/gf = Fuß von Heck-/Frontscheibe, r0..r1 = flaches Dach, hood = Absenkung der Motorhaube
  const CAR_SHAPE = {
    sedan: { gb: -0.62, r0: -0.36, r1: 0.1, gf: 0.36, hood: 0.08, R: 0.36 },
    taxi: { gb: -0.62, r0: -0.36, r1: 0.1, gf: 0.36, hood: 0.08, R: 0.36 },
    police: { gb: -0.62, r0: -0.36, r1: 0.1, gf: 0.36, hood: 0.08, R: 0.36 },
    sport: { gb: -0.66, r0: -0.24, r1: -0.02, gf: 0.3, hood: 0.1, R: 0.34 },
    pickup: { gb: -0.06, r0: -0.05, r1: 0.24, gf: 0.44, hood: 0.05, R: 0.4 },
    van: { gb: -1, r0: -1, r1: 0.42, gf: 0.72, hood: 0.04, R: 0.38 }
  };
  function buildCarMesh(key, T, lod) {
    const g = geo(), hw = T.Wd / 2, hl = T.L / 2, H = T.H, S = CAR_SHAPE[key];
    const PAINT = [1, 1, 1, 2], DOOR = [1, 1, 1, 3], GLASS = hexc('#16202a'), TIRE = hexc('#141414'), RIM = hexc('#9aa0a8'), DARK = hexc('#17181b');
    const HEAD = hexc('#e8f6ff', 4), DRL = hexc('#7fe8ff', 4), TAIL = hexc('#ff2238', 4);
    const E = (cx, cy, cz, rx, ry, rz, c) => ellipGeo(g, cx, cy, cz, rx, ry, rz, c, lod ? 6 : 12);
    const step = lod ? 0.22 : 0.07; loftA = lod ? 2 : 4;
    const low = 0.3, top = key === 'van' ? low + H * 0.36 : low + H * 0.4;
    const gb = S.gb * hl, r0 = S.r0 * hl, r1 = S.r1 * hl, gf = S.gf * hl, R = S.R, wz = hl * 0.63;
    const archTop = Math.min(R * 2 + 0.08, top - 0.1), archR = R + 0.1;
    // Unterbau: runde Enden, abfallende Haube, Radkästen
    const secAt = (z) => {
      const d = hl - Math.abs(z), e = d < 0.3 ? Math.sqrt(Math.max(0, 1 - Math.pow(1 - d / 0.3, 2))) : 1;
      let yt = top - (1 - e) * 0.16, yb = low + (1 - e) * 0.1;
      if (z > gf) yt -= (z - gf) / (hl - gf) * S.hood;
      for (const s of [-1, 1]) { const dz = Math.abs(z - s * wz); if (dz < archR) yb = Math.max(yb, low + (archTop - low) * Math.sqrt(1 - Math.pow(dz / archR, 2))); }
      return { z: z, wb: hw * (0.84 + 0.16 * e) - 0.02, wt: hw * (0.82 + 0.16 * e) - 0.05, yb: yb, yt: yt, r: 0.17 };
    };
    const zs = [];
    for (const d of [0, 0.02, 0.06, 0.12, 0.2, 0.3]) { zs.push(-hl + d); zs.push(hl - d); }
    for (let z = -hl + 0.37; z < hl - 0.36; z += step) zs.push(z);
    zs.sort((a, b) => a - b);
    loftGeo(g, zs.map(secAt), (x, y, z, nx) => {
      if (y < low + 0.17 && Math.abs(z) > hl - 0.32) return DARK;
      if (y < low + 0.1 && Math.abs(nx) > 0.5) return DARK;
      if (key === 'police' && Math.abs(nx) > 0.6 && Math.abs(z) < hl * 0.34 && y > low + 0.14 && y < top - 0.06) return DOOR;
      return PAINT;
    });
    // Kabine: schräge Scheiben, nach innen geneigte Seiten, Dachsäulen in Wagenfarbe
    const gz = [gb, r0, r1, gf];
    for (let z = gb; z < gf; z += step * 0.9) gz.push(z);
    gz.sort((a, b) => a - b);
    const cz = gz.filter((z, i) => i === 0 || z - gz[i - 1] > 0.005);
    const wbg = hw * (key === 'van' ? 0.97 : 0.9) - 0.03, wtg = hw * (key === 'van' ? 0.9 : 0.7);
    const cab = cz.map((z) => {
      let yt = H;
      if (z < r0) yt = top + (H - top) * (z - gb) / (r0 - gb);
      else if (z > r1) yt = H - (H - top) * (z - r1) / (gf - r1);
      yt = Math.max(top + 0.002, yt);
      return { z: z, wb: wbg, wt: lerp(wbg, wtg, clamp((yt - top) / (H - top), 0, 1)), yb: top - 0.03, yt: yt, r: 0.12 };
    });
    const bp = (r0 + r1) / 2;
    loftGeo(g, cab, (x, y, z, nx, ny) => {
      if (ny > 0.88) return PAINT;
      if (Math.abs(nx) > 0.6) {
        if (y > H - 0.07 || y < top + 0.04) return PAINT;
        if (key === 'van') return z > hl * 0.3 ? GLASS : PAINT;
        if (Math.abs(z - bp) < 0.07) return PAINT;
        return GLASS;
      }
      if (key === 'van' && z < 0) return Math.abs(x) < wtg * 0.4 && y > top + 0.35 && y < H - 0.15 && Math.abs(x) > 0.06 ? GLASS : PAINT;
      return Math.abs(x) < wtg * 0.82 ? GLASS : PAINT;
    }, PAINT);
    // Räder
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheelGeo(g, sx * (hw - 0.17), R, sz * wz, R, 0.26, sx, TIRE, RIM, lod ? 8 : 16);
    // Licht vorn: Scheinwerfer, LED-Leiste, Grill
    const sf = secAt(hl - 0.05), sb = secAt(-hl + 0.05);
    for (const s of [-1, 1]) E(s * hw * 0.62, sf.yt - 0.09, hl - 0.05, 0.2, 0.055, 0.07, HEAD);
    E(0, sf.yt - 0.035, hl - 0.03, hw * 0.48, 0.012, 0.03, DRL);
    E(0, low + 0.24, hl - 0.03, hw * 0.42, 0.07, 0.05, DARK);
    // Heck: durchgehendes Leuchtband, Ecken, Kennzeichen
    E(0, sb.yt - 0.08, -hl + 0.045, hw * 0.78, 0.035, 0.05, TAIL);
    for (const s of [-1, 1]) E(s * hw * 0.7, sb.yt - 0.08, -hl + 0.05, 0.15, 0.055, 0.055, TAIL);
    E(0, low + 0.3, -hl + 0.02, 0.2, 0.06, 0.02, hexc('#d8d8d0'));
    // Außenspiegel
    for (const s of [-1, 1]) E(s * (wbg + 0.07), top + 0.1, gf - 0.12, 0.07, 0.05, 0.1, PAINT);
    if (key === 'pickup') {
      // Ladefläche mit Bordwänden
      quad(g, -hw + 0.1, -hl + 0.12, hw - 0.1, gb, top + 0.005, DARK);
      for (const s of [-1, 1]) roundBox(g, s < 0 ? -hw + 0.04 : hw - 0.14, top - 0.05, -hl + 0.04, s < 0 ? -hw + 0.14 : hw - 0.04, top + 0.42, gb - 0.02, 0.04, PAINT);
      roundBox(g, -hw + 0.04, top - 0.05, -hl + 0.04, hw - 0.04, top + 0.42, -hl + 0.14, 0.04, PAINT);
    }
    if (key === 'sport') {
      for (const s of [-1, 1]) roundBox(g, s * hw * 0.62 - 0.04, top - 0.02, -hl + 0.2, s * hw * 0.62 + 0.04, top + 0.3, -hl + 0.3, 0.02, DARK);
      roundBox(g, -hw * 0.92, top + 0.28, -hl + 0.06, hw * 0.92, top + 0.35, -hl + 0.42, 0.03, PAINT);
    }
    if (key === 'police') {
      roundBox(g, -0.68, H - 0.02, -0.16, 0.68, H + 0.05, 0.16, 0.03, DARK);
      E(-0.33, H + 0.08, 0, 0.3, 0.07, 0.13, hexc('#ff2020', 4));
      E(0.33, H + 0.08, 0, 0.3, 0.07, 0.13, hexc('#2050ff', 4));
    }
    if (key === 'taxi') roundBox(g, -0.32, H - 0.02, -0.14, 0.32, H + 0.2, 0.14, 0.05, hexc('#fff6c8', 4));
    loftA = 4;
    return upload(g);
  }
  // Neon Jet: Ursprung am Boden unter der Rumpfmitte, +z = Nase, -x = rechte Tragfläche
  function buildPlaneMesh() {
    const g = geo(), PAINT = [1, 1, 1, 2], GLASS = hexc('#16202a'), DARK = hexc('#1c1e24'), GREY = hexc('#8a9098'), TIRE = hexc('#141414');
    const E = (cx, cy, cz, rx, ry, rz, c) => ellipGeo(g, cx, cy, cz, rx, ry, rz, c, 14);
    E(0, 1.9, 0, 1.1, 1.05, 7, PAINT);
    E(0, 2.55, 2.8, 0.72, 0.6, 2.2, GLASS);
    E(0, 2.05, 0, 1.12, 0.1, 6.2, hexc('#ff2bd6', 4));
    roundBox(g, -6.5, 1.55, -1.2, 6.5, 1.85, 1.4, 0.15, PAINT);
    roundBox(g, -0.12, 2.2, -6.8, 0.12, 4.4, -4.9, 0.1, PAINT);
    roundBox(g, -0.13, 3.9, -6.8, 0.13, 4.3, -5.4, 0.08, hexc('#22e6ff', 4));
    roundBox(g, -2.8, 2.15, -6.7, 2.8, 2.35, -5.3, 0.08, PAINT);
    for (const s of [-1, 1]) {
      E(s * 1.35, 2.35, -3.4, 0.48, 0.48, 1.5, GREY);
      E(s * 1.35, 2.35, -4.85, 0.36, 0.36, 0.12, hexc('#22e6ff', 4));
      E(s * 6.45, 1.7, 0.1, 0.12, 0.12, 0.25, hexc(s > 0 ? '#ff3355' : '#39ff88', 4));
      // Hauptfahrwerk
      lineBox(g, s * 1.6, 0.45, -0.4, s * 1.4, 1.5, -0.4, 0.14, 0, DARK);
      E(s * 1.6, 0.42, -0.4, 0.16, 0.42, 0.42, TIRE);
    }
    lineBox(g, 0, 0.4, 4.6, 0, 1.4, 4.4, 0.12, 0, DARK);
    E(0, 0.36, 4.6, 0.13, 0.36, 0.36, TIRE);
    return upload(g);
  }
  const carMeshes = {};
  const carMeshesLo = {};
  for (const k in CAR_TYPES) {
    if (k === 'plane') { carMeshes[k] = carMeshesLo[k] = buildPlaneMesh(); continue; }
    carMeshes[k] = buildCarMesh(k, CAR_TYPES[k]); carMeshesLo[k] = buildCarMesh(k, CAR_TYPES[k], true);
  }
  const cars = [];
  let carId = 0;
  function spawnCar(type, x, z, yaw, mode) {
    const T = CAR_TYPES[type];
    const c = { id: ++carId, type: type, T: T, mesh: carMeshes[type], x: x, z: z, y: groundY(x, z), yaw: yaw, vx: 0, vz: 0, steer: 0, speed: 0, hp: 100,
      paint: rgb(pick(T.colors)), paint2: [0.95, 0.95, 0.95], driver: null, mode: mode || 'parked', ai: null, siren: false,
      burnT: 0, onFire: false, wreck: false, deadT: 0, honkT: 0, stuckT: 0, revT: 0, cruise: rand(9, 13), deployed: false, inp: { thr: 0, steer: 0, hb: false } };
    // Neon-Unterbodenbeleuchtung: Sportwagen immer, sonst ab und zu
    if (type === 'sport' || (type !== 'police' && Math.random() < 0.22)) c.glow = rgb(pick(['#ff2bd6', '#22e6ff', '#a14bff', '#39ff88']));
    cars.push(c); return c;
  }
  const NOINP = { thr: 0, steer: 0, hb: false };
  function stepCar(c, dt, inp) {
    const T = c.T;
    if (c.wreck || c.onFire) inp = NOINP;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rxv = -fz, rzv = fx;
    let fs = c.vx * fx + c.vz * fz, ls = c.vx * rxv + c.vz * rzv;
    // Nitro: stärkere Beschleunigung und höhere Endgeschwindigkeit, solange es gezündet ist
    const maxV = T.max * (inp.boost ? 1.45 : 1), accV = T.acc * (inp.boost ? 2.4 : 1);
    if (inp.thr > 0) {
      if (fs < -0.5) fs += 24 * dt * inp.thr; else fs += accV * inp.thr * dt * (1 - Math.max(0, fs) / maxV);
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
  // ================= Flugzeug =================
  // Einfaches Arcade-Flugmodell: W/S regeln den Schub, A/D legen das Flugzeug in die Kurve, ↓/↑ ziehen die Nase hoch/runter.
  // Abheben ab ~110 km/h, unter ~85 km/h reißt die Strömung ab und die Nase sackt. Sanft aufsetzen geht auf flachem Land.
  const PLANE = { vmax: 80, vrot: 30, vstall: 19, apronX: 565, apronZ: 245 };
  function planeGround(x, z) { return x > -2 && x < W + 2 && z > -1 && z < W + 2 ? groundY(x, z) : Math.max(terrH(x, z), -0.6); }
  function spawnPlane() {
    const c = spawnCar('plane', PLANE.apronX, PLANE.apronZ, Math.PI / 2, 'parked');
    Object.assign(c, { paint: rgb('#e8ecf2'), glow: null, pitch: 0, roll: 0, thr: 0, air: false, looted: true });
    return c;
  }
  function crashPlane(c) {
    c.air = false; c.speed = 0; c.vx = c.vz = 0; c.thr = 0;
    explodeCar(c);
  }
  function stepPlane(c, dt, inp) {
    if (c.wreck) { stepCar(c, dt, NOINP); return; }
    c.thr = clamp((c.thr || 0) + inp.thr * 0.45 * dt, 0, 1);
    let sp = c.speed;
    sp += (c.thr * PLANE.vmax - sp) * (c.air ? 0.28 : 0.35) * dt;
    if (c.air) sp -= 9.8 * Math.sin(c.pitch) * dt;
    else { sp -= sp * 0.05 * dt; if (inp.thr < 0 && c.thr === 0) sp -= 14 * dt; }
    sp = clamp(sp, 0, PLANE.vmax * 1.25);
    if (!c.air) {
      // Rollen: lenken wie ein Auto, die Nase hebt sich erst ab Abhebegeschwindigkeit
      c.roll += -c.roll * Math.min(1, 6 * dt);
      c.yaw -= inp.steer * Math.min(1, sp / 6) * 0.55 * dt;
      c.pitch = sp > PLANE.vrot ? clamp(c.pitch + inp.pitch * 0.6 * dt, 0, 0.3) : Math.max(0, c.pitch - dt);
      if (c.pitch > 0.06 && sp > PLANE.vrot) c.air = true;
    } else {
      c.roll += (clamp(inp.steer, -1, 1) * 0.95 - c.roll) * Math.min(1, 2.2 * dt);
      c.pitch = clamp(c.pitch + inp.pitch * 0.8 * dt, -0.75, 0.75);
      if (!inp.pitch) c.pitch -= c.pitch * 0.25 * dt; // ohne Eingabe langsam zurück in den Geradeausflug
      c.yaw -= Math.sin(c.roll) * (0.25 + sp / 200) * dt;
      if (sp < PLANE.vstall) c.pitch -= 0.6 * dt * (1 - sp / PLANE.vstall);
      // Abfanghilfe kurz über dem Boden: Nase leicht auf Landelage
      const alt = c.y - planeGround(c.x, c.z);
      if (alt < 10 && !inp.pitch && c.pitch < 0.02) c.pitch += (0.02 - c.pitch) * Math.min(1, 1.5 * dt);
    }
    c.speed = sp;
    const cp = Math.cos(c.pitch), fx = Math.sin(c.yaw) * cp, fz = Math.cos(c.yaw) * cp;
    c.vx = fx * sp; c.vz = fz * sp;
    c.x += c.vx * dt; c.z += c.vz * dt;
    if (!c.air) {
      c.y = planeGround(c.x, c.z);
      // am Boden: Rumpf stößt wie ein Auto gegen Gebäude, Hänge und Wasser
      const nfx = Math.sin(c.yaw), nfz = Math.cos(c.yaw);
      for (const o of [-5, 0, 5]) {
        const pt = { x: c.x + nfx * o, z: c.z + nfz * o }, h = circleCollide(pt, 1.5, 0);
        if (h.hit) {
          c.x += pt.x - (c.x + nfx * o); c.z += pt.z - (c.z + nfz * o);
          if (sp > 8) { damageCar(c, (sp - 8) * 3, true); sfx('crash', 0.6, c.x, c.z); }
          c.speed = sp = Math.min(sp, 3);
        }
      }
      return;
    }
    // Steigen/Sinken; ohne genug Fahrt fällt es durch
    const vy = Math.sin(c.pitch) * sp - (1 - clamp(sp / PLANE.vstall, 0, 1)) * 9;
    c.y = Math.min(420, c.y + vy * dt);
    if (c.thr > 0.55 && Math.random() < dt * 30) {
      for (const s of [-1, 1]) addParticle(c.x - fx * 5 - Math.cos(c.yaw) * s * 1.35, c.y + 2.3, c.z - fz * 5 + Math.sin(c.yaw) * s * 1.35, -fx * 8, 0, -fz * 8, 0.16, 0.18, [0.3, 0.8, 1], 0);
    }
    let hitB = false;
    forNear(c.x, c.z, 3, (k) => { if (!hitB && c.y < k.h && c.x > k.x0 - 1 && c.x < k.x1 + 1 && c.z > k.z0 - 1 && c.z < k.z1 + 1) hitB = true; });
    if (hitB) { crashPlane(c); return; }
    const g = planeGround(c.x, c.z);
    if (c.y <= g + 0.05) {
      const ti = Math.floor((c.x - TX0) / TG), tj = Math.floor((c.z - TZ0) / TG);
      const flat = g > -0.5 && !(ti >= 0 && tj >= 0 && ti < TNX && tj < TNZ && terrBl[tj * TNX + ti] && !(c.x > -2 && c.x < W + 2 && c.z > -1 && c.z < W + 2));
      if (flat && vy > -9 && c.pitch > -0.35 && c.pitch < 0.5 && Math.abs(c.roll) < 0.45) {
        c.air = false; c.y = g; c.pitch = 0; c.roll = 0; sfx('crash', 0.3, c.x, c.z); shake = Math.max(shake, 0.15); msg('Gelandet', 1.5);
      } else crashPlane(c);
    }
  }
  function damageCar(c, amt, byPlayer) {
    if (c.wreck) return;
    c.hp -= amt;
    if (mission && mission.fragile != null && c === player.inCar) mission.fragile += amt;
    if (c.hp <= 0 && !c.onFire) { c.onFire = true; c.burnT = 4; c.hp = 0; }
    if (byPlayer && c.type === 'police' && amt > 3) crime('copcar', null);
  }
  function explodeCar(c) {
    c.onFire = false; c.wreck = true; c.deadT = 0;
    c.paint = [0.12, 0.12, 0.12]; c.paint2 = [0.15, 0.15, 0.15]; c.siren = false; c.glow = null;
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
      hairStyle: Math.random() < 0.55 ? 0 : Math.random() < 0.8 ? 1 : 2, sleeve: Math.random() < 0.3, h: rand(0.94, 1.05), bw: rand(0.93, 1.1),
      act: null, run: false, bag: null, spot: null };
    if (kind === 'cop') { p.shirt = rgb('#1f3a68'); p.sleeve = true; p.hairStyle = 0; p.pants = rgb('#1b2433'); p.hair = rgb('#111111'); p.armed = true; p.cash = randi(20, 80); }
    return p;
  }
  function addPed(p) { if (peds.indexOf(p) < 0) peds.push(p); return p; }
  function spawnWalker(kind) {
    const s = randomSidewalk(); const p = makePed(kind || 'civ', s.x, s.z); p.bi = s.i; p.bj = s.j; p.k = s.k;
    if (p.kind === 'civ') {
      const r = Math.random();
      if (r < 0.12) { p.run = true; p.speed = rand(3.0, 3.6); p.shirt = rgb(pick(['#ff2bd6', '#22e6ff', '#39ff88', '#ffe14d'])); p.pants = rgb('#1b1d22'); p.sleeve = false; }
      else if (r < 0.4) p.bag = rgb(pick(['#c9a46c', '#d8d4cc', '#2b2b2b', '#b03a5a', '#3a6fb0']));
    }
    return addPed(p);
  }
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
    p.act = null;
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
        if (r < 0.3 && !p.run) { p.state = 'idle'; p.stateT = rand(1.5, 5); p.act = Math.random() < 0.45 ? 'phone' : null; }
        if (r > 0.93) p.dir = -p.dir;
        p.k = (p.k + p.dir + 4) % 4;
      }
    } else if (st === 'cross') {
      if (moveTo(p, p.tx, p.tz, p.speed * 1.15, dt) < 0.6) { p.state = 'walk'; p.k = (p.k + p.dir + 4) % 4; }
    } else if (st === 'idle' || st === 'talk') {
      p.moving = Math.max(0, p.moving - dt * 4);
      if (st === 'talk') p.yaw += angDiff(p.yaw, Math.atan2(player.x - p.x, player.z - p.z)) * Math.min(1, 6 * dt);
      if (st === 'idle' && p.stateT <= 0) { p.state = 'walk'; p.act = null; }
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
      if (c.type === 'plane' && c.driver === player) stepPlane(c, dt, inp); else stepCar(c, dt, inp);
    }
  }
  function carCollisions() {
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (a.air || b.air) continue;
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
      if (a.air) continue;
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
    const foreArm = (sleeve, fist) => mk((g) => {
      const S = sleeve ? P2 : P1, d = sleeve ? 0.008 : 0;
      L(g, [[0.03, 0, 0, S], [0.015, 0.033 + d, 0.032 + d, S], [0, 0.038 + d, 0.036 + d, S], [-0.08, 0.041 + d, 0.037 + d, S], [-0.18, 0.032 + d, 0.029 + d, S],
        [-0.225, 0.03 + d, 0.028 + d, sleeve ? P2 : P1], [-0.226, 0.026, 0.024, P1], [-0.24, 0.026, 0.024, P1], [-0.25, 0, 0, P1]]);
      if (fist) {
        // geballte Faust: Knöchelreihe vorn, Daumen quer davor
        E(g, 0, -0.29, 0.004, 0.036, 0.048, 0.042, P1);
        E(g, 0, -0.318, 0.022, 0.034, 0.022, 0.026, P1);
        E(g, 0.022, -0.282, 0.03, 0.014, 0.026, 0.014, P1);
      } else {
        E(g, 0, -0.3, 0.006, 0.022, 0.062, 0.04, P1);
        E(g, 0.012, -0.262, 0.035, 0.012, 0.03, 0.012, P1);
      }
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
      fore: foreArm(false), foreSleeve: foreArm(true), fist: foreArm(false, true), fistSleeve: foreArm(true, true),
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
    // Tätigkeit im Stand (sitzen, telefonieren, plaudern …) und Joggen
    const act = (p.state === 'idle' || p.state === 'talk') ? p.act : null, run = !!p.run && m > 0.5 && (p.state === 'walk' || p.state === 'cross');
    if (act === 'sit') tr(MA, 0, -0.45, 0);
    // Faustschlag: Phase u (0..1), Streckung e schnell raus und langsamer zurück; der Oberkörper dreht in den Schlag
    const kind = p.punchT > 0 ? (p.punchKind || 0) : -1, u = kind >= 0 ? clamp(1 - p.punchT / (p.punchDur || 0.25), 0, 1) : 0;
    const ext = (v) => v < 0.35 ? Math.sin(v / 0.35 * Math.PI / 2) : 1 - (v - 0.35) / 0.65;
    const guard = kind >= 0 || p.guardT > 0;
    let twist = 0, dip = 0, e = 0, wind = 0;
    if (kind === 0 || kind === 1) { e = ext(u); twist = (kind === 0 ? 0.32 : -0.32) * e; }
    else if (kind === 2) {
      if (u < 0.28) wind = Math.sin(u / 0.28 * Math.PI / 2); else { wind = 1 - clamp((u - 0.28) / 0.2, 0, 1); e = ext((u - 0.28) / 0.72); }
      twist = 0.2 * wind + 0.38 * e; dip = 0.07 * wind - 0.03 * e;
    }
    if (dip) tr(MA, 0, -dip, 0);
    mCopy(MU, MA); ry(MU, twist);
    if (kind === 2) { tr(MU, 0, 1.0, 0); rx(MU, 0.12 * wind - 0.1 * e); tr(MU, 0, -1.0, 0); }
    if (run) { tr(MU, 0, 0.9, 0); rx(MU, 0.14); tr(MU, 0, -0.9, 0); }
    drawMesh(B.torso, MU, p.shirt, p.pants, 1);
    // Beine: Hüfte schwingt, das Knie beugt sich beim Vorschwingen (Joggen: weiter ausgreifend)
    for (const s of [-1, 1]) {
      let hip = Math.sin(wt) * (run ? 0.8 : 0.5) * m * s, knee = m * (0.08 + (run ? 1.5 : 0.95) * Math.max(0, -s * Math.cos(wt)));
      if (act === 'sit') { hip = -1.5; knee = 1.45; }
      mCopy(MB, MA); tr(MB, s * 0.095, 0.92, 0); rx(MB, hip); drawMesh(B.thigh, MB, p.pants);
      tr(MB, 0, -0.44, 0); rx(MB, knee); drawMesh(B.shin, MB, p.pants);
    }
    // Arme: Schulter, Ellbogen, Hand
    for (const s of [-1, 1]) {
      const isRight = s < 0;
      let a = -Math.sin(wt) * 0.52 * m * s, elbow = -(0.15 + Math.max(0, -a) * 0.8), spread = s * 0.07;
      if (run) { a = -Math.sin(wt) * 0.9 * m * s; elbow = -1.5; }
      if (act && !guard) {
        const ph = p.walkT * 3 + s * 1.7;
        if (act === 'sit') { a = -0.45; elbow = -0.9; spread = s * 0.04; }
        else if (act === 'phone' && isRight) { a = -0.25; elbow = -2.5; spread = -s * 0.3; }
        else if (act === 'chat') { a = -0.35 - 0.22 * (Math.sin(nowT * 2.3 + ph) + 1); elbow = -1.0 - 0.35 * Math.sin(nowT * 3.1 + ph * 2); spread = s * 0.05; }
        else if (act === 'vendor') { a = -0.6; elbow = -0.85; spread = -s * 0.08; }
        else if (act === 'wait' || act === 'phone') { a = 0.06; elbow = -0.25; spread = s * 0.13; }
      }
      if (guard && !p.aim) {
        // Deckung: Fäuste vor dem Kinn
        a = -0.75 - Math.sin(wt) * 0.08 * m * s; elbow = -2.1; spread = -s * 0.17;
        const punching = (kind === 0 && isRight) || (kind === 1 && !isRight) || (kind === 2 && isRight);
        if (punching && kind < 2) { a = lerp(-0.75, -1.52, e); elbow = lerp(-2.1, -0.06, e); spread = lerp(-s * 0.17, -s * 0.08, e); }
        else if (punching) {
          // Uppercut: erst tief ausholen, dann Faust von unten nach oben vor das Gesicht
          a = lerp(lerp(-0.75, -0.2, wind), -1.45, e); elbow = lerp(lerp(-2.1, -1.65, wind), -1.4, e); spread = lerp(-s * 0.2, -s * 0.32, e);
        } else if (kind >= 0) { a -= 0.08 * e; elbow -= 0.15 * e; } // die andere Hand schützt das Gesicht
      }
      if (isRight && p.aim) { a = -Math.PI / 2 + (p.aimPitch || 0); elbow = 0; spread = 0; }
      if (!isRight && p.aim && p.twoHand) { a = -Math.PI / 2 + (p.aimPitch || 0) + 0.15; elbow = -0.25; spread = -s * 0.45; }
      mCopy(MB, MU); tr(MB, s * 0.2, 1.45, 0); rz(MB, spread); rx(MB, a);
      drawMesh(p.sleeve ? B.armLong : B.armShort, MB, p.shirt, p.skin);
      tr(MB, 0, -0.29, 0); rx(MB, elbow);
      const fist = guard && !p.aim;
      drawMesh(fist ? (p.sleeve ? B.fistSleeve : B.fist) : (p.sleeve ? B.foreSleeve : B.fore), MB, p.skin, p.shirt);
      if (!isRight && p.bag && !fist && act !== 'sit' && B === bodyHi) { mCopy(MC, MB); tr(MC, 0, -0.45, 0.02); sc(MC, 0.13, 0.3, 0.27); part(MC, p.bag); }
      if (isRight && act === 'phone' && B === bodyHi) { mCopy(MC, MB); tr(MC, 0, -0.31, 0.04); sc(MC, 0.03, 0.14, 0.075); part(MC, [0.45, 0.85, 1], true); }
      if (isRight && p.aim && p.gunLen) {
        mCopy(MC, MB); tr(MC, 0, -0.27 - p.gunLen / 2, 0.05); sc(MC, 0.06, p.gunLen, 0.1); part(MC, GUN);
        mCopy(MC, MB); tr(MC, 0, -0.3, -0.01); sc(MC, 0.045, 0.05, 0.1); part(MC, GUN);
      }
    }
    // Kopf dreht nur halb mit, damit der Blick zum Gegner bleibt
    mCopy(MB, MA); ry(MB, twist * 0.4); if (kind === 2) { tr(MB, 0, 1.0, 0); rx(MB, 0.12 * wind - 0.1 * e); tr(MB, 0, -1.0, 0); }
    drawMesh(B.head, MB, p.skin);
    if (p.kind === 'cop') { drawMesh(B.hairShort, MB, p.hair); drawMesh(B.hat, MB); }
    else if (p.hairStyle === 1) drawMesh(B.hairLong, MB, p.hair);
    else if (p.hairStyle !== 2) drawMesh(B.hairShort, MB, p.hair);
  }
  function drawCar(c) {
    mIdent(MA); tr(MA, c.x, c.y, c.z); ry(MA, c.yaw);
    if (c.type === 'plane') { rx(MA, -(c.pitch || 0)); rz(MA, c.roll || 0); }
    const far = Math.hypot(c.x - camState.eye[0], c.z - camState.eye[2]) > 35;
    drawMesh(far ? carMeshesLo[c.type] : c.mesh, MA, c.paint, c.paint2, 1);
    if (c.siren && c.type === 'police' && Math.floor(nowT * 6) % 2 === 0) {
      mCopy(MB, MA); tr(MB, (Math.floor(nowT * 3) % 2 ? 0.33 : -0.33), c.T.H + 0.08, 0); sc(MB, 0.62, 0.17, 0.3);
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
  Object.assign(player, { hp: 100, nitro: 1, boostT: 0, boostOn: false, armor: 0, money: 500, weapons: { fist: Infinity }, clip: {}, reloadT: 0, cur: 'fist', inCar: null, dead: false, grounded: true,
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
  // Faustkombo: 0 = Jab rechts, 1 = Cross links, 2 = Uppercut rechts. Wer im Zeitfenster nachklickt, schlägt den nächsten Schlag.
  const COMBO = [
    { dur: 0.26, hit: 0.09, next: 0.28, dmg: 12, knock: 0 },
    { dur: 0.26, hit: 0.09, next: 0.28, dmg: 15, knock: 0 },
    { dur: 0.42, hit: 0.16, next: 0.62, dmg: 30, knock: 3.5 }
  ];
  function punch() {
    const P = player;
    P.combo = P.comboT > 0 && P.combo < 2 ? P.combo + 1 : 0;
    const k = COMBO[P.combo];
    P.punchKind = P.combo; P.punchDur = k.dur; P.punchT = k.dur; P.punchHit = k.hit;
    P.shootT = k.next; P.comboT = k.dur + 0.45; P.guardT = 1.6;
    P.yaw = camState.yaw;
    sfx('swing', P.combo === 2 ? 0.6 : 0.4);
  }
  // Treffer erst, wenn der Arm ausgestreckt ist
  function punchImpact() {
    const P = player, k = COMBO[P.punchKind || 0];
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    let best = null, bd = 2.4;
    for (const p of peds) {
      if (p.state === 'dead' || p.kind === 'giver') continue;
      const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.35) { bd = d; best = p; }
    }
    if (!best) return;
    sfx('punch', P.punchKind === 2 ? 0.9 : 0.6);
    rumble(P.punchKind === 2 ? 0.7 : 0.3, 0.4, P.punchKind === 2 ? 140 : 60);
    if (P.punchKind === 2) shake = Math.max(shake, 0.12);
    damagePed(best, k.dmg, fx, fz, 'player', k.knock || (Math.random() < 0.1 ? 2.5 : 0));
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

  // ================= Eigener Wagen =================
  // ownSpec merkt sich Typ, Lack und Unterbodenlicht, damit der Wagen nach einem Totalschaden neu geliefert werden kann
  let ownCar = null, ownSpec = null, callT = 0;
  function makeOwn(c) {
    if (ownCar && ownCar !== c) ownCar.owned = false;
    ownCar = c; c.owned = true; c.playerOwned = true;
    ownSpec = { type: c.type, paint: c.paint.slice(), glow: c.glow ? c.glow.slice() : null };
  }
  function ownCarAlive() { return !!ownCar && cars.indexOf(ownCar) >= 0 && !ownCar.wreck && !ownCar.onFire; }
  // Wagen rufen (L / Steuerkreuz ↓): steht er weit weg oder ist Schrott, wird er an eine Straße in der Nähe gebracht
  function callCar() {
    if (player.dead || !ownSpec) return;
    if (ownCar && player.inCar === ownCar) { msg('Du sitzt schon in deinem Wagen.', 1.5); return; }
    if (callT > 0) { msg('Dein Wagen ist schon unterwegs.', 1.2); return; }
    const alive = ownCarAlive();
    if (alive && Math.hypot(ownCar.x - player.x, ownCar.z - player.z) < 40) { msg('Dein Wagen steht ganz in der Nähe – siehe Karte.', 2); return; }
    const sp = roadSpawnPoint(12, 45) || roadSpawnPoint(12, 100);
    if (!sp) { msg('Gerade kein Platz für deinen Wagen. Versuch es gleich nochmal.', 1.8); return; }
    let c = alive && (!ownCar.driver || ownCar.driver === player) ? ownCar : null;
    if (c) {
      Object.assign(c, { x: sp.x, z: sp.z, y: groundY(sp.x, sp.z), yaw: sp.yaw, vx: 0, vz: 0, speed: 0, steer: 0, mode: 'parked', ai: null, siren: false });
    } else {
      c = spawnCar(ownSpec.type, sp.x, sp.z, sp.yaw, 'parked');
      c.paint = ownSpec.paint.slice(); c.glow = ownSpec.glow ? ownSpec.glow.slice() : null; c.looted = true;
      makeOwn(c);
    }
    callT = 3; sfx('door', 0.4); msg('Dein Wagen steht bereit – siehe Karte.', 2.5);
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
    if (c.type === 'plane') msg('Neon Jet: W gibt Schub, ab 110 km/h mit ↓ die Nase hochziehen. Landen nur sanft auf flachem Boden.', 6);
    sfx('door', 0.5);
  }
  function exitCar() {
    const c = player.inCar; if (!c) return;
    if (c.air) { msg('Nicht in der Luft aussteigen – erst landen!', 1.6); return; }
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
    for (const g of givers) if (Math.hypot(g.ped.x - player.x, g.ped.z - player.z) < 2.6) { g.talk(); return; }
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
    if (talkPed && talkPed.state === 'talk') talkPed.state = talkPed.spot ? 'idle' : 'walk';
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
  // Jeder Auftrag ist eine Kette von Schritten. Schritt-Typen:
  //   goto    – Ort erreichen (optional im Auftragswagen, angehalten, ohne Fahndung)
  //   kill    – Gruppe erledigen (oder nur das Ziel `boss`)
  //   defend  – eine Zeit lang durchhalten, während Angreifer in Wellen kommen
  //   steal   – in den Auftragswagen steigen
  //   destroy – den Fluchtwagen zerstören, bevor die Zeit abläuft
  //   lose    – Fahndung loswerden
  // Optional: time (Zeitlimit, sonst gescheitert), keep (Zeit läuft vom vorigen Schritt weiter), start/done/check/near.
  let tony = null, nova = null, mission = null, missionLevel = 1, gangIdx = 0, specialIdx = 0;
  const givers = [];
  const pt = (x, z) => ({ x: x, z: z });
  const walkSide = (i, j, side) => { const b = blockRect(i, j); return side === 'S' ? pt(b.cx, b.z0 + 1.6) : side === 'N' ? pt(b.cx, b.z1 - 1.6) : side === 'E' ? pt(b.x0 + 1.6, b.cz) : pt(b.x1 - 1.6, b.cz); };
  const tonyPt = () => pt(tony.x + 2.5, tony.z - 1.5);
  const PLACES = {
    airport: pt(498, 239), arena: pt(-74, 260), isle: pt(-155, -132), lake: pt(140, 545), marina: pt(-150, 80),
    hills: pt(-118, 420), export: () => { const g = shopOf('export'); return pt(g.x, g.z); }
  };
  const go = (at, text, o) => Object.assign({ type: 'goto', at: at, text: text, r: 3.5 }, o || {});
  // Gangmitglied der Chrome Vipers: grünes Shirt, bewaffnet, greift an, sobald man nah genug ist
  function viper(x, z, o) {
    const p = addPed(makePed('guard', x, z));
    Object.assign(p, { hp: 100, state: 'stand', armed: true, shirt: rgb('#39ff88'), pants: rgb('#151515'), hair: rgb('#111111'), sleeve: false, hairStyle: 2, cash: randi(30, 90), bag: null, run: false, act: null }, o || {});
    mission.peds.push(p); return p;
  }
  function freeSpot(x, z) {
    if (insideBuilding(x, 1, z, 0.6)) return false;
    const ti = Math.floor((x - TX0) / TG), tj = Math.floor((z - TZ0) / TG);
    return ti >= 0 && tj >= 0 && ti < TNX && tj < TNZ && !terrBl[tj * TNX + ti];
  }
  function viperGroup(c, n, rad, o) {
    const g = [];
    for (let k = 0; k < n; k++) {
      let x = c.x, z = c.z;
      for (let t = 0; t < 14; t++) { const a = k / n * TAU + rand(-0.6, 0.6), r = rand(rad * 0.4, rad), qx = c.x + Math.sin(a) * r, qz = c.z + Math.cos(a) * r; if (freeSpot(qx, qz)) { x = qx; z = qz; break; } }
      g.push(viper(x, z, o));
    }
    return g;
  }
  // Angreifer kommen aus 30–40 m Entfernung, nur auf begehbarem Boden außerhalb von Gebäuden
  function attackWave(c, n) {
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 12; t++) {
        const a = rand(0, TAU), r = rand(30, 40), x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
        if (!freeSpot(x, z)) continue;
        const p = viper(x, z, { state: 'attack', hostile: true }); mission.group.push(p);
        break;
      }
    }
  }
  const WAGE = (r) => Math.round(r * missionLevel);
  // ---- Kurierjobs (Nova) ----
  const COURIER = [
    { id: 'c-eil', title: 'Eilpost', text: 'Ein Umschlag wartet am Späti. Bring ihn in 90 Sekunden zum Villenhügel.', reward: 800, steps: [
      go(() => { const s = shopOf('spaeti'); return pt(s.x + 5, s.z); }, 'Hol den Umschlag am Späti ab.', { msg: 'Umschlag aufgenommen' }),
      go(() => walkSide(3, 6, 'S'), 'Bring den Umschlag zum Villenhügel!', { time: 90 })] },
    { id: 'c-glas', title: 'Zerbrechlich', text: 'Ein Kunstsammler in der Arena wartet auf eine Glasskulptur aus der Klinik-Apotheke. Wenn dein Wagen zu viel abkriegt, ist sie hin. 120 Sekunden.', reward: 1100, steps: [
      go(() => { const s = shopOf('hospital'); return pt(s.x + 4, s.z); }, 'Hol die Skulptur an der Klinik ab.', { msg: 'Skulptur eingeladen – vorsichtig fahren!', done: (m) => { m.fragile = 0; } }),
      go(PLACES.arena, 'Bring die Skulptur heil zur Arena!', { time: 120, check: (m) => m.fragile > 22 ? 'Die Skulptur ist zerbrochen.' : null })] },
    { id: 'c-drei', title: 'Drei Stopps', text: 'Drei Päckchen, drei Kunden, eine Uhr. Abholung am Hafen, dann Altstadt, Downtown und Palmenhain. 160 Sekunden für alles.', reward: 1400, steps: [
      go(() => walkSide(4, 0, 'N'), 'Hol die Päckchen am Hafen ab.', { msg: 'Drei Päckchen aufgenommen' }),
      go(() => walkSide(1, 3, 'S'), 'Stopp 1: Altstadt', { time: 160, msg: 'Päckchen 1 abgegeben' }),
      go(() => walkSide(3, 3, 'E'), 'Stopp 2: Downtown', { keep: true, msg: 'Päckchen 2 abgegeben' }),
      go(() => walkSide(6, 2, 'S'), 'Stopp 3: Palmenhain', { keep: true })] },
    { id: 'c-luft', title: 'Luftfracht', text: 'Am Flughafen liegt Fracht für den Leuchtturmwärter auf der kleinen Insel. Du hast 150 Sekunden – nimm, was schnell ist.', reward: 1600, steps: [
      go(PLACES.airport, 'Hol die Fracht am Flughafen-Terminal ab.', { r: 5, msg: 'Fracht aufgenommen' }),
      go(PLACES.isle, 'Bring die Fracht zur Leuchtturm-Insel!', { time: 150, r: 6 })] },
    { id: 'c-heiss', title: 'Heiße Ware', text: 'In der Hügelsiedlung liegt eine Tasche, nach der die Polizei sucht. Sobald du sie hast, bist du dran. Bring sie zum Jachthafen.', reward: 1800, steps: [
      go(PLACES.hills, 'Hol die Tasche in der Hügelsiedlung.', { r: 5, msg: 'Die Polizei ist hinter dir her!', done: () => setWanted(Math.max(wanted, 2)) }),
      go(PLACES.marina, 'Bring die Tasche zum Jachthafen!', { time: 140, r: 6 })] }
  ];
  // ---- Bandenkrieg gegen die Chrome Vipers (Tony, eine Kette) ----
  const GANG = [
    { id: 'g1', title: 'Revier markieren', text: 'Die Chrome Vipers dealen an meiner Ecke in der Altstadt. Vertreib sie, plündere ihr Versteck und bring mir die Ware.', reward: 1600, steps: [
      go(() => walkSide(1, 4, 'E'), 'Fahr zur Ecke der Vipers in der Altstadt.', { r: 26 }),
      { type: 'kill', text: 'Erledige die Dealer der Vipers.', start: (m) => { m.group = viperGroup(walkSide(1, 4, 'E'), 3, 7); } },
      go(() => walkSide(1, 4, 'S'), 'Schnapp dir ihr Versteck.', { msg: 'Versteck geplündert' }),
      go(tonyPt, 'Bring die Ware zu Tony am Hafen.')] },
    { id: 'g2', title: 'Gegenschlag', text: 'Die Vipers greifen meine Export-Garage an! Halt sie auf. Und ihr Anführer soll nicht lebend davonkommen.', reward: 2200, steps: [
      go(PLACES.export, 'Die Vipers greifen die Export-Garage an – fahr hin!', { r: 20 }),
      { type: 'defend', text: 'Halte die Garage!', time: 45, start: (m) => { m.group = []; m.waveT = 0; } },
      { type: 'destroy', text: 'Ihr Anführer flieht im grünen Wagen – mach ihn kaputt!', time: 90, start: (m) => {
        const sp = roadSpawnPoint(25, 70) || { x: roadC(2), z: roadC(1), yaw: 0 };
        const c = spawnCar('sport', sp.x, sp.z, sp.yaw, 'traffic'); c.paint = rgb('#1f8f4a'); c.glow = rgb('#39ff88');
        const d = makePed('guard', sp.x, sp.z); Object.assign(d, { shirt: rgb('#39ff88'), inCar: c }); c.driver = d; c.flee = true; c.cruise = 16;
        m.car = c; m.target = c;
      } }] },
    { id: 'g3', title: 'Waffenlieferung', text: 'Im Hafen liegt eine Waffenlieferung der Vipers, gut bewacht. Nimm ihnen den Lieferwagen ab und bring ihn zu mir. Rechne mit einem Hinterhalt.', reward: 2800, steps: [
      go(() => walkSide(5, 0, 'N'), 'Fahr zur Waffenlieferung im Hafen.', { r: 28 }),
      { type: 'kill', text: 'Schalte die Wachen aus.', start: (m) => {
        const c = walkSide(5, 0, 'N'); m.group = viperGroup(c, 4, 9, { hp: 110 });
        const v = spawnCar('van', c.x - 6, c.z + 5.5, Math.PI / 2, 'parked'); v.paint = rgb('#1f2a22'); v.glow = rgb('#39ff88'); m.car = v;
      } },
      { type: 'steal', text: 'Steig in den Lieferwagen der Vipers.' },
      go(tonyPt, 'Bring den Lieferwagen zu Tony.', { r: 6, needCar: true, near: 90, onNear: (m) => { m.group = viperGroup(tonyPt(), 3, 22, { state: 'attack', hostile: true }); msg('Hinterhalt!', 2); } })] },
    { id: 'g4', title: 'Kopf der Schlange', text: 'Rico führt die Vipers. Er versteckt sich mit seinen Leuten in der Hügelsiedlung. Wenn er fällt, ist der Krieg vorbei. Danach wird die Polizei Fragen stellen.', reward: 3500, steps: [
      go(PLACES.hills, 'Fahr zu Ricos Versteck in der Hügelsiedlung.', { r: 32 }),
      { type: 'kill', text: 'Erledige Rico!', start: (m) => {
        m.group = viperGroup(PLACES.hills, 5, 12, { hp: 120 });
        m.boss = viper(PLACES.hills.x - 2, PLACES.hills.z + 1, { name: 'Rico', hp: 260, shirt: rgb('#e8e8e2'), pants: rgb('#39ff88'), cash: 600 });
        m.group.push(m.boss); m.target = m.boss;
      } },
      { type: 'lose', text: 'Die Polizei ist alarmiert – häng sie ab!', start: () => setWanted(Math.max(wanted, 3)) },
      go(tonyPt, 'Melde dich bei Tony.')] }
  ];
  // ---- Spezialjobs (Tony, abwechselnd) ----
  const SPECIAL_JOBS = [
    { id: 'export', title: 'Exportgeschäft', text: 'Ein Kunde aus Übersee will einen Sportwagen. Am Palmenhain parkt ein roter Flitzer. Klau ihn und bring ihn heil in die Export-Garage hier am Hafen.', reward: 1500, steps: [
      { type: 'steal', text: 'Klau den roten Sportwagen am Palmenhain.', start: (m) => {
        const b = blockRect(6, 3), c = spawnCar('sport', roadC(6) + 5.6, b.cz, 0, 'parked'); c.paint = rgb('#d4201a'); m.car = c; m.target = c;
      } },
      go(PLACES.export, 'Bring den Wagen in die Export-Garage am Hafen.', { r: 4, needCar: true, stop: true, clean: true,
        done: (m) => { m.reward = Math.round(m.reward * (0.5 + 0.5 * m.car.hp / 100)); leaveCarForce(); cars.splice(cars.indexOf(m.car), 1); m.car = null; } })] },
    { id: 'hit', title: 'Alte Rechnung', text: 'Vito schuldet mir viel Geld. Er hängt mit zwei Leibwächtern in der Altstadt rum. Erledige das. Ohne Knarre brauchst du gar nicht erst hinfahren.', reward: 2000, steps: [
      { type: 'kill', text: 'Erledige Vito in der Altstadt.', start: (m) => {
        const b = blockRect(2, 1), z = b.z0 + 1.6;
        m.boss = viper(b.cx, z, { kind: 'target', name: 'Vito', hp: 150, shirt: rgb('#7a1f2b'), pants: rgb('#1b1b1b'), hair: rgb('#2b1b10'), hairStyle: 0, cash: 400 });
        m.group = [m.boss, viper(b.cx - 2.5, z + 0.6, { hp: 110, shirt: rgb('#151515') }), viper(b.cx + 2.5, z + 0.6, { hp: 110, shirt: rgb('#151515') })];
        m.target = m.boss;
      } }] }
  ];
  for (const d of COURIER) d.cat = 'courier';
  for (const d of GANG) d.cat = 'gang';
  for (const d of SPECIAL_JOBS) d.cat = 'special';

  function busyDialog(name) {
    openDialog(name, 'Du hast schon einen Job. Erledige den erst.', [{ label: 'Bin schon weg' }, { label: 'Auftrag abbrechen', act: () => { closeMenu(); failMission('Auftrag abgebrochen.'); } }]);
  }
  function talkTony() {
    if (mission) { busyDialog('Tony'); return; }
    const g = GANG[gangIdx % GANG.length], s = SPECIAL_JOBS[specialIdx % SPECIAL_JOBS.length], part = (gangIdx % GANG.length) + 1;
    openDialog('Tony', gangIdx >= GANG.length && gangIdx % GANG.length === 0 ? 'Die Vipers haben sich neu formiert. Der Krieg geht weiter – und die Bezahlung wird besser.' : 'Die Chrome Vipers wollen mein Revier. Ich brauche jemanden, der sich nicht die Finger schmutzig zu machen scheut.', [
      { label: 'Bandenkrieg ' + part + '/' + GANG.length + ': ' + g.title + ' (' + fmt(WAGE(g.reward)) + ')', act: () => offer('Tony', g) },
      { label: 'Spezialjob: ' + s.title + ' (' + fmt(WAGE(s.reward)) + ')', act: () => offer('Tony', s) },
      { label: 'Später' }]);
  }
  function talkNova() {
    if (mission) { busyDialog('Nova'); return; }
    openDialog('Nova – Kurierdienst', 'Pakete, Umschläge, Fragen stellt hier keiner. Such dir was aus.', COURIER.map((c) => ({ label: c.title + ' (' + fmt(WAGE(c.reward)) + ')', act: () => offer('Nova', c) })).concat([{ label: 'Später' }]));
  }
  function offer(name, d) {
    openDialog(name + ' – ' + d.title, d.text + '  Bezahlung: ' + fmt(WAGE(d.reward)) + '.', [{ label: 'Annehmen', act: () => { closeMenu(); startMission(d, WAGE(d.reward)); } }, { label: 'Zurück', act: () => (name === 'Nova' ? talkNova() : talkTony()) }]);
  }
  function startMission(d, reward) {
    mission = { def: d, reward: reward, si: -1, timer: 0, timed: false, car: null, peds: [], group: [], target: null, markTarget: false, boss: null };
    msg(d.title, 3); sfx('mission', 0.5);
    nextStep();
  }
  function nextStep() {
    const m = mission, prev = m.def.steps[m.si];
    if (prev && prev.done) prev.done(m);
    if (prev && prev.msg) { msg(prev.msg, 2); sfx('cash', 0.4); }
    if (!mission) return;
    m.si++;
    if (m.si >= m.def.steps.length) { passMission(); return; }
    const s = m.def.steps[m.si];
    m.nearFired = false;
    if (s.time) { m.timer = s.time; m.timed = true; } else if (!s.keep) m.timed = false;
    if (m.target && m.markTarget) m.home = pt(m.target.x, m.target.z);
    m.target = null; m.markTarget = false;
    if (s.type === 'goto') { const a = typeof s.at === 'function' ? s.at() : s.at; m.target = pt(a.x, a.z); m.markTarget = true; }
    if (s.start) s.start(m);
    if (s.type === 'steal' && m.car) m.target = m.car;
    if (s.type === 'kill' && !m.target && m.group.length) m.target = m.group[0];
    setObjective(s.text);
  }
  function setObjective(t) { objective = t; }
  function cleanupMission() {
    if (!mission) return;
    for (const p of mission.peds) if (p.state !== 'dead' && !p.inCar) { p.kind = 'civ'; p.hostile = false; p.armed = false; rehome(p); }
    if (mission.car && mission.car.flee && mission.car.driver) mission.car.flee = false;
    mission = null; setObjective(''); ui({ timer: '' });
  }
  function passMission() {
    const m = mission, r = m.reward;
    player.money += r; big('AUFTRAG ERFÜLLT!', '+' + fmt(r), '#f2c94c', 4); sfx('mission', 0.8);
    if (m.def.cat === 'gang') { gangIdx++; if (gangIdx % GANG.length === 0) { missionLevel *= 1.5; msg('Die Chrome Vipers sind geschlagen – fürs Erste.', 5); } }
    else if (m.def.cat === 'special') specialIdx++;
    cleanupMission();
  }
  function failMission(reason, silent) {
    if (!mission) return;
    if (!silent) big('AUFTRAG GESCHEITERT', reason, '#e05a4f', 3.5);
    cleanupMission();
  }
  function updateMission(dt) {
    if (!mission) return;
    const m = mission, s = m.def.steps[m.si];
    if (!s) return;
    const c = player.inCar, px = c ? c.x : player.x, pz = c ? c.z : player.z;
    if (m.timed) { m.timer -= dt; if (m.timer <= 0 && s.type !== 'defend') { failMission(s.type === 'destroy' ? 'Er ist entkommen.' : 'Zu spät!'); return; } }
    if (m.car && (m.car.wreck || m.car.onFire) && s.type !== 'destroy' && (s.type === 'steal' || s.needCar)) { failMission('Der Wagen ist Schrott.'); return; }
    if (s.check) { const why = s.check(m); if (why) { failMission(why); return; } }
    if (s.near && !m.nearFired && m.target && Math.hypot(px - m.target.x, pz - m.target.z) < s.near) { m.nearFired = true; s.onNear(m); }
    // Gruppe: wird einer angegriffen, greifen alle an
    if (m.group.some((p) => p.hostile || p.state === 'attack')) for (const p of m.group) if (p.state === 'stand') { p.state = 'attack'; p.hostile = true; }
    if (s.type === 'goto') {
      if (s.needCar && c !== m.car) { setObjective(m.car ? 'Steig wieder in den Wagen.' : s.text); return; }
      if (s.stop && wanted > 0) { setObjective('Hänge erst die Polizei ab!'); return; }
      setObjective(s.text);
      if (Math.hypot(px - m.target.x, pz - m.target.z) < s.r && (!s.stop || !c || Math.abs(c.speed) < 3)) nextStep();
    } else if (s.type === 'kill') {
      const down = (p) => p.state === 'dead' || p.hp <= 0;
      if (m.boss ? down(m.boss) : m.group.every(down)) { m.target = null; nextStep(); return; }
      if (!m.boss) { const a = m.group.find((p) => !down(p)); if (a) m.target = a; }
    } else if (s.type === 'defend') {
      const home = m.home;
      m.waveT -= dt;
      if (m.waveT <= 0 && m.timer > 6) { m.waveT = 13; attackWave(home, 3); msg('Die nächste Welle kommt!', 1.8); }
      m.target = home; m.markTarget = true;
      if (m.timer <= 0) { for (const p of m.group) if (p.state !== 'dead') { p.state = 'flee'; p.fx = home.x; p.fz = home.z; p.stateT = 8; p.hostile = false; } nextStep(); }
    } else if (s.type === 'steal') {
      if (c === m.car) nextStep();
    } else if (s.type === 'destroy') {
      if (m.car.wreck || m.car.onFire) nextStep();
    } else if (s.type === 'lose') {
      if (wanted === 0) nextStep();
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
  let clockH = 21.0, started = false, attractA = 0, gamePaused = false;
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
    if (c && c.type === 'plane') {
      // Flugzeug: weiter hinten, folgt Kurs und Neigung
      tx = c.x; ty = c.y + 3; tz = c.z; dist = 17 * mk;
      if (nowT - camState.lastInput > 1.0 && (c.air || c.speed > 2)) {
        camState.yaw += angDiff(camState.yaw, c.yaw) * Math.min(1, 3 * dt);
        camState.pitch += (0.14 - (c.pitch || 0) * 0.55 - camState.pitch) * Math.min(1, 2.5 * dt);
      }
    } else if (c) {
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
  const SKY = { dayTop: [0.34, 0.48, 0.72], dayFog: [0.64, 0.68, 0.78], duskTop: [0.36, 0.14, 0.52], duskFog: [0.95, 0.36, 0.55], nightTop: [0.07, 0.03, 0.16], nightFog: [0.17, 0.08, 0.25] };
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
    light.sunC = el > 0 ? L3([1.0, 0.95, 0.88], [1.0, 0.45, 0.55], dusk) : [0.36, 0.33, 0.58];
    if (el > 0) light.sunC = light.sunC.map((v) => v * (0.55 + 0.45 * day));
    light.amb = L3([0.24, 0.2, 0.34], [0.40, 0.42, 0.52], day);
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
    mPersp(PR, (player.inCar ? 64 - 10 * camState.aimT + 14 * (player.boostT || 0) : 58 - 12 * camState.aimT) * Math.PI / 180, cw / chh, 0.15, 900);
    mLookAt(VW, e[0], e[1], e[2], e[0] + d[0], e[1] + d[1], e[2] + d[2]);
    mMul(VP, PR, VW);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uVP, false, VP);
    gl.uniform3fv(U.uSun, light.sun); gl.uniform3fv(U.uSunC, light.sunC); gl.uniform3fv(U.uAmb, light.amb);
    gl.uniform3fv(U.uFog, light.fog); gl.uniform3fv(U.uCam, e);
    gl.uniform1f(U.uFogD, lerp(650, 520, light.night)); gl.uniform1f(U.uNight, light.night);
    updatePointLights();
    // Himmel
    gl.depthMask(false);
    mIdent(MA); tr(MA, e[0], e[1], e[2]); drawMesh(skyMesh, MA, light.top, null, 1);
    gl.depthMask(true);
    drawMesh(worldMesh, IDM, null, null, 1);
    drawMesh(terrainMesh, IDM, null, null, 1);
    drawMesh(neonTubes, IDM, null, null, 1);
    drawFerris(false);
    const flickOn = flickerOn();
    if (flickOn) drawMesh(flickTubes, IDM, null, null, 1);
    for (const hl of holos) drawHolo(hl, false);
    drawSkyCars(false);
    for (const c of cars) if (visible(c.x, c.z, 4)) drawCar(c);
    for (const p of peds) if (visible(p.x, p.z, 2)) drawHuman(p);
    if (started && !player.inCar) drawHuman(player);
    for (const g of givers) { mIdent(MA); tr(MA, g.ped.x, g.ped.y + 2.35 + Math.sin(nowT * 3) * 0.12, g.ped.z); ry(MA, nowT * 2); sc(MA, 0.35, 0.35, 0.35); part(MA, g.col, true); }
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
    for (const c of cars) if (visible(c.x, c.z, 4)) {
      const gy = c.air ? planeGround(c.x, c.z) : c.y, sw = c.T.span ? c.T.span * 0.45 : c.T.Wd * 0.62, sa = c.air ? clamp(0.4 - (c.y - gy) / 150, 0.08, 0.4) : 0.4;
      mIdent(MA); tr(MA, c.x, gy + 0.03, c.z); ry(MA, c.yaw); sc(MA, sw, 1, c.T.L * 0.58); drawMesh(diskMesh, MA, SHADOW, null, sa);
    }
    const shadowP = (p) => { mIdent(MA); tr(MA, p.x, groundY(p.x, p.z) + 0.03, p.z); sc(MA, p.state === 'dead' ? 0.9 : 0.45, 1, p.state === 'dead' ? 0.9 : 0.45); drawMesh(diskMesh, MA, p.state === 'dead' ? [0.35, 0.02, 0.02] : SHADOW, null, p.state === 'dead' ? 0.6 : 0.35); };
    for (const p of peds) if (visible(p.x, p.z, 2)) shadowP(p);
    if (started && !player.inCar) shadowP(player);
    const marker = (x, z, r, col, h) => { mIdent(MA); tr(MA, x, groundY(x, z), z); sc(MA, r, h || 1.1, r); drawMesh(cylMesh, MA, col, null, 0.38 + Math.sin(nowT * 4) * 0.08); };
    if (started) {
      for (const s of shops) {
        if (s.kind === 'export' && !(mission && mission.def.id === 'export' && mission.si === 1) && !(player.inCar && !mission)) continue;
        marker(s.x, s.z, s.r * (s.drive ? 1 : 0.8), s.color, s.drive ? 0.6 : 1.1);
      }
      if (!mission) for (const g of givers) marker(g.ped.x, g.ped.z, 1.1, g.col, 0.5);
      if (mission && mission.target && mission.markTarget) marker(mission.target.x, mission.target.z, 2.6, [1, 0.85, 0.2], 1.6);
      // gesetzte Kartenmarkierungen: hohe Lichtsäule, von weitem sichtbar
      for (const m of markers) if (Math.hypot(m.x - e[0], m.z - e[2]) < 700) {
        if (!m.rgb) m.rgb = rgb(m.col);
        mIdent(MA); tr(MA, m.x, groundY(m.x, m.z), m.z); sc(MA, 1.3, 80, 1.3); drawMesh(cylMesh, MA, m.rgb, null, 0.22);
        marker(m.x, m.z, 3.2, m.rgb, 0.4);
      }
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
    // Neon-Leuchten: additiv, nachts kräftiger
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const glowA = lerp(0.3, 1, light.night);
    drawMesh(neonGlow, IDM, null, null, glowA);
    if (flickOn) drawMesh(flickGlow, IDM, null, null, glowA);
    for (const c of cars) if (c.glow && visible(c.x, c.z, 4)) for (const [k, a] of [[0.62, 0.32], [0.85, 0.16], [1.1, 0.07]]) { mIdent(MA); tr(MA, c.x, c.y + 0.05, c.z); ry(MA, c.yaw); sc(MA, c.T.Wd * k, 1, c.T.L * k * 0.62); drawMesh(diskMesh, MA, c.glow, null, glowA * a); }
    for (const hl of holos) drawHolo(hl, true, glowA);
    drawFerris(true, glowA);
    drawSkyCars(true, glowA);
    // Leuchtturm: zwei kreisende Lichtkegel
    if (light.night > 0.1) for (const s of [0, Math.PI]) {
      mIdent(MA); tr(MA, LH.x, LH.y + 23.5, LH.z); ry(MA, nowT * 0.9 + s); tr(MA, 0, 0, 30); sc(MA, 2.4, 1.3, 60);
      drawMesh(unitGlow, MA, [1, 0.9, 0.55], null, 0.07 * light.night);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  // Die NL Lichtquellen nahe der Kamera an den Shader geben; Laternen nur nachts, Neon tagsüber schwach
  const LP = new Float32Array(NL * 4), LC = new Float32Array(NL * 3);
  let nearL = [], lightSelT = -1;
  function updatePointLights() {
    if (Math.abs(nowT - lightSelT) > 0.12) {
      lightSelT = nowT;
      const ex = camState.eye[0], ez = camState.eye[2];
      for (const l of lightSrc) l.s = Math.hypot(l.x - ex, l.z - ez) - l.r * 0.6;
      nearL = lightSrc.filter((l) => l.s < 70).sort((a, b) => a.s - b.s).slice(0, NL);
    }
    const kn = lerp(0.15, 1, light.night), kl = light.night;
    LP.fill(0); LC.fill(0);
    nearL.forEach((l, i) => {
      const k = l.neon ? kn : kl;
      LP[i * 4] = l.x; LP[i * 4 + 1] = l.y; LP[i * 4 + 2] = l.z; LP[i * 4 + 3] = l.r;
      LC[i * 3] = l.c[0] * k; LC[i * 3 + 1] = l.c[1] * k; LC[i * 3 + 2] = l.c[2] * k;
    });
    gl.uniform4fv(U.uLP, LP); gl.uniform3fv(U.uLC, LC);
  }
  // Riesenrad: Rad dreht sich langsam um die Querachse, die Gondeln hängen immer senkrecht
  function drawFerris(glow, a) {
    if (Math.hypot(FW.x - camState.eye[0], FW.z - camState.eye[2]) > 520) return;
    const ang = nowT * 0.12;
    mIdent(MA); tr(MA, FW.x, FW.y, FW.z); rx(MA, ang);
    if (glow) { drawMesh(fwGlow, MA, null, null, a); return; }
    drawMesh(fwTubes, MA, null, null, 1);
    for (let k = 0; k < 12; k++) {
      const t = k / 12 * TAU + ang;
      mIdent(MB); tr(MB, FW.x, FW.y + Math.cos(t) * FW.r - 1.4, FW.z + Math.sin(t) * FW.r); sc(MB, 1.8, 1.6, 1.5);
      part(MB, k % 3 === 0 ? [1, 0.25, 0.75] : k % 3 === 1 ? [0.2, 0.85, 1] : [1, 0.85, 0.3], true);
    }
  }
  // Flackernde Schilder: meist an, ab und zu kurze Aussetzer
  function flickerOn() {
    const t = nowT * 9, k = Math.floor(t);
    const n = Math.sin(k * 12.9898) * 43758.5453; const r = n - Math.floor(n);
    return Math.sin(nowT * 0.7) > -0.6 ? r > 0.06 : r > 0.55;
  }
  // Hologramm: schwebender, rotierender Drahtwürfel mit Ring
  function drawHolo(hl, glow, a) {
    if (!visible(hl.x, hl.z, 10)) return;
    mIdent(MA); tr(MA, hl.x, hl.y + Math.sin(nowT * 1.3 + hl.x) * 0.4, hl.z); ry(MA, nowT * hl.sp); rx(MA, 0.6); rz(MA, 0.62);
    const s = hl.s, t = glow ? 0.45 : 0.09;
    for (let ax = 0; ax < 3; ax++) for (const s1 of [-0.5, 0.5]) for (const s2 of [-0.5, 0.5]) {
      mCopy(MB, MA);
      const o = [0, 0, 0]; o[(ax + 1) % 3] = s1 * s; o[(ax + 2) % 3] = s2 * s; tr(MB, o[0], o[1], o[2]);
      const k = [t, t, t]; k[ax] = s + t; sc(MB, k[0], k[1], k[2]);
      if (glow) drawMesh(unitGlow, MB, hl.col, null, a * 0.35); else part(MB, hl.col, true);
    }
    mIdent(MB); tr(MB, hl.x, hl.y - s * 1.1, hl.z); sc(MB, s * 0.9, 0.06, s * 0.9);
    if (glow) drawMesh(cylMesh, MB, hl.col, null, a * 0.25);
  }

  // ================= Radar =================
  const rctx = radar.getContext('2d');
  // ================= Pausenkarte & Markierungen =================
  // Karte im Pausenmenü: Norden oben, Westen links (wie das Radar). Zoomen mit Mausrad/Knöpfen, Ziehen verschiebt,
  // Klick setzt eine Markierung, Klick auf eine Markierung oder Rechtsklick entfernt sie. Markierungen erscheinen auch auf dem Radar und als Lichtsäule.
  const pmap = root.querySelector('#pmap'), pctx = pmap ? pmap.getContext('2d') : null;
  const markers = [], MARK_COLS = ['#ff2bd6', '#22e6ff', '#ffe14d', '#39ff88', '#ff8a1f', '#a14bff', '#ff3355', '#3d7bff'], MAX_MARKS = 8;
  const pm = { x: 0, z: 0, zoom: 1.2, drag: null, dirty: true };
  const PM_MIN = 0.4, PM_MAX = 6;
  let markSeq = 0;
  function pmSize() { return [pmap.clientWidth || 1, pmap.clientHeight || 1]; }
  function pmToScreen(x, z) { const s = pmSize(); return [(mapX(x) - mapX(pm.x)) * pm.zoom + s[0] / 2, (mapY(z) - mapY(pm.z)) * pm.zoom + s[1] / 2]; }
  function pmToWorld(sx, sy) { const s = pmSize(); return [TX1 - (mapX(pm.x) + (sx - s[0] / 2) / pm.zoom), TZ1 - (mapY(pm.z) + (sy - s[1] / 2) / pm.zoom)]; }
  function pmCenterOnPlayer() { const c = player.inCar || player; pm.x = c.x; pm.z = c.z; pm.dirty = true; }
  function pmZoom(f, sx, sy) {
    if (!pmap) return;
    const s = pmSize(); if (sx == null) { sx = s[0] / 2; sy = s[1] / 2; }
    const a = pmToWorld(sx, sy); pm.zoom = clamp(pm.zoom * f, PM_MIN, PM_MAX); const b = pmToWorld(sx, sy);
    pm.x = clamp(pm.x + a[0] - b[0], TX0, TX1); pm.z = clamp(pm.z + a[1] - b[1], TZ0, TZ1); pm.dirty = true;
  }
  function markerAt(sx, sy, r) {
    let best = -1, bd = r;
    markers.forEach((m, i) => { const p = pmToScreen(m.x, m.z), d = Math.hypot(p[0] - sx, p[1] - sy - 12); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function addMarker(x, z) {
    if (markers.length >= MAX_MARKS) markers.shift();
    markers.push({ x: x, z: z, col: MARK_COLS[markSeq++ % MARK_COLS.length] });
    sfx('click', 0.6); markersUi();
  }
  function removeMarker(i) { if (i >= 0 && i < markers.length) { markers.splice(i, 1); sfx('click', 0.4); markersUi(); } }
  function clearMarkers() { markers.length = 0; markersUi(); }
  function markersUi() {
    pm.dirty = true;
    const c = player.inCar || player;
    ui({ markers: markers.map((m, i) => {
      const d = Math.hypot(m.x - c.x, m.z - c.z);
      return { n: i + 1, col: m.col, label: (d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km') + ' · ' + zoneAt(m.x, m.z), remove: () => removeMarker(markers.indexOf(m)) };
    }) });
  }
  function pmPin(g, x, y, col, label) {
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - 4, y - 8, x - 10, y - 12, x - 10, y - 19); g.arc(x, y - 19, 10, Math.PI, 0); g.bezierCurveTo(x + 10, y - 12, x + 4, y - 8, x, y);
    g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
    g.fillStyle = '#000'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x, y - 19);
  }
  function drawPauseMap() {
    if (!pctx) return;
    const s = pmSize(), W = s[0], H = s[1], dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (W < 2 || H < 2) return;
    if (pmap.width !== Math.round(W * dpr) || pmap.height !== Math.round(H * dpr)) pm.dirty = true;
    if (!pm.dirty) return;
    pm.dirty = false;
    if (pmap.width !== Math.round(W * dpr) || pmap.height !== Math.round(H * dpr)) { pmap.width = Math.round(W * dpr); pmap.height = Math.round(H * dpr); }
    const g = pctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#16384e'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(pm.zoom, pm.zoom); g.translate(-mapX(pm.x), -mapY(pm.z));
    g.imageSmoothingEnabled = pm.zoom < 2.5; g.drawImage(mapCanvas, 0, 0);
    g.restore();
    const dot = (x, z, col, label, r) => {
      const p = pmToScreen(x, z); r = r || 9;
      g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke();
      if (label) { g.fillStyle = '#fff'; g.font = '700 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, p[0], p[1] + 0.5); }
    };
    for (const sh of shops) { const c = sh.color; dot(sh.x, sh.z, 'rgb(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ')', sh.blip, 10); }
    if (!mission) for (const g of givers) dot(g.ped.x, g.ped.z, g.css, g.blip, 10);
    if (mission && mission.target) dot(mission.target.x, mission.target.z, mission.boss && mission.target === mission.boss ? '#ff3030' : '#f2c94c', '!', 10);
    // eigener Wagen
    if (ownCarAlive() && player.inCar !== ownCar) {
      const p = pmToScreen(ownCar.x, ownCar.z);
      g.save(); g.translate(p[0], p[1]); g.rotate(-ownCar.yaw);
      g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.7)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#22e6ff'; g.stroke();
      g.fillStyle = '#22e6ff'; g.fillRect(-4.5, -7, 9, 14); g.fillStyle = '#06222a'; g.fillRect(-3.3, -4.2, 6.6, 2.6);
      g.restore();
    }
    markers.forEach((m, i) => { const p = pmToScreen(m.x, m.z); pmPin(g, p[0], p[1], m.col, String(i + 1)); });
    // Spieler
    const c = player.inCar || player, pp = pmToScreen(c.x, c.z), py = player.inCar ? player.inCar.yaw : player.yaw;
    g.save(); g.translate(pp[0], pp[1]); g.rotate(-py);
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4.5); g.lineTo(-8, 9); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#000'; g.stroke(); g.restore();
    // Fadenkreuz in der Mitte (für Controller), Maßstab und Nordpfeil
    if (inputMode === 'pad') { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 12, H / 2); g.lineTo(W / 2 + 12, H / 2); g.moveTo(W / 2, H / 2 - 12); g.lineTo(W / 2, H / 2 + 12); g.stroke(); }
    const steps = [25, 50, 100, 200, 500, 1000];
    let m = steps[steps.length - 1]; for (const v of steps) if (v * pm.zoom >= 70) { m = v; break; }
    const L = m * pm.zoom;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(12, H - 40, L + 24, 28);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(24, H - 20); g.lineTo(24 + L, H - 20); g.moveTo(24, H - 25); g.lineTo(24, H - 15); g.moveTo(24 + L, H - 25); g.lineTo(24 + L, H - 15); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(m >= 1000 ? (m / 1000) + ' km' : m + ' m', 24 + L / 2, H - 23);
    g.font = '700 16px sans-serif'; g.textBaseline = 'middle'; g.fillText('N', 28, 26);
    g.beginPath(); g.moveTo(28, 8); g.lineTo(23, 16); g.lineTo(33, 16); g.closePath(); g.fill();
  }
  if (pmap) {
    const pos = (e) => { const r = pmap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    pmap.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); pmZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, p[0], p[1]); }, { passive: false });
    pmap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const p = pos(e); pm.drag = { sx: p[0], sy: p[1], x: pm.x, z: pm.z, moved: false }; pmap.classList.add('dragging'); e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!pm.drag) return;
      const p = pos(e), dx = p[0] - pm.drag.sx, dy = p[1] - pm.drag.sy;
      if (Math.hypot(dx, dy) > 4) pm.drag.moved = true;
      if (pm.drag.moved) { pm.x = clamp(pm.drag.x + dx / pm.zoom, TX0, TX1); pm.z = clamp(pm.drag.z + dy / pm.zoom, TZ0, TZ1); pm.dirty = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (!pm.drag) return;
      const d = pm.drag; pm.drag = null; pmap.classList.remove('dragging');
      if (d.moved || e.button !== 0) return;
      const i = markerAt(d.sx, d.sy, 16);
      if (i >= 0) removeMarker(i); else { const w = pmToWorld(d.sx, d.sy); addMarker(w[0], w[1]); }
    });
    pmap.addEventListener('contextmenu', (e) => { e.preventDefault(); const p = pos(e); removeMarker(markerAt(p[0], p[1], 20)); });
  }
  // Ankommen an einer Markierung entfernt sie
  function checkMarkers() {
    const c = player.inCar || player;
    for (let i = markers.length - 1; i >= 0; i--) if (Math.hypot(markers[i].x - c.x, markers[i].z - c.z) < 9) { markers.splice(i, 1); msg('Markierung erreicht', 2); sfx('click', 0.6); markersUi(); }
  }
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
    if (!mission) for (const g of givers) blip(g.ped.x, g.ped.z, g.css, g.blip);
    for (const c of cars) if (c.type === 'police' && c.driver && c.driver !== player && !c.wreck && (wanted > 0 || Math.hypot(c.x - px, c.z - pz) < 80)) blip(c.x, c.z, Math.floor(nowT * 4) % 2 ? '#2f5cff' : '#ff3030', null, 4);
    for (const p of peds) if (p.hostile && p.state !== 'dead') blip(p.x, p.z, '#ff3030', null, 4);
    markers.forEach((m, i) => blip(m.x, m.z, m.col, String(i + 1), 7));
    if (mission && mission.target) blip(mission.target.x, mission.target.z, mission.boss && mission.target === mission.boss ? '#ff3030' : '#f2c94c', null, 6);
    // Eigener Wagen: immer sichtbar, am Rand festgehalten, wenn er außerhalb des Radars steht
    if (ownCarAlive() && player.inCar !== ownCar) {
      const b = blipPos(ownCar.x, ownCar.z, px, pz, zoom, 84);
      g.save(); g.translate(b[0], b[1]); g.rotate(camState.yaw - ownCar.yaw);
      g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.65)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#22e6ff'; g.stroke();
      g.fillStyle = '#22e6ff'; g.strokeStyle = '#000'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(-3.5, -7); g.lineTo(3.5, -7); g.quadraticCurveTo(4.8, -7, 4.8, -5); g.lineTo(4.8, 6); g.quadraticCurveTo(4.8, 7.5, 3.3, 7.5);
      g.lineTo(-3.3, 7.5); g.quadraticCurveTo(-4.8, 7.5, -4.8, 6); g.lineTo(-4.8, -5); g.quadraticCurveTo(-4.8, -7, -3.5, -7); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#06222a'; g.fillRect(-3.3, -4.2, 6.6, 2.6); g.fillRect(-3.3, 3, 6.6, 1.8);
      g.restore();
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
        case 'nitro': noise(0.45 * vol, 0.7, 1600, 'bandpass'); tone(140, 0.2 * vol, 0.6, 'sawtooth', 360); break;
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
        const L = player.inCar.type === 'plane'
          ? [K('F', 'Y') + 'Aussteigen (am Boden)', K('W / S', 'RT / LT') + 'Schub', K('A / D', 'Stick ← →') + 'Kurve', K('↓ / ↑', 'Stick ↓ ↑') + 'Nase hoch / runter']
          : [K('F', 'Y') + 'Aussteigen', K('E', 'L3') + (player.inCar.type === 'police' ? 'Sirene' : 'Hupe'), K('Shift', 'A') + (player.nitroLock ? 'Nitro lädt …' : 'Nitro')];
        if (w.driveby) L.push(K('Rechte Maus', 'LB') + 'Zielen  ' + K('Linke Maus', 'RB') + 'Drive-by');
        prompt = L.join('\n');
      } else {
        const L = [], s = nearShop();
        if (s) L.push(K('E', '→') + s.name);
        else if (givers.some((g) => Math.hypot(g.ped.x - player.x, g.ped.z - player.z) < 2.6)) L.push(K('E', '→') + 'Mit ' + givers.find((g) => Math.hypot(g.ped.x - player.x, g.ped.z - player.z) < 2.6).ped.name + ' reden');
        else { const p = nearPed(); if (p) L.push(K('E', '→') + 'Ansprechen'); }
        const c = nearCar(); if (c && !c.wreck) L.push(K('F', 'Y') + (c.driver ? 'Auto klauen' : 'Einsteigen'));
        prompt = L.join('\n');
      }
    }
    const hh = Math.floor(clockH), mm = Math.floor((clockH - hh) * 60);
    let timer = '';
    if (mission && mission.timed) { const s = Math.max(0, Math.ceil(mission.timer)); timer = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    const ammo = cur === 'fist' ? '' : (player.reloadT > 0 ? 'LÄDT…' : (player.clip[cur] || 0) + ' / ' + (player.weapons[cur] || 0));
    const aimVis = cur !== 'fist' && (camState.aimT > 0.5 || player.aimHold > 0) && (!player.inCar || (w.driveby && ctl.aim));
    ui({
      money: '$' + String(Math.floor(player.money)).padStart(8, '0'), hp: Math.round(player.hp), armor: Math.round(player.armor),
      weapon: w.name, ammo: ammo, stars: stars, clock: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'),
      prompt: prompt, message: msgT > 0 ? msgText : '', objective: objective, timer: timer,
      zone: zoneName, zoneOn: zoneT > 0, vehicleOn: vehicleT > 0, nitro: Math.round(player.nitro * 100), nitroOn: !!player.inCar && !player.dead && player.inCar.type !== 'plane', nitroLock: !!player.nitroLock,
      speed: player.inCar ? Math.round(Math.abs(player.inCar.speed) * 3.6) + ' km/h' + (player.inCar.type === 'plane' ? ' · ' + Math.max(0, Math.round(player.inCar.y - planeGround(player.inCar.x, player.inCar.z))) + ' m' : '') : '',
      crosshair: started && !player.dead && aimVis,
      hint: hintT > 0 ? 'Die Maus wird hier nicht eingefangen: Maustaste gedrückt halten und ziehen, um dich umzusehen.' : '', muted: muted
    });
  }

  // ================= Steuerung: Tastatur, Maus & Controller =================
  let locked = false, wasLocked = false, lockFailed = false, inputMode = 'kbm', jumpReq = false, lockPauseAt = -1e9;
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
    const plane = inCar && player.inCar.type === 'plane';
    // im Flugzeug: W/S Schub, Pfeil runter/hoch bzw. Stick ziehen/drücken = Nase hoch/runter
    ctl.thr = clamp((plane ? (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) : kz) + (pad.b[PB.RT] || 0) - (pad.b[PB.LT] || 0), -1, 1);
    ctl.pitch = clamp((keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0) + (pad.ax[1] || 0), -1, 1);
    ctl.steer = clamp(kx + pad.ax[0], -1, 1);
    ctl.hb = !!keys.Space || (held(PB.RB) && !held(PB.LB));
    ctl.lookBack = !!keys.KeyC || held(PB.R3);
  }
  function look(dx, dy) { camState.yaw -= dx * 0.0032; camState.pitch += dy * 0.0028; camState.lastInput = nowT; }
  function playerCarInput() {
    const c = player.inCar.inp;
    c.thr = ctl.thr; c.steer = ctl.steer; c.hb = ctl.hb; c.pitch = ctl.pitch;
    // Nitro nur im Auto und erst wieder, wenn es nach dem Leerfahren voll aufgeladen ist
    c.boost = player.inCar.type !== 'plane' && ctl.sprint && ctl.thr > 0.1 && player.nitro > 0 && !player.nitroLock;
    if (paused || gamePaused || player.dead) { c.thr = 0; c.steer = 0; c.hb = true; c.boost = false; c.pitch = 0; }
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
    if (gamePaused) { closeWheel(); try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* egal */ } pmCenterOnPlayer(); markersUi(); }
    ui({ paused: gamePaused, pauseHint: inputMode === 'pad' ? 'Start oder B zum Weiterspielen' : 'Esc oder P drücken oder auf WEITER klicken',
      mapHelp: inputMode === 'pad' ? 'Linker Stick verschiebt · LB / RB zoomen · A setzt oder entfernt eine Markierung in der Mitte · Y zentriert auf dich' : 'Mausrad oder + / − zoomen · Ziehen oder Pfeiltasten verschieben · Klick setzt eine Markierung · Klick auf eine Markierung oder Rechtsklick entfernt sie' });
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
    if (gamePaused) {
      if (pressed(PB.B)) { togglePause(false); return; }
      // Karte: linker Stick verschiebt, LB/RB zoomen, A setzt/entfernt eine Markierung in der Mitte, Y zentriert
      const lx = pad.ax[0], ly = pad.ax[1];
      if (Math.abs(lx) + Math.abs(ly) > 0.15) { pm.x = clamp(pm.x - lx * 260 / pm.zoom * dt, TX0, TX1); pm.z = clamp(pm.z - ly * 260 / pm.zoom * dt, TZ0, TZ1); pm.dirty = true; }
      if (held(PB.RB)) pmZoom(1 + 1.5 * dt); if (held(PB.LB)) pmZoom(1 / (1 + 1.5 * dt));
      if (pressed(PB.Y)) pmCenterOnPlayer();
      if (pressed(PB.A)) { const s = pmSize(), i = markerAt(s[0] / 2, s[1] / 2 + 12, 22); if (i >= 0) removeMarker(i); else addMarker(pm.x, pm.z); }
      return;
    }
    if (player.dead) return;
    if (pressed(PB.Y)) pressF();
    if (pressed(PB.RIGHT)) pressE();
    if (player.inCar && pressed(PB.L3)) pressE();
    if (!player.inCar && pressed(PB.B)) startReload();
    if (pressed(PB.LEFT)) switchWeapon(1);
    if (pressed(PB.BACK)) cycleCam();
    if (pressed(PB.DOWN)) callCar();
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
  const GAMEKEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyC', 'KeyV', 'KeyP', 'KeyM', 'KeyL', 'ShiftLeft', 'ShiftRight', 'Tab', 'Enter', 'Backspace'];
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
    // Esc pausiert immer; kam die Pause gerade erst durch das Freigeben der Maus (auch Esc), nicht gleich wieder aufheben
    if (e.code === 'Escape' && gamePaused && performance.now() - lockPauseAt < 400) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
    if (gamePaused) {
      // Karte im Pausenmenü: Pfeiltasten/WASD verschieben, + / − zoomen, C zentriert, Entf löscht alle Markierungen
      const step = 60 / pm.zoom;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') { pm.x = clamp(pm.x + step, TX0, TX1); pm.dirty = true; }
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') { pm.x = clamp(pm.x - step, TX0, TX1); pm.dirty = true; }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { pm.z = clamp(pm.z + step, TZ0, TZ1); pm.dirty = true; }
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') { pm.z = clamp(pm.z - step, TZ0, TZ1); pm.dirty = true; }
      else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'BracketRight') pmZoom(1.4);
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'Slash') pmZoom(1 / 1.4);
      else if (e.code === 'KeyC') pmCenterOnPlayer();
      else if (e.code === 'Delete') clearMarkers();
      return;
    }
    if (player.dead) return;
    if (e.code === 'KeyE') pressE();
    else if (e.code === 'KeyF' || e.code === 'Enter') pressF();
    else if (e.code === 'KeyR') startReload();
    else if (e.code === 'KeyQ') switchWeapon(1);
    else if (e.code === 'Tab') openWheel();
    else if (/^Digit[1-5]$/.test(e.code)) selectWeapon(parseInt(e.code.slice(5), 10) - 1);
    else if (e.code === 'KeyV') cycleCam();
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'KeyL') callCar();
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
    else if (wasLocked && started && !menu && !gamePaused && !player.dead) { togglePause(true); lockPauseAt = performance.now(); }
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
    for (let i = 0; i < 2; i++) { const c = spawnTraffic(0, 9999); if (c && c.type !== 'police') { c.type = 'police'; c.T = CAR_TYPES.police; c.mesh = carMeshes.police; c.paint = rgb('#15181d'); c.glow = null; Object.assign(c.driver, makePed('cop', 0, 0), { inCar: c }); } }
    for (let i = 0; i < 14; i++) {
      const sp = roadSpawnPoint(0, 9999); if (!sp) continue;
      const ox = Math.round(Math.cos(sp.yaw)) * -2.2, oz = Math.round(Math.sin(sp.yaw)) * 2.2;
      spawnCar(pick(['sedan', 'sedan', 'pickup', 'van', 'sport', 'taxi']), sp.x + ox, sp.z + oz, sp.yaw, 'parked');
    }
    for (let i = 0; i < 72; i++) spawnWalker(i % 13 === 0 ? 'cop' : 'civ');
    const b = blockRect(5, 0);
    tony = addPed(makePed('giver', b.cx + 4, b.z0 + 1.6));
    Object.assign(tony, { name: 'Tony', hp: 1e9, state: 'stand', shirt: rgb('#f4f1ea'), pants: rgb('#f4f1ea'), hair: rgb('#111111'), cash: 0, hairStyle: 0, sleeve: true, h: 1.02, bw: 1.12 });
    // Nova vermittelt Kurierjobs, sie steht am Späti
    const sp = shopOf('spaeti');
    nova = addPed(makePed('giver', sp.x - 5, sp.z));
    Object.assign(nova, { name: 'Nova', hp: 1e9, state: 'stand', yaw: Math.PI, shirt: rgb('#22e6ff'), pants: rgb('#1b1d22'), hair: rgb('#ff2bd6'), cash: 0, hairStyle: 1, sleeve: false, h: 0.97, bw: 0.95, bag: rgb('#ffe14d') });
    givers.push({ ped: tony, col: [1, 0.8, 0.15], css: '#e2a12b', blip: 'T', talk: talkTony }, { ped: nova, col: [0.63, 0.3, 1], css: '#a14bff', blip: 'N', talk: talkNova });
  }
  function placePlayer() {
    spawnPlane();
    const s = shopOf('waffen');
    player.x = s.x + 5; player.z = s.z; player.y = groundY(player.x, player.z); player.yaw = 1.1;
    camState.yaw = 1.1; camState.pitch = 0.2;
    const c = spawnCar('sedan', s.x + 12, roadC(2) + LANE + 2.0, Math.PI / 2, 'parked'); c.paint = rgb('#1f3d6b'); c.glow = rgb('#22e6ff');
    makeOwn(c);
  }
  // Nitro: lädt sich in rund 14 s voll, eine volle Ladung reicht für gut 3 s Schub
  function nitroTick(dt) {
    const c = player.inCar, on = !!c && !!c.inp.boost && !c.wreck;
    player.nitro = on ? Math.max(0, player.nitro - dt / 3.2) : Math.min(1, player.nitro + dt / 14);
    // leer gefahren: gesperrt, bis es wieder ganz voll ist
    if (player.nitro <= 0 && !player.nitroLock) { player.nitroLock = true; msg('Nitro leer – lädt auf', 1.6); }
    if (player.nitroLock && player.nitro >= 1) { player.nitroLock = false; msg('Nitro bereit', 1.2); }
    player.boostT += ((on ? 1 : 0) - player.boostT) * Math.min(1, (on ? 6 : 3) * dt);
    if (on && !player.boostOn) { sfx('nitro', 0.7); rumble(0.5, 0.8, 220); }
    player.boostOn = on;
    if (!on) return;
    shake = Math.max(shake, 0.04);
    // Flammen aus zwei Auspuffrohren am Heck
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx, back = c.T.L / 2 + 0.15;
    for (const s of [-1, 1]) {
      const x = c.x - fx * back + rx * s * c.T.Wd * 0.28, z = c.z - fz * back + rz * s * c.T.Wd * 0.28;
      addParticle(x, c.y + 0.42, z, c.vx * 0.6 - fx * rand(4, 7) + rand(-0.6, 0.6), rand(-0.2, 0.5), c.vz * 0.6 - fz * rand(4, 7) + rand(-0.6, 0.6), rand(0.12, 0.26), rand(0.14, 0.24), Math.random() < 0.5 ? [0.3, 0.75, 1] : [1, 0.35, 0.95], 0);
    }
  }
  // Szenenplätze nur in Spielernähe besetzen: Leute erscheinen außer Sicht (30–110 m) und verschwinden ab 150 m wieder
  function updateSpots(px, pz) {
    for (const s of spots) {
      const d = Math.hypot(s.x - px, s.z - pz), p = s.ped;
      if (p) {
        const gone = peds.indexOf(p) < 0;
        if (gone || (p.state !== 'idle' && p.state !== 'talk')) { if (!gone) p.spot = null; s.ped = null; s.cool = 25; continue; }
        if (d > 150) { peds.splice(peds.indexOf(p), 1); s.ped = null; }
        continue;
      }
      s.cool -= 0.5;
      if (s.cool > 0 || d > 110 || d < 30) continue;
      const q = makePed('civ', s.x, s.z);
      Object.assign(q, { state: 'idle', stateT: 1e9, act: s.act, yaw: s.yaw, spot: s, cash: randi(5, 40) });
      if (s.act === 'vendor') { q.shirt = rgb('#e8e8e2'); q.sleeve = false; }
      if (s.act === 'wait' && Math.random() < 0.4) q.bag = rgb(pick(['#c9a46c', '#d8d4cc', '#b03a5a']));
      addPed(q); s.ped = q;
    }
  }
  // Fliegende Autos über den Straßenachsen, Dampf aus Gullydeckeln
  const skyCars = [];
  for (let k = 0; k < 10; k++) {
    const alongX = k % 2 === 0, lane = roadC(1 + (k * 3) % 6);
    skyCars.push({ alongX: alongX, lane: lane, y: 34 + (k % 4) * 9, pos: rand(-250, 670), dir: k % 3 === 0 ? -1 : 1, v: rand(22, 34),
      type: pick(['sport', 'sedan', 'taxi', 'van']), paint: rgb(pick(['#1b1d22', '#e8e8e2', '#2a2f3a', '#8b1e3a', '#f2c230'])), glow: rgb(pick(['#ff2bd6', '#22e6ff', '#a14bff', '#39ff88'])) });
  }
  let ventT = 0;
  function ambientTick(dt) {
    for (const s of skyCars) { s.pos += s.v * s.dir * dt; if (s.pos > 670) s.pos -= 920; else if (s.pos < -250) s.pos += 920; }
    ventT -= dt;
    if (ventT > 0) return;
    ventT = 0.3;
    for (const v of vents) if (Math.hypot(v.x - player.x, v.z - player.z) < 70) addParticle(v.x + rand(-0.2, 0.2), 0.15, v.z + rand(-0.2, 0.2), rand(-0.25, 0.25), rand(0.7, 1.1), rand(-0.25, 0.25), rand(2.2, 3.2), 0.5, [0.42, 0.44, 0.52], 0.25);
  }
  function skyCarPos(s) { return s.alongX ? [s.pos, s.lane + 2.5 * s.dir] : [s.lane - 2.5 * s.dir, s.pos]; }
  function drawSkyCars(glow, a) {
    for (const s of skyCars) {
      const p = skyCarPos(s), yaw = s.alongX ? (s.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (s.dir > 0 ? 0 : Math.PI);
      if (!visible(p[0], p[1], 6)) continue;
      mIdent(MA); tr(MA, p[0], s.y + Math.sin(nowT * 1.3 + s.lane) * 0.4, p[1]); ry(MA, yaw); rz(MA, Math.sin(nowT * 0.9 + s.pos * 0.01) * 0.05);
      if (!glow) { drawMesh(carMeshesLo[s.type], MA, s.paint, s.paint, 1); continue; }
      const T = CAR_TYPES[s.type];
      for (const [k, al] of [[0.6, 0.45], [0.95, 0.18]]) { mCopy(MB, MA); tr(MB, 0, -0.05, 0); sc(MB, T.Wd * k, 1, T.L * k * 0.62); drawMesh(diskMesh, MB, s.glow, null, a * al); }
    }
  }
  function recycle() {
    const px = player.x, pz = player.z;
    let civs = 0, traffic = 0;
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      if (p.kind === 'giver' || (mission && mission.peds.indexOf(p) >= 0)) continue;
      const far = Math.hypot(p.x - px, p.z - pz) > 70;
      if (p.state === 'dead' && p.deadT > 40 && far) { peds.splice(i, 1); continue; }
      if (p.state !== 'dead' && !p.spot) civs++;
    }
    updateSpots(px, pz);
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      if (c === player.inCar || (mission && mission.car === c) || (c === ownCar && !c.wreck)) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (c.wreck && c.deadT > 45 && d > 70) { cars.splice(i, 1); continue; }
      if (c.mode === 'parked' && !c.driver && d > 260 && c.type !== 'plane') { cars.splice(i, 1); continue; }
      if (c.driver && c.mode === 'traffic') traffic++;
    }
    // zerstörtes Flugzeug wird außer Sicht am Flughafen ersetzt
    if (!cars.some((c) => c.type === 'plane' && !c.wreck) && Math.hypot(px - PLANE.apronX, pz - PLANE.apronZ) > 150) spawnPlane();
    if (civs < 70) spawnWalker(Math.random() < 0.08 ? 'cop' : 'civ');
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
      callT = Math.max(0, callT - dt);
      if (markers.length) checkMarkers();
      nitroTick(dt);
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
      ambientTick(dt);
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
    player.comboT = (player.comboT || 0) - dt; player.guardT = Math.max(0, (player.guardT || 0) - dt);
    if (player.punchHit > 0) { player.punchHit -= dt; if (player.punchHit <= 0) punchImpact(); }
    if (player.cur !== 'fist') player.guardT = 0;
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
        if (c === ownCar) makeOwn(c); // neue Farbe merken
        else if (!(mission && mission.car === c)) openDialog('Spray & Weg', 'Frisch lackiert! Soll dieser ' + c.T.name + ' ab jetzt dein Hauptwagen sein? Den rufst du dann mit L.', [
          { label: 'Ja, mein neuer Hauptwagen', act: () => { makeOwn(c); closeMenu(); msg('Neuer Hauptwagen: ' + c.T.name + '. Mit L rufst du ihn.', 3); sfx('cash', 0.5); } },
          { label: 'Nein, nur lackieren' }
        ]);
      } else msg('Neue Farbe kostet $100. Komm wieder, wenn du flüssig bist.', 3);
    }
    inLack = nowLack;
    const nowExp = !!c && Math.hypot(c.x - exp.x, c.z - exp.z) < exp.r;
    if (nowExp && !inExport && exportCool <= 0 && !(mission && mission.car === c)) {
      if (c === ownCar) msg('Deinen eigenen Wagen verkaufst du nicht.', 2.5);
      else if (c.type === 'plane') msg('Ein Flugzeug passt hier nicht rein.', 2.5);
      else if (wanted > 0) msg('Die Garage nimmt keine heißen Karren. Hänge erst die Polizei ab.', 3);
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
    if (gamePaused) drawPauseMap();
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
    mapZoom: (f) => pmZoom(f),
    mapCenter: pmCenterOnPlayer,
    clearMarkers: clearMarkers,
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
