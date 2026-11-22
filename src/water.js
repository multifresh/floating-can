// Water on the can. Small things are painted into maps (mist, tiny beads, the clean tracks left by drops that ran);
// beads big enough to stand off the surface are real geometry that light bends through; the drop that gathers at the
// can's lowest point, falls and rings the puddle is run every frame.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';
import { CAN, bodyProfile, profileAt, lidRelief, tabShade } from './can.js?v=0f44a8fc';
import { nearest } from './ball.js?v=0f44a8fc';

export function mulberry32(a) { return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function tex(data, W, H, wrap) {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// a grid of random values read smoothly; joins up left to right
function noise2(rand, nx, ny) {
  const g = Float32Array.from({ length: nx * ny }, rand);
  return (x, y) => {
    x *= nx; y *= ny - 1;
    const i = Math.floor(x), j = Math.min(ny - 2, Math.max(0, Math.floor(y))), fx = x - i, fy = Math.min(1, Math.max(0, y - j)), u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = ((i % nx) + nx) % nx, b = (a + 1) % nx;
    return (g[j * nx + a] * (1 - u) + g[j * nx + b] * u) * (1 - v) + (g[(j + 1) * nx + a] * (1 - u) + g[(j + 1) * nx + b] * u) * v;
  };
}

// A patch of surface as a grid, sized in mm: water height, mist (0..1) and the darkening where a drop meets the surface.
// wrap: the grid joins up left to right (the can's body).
class Field {
  constructor(W, H, mmW, mmH, wrap) {
    this.W = W; this.H = H; this.sx = W / mmW; this.sy = H / mmH; this.mmW = mmW; this.wrap = wrap;
    this.h = new Float32Array(W * H); this.mist = new Float32Array(W * H); this.dark = new Float32Array(W * H);
  }
  idx(x, y) { const i = Math.floor((((x % this.mmW) + this.mmW) % this.mmW) * this.sx), j = Math.min(this.H - 1, Math.max(0, Math.floor(y * this.sy))); return j * this.W + Math.min(this.W - 1, i); }
  // visit the texels inside an ellipse (ax, ay mm, turned by rot) centred at x, y; f(index, d2), d2 = 0 at the centre, 1 at the edge
  each(x, y, ax, ay, rot, f) {
    const c = Math.cos(rot), s = Math.sin(rot), rr = Math.max(ax, ay), W = this.W;
    const i0 = Math.floor((x - rr) * this.sx), i1 = Math.ceil((x + rr) * this.sx), j0 = Math.max(0, Math.floor((y - rr) * this.sy)), j1 = Math.min(this.H - 1, Math.ceil((y + rr) * this.sy));
    for (let j = j0; j <= j1; j++) {
      const dy = (j + 0.5) / this.sy - y;
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) / this.sx - x, a = (dx * c + dy * s) / ax, b = (dy * c - dx * s) / ay, d2 = a * a + b * b;
        if (d2 >= 1) continue;
        let ii = i;
        if (this.wrap) ii = ((i % W) + W) % W; else if (i < 0 || i >= W) continue;
        f(j * W + ii, d2);
      }
    }
  }
  drop(x, y, ax, ay, hc, rot = 0) { const h = this.h; this.each(x, y, ax, ay, rot, (k, d2) => { const v = hc * (1 - d2); if (v > h[k]) h[k] = v; }); }
  wipe(x, y, r) { const m = this.mist; this.each(x, y, r, r, 0, (k, d2) => { const v = sm(0.45, 1, d2); if (v < m[k]) m[k] = v; }); }
  ring(x, y, r, amt = 0.22) {
    const d = this.dark;
    this.each(x, y, r * 1.4, r * 1.4, 0, (k, d2) => { const q = Math.sqrt(d2) * 1.4, v = q < 1 ? amt * sm(0.6, 1, q) : amt * (1 - sm(1, 1.4, q)); if (v > d[k]) d[k] = v; });
  }
  // rough: roughness of the dry surface; relief: height pressed into the metal itself (mm), or null
  textures(rough, relief) {
    const { W, H, h, mist, dark, sx, sy, wrap } = this, N = W * H;
    let T = h;
    if (relief) { T = new Float32Array(N); for (let k = 0; k < N; k++) T[k] = h[k] + relief[k]; }
    const nrm = new Uint8Array(N * 4), dat = new Uint8Array(N * 4), cnd = new Uint8Array(N * 4);
    for (let j = 0; j < H; j++) {
      const jd = Math.max(0, j - 1) * W, ju = Math.min(H - 1, j + 1) * W, row = j * W;
      for (let i = 0; i < W; i++) {
        const il = i > 0 ? i - 1 : wrap ? W - 1 : 0, ir = i < W - 1 ? i + 1 : wrap ? 0 : W - 1, k = row + i, o = k * 4;
        const gx = (T[row + ir] - T[row + il]) * sx * 0.5, gy = (T[ju + i] - T[jd + i]) * sy * 0.5, n = 127.5 / Math.sqrt(gx * gx + gy * gy + 1);
        nrm[o] = 127.5 - gx * n; nrm[o + 1] = 127.5 - gy * n; nrm[o + 2] = 127.5 + n; nrm[o + 3] = 255;
        const hh = h[k], c = hh <= 0 ? 0 : hh >= 0.02 ? 1 : sm(0, 0.02, hh), m = mist[k];
        dat[o] = c * 255; dat[o + 1] = (rough + (0.62 - rough) * m * (1 - c)) * 255; dat[o + 2] = 255; dat[o + 3] = 255;
        cnd[o] = 255 * (1 - Math.min(0.6, dark[k])); cnd[o + 1] = m * 255; cnd[o + 3] = 255;
      }
    }
    return { normal: tex(nrm, W, H, wrap), data: tex(dat, W, H, wrap), cond: tex(cnd, W, H, wrap) };
  }
}

