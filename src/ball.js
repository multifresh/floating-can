// A golf ball, true to size against the can: 42.67 mm across (the can is 66 mm across, 122.2 mm tall).
// Dimples (rebuilt 2026-11-21, the designer: "the dimples maybe need to be a little more defined"): 362 of them on a geodesic
// icosahedron, the layout most balls use, each as wide as its spacing allows (3.4 to 4.2 mm, so neighbours are packed
// with a narrow land between), a spherical-cap cut with a crisp edge, walls about 16 degrees at the edge, depth 7 % of
// the width (about 0.28 mm). Their shading is worked out per pixel, so the edges stay sharp at any zoom; the mesh is
// also cut in, for the outline. Millimetres, centred on the origin.
// Logo ("A space for golf nerds", Figma frame 6:25 in the art file, assets/ball-logo.svg): printed at its size in the
// art, 71 × 30 pt = 25.0 × 10.6 mm, which matches the designer's photo of the real ball. It is centred on the ball's +z and
// wrapped on as a pad print would lay it: distances along the surface equal distances on the art. Printed twice over
// (the designer: "double hit" it, to darken it): each layer of ink filters the light, so the colour is the art's colour squared.
//
// The ball can be picked up and thrown. It stays in the plane it sits in (it never moves toward or away from the
// camera), falls, bounces on the table and off the can, and rolls. A hit nudges the can's spin.
import * as THREE from 'three';
import { CAN } from './can.js';

const R = 21.335, SLOPE = 0.28, LOGO = [71 * 25.4 / 72, 30 * 25.4 / 72];          // SLOPE: the dimple wall's slope at its edge; the depth follows from it

function dimples() {
  const p = new THREE.IcosahedronGeometry(1, 5).attributes.position, C = [], seen = new Set();   // frequency 6: 362 points
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize(), k = v.toArray().map(x => Math.round(x * 1e4)).join();
    if (!seen.has(k)) { seen.add(k); C.push(v); }
  }
  return C.map(c => { let nn = Math.PI; for (const o of C) if (o !== c) nn = Math.min(nn, c.angleTo(o)); const a = 0.46 * nn; return { c, a, cos: Math.cos(a) }; });
}

export function buildBall(logo, hits = 2) {
  const D = dimples(), g = new THREE.IcosahedronGeometry(1, 44), p = g.attributes.position, nrm = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let h = 0;
    for (const { c, a, cos } of D) { const d = v.dot(c); if (d < cos) continue; const q = Math.acos(Math.min(1, d)) / a; h = Math.min(h, -SLOPE / 2 * a * R * (1 - q * q)); }
    p.setXYZ(i, v.x * (R + h), v.y * (R + h), v.z * (R + h)); nrm.setXYZ(i, v.x, v.y, v.z);
  }
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(0.86, 0.86, 0.84), roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.12 });
  const U = { uDimples: { value: D.map(({ c, cos }) => new THREE.Vector4(c.x, c.y, c.z, cos)) }, uLogo: { value: logo ?? null } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDir, vN0, vN1, vN2;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = position; vN0 = normalMatrix[0]; vN1 = normalMatrix[1]; vN2 = normalMatrix[2];');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDir, vN0, vN1, vN2;\nuniform vec4 uDimples[${D.length}];${logo ? '\nuniform sampler2D uLogo;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 dD = normalize(vDir), dN = dD;
        float pix = length(fwidth(dD)), cav = 1.0;                // the angle one pixel spans, for softening the edges just enough
        for (int i = 0; i < ${D.length}; i++) {
          vec4 c = uDimples[i]; float d = dot(dD, c.xyz);
          if (d <= c.w) continue;
          float a = acos(c.w), q = acos(min(d, 1.0)) / a;
          float lip = 1.0 - smoothstep(1.0 - clamp(1.5 * pix / a, 0.05, 0.6), 1.0, q);   // a slightly rounded edge, so it does not shimmer
          vec3 t = d * dD - c.xyz; float tl = length(t);
          if (tl > 1e-6) dN = normalize(dD - ${SLOPE.toFixed(3)} * q * lip * t / tl);
          cav = 1.0 - 0.06 * (1.0 - q * q);                       // a touch darker in the hollow
          break;
        }
        diffuseColor.rgb *= cav;${logo ? `
        if (dD.z > 0.0) {                                         // the logo: ink laid on the surface, in the dimples too
          vec2 t = dD.xy; float tl = length(t);
          vec2 uv = (tl > 1e-6 ? asin(min(tl, 1.0)) * ${R} * t / tl : vec2(0.0)) / vec2(${LOGO[0].toFixed(3)}, ${LOGO[1].toFixed(3)}) + 0.5;
          if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) { vec4 ink = texture2D(uLogo, uv); diffuseColor.rgb = mix(diffuseColor.rgb, pow(ink.rgb, vec3(${hits.toFixed(2)})), ink.a); }
        }` : ''}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mat3(vN0, vN1, vN2) * dN);')
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\nclearcoatNormal = normal;');
  };
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- throwing it
const RM = R / 1000, G = 9.81, MASS = 0.0459;
const E_TABLE = 0.6, E_CAN = 0.45, E_WALL = 0.5, MU = 0.35;   // speed kept bouncing off the table, the can, the edges of the view; MU: friction on the can
const CAN_I = 0.01;                                 // the can's moment of inertia (kg m²), many times a full can's (0.0006), so a hit nudges it rather than flings it
// The can's outline (radius, height about its centre, mm), from the stand ring round to the rim; the lid counts as flat.
const OUTLINE = [[0, 0], [24.0, 0], [25.5, 1.3], [28.8, 4.3], [31.8, 7.5], [33, 11.6], [33, 103.2], [31.6, 108.4], [29.2, 113.3], [26.6, 117.6], [26.15, 120.1], [27.18, 120.6], [27.22, 121.5], [26.5, 122.2], [0, 122.2]].map(([r, y]) => [r, y - CAN.H / 2]);

