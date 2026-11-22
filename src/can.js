// The can: a standard 12 oz beverage can (211 diameter × 413 tall, 355 ml), in millimetres, standing on y = 0
// with its axis on y. Sizes follow Crown's 12 oz can and its art template (../templates/crown-12oz-standard-can-template.pdf).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

const IN = 25.4;
export const CAN = {
  R: 33.0,              // body radius (66.0 mm across)
  H: 122.2,             // height with the lid on
  panelY: 118.4,        // lid centre panel, 3.8 mm below the top of the seam
  rivetZ: -3.8,         // the rivet sits this far behind the centre, away from the opening (the designer's photos)
  seamY: 120.1,         // where the shoulder meets the underside of the seam
  neckBend: 103.2,      // where the shoulder starts to curve in (print bottom + 3.8688 in)
  printBottom: 5.95,    // bottom edge of the printed area, on the curve of the base (raised 1.05 mm, the designer: so the print reaches up the neck to the seam, with no bare metal under it)
  // Crown's template, inches
  art: { w: 8.3785, h: 4.5179, overL: 0.4029, overR: 0.2868 },
};
CAN.circ = 2 * Math.PI * CAN.R;          // 207.35 mm = 8.1634 in round the body
CAN.art.printH = CAN.art.h * IN;         // 114.75 mm

const V = (r, y) => new THREE.Vector2(r, y);

// Outer wall, from the stand ring up over the shoulder and the double seam to the top of the seam's inner side.
// Checked against photos of real 12 oz cans (2026-11-21): the shoulder is a cone of about 30 degrees with rounded ends,
// then a short straight neck. The rim (the double seam) was rebuilt from the designer's photos of his own can :
// a thin upright band, 2.1 mm in all, with a flat face standing 1 mm proud and a broad, flat top; its underside is a short
// chamfer tight to the metal below (a flat underside mirrored the green table and read as a gap). the designer's close-up showed
// the seam much thinner than the first rebuild and no straight neck under it, so the shoulder now curves right up to the
// seam: it rises 16.9 mm (was 15 plus a 1.7 mm neck).
export function bodyProfile() {
  const P = [];
  // base (photos of real cans, see the README): a narrow rounded stand ring 48 mm across, a straight cone rising at about
  // 40 degrees, then a broad curve into the wall 11.6 mm up. It was one round bowl curve before, which read as bulbous.
  for (const [r, y] of [[24.0, 0], [24.6, 0.14], [25.05, 0.5], [25.35, 1.0], [25.7, 1.6], [26.4, 2.3], [27.6, 3.3], [28.8, 4.3], [30.0, 5.35], [31.0, 6.4], [31.8, 7.5], [32.4, 8.7], [32.8, 9.9], [32.95, 10.8], [33.0, 11.6]]) P.push(V(r, y));
  for (const y of [12.6, 16, 20, 30, 40, 50, 60, 70, 80, 90, 98, 102.3]) P.push(V(33.0, y));   // straight wall; points near its ends keep the shading flat
  const a = 0.22, K = s => s < a ? s * s / (2 * a * (1 - a)) : s > 1 - a ? 1 - (1 - s) * (1 - s) / (2 * a * (1 - a)) : (s - a / 2) / (1 - a);   // slope eases in, holds, eases out
  for (let i = 0; i <= 18; i++) { const s = i / 18; P.push(V(33.0 - 6.85 * K(s), CAN.neckBend + (CAN.seamY - CAN.neckBend) * s)); }   // shoulder
  for (const [r, y] of [[26.4, 120.22], [26.75, 120.33], [27.05, 120.45], [27.18, 120.62], [27.22, 120.9], [27.21, 121.5], [27.13, 121.82], [26.97, 122.04], [26.75, 122.16], [26.45, 122.2], [26.1, 122.17], [25.85, 122.06], [25.7, 121.9]]) P.push(V(r, y));
  return P;
}