// How much water. the designer (2026-11-21): the first pass had far too many drops, too big, and a white frosted look he did not
// want; he asked for 80 to 85 % fewer and to see the can. That cut went a little too far: he then asked for about
// double (460 beads), and then for a little more again, which is what is set here. So: sparse small beads, a few runs, no mist.
// amount scales every count (?drops=2 doubles them); mist 0..1 brings the frosting back.
export const WATER = { amount: 1, beads: 600, tiny: 6200, runs: 12, lid: 340, mist: 0 };

// The body. q0: how the can hangs at rest, so drops run the way gravity pulls them over the tilted wall.
// Returns the maps and the list of beads to build as geometry: { x (mm round the can), y, r, rot, kind 0 round | 1 sagging | 2 at the end of a run }.
export function bodyWater(q0, rand, detail = 1) {
  const circ = CAN.circ, F = new Field(4096 * detail, 2048 * detail, circ, CAN.H, true), { W, H } = F;
  const n1 = noise2(rand, 8, 6), n2 = noise2(rand, 40, 24);
  const A = WATER.amount, mist = WATER.mist;
  if (mist > 0) for (let j = 0, k = 0; j < H; j++) for (let i = 0; i < W; i++, k++) { const u = (i + 0.5) / W, v = (j + 0.5) / H; F.mist[k] = mist * Math.min(1, Math.max(0, 0.42 + 0.6 * n1(u, v) + 0.3 * (n2(u, v) - 0.5))); }

  const g = new THREE.Vector3(0, -1, 0).applyQuaternion(q0.clone().invert());
  const downAt = x => { const f = Math.PI + 2 * Math.PI * x / circ; return Math.atan2(g.y, g.x * Math.cos(f) - g.z * Math.sin(f)); };   // direction of "down" on the wall, as an angle in (round, up)

  const beads = [], cell = 7, cols = Math.ceil(circ / cell), grid = new Map();
  const add = b => {
    b.x = ((b.x % circ) + circ) % circ; beads.push(b);
    const k = Math.floor(b.x / cell) + cols * Math.floor(b.y / cell);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(b);
    F.wipe(b.x, b.y, b.r * (1.6 + 0.8 * rand())); F.ring(b.x, b.y, b.r);      // a big drop has swallowed the mist round it
  };
  const hit = (x, y, r, pad) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = grid.get(((cx + a) % cols + cols) % cols + cols * (cy + b));
      if (!list) continue;
      for (const o of list) { let dx = Math.abs(o.x - x); if (dx > circ / 2) dx = circ - dx; if (Math.hypot(dx, o.y - y) < (r + o.r) * pad + 0.12) return true; }
    }
    return false;
  };

  // drops that ran: each leaves a clean wet track with a few beads strung along it, and sits at the end of it
  for (let n = 0; n < WATER.runs * A; n++) {
    let x = rand() * circ, y = 50 + rand() * 62, wob = 0, ang = 0;
    const L = 20 + 95 * rand() ** 1.5, w = 0.45 + 0.45 * rand(), pts = [];
    for (let s = 0; s < L && y > 2.4; s += 0.3) {
      wob += (rand() - 0.5) * 0.2 - wob * 0.05; ang = downAt(x) + wob;
      x += 0.3 * Math.cos(ang); y += 0.3 * Math.sin(ang); pts.push(x, y);
    }
    for (let i = 0; i < pts.length; i += 2) {
      const ww = w * (0.4 + 0.6 * sm(0, 0.45, i / pts.length)), px = pts[i], py = pts[i + 1];
      F.wipe(px, py, ww * 2);
      F.each(px, py, ww, ww, 0, (k, d2) => { const v = 0.035 * (1 - d2 * d2); if (v > F.h[k]) F.h[k] = v; });
      if (rand() < 0.07) { const a = 0.1 + 0.28 * rand(); F.drop(px + (rand() - 0.5) * ww, py + (rand() - 0.5) * ww, a, a * 1.4, a * 0.5); }
    }
    if (y > 2.4) add({ x, y, r: w * 1.3, rot: ang + Math.PI / 2, kind: 2 });
  }

  // beads, biggest first, none overlapping; a few have a smaller one run into them
  const sizes = Array.from({ length: Math.round(WATER.beads * A) }, () => { const u = rand(); return 0.3 + 0.45 * u * u + 0.85 * u ** 8; }).sort((a, b) => b - a), n3 = noise2(rand, 13, 8);
  for (const r of sizes) for (let tries = 0; tries < 40; tries++) {
    const x = rand() * circ, y = 2.5 + rand() * 114;
    if (rand() > 0.12 + 1.5 * n3(x / circ, y / CAN.H) ** 2) continue;                    // thick in some patches, thin in others
    if (hit(x, y, r, 1.12 + 0.5 * rand()) || (F.h[F.idx(x, y)] > 0 && rand() < 0.85)) continue;
    add({ x, y, r, rot: r > 1.1 ? downAt(x) + Math.PI / 2 : 0, kind: r > 1.1 ? 1 : 0 });
    if (r > 0.9 && rand() < 0.12) { const a = rand() * 6.283, r2 = r * (0.5 + 0.3 * rand()); add({ x: x + Math.cos(a) * r * 0.8, y: Math.min(116, Math.max(2.5, y + Math.sin(a) * r * 0.8)), r: r2, rot: 0, kind: 0 }); }
    break;
  }
  // beads too small to build, painted in
  for (let n = 0; n < WATER.tiny * A; n++) {
    const x = rand() * circ, y = 1.5 + rand() * 117, a = 0.1 + 0.25 * rand() ** 2;
    if (hit(x, y, a, 0.92)) continue;
    F.drop(x, y, a, a * (1 + 0.25 * rand()), a * 0.55); F.wipe(x, y, a * 1.6); F.ring(x, y, a, 0.15);
  }
  // the mist itself: the finest drops, wherever nothing has wiped it
  for (let n = 0; n < 200000 * mist; n++) {
    const x = rand() * circ, y = rand() * 119;
    if (rand() > F.mist[F.idx(x, y)]) continue;
    const a = 0.06 + 0.13 * rand(); F.drop(x, y, a, a, a * 0.5);
  }
  return { maps: F.textures(0.3), beads };   // metal roughness: 0.3, satin (was 0.2; the designer: a little more matte)
}