// Signed distance (mm) from (r, y) in the can's own frame to its outline, and the outward normal there.
export function nearest(r, y) {
  let best = Infinity, br = 0, by = 0, inside = false;
  for (let i = 0; i < OUTLINE.length - 1; i++) {
    const [ar, ay] = OUTLINE[i], [bR, bY] = OUTLINE[i + 1], er = bR - ar, ey = bY - ay;
    const t = Math.max(0, Math.min(1, ((r - ar) * er + (y - ay) * ey) / (er * er + ey * ey))), cr = ar + er * t, cy = ay + ey * t, d = (r - cr) ** 2 + (y - cy) ** 2;
    if (d < best) { best = d; br = cr; by = cy; }
    if ((ay > y) !== (bY > y) && r < ar + (y - ay) / ey * er) inside = !inside;
  }
  const d = Math.sqrt(best), s = inside ? -1 : 1;
  return d < 1e-6 ? { d: 0, nr: 1, ny: 0 } : { d: s * d, nr: s * (r - br) / d, ny: s * (y - by) / d };
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4(), _plane = new THREE.Plane(), Z = new THREE.Vector3(0, 0, 1);

export class Ball {
  constructor(mesh, x, z) {
    this.mesh = mesh; this.z = z; this.p = new THREE.Vector2(x, RM); this.v = new THREE.Vector2(); this.w = 0;   // w: spin about the line of sight
    this.held = null; _plane.set(Z, -z);
    mesh.position.set(x, RM, z);
  }
  // Pick it up if the pointer's ray passes over it (a little generously).
  grab(ray) {
    if (ray.distanceToPoint(this.mesh.position) > RM * 1.35 || !ray.intersectPlane(_plane, _v)) return false;
    this.held = { off: new THREE.Vector2(this.p.x - _v.x, this.p.y - _v.y), target: this.p.clone(), vel: new THREE.Vector2() };
    return true;
  }
  move(ray) { if (this.held && ray.intersectPlane(_plane, _v)) this.held.target.set(_v.x + this.held.off.x, _v.y + this.held.off.y); }
  release() { if (!this.held) return; this.v.copy(this.held.vel); if (this.v.length() > 7) this.v.setLength(7); this.held = null; }

  // can: { group, prev (its matrix last frame), spin (its spin, rad/s, world axes), free (not being turned by hand) }
  update(dt, cam, can) {
    const { p, v } = this, held = this.held, before = p.clone();
    // the edges of the view, at the ball's height, are walls; never closer than 7 cm to the can's axis, so there is room for
    // the ball beside the can (it was 14 cm, which put the right wall off screen in a narrow window: the camera stands left of the can)
    const ey = _v.set(p.x, p.y, this.z).project(cam).y, walls = [-1, 1].map(s => { _v.set(s, ey, 0.5).unproject(cam).sub(cam.position); return cam.position.x + _v.x * (this.z - cam.position.z) / _v.z; });
    const L = Math.min(walls[0], -0.07) + RM, Rt = Math.max(walls[1], 0.07) - RM;
    _inv.copy(can.group.matrixWorld).invert();
    if (held) { v.subVectors(held.target, p).divideScalar(dt); if (v.length() > 8) v.setLength(8); }   // held: it chases the pointer, but the can and table still stop it
    const n = Math.min(48, Math.max(Math.ceil(dt / 0.004), Math.ceil(v.length() * dt / (RM * 0.4)))), h = dt / n;   // short steps, so it never jumps into the can
    for (let s = 0; s < n; s++) {
      if (!held && !(p.y <= RM + 1e-6 && v.y <= 0)) v.y -= G * h;   // gravity, unless the table holds it up
      p.addScaledVector(v, h);
      if (p.y <= RM + 1e-6) {                                           // the table
        p.y = RM;
        if (v.y < 0) v.y = held || v.y > -0.12 ? 0 : -v.y * E_TABLE;
        const vf = (5 * v.x - 2 * this.w * RM) / 7; v.x = vf; this.w = -vf / RM;   // grips: slides into rolling
        if (!held && v.y === 0) { v.x -= Math.sign(v.x) * Math.min(Math.abs(v.x), 0.15 * h); v.x *= Math.exp(-0.4 * h); this.w = -v.x / RM; }   // rolling resistance
      }
      if (p.x < L) { p.x = L; if (v.x < 0) v.x = held ? 0 : -v.x * E_WALL; }
      if (p.x > Rt) { p.x = Rt; if (v.x > 0) v.x = held ? 0 : -v.x * E_WALL; }
      this.hitCan(h, dt, can, held);
      if (p.y < RM) p.y = RM;
    }
    if (held) { held.vel.lerp(_v.set((p.x - before.x) / dt, (p.y - before.y) / dt), 0.5); v.set(0, 0); if (p.y <= RM + 1e-5) this.w = -held.vel.x / RM; }
    else if (p.y > RM + 1e-5) this.w *= Math.exp(-0.2 * dt);
    this.mesh.position.set(p.x, p.y, this.z);
    this.mesh.rotateOnWorldAxis(Z, this.w * dt);
  }

  hitCan(h, dt, can, held) {
    const { p, v } = this, pl = _v.set(p.x, p.y, this.z).applyMatrix4(_inv), r = Math.hypot(pl.x, pl.z), o = nearest(r, pl.y);
    if (o.d >= R) return;
    const cr = r > 1e-6 ? o.nr / r : 0, nl = _w.set(pl.x * cr, o.ny, pl.z * cr);                // outward normal, can frame
    _n.copy(nl).applyQuaternion(can.group.quaternion);                                          // and in the world
    let ux = _n.x, uy = _n.y;
    if (uy < 0 && p.y <= RM + 1e-5) uy = 0;                                                   // pressed down onto the table: the table holds, so it goes sideways
    let l = Math.hypot(ux, uy);
    if (l < 1e-4) { ux = Math.sign(p.x - can.group.position.x) || 1; uy = 0; l = 1; }
    ux /= l; uy /= l;
    const push = (R - o.d) / 1000 / Math.max(l, 0.3);
    p.x += ux * push; p.y += uy * push;
    // the can's surface speed at the contact, from how the touching point moved since last frame
    _c.copy(pl).addScaledVector(nl, -o.d);                                                      // the touching point, can frame
    const cw = _w.copy(_c).applyMatrix4(can.group.matrixWorld), was = _n.copy(_c).applyMatrix4(can.prev);
    const sx = (cw.x - was.x) / dt, sy = (cw.y - was.y) / dt, vn = (v.x - sx) * ux + (v.y - sy) * uy;
    if (vn >= 0) return;
    const dv = held ? -vn : -(1 + E_CAN) * vn;
    v.x += ux * dv; v.y += uy * dv;
    // Friction where it touches drags the ball's surface toward the can's, so the ball picks up spin as it hits and as it
    // slides off (the designer: it slid off without turning). A solid ball: stopping a slip takes 3.5 times the impulse it would
    // for a sliding block; the friction is capped at MU times the can's push.
    const tx = -uy, ty = ux;
    let f = 0;
    if (!held) {
      const slip = (v.x - sx) * tx + (v.y - sy) * ty - this.w * RM;
      f = Math.max(-MU * dv, Math.min(MU * dv, slip / 3.5));
      v.x -= f * tx; v.y -= f * ty; this.w += 2.5 * f / RM;
    }
    if (can.free) {                                                     // and the can takes the opposite kick (a gentle push while the ball is held)
      const kn = held ? Math.min(dv, 2) * h * 2 : dv, jx = -MASS * (kn * ux - f * tx) / CAN_I, jy = -MASS * (kn * uy - f * ty) / CAN_I;
      const ox = cw.x - can.group.position.x, oy = cw.y - can.group.position.y, oz = cw.z - can.group.position.z;
      can.spin.x -= oz * jy; can.spin.y += oz * jx; can.spin.z += ox * jy - oy * jx;
    }
  }
}