// Lid, from the inside edge of the seam in: rebuilt (fourth time) from the designer's photos of his own can. The wall inside the
// rim is not one long slope: a short steep wall (about 20 degrees off upright, 2 mm), then a shelf halfway down that juts
// in about 1.5 mm (the "bevel" the designer sees), then a second steep wall to a narrow groove 6.1 mm below the top of the
// seam, then up 2.3 mm onto a centre panel 41 mm across (it was 42.4) that sits 3.8 mm below the top.
function lidProfile() {
  const P = [[25.7, 121.9], [25.55, 121.6], [25.38, 121.1], [25.15, 120.45], [24.92, 119.85], [24.75, 119.6], [24.5, 119.43], [24.1, 119.27], [23.7, 119.12], [23.45, 118.98], [23.3, 118.75], [23.1, 118.2], [22.85, 117.5], [22.6, 116.85], [22.4, 116.45], [22.15, 116.2], [21.85, 116.12], [21.58, 116.22], [21.42, 116.5], [21.32, 117.0], [21.22, 117.6], [21.05, 118.05], [20.75, 118.3], [20.4, 118.38], [20.0, CAN.panelY]];
  for (const r of [18, 15, 12, 9, 6, 3.5, 1.5, 0]) P.push([r, CAN.panelY]);
  return P.map(([r, y]) => V(r, y));
}

// Base: the dome, out to the stand ring the can stands on.
// From photos: a smooth dome 10.4 mm deep that takes up most of the base, meeting a short steep wall on the inside of the stand ring.
export const domeY = r => 10.4 - 7.4 * (r / 21.9) ** 2;
function bottomProfile() {
  const P = [];
  for (let i = 0; i <= 14; i++) { const r = 21.9 * i / 14; P.push(V(r, domeY(r))); }
  for (const [r, y] of [[22.3, 2.5], [22.55, 1.8], [22.7, 1.1], [22.95, 0.5], [23.4, 0.12], [24.0, 0]]) P.push(V(r, y));
  return P;
}

// Radius, outward normal and down-the-surface direction of the body at height y (on the part where y only rises).
export function profileAt(P, y) {
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (b.y <= a.y || y < a.y || y > b.y) continue;
    const t = (y - a.y) / (b.y - a.y), dr = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dr, dy);
    return { r: a.x + dr * t, nr: dy / l, ny: -dr / l, dr: -dr / l, dy: -dy / l };
  }
  return { r: CAN.R, nr: 1, ny: 0, dr: 0, dy: -1 };
}

// Points on the outside of the can, about its centre, for finding the lowest one (where water drips from).
export function canSamples() {
  const prof = [[24.0, 0], [25.5, 1.3], [28.8, 4.3], [31.8, 7.5], [33, 11.6], [33, 40], [33, 70], [33, 103.2], [31.6, 108.4], [29.2, 113.3], [27.0, 117.6], [26.15, 120.1], [27.18, 120.6], [27.22, 121.5], [26.5, 122.2]];
  const out = [];
  for (let i = 0; i < 72; i++) {
    const f = 2 * Math.PI * i / 72;
    for (const [r, y] of prof) out.push(new THREE.Vector3(r * Math.sin(f), y - CAN.H / 2, r * Math.cos(f)));
  }
  return out;
}

// Body: lathe seam at the back (phiStart = π), so texture u runs 0..1 starting at the back.
// aArtV: height on the art. Printing happens before the shoulder is necked in, so above the neck bend the art
// follows the length along the metal, not the height.
function bodyGeometry() {
  const P = bodyProfile(), n = P.length;
  const g = new THREE.LatheGeometry(P, 160, Math.PI, 2 * Math.PI);
  // above the neck bend the art follows the metal, scaled so the print ends where the seam begins (no bare band under it)
  let arc = 0;
  for (let j = 1; j < n && P[j].y <= CAN.seamY + 1e-6; j++) if (P[j].y > CAN.neckBend) arc += Math.hypot(P[j].x - P[j - 1].x, P[j].y - P[j - 1].y);
  const fit = (CAN.printBottom + CAN.art.printH - CAN.neckBend) / arc;
  const s = []; let acc = 0;
  for (let j = 0; j < n; j++) {
    if (P[j].y <= CAN.neckBend || j === 0) acc = P[j].y;
    else acc += Math.hypot(P[j].x - P[j - 1].x, P[j].y - P[j - 1].y) * fit;
    s.push((acc - CAN.printBottom) / CAN.art.printH);
  }
  const pos = g.attributes.position, uv = g.attributes.uv, artV = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k++) {
    uv.setY(k, pos.getY(k) / CAN.H);
    artV[k] = s[k % n];
  }
  g.setAttribute('aArtV', new THREE.BufferAttribute(artV, 1));
  return g;
}