// Lid (with the relief pressed into it) or base: beads and mist painted in, and the direction of the spin marks.
export function discWater(rand, lid) {
  const N = lid ? 2048 : 1024, S = 66, F = new Field(N, N, S, S, false), rel = lid ? new Float32Array(N * N) : null, an = new Uint8Array(N * N * 4), ns = noise2(rand, 7, 7);
  for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++, k++) {
    const px = (i + 0.5) / N * S - S / 2, py = (j + 0.5) / N * S - S / 2, r = Math.hypot(px, py) || 1e-6;
    if (lid) { rel[k] = lidRelief(px, -py); F.dark[k] = tabShade(px, -py); }   // on the lid, up in the map is toward the back of the can
    if (WATER.mist > 0 && r < 27) F.mist[k] = WATER.mist * Math.min(1, 0.35 + 0.75 * ns((i + 0.5) / N, (j + 0.5) / N));
    // the grain of the metal. Lid: straight, as rolled sheet (photos show fine parallel lines), so highlights smear across it.
    // Base: spun, so they fan out from the centre.
    if (lid) { an[k * 4] = 127; an[k * 4 + 1] = 255; an[k * 4 + 2] = 255; } else { an[k * 4] = 127.5 + 127.5 * px / r; an[k * 4 + 1] = 127.5 + 127.5 * py / r; an[k * 4 + 2] = 255 * sm(0.6, 2.5, r); }
    an[k * 4 + 3] = 255;
  }
  for (let n = 0; n < WATER.lid * WATER.amount; n++) {
    const a = 0.12 + 0.75 * rand() ** 3, f = rand() * 6.283, rr = 26 * Math.sqrt(rand()), x = S / 2 + rr * Math.cos(f), y = S / 2 + rr * Math.sin(f);
    F.drop(x, y, a, a, a * 0.5); F.wipe(x, y, a * 1.7); F.ring(x, y, a, 0.2);
  }
  for (let n = 0; n < 30000 * WATER.mist; n++) {
    const x = rand() * S, y = rand() * S;
    if (rand() > F.mist[F.idx(x, y)]) continue;
    const a = 0.07 + 0.14 * rand(); F.drop(x, y, a, a, a * 0.5);
  }
  if (lid) {                       // grooves read darker, as in photos: shade where the relief lies below its surroundings
    const b = boxBlur(rel, N, 8);
    for (let k = 0; k < N * N; k++) F.dark[k] = Math.max(F.dark[k], Math.min(0.5, (b[k] - rel[k]) * 2.2));
  }
  const maps = F.textures(lid ? 0.38 : 0.36, rel);   // satin, a little more matte than before (0.28, 0.26)
  maps.aniso = tex(an, N, N, false);
  return maps;
}

function boxBlur(a, N, r) {
  const t = new Float32Array(N * N), o = new Float32Array(N * N), w = 2 * r + 1, c = v => Math.min(N - 1, Math.max(0, v));
  for (let j = 0; j < N; j++) { const row = j * N; let s = 0; for (let i = -r; i <= r; i++) s += a[row + c(i)]; for (let i = 0; i < N; i++) { t[row + i] = s / w; s += a[row + c(i + r + 1)] - a[row + c(i - r)]; } }
  for (let i = 0; i < N; i++) { let s = 0; for (let j = -r; j <= r; j++) s += t[c(j) * N + i]; for (let j = 0; j < N; j++) { o[j * N + i] = s / w; s += t[c(j + r + 1) * N + i] - t[c(j - r) * N + i]; } }
  return o;
}

// A bead: a cap of a sphere, footprint radius 1 in the xy plane, standing k high along +z.
// sag: heavier at the bottom (-y) and narrower at the top, for drops big enough to be pulled out of round.
function capGeo(k, sag) {
  const Rs = (1 + k * k) / (2 * k), th = Math.acos((Rs - k) / Rs) + 0.14;
  let g = new THREE.SphereGeometry(Rs, 20, 8, 0, Math.PI * 2, 0, th);
  g.rotateX(Math.PI / 2); g.translate(0, 0, k - Rs);
  if (sag) {
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * (1 - 0.2 * y), y - 0.3 * Math.max(0, z / k), z); }
    g.computeVertexNormals();
  }
  return g;
}