// lid and base use a flat map seen from above (lid) or below (base), 66 mm across
function planar(g, flip) {
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, 0.5 + p.getX(k) / 66, 0.5 + flip * p.getZ(k) / 66);
  return g;
}

// The pull tab, from photos of real ones (see the README): about 24.5 x 16 mm. The lifting end is square-shouldered and
// nearly all finger hole (a rounded rectangle, wider than it is long); it narrows a little to a round nose centred on
// the rivet; a slot runs three quarters of the way round the rivet, open toward the nose. The outer edge and the edge
// of the finger hole are rolled. Rebuilt after the designer's photos ("not thick enough", "sits up off the can more"): 23 x 13.4 mm,
// a rolled edge 1.5 mm thick round a 0.28 mm web, the finger hole rolled too, and the whole tab tipped up 2.6 degrees
// from the rivet, so the nose rests on the lid and the finger end stands 1.1 mm clear of it, with a shadow under it.
function tabGeometry() {
  // in the shape's plane: rivet at the origin, nose toward -y (over the opening), finger hole toward +y
  const out = [], slot = [], W1 = 6.7, RC = 3.6, YT = 16.8, RN = 6.0;
  const arc = (cx, cy, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push(V(cx + r * Math.cos(a), cy + r * Math.sin(a))); } };
  arc(W1 - RC, YT - RC, RC, 0, Math.PI / 2, 8); arc(-(W1 - RC), YT - RC, RC, Math.PI / 2, Math.PI, 8);
  out.push(V(-W1, 10), V(-W1, 7.5), V(-6.5, 5), V(-6.1, 2.5));
  arc(0, 0, RN, Math.PI, 2 * Math.PI, 20);
  out.push(V(6.1, 2.5), V(6.5, 5), V(W1, 7.5), V(W1, 10));
  const rrect = (cx, cy, hw, hh, r, n = 6) => { const q = []; for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]]) for (let i = 0; i <= n; i++) { const a = a0 + Math.PI / 2 * i / n; q.push(V(cx + sx * (hw - r) + r * Math.cos(a), cy + sy * (hh - r) + r * Math.sin(a))); } return q; };
  for (let i = 0; i <= 28; i++) { const a = -0.785 + (Math.PI + 1.57) * i / 28; slot.push(V(4.8 * Math.cos(a), 4.8 * Math.sin(a))); }
  for (let i = 28; i >= 0; i--) { const a = -0.785 + (Math.PI + 1.57) * i / 28; slot.push(V(3.5 * Math.cos(a), 3.5 * Math.sin(a))); }
  const s = new THREE.Shape(out);
  s.holes.push(new THREE.Path(rrect(0, 11.6, 4.3, 3.3, 2.4)), new THREE.Path(slot));
  const web = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 40 });
  web.rotateX(-Math.PI / 2);                                                  // lay it flat: nose to +z, over the opening
  const tube = (pts, r, y) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(q.x, y, -q.y)), true, 'centripetal'), 260, r, 12, true).toNonIndexed();
  const g = mergeGeometries([web, tube(out, 0.75, 0.3), tube(rrect(0, 11.6, 4.65, 3.65, 2.7), 0.5, 0.25)]);
  g.rotateX(0.045);                                                           // tipped up toward the finger end
  return g.translate(0, CAN.panelY + 0.8, CAN.rivetZ);
}

// Light lost on the lid under and just round the tab, which stands up to 1.1 mm off it (x, z on the lid, opening toward +z).
export function tabShade(x, z) {
  const qx = Math.abs(x) - 3.2, qz = Math.abs(z - CAN.rivetZ + 5.4) - 7.9;      // the tab's outline as a rounded rectangle, corners 3.5
  const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 3.5;
  return 0.3 * sm(1.6, -0.3, d);
}

function rivetGeometry() {
  const g = new THREE.SphereGeometry(3.0, 32, 10, 0, Math.PI * 2, 0, 0.85);
  g.scale(1, 0.25, 1);                                   // a low button, not a ball
  g.translate(0, CAN.panelY + 1.05 - 3.0 * Math.cos(0.85) * 0.25, CAN.rivetZ);
  return g;
}

// Aluminium with water on it. Maps (from water.js): normal (water and relief), data (R water cover, G roughness,
// B metalness), cond (R darkening at drop edges, G paleness of the mist), aniso (lid and base: direction of the spin marks).
// The body also takes the art: printed where the art is opaque, bare metal where it is clear.
function canMaterial(maps, o) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1, metalnessMap: maps.data, roughness: 1, roughnessMap: maps.data,
    normalMap: maps.normal, normalScale: new THREE.Vector2(o.ns, o.ns),
    clearcoat: 1, clearcoatMap: maps.data, clearcoatRoughness: 0.6, clearcoatRoughnessMap: maps.cond,   // the coat is the water: sharp on drops, dull where it is mist
    clearcoatNormalMap: maps.normal, clearcoatNormalScale: new THREE.Vector2(1, 1), envMapIntensity: o.env ?? 1,
    anisotropy: o.aniso, anisotropyMap: maps.aniso ?? null,
  });
  const U = {
    tCond: { value: maps.cond }, tArt: { value: o.art ?? null }, uArtOn: { value: o.art ? 1 : 0 },
    uAlu: { value: new THREE.Color().setRGB(...o.alu) }, uArtMap: { value: o.artMap ?? new THREE.Vector4() },
    uVarnish: { value: o.varnish ?? 0.25 }, uInk: { value: o.ink ?? 0.35 }, uMist: { value: o.mist ?? 0.14 },   // uInk: how much metal shows through the inks; uMist: how pale the mist is
  };
  m.userData.U = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aArtV;\nvarying float vArtV;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvArtV = aArtV;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tCond; uniform sampler2D tArt; uniform float uArtOn; uniform vec3 uAlu; uniform vec4 uArtMap; uniform float uVarnish, uInk, uMist;
varying float vArtV;`)
      .replace('#include <map_fragment>', `
float printed = 0.;
{
  vec4 cnd = texture2D(tCond, vNormalMapUv);
  vec3 col = uAlu;
  if (uArtOn > 0.5) {
    float ug = vNormalMapUv.x;                       // 0..1 round the can, from the back
    float xu = fract(uArtMap.x + fract(ug + .5));     // share of the wrapped width, from its left end
    vec2 auv = vec2(uArtMap.y + xu * uArtMap.z, vArtV);
    vec2 gx = vec2(dFdx(ug) * uArtMap.z, dFdx(vArtV)), gy = vec2(dFdy(ug) * uArtMap.z, dFdy(vArtV));
    vec4 art = textureGrad(tArt, auv, gx, gy);
    printed = art.a * step(0., vArtV) * step(vArtV, 1.);
    col = mix(col, art.rgb, printed);
  }
  diffuseColor.rgb *= col * cnd.r + cnd.g * uMist;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, max(roughnessFactor, uVarnish), printed);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= mix(1., uInk, printed);');
  };
  return m;
}