// Clear water that bends what is behind it. Two liberties, both for how drops read at this size:
// glint: reflections are brighter than water's own 2 % (a real lamp is far brighter than anything a screen shows, so its
//   pinpoint in each drop survives; here it has to be helped);
// focus: a drop gathers the light that enters it onto its far side, so the surface seen through it is brighter away from
//   the lamp and darker toward it.
export function waterMaterial(lampDir, o = {}) {
  const g = o.glint ?? 2.4;
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0, transmission: 1, ior: 1.333, thickness: 1.4, specularIntensity: 1,
    specularColor: new THREE.Color(g, g, g), clearcoat: 1, clearcoatRoughness: 0.1 });
  const U = { uLampDir: { value: lampDir }, uFocus: { value: new THREE.Vector2(o.shade ?? 0.7, o.focus ?? 1.6) } };
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLampDir; uniform vec2 uFocus;')
      .replace('#include <transmission_fragment>', `#include <transmission_fragment>
{ float far = smoothstep(.65, .1, dot(inverseTransformDirection(normal, viewMatrix), uLampDir)); totalDiffuse *= uFocus.x + uFocus.y*far*far; }`);
  };
  return m;
}

// the body's beads as two sets of instances (round, sagging), in the can's own frame (mm, standing)
export function buildBeads(list, mat) {
  const P = bodyProfile(), grp = new THREE.Group(), M = new THREE.Matrix4();
  const t = new THREE.Vector3(), s = new THREE.Vector3(), n = new THREE.Vector3(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), p = new THREE.Vector3();
  for (const sag of [false, true]) {
    const set = list.filter(b => (b.kind > 0) === sag), mesh = new THREE.InstancedMesh(capGeo(sag ? 0.6 : 0.64, sag), mat, set.length);
    set.forEach((b, i) => {
      const f = Math.PI + 2 * Math.PI * b.x / CAN.circ, sf = Math.sin(f), cf = Math.cos(f), pr = profileAt(P, b.y), c = Math.cos(b.rot), sn = Math.sin(b.rot), r = b.r;
      n.set(pr.nr * sf, pr.ny, pr.nr * cf); t.set(cf, 0, -sf); s.set(-pr.dr * sf, -pr.dy, -pr.dr * cf);     // out, round, up the surface
      ax.copy(t).multiplyScalar(c).addScaledVector(s, sn).multiplyScalar(r * (b.kind === 2 ? 0.8 : 1));
      ay.copy(s).multiplyScalar(c).addScaledVector(t, -sn).multiplyScalar(r * (b.kind === 2 ? 1.9 : b.kind === 1 ? 1.18 : 1));
      p.set(pr.r * sf, b.y, pr.r * cf).addScaledVector(n, -(0.05 * r + r * r / 90));                           // sunk a little so its edge meets the curved wall
      M.makeBasis(ax, ay, n.multiplyScalar(r / (1 + 0.1 * Math.max(0, r - 0.8) ** 2))).setPosition(p);          // big drops lie flatter
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    grp.add(mesh);
  }
  return grp;
}

// The drip. Water gathers at whatever point of the can is lowest right now, swells, necks and lets go; the drop falls,
// rings the puddle (impact(x, z, radius, time, strength)) and throws up two or three small ones.
// The drop hanging from the lowest point is not a ball (the designer: "like a bubble more than a water drop"). It is a pendant
// drop: where the water wets the can its edge flares out onto the metal, below that a neck, then the round bulb. As it
// fills, the bulb sinks and the neck forms; in the last moment the neck thins and stretches, the bulb goes a little pear-
// shaped, and it lets go, leaving a small bead behind. A lathe whose outline is rebuilt every frame; metres, hanging from y = 0.
const DP = 44, DS = 36;
function dropGeometry() {
  const g = new THREE.BufferGeometry(), idx = [];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((DS + 1) * DP * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((DS + 1) * DP * 3), 3));
  for (let i = 0; i < DS; i++) for (let j = 0; j < DP - 1; j++) { const a = i * DP + j, b = a + DP; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  g.setIndex(idx);
  return g;
}
// B: bulb radius; grow 0..1 as it fills; pull 0..1 through the last moment. Returns how far down the bulb's centre is.
function shapeDrop(g, B, grow, pull) {
  // the designer (second look): still too round, like a ball; bring in the sides. So the bulb is narrower than it is long, and its
  // upper half is drawn out into the neck (a teardrop, widest low down), with the size kept about the same.
  const a = B * 0.95, n = B * (0.95 - 0.42 * grow - 0.38 * pull);               // a: where it wets the can; n: the neck
  const c = B * (0.4 + 1.05 * grow + 1.0 * pull), w = B * (0.26 + 0.2 * pull);   // c: depth of the widest point; w: length of the flare
  const bx = B * 0.84 * (1 - 0.05 * pull), up = B * (1.3 + 0.3 * pull), by = B * (1.0 + 0.1 * pull), z0 = -0.05 * B, L = c + by;
  const pos = g.attributes.position, nrm = g.attributes.normal, R = new Float32Array(DP), Z = new Float32Array(DP);
  for (let j = 0; j < DP; j++) {
    const z = z0 + (L - z0) * (0.5 - 0.5 * Math.cos(Math.PI * j / (DP - 1)));
    const rb = bx * Math.sqrt(Math.max(0, 1 - ((z - c) / (z < c ? up : by)) ** 2));
    const rm = (z < 0 ? a : n + (a - n) * Math.exp(-z / w)) * sm(c, c - 0.5 * B, z);
    R[j] = j === DP - 1 ? 0 : Math.pow(rm ** 6 + rb ** 6, 1 / 6); Z[j] = -z;
  }
  for (let i = 0; i <= DS; i++) {
    const f = 2 * Math.PI * i / DS, sn = Math.sin(f), cs = Math.cos(f);
    for (let j = 0; j < DP; j++) pos.setXYZ(i * DP + j, R[j] * sn, Z[j], R[j] * cs);
  }
  g.userData.Z = Z;
  return c;
}
// Lay the top of the drop onto the can: the metal round the lowest point rises away from it (steeply on the outer side of
// the bottom edge), so each point of the flare is lifted by as much as the can's surface rises above it, fully at the top
// row (which then lies on the metal) and fading out down the neck. Found by marching up to the can's outline from below.
const _s = new THREE.Vector3(), _up = new THREE.Vector3(), _inv = new THREE.Matrix4();
function wrapDrop(g, at, B, group) {
  const pos = g.attributes.position, nrm = g.attributes.normal, Z = g.userData.Z, H = CAN.H / 2;
  _inv.copy(group.matrixWorld).invert(); _up.set(0, 1, 0).transformDirection(_inv);   // world up, in the can's frame
  for (let j = 0; j < DP; j++) {
    const wt = sm(0.6 * B, 0, -Z[j]);
    if (wt <= 0) break;
    for (let i = 0; i <= DS; i++) {
      const k = i * DP + j;
      _s.set(at.x + pos.getX(k), at.y - 0.002, at.z + pos.getZ(k)).applyMatrix4(_inv);   // from 2 mm under the lowest point, in mm
      let t = 0;
      for (let n = 0; n < 14; n++) { const o = nearest(Math.hypot(_s.x, _s.z), _s.y); if (o.d < 0.02) break; t += o.d; _s.addScaledVector(_up, o.d); if (t > 9) break; }
      const rise = Math.min(t / 1000 - 0.002, 0.004);                                // how far the metal above this point is above the lowest point
      pos.setY(k, pos.getY(k) + Math.max(0, rise) * wt + (j === 0 ? 0.00008 : 0));    // the top row tucked just into the metal
    }
  }
  pos.needsUpdate = true; g.computeVertexNormals();
  for (let i = 0; i <= DS; i++) nrm.setXYZ(i * DP + DP - 1, 0, -1, 0);         // the tip points straight down
  g.computeBoundingSphere();
}

export class Drips {
  constructor(scene, mat, samples, impact, rand) {
    this.samples = samples; this.impact = impact; this.rand = rand;
    const ball = new THREE.SphereGeometry(1, 28, 18);
    this.hang = new THREE.Mesh(dropGeometry(), mat); this.hang.castShadow = true; this.c = 0;
    this.fall = new THREE.InstancedMesh(ball, mat, 16); this.fall.castShadow = true; this.fall.frustumCulled = false; this.fall.scale.setScalar(0.001);
    scene.add(this.hang, this.fall);
    this.at = null; this.low = new THREE.Vector3(); this.v = new THREE.Vector3(); this.M = new THREE.Matrix4();
    this.r = 0.0016; this.pull = -1; this.full = 0.0026; this.rate = 0.0006; this.drops = [];
  }
  release(k) {
    this.drops.push({ p: this.hang.position.clone().setY(this.hang.position.y - this.c), v: new THREE.Vector3(), r: this.r * 0.93 * k, first: true });   // from where the bulb was
    this.r = 0.0009; this.pull = -1; this.full = 0.0023 + 0.0006 * this.rand(); this.rate = (this.full - this.r) / (1.6 + 2.4 * this.rand());
  }
  update(t, dt, group) {
    const { v, low, M } = this;
    low.y = Infinity;
    for (const p of this.samples) { v.copy(p).applyMatrix4(group.matrixWorld); if (v.y < low.y) low.copy(v); }
    if (!this.at) this.at = low.clone();
    if (this.at.distanceTo(low) > 0.014) { if (this.r > 0.0013) this.release(0.85); this.at.copy(low); }   // the can was turned: what hung there falls
    else this.at.lerp(low, Math.min(1, dt * 14));
    if (this.pull < 0) { this.r += dt * this.rate; if (this.r >= this.full) this.pull = 0; }
    else { this.pull += dt / 0.16; if (this.pull >= 1) this.release(1); }
    const grow = this.pull < 0 ? Math.min(1, Math.max(0, (this.r - 0.0009) / (this.full - 0.0009))) : 1, st = this.pull < 0 ? 0 : this.pull * this.pull;
    this.c = shapeDrop(this.hang.geometry, this.r, grow, st);
    wrapDrop(this.hang.geometry, this.at, this.r, group);
    this.hang.position.copy(this.at);

    for (const d of this.drops) {
      d.v.y -= 5.5 * dt; d.p.addScaledVector(d.v, dt);
      if (d.p.y > d.r * 0.6) continue;
      d.dead = true; this.impact(d.p.x, d.p.z, d.r, t, d.first ? 1 : 0.25);
      if (d.first) for (let i = 0, m = 2 + (this.rand() * 3 | 0); i < m; i++) {
        const a = this.rand() * 6.283, sp = 0.05 + 0.1 * this.rand();
        this.drops.push({ p: new THREE.Vector3(d.p.x, 0.001, d.p.z), v: new THREE.Vector3(Math.cos(a) * sp, 0.28 + 0.3 * this.rand(), Math.sin(a) * sp), r: d.r * (0.18 + 0.14 * this.rand()) });
      }
    }
    this.drops = this.drops.filter(d => !d.dead).slice(-16);
    this.drops.forEach((d, i) => {
      const k = Math.min(1.3, Math.abs(d.v.y) * 1.5), rr = d.r * 1000;
      M.makeScale(rr * (1 - 0.12 * k), rr * (1 + k), rr * (1 - 0.12 * k)).setPosition(d.p.x * 1000, d.p.y * 1000, d.p.z * 1000);
      this.fall.setMatrixAt(i, M);
    });
    this.fall.count = this.drops.length; this.fall.instanceMatrix.needsUpdate = true;
  }
}