// maps: { body, lid, bottom } from water.js; art: a texture laid out on Crown's template, or null for a blank can
export function buildCan(maps, art, artFront = 0.27) {
  const group = new THREE.Group(), inner = new THREE.Group();   // group's origin is the can's centre: the ball swivel
  inner.position.y = -CAN.H / 2;
  group.add(inner);

  // art layout: the 8.1634 in round the can takes the middle of the 8.3785 in print width; the spare is split between
  // the two overlap strips in proportion to their widths, so the join sits at the back. artFront: share of the art's
  // width that faces the front.
  const A = CAN.art, circIn = CAN.circ / IN, trimL = (A.w - circIn) * A.overL / (A.overL + A.overR);
  const artMap = new THREE.Vector4((((artFront * A.w - trimL) / circIn) % 1 + 1) % 1, trimL / A.w, circIn / A.w, 0);

  const body = new THREE.Mesh(bodyGeometry(), canMaterial(maps.body, { ns: -0.6, aniso: 0.22, alu: [0.91, 0.915, 0.92], art, artMap }));
  const lid = new THREE.Mesh(planar(new THREE.LatheGeometry(lidProfile(), 160), -1), canMaterial(maps.lid, { ns: 1.6, aniso: 0.25, alu: [0.8, 0.805, 0.81], env: 0.4 }));   // env: the room's reflection held down, or the lid washes out white and its relief is lost when it faces the camera
  const bottom = new THREE.Mesh(planar(new THREE.LatheGeometry(bottomProfile(), 128), 1), canMaterial(maps.bottom, { ns: 0.8, aniso: 0.5, alu: [0.9, 0.905, 0.91] }));
  const plain = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(0.86, 0.865, 0.87), metalness: 1, roughness: 0.34 });   // tab and rivet: satin (was 0.24)
  const tab = new THREE.Mesh(tabGeometry(), plain), rivet = new THREE.Mesh(rivetGeometry(), plain);
  for (const o of [body, lid, bottom, tab, rivet]) { o.castShadow = o.receiveShadow = true; inner.add(o); }
  return { group, inner, body };
}

// Relief pressed into the lid's centre panel, in mm of height at lid position (x, z); the opening is toward +z.
// From photos of real ends: a long field with rounded corners holds the tab and the opening and sits half a millimetre
// lower than the rest, with a bead round it; a dish under the finger hole lets a fingernail in; the opening is a wide
// rounded shape cut by a sharp score, with a curved bead inside its outer half.
// the designer (2026-11-21): the cut lines want to be deeper, so these are at the strong end of what the photos show.
// Relaid after his own photos: the rivet 3.8 mm behind the centre, the opening 17 mm long, 10 mm wide by the rivet and
// 16 mm at the far end (he found it too small), its score deeper and the panel inside it a little lower, all inside the
// smaller centre panel.
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function lidRelief(x, z) {
  const r = Math.hypot(x, z);
  if (r > 20.5) return 0;
  const rr = 8.5, qx = Math.abs(x) - (10.2 - rr), qz = Math.abs(z + 0.6) - (18.6 - rr);
  const ds = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr;      // mm outside the field (negative inside)
  let h = -0.5 * sm(0.35, -0.35, ds) + 0.22 * Math.exp(-(((ds - 0.75) / 0.4) ** 2));
  h -= 0.7 * sm(5.0, 2.0, Math.hypot(x * 0.85, z - CAN.rivetZ + 11.6));                           // the dish under the finger hole
  const zc = 8.6, hz = 8.4, w = 5.0 + 3.0 * sm(1, 12, z);
  const f = Math.pow(Math.pow(Math.abs(x) / w, 4) + Math.pow(Math.abs(z - zc) / hz, 4), 0.25) - 1;
  const d = f * Math.min(w, hz) * 0.9;                                                               // roughly mm from the score, negative inside
  h -= 0.45 * Math.exp(-((d / 0.22) ** 2)) + 0.18 * sm(0.4, -0.4, d);
  h += 0.3 * Math.exp(-(((d + 2.2) / 0.5) ** 2)) * sm(zc - 1, zc + 3, z);
  return h * sm(20.3, 19.6, r);
}
