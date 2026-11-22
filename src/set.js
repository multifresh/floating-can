// The set: an emerald tabletop running back into a dark emerald backdrop, one spotlight from above, the room the
// metal and the water reflect, and the puddle on the table. Metres, y up, table at y = 0.
import * as THREE from 'three';
import { mulberry32 } from './water.js?v=ba8e72d3';

const rgb = (r, g, b) => new THREE.Color().setRGB(r, g, b);
export const LOOK = {
  table: [0.004, 0.105, 0.058],        // emerald, linear
  horizon: [0.0015, 0.022, 0.014],     // where table and backdrop meet
  top: [0.0006, 0.009, 0.006],
  glow: [0.004, 0.05, 0.03],           // spill of the light on the backdrop behind the can
  spot: { pos: [-0.08, 0.78, 0.42], power: 4.8, angle: 0.36, soft: 1 },   // angle: half-width of the pool (0.44 was 'a little wide', the designer); soft: how gradually its edge fades
  gloss: 0.85, blur: 4,                // how much the dry table mirrors, and how blurred
};

// the room as the can sees it (the table's green is held well down: the designer found the green bounce on the can too strong): the lit table below, the lamp, two tall strips behind for the edges, a dim card in front
function makeEnv(renderer, lampDir) {
  const s = new THREE.Scene(), mat = c => new THREE.MeshBasicMaterial({ color: rgb(...c), side: THREE.DoubleSide });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), mat([0.0015, 0.014, 0.009])));
  for (const [r, y, c] of [[2.2, -0.36, [0.001, 0.01, 0.006]], [0.9, -0.33, [0.002, 0.03, 0.018]], [0.42, -0.3, [0.004, 0.075, 0.042]]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat(c)); m.rotation.x = -Math.PI / 2; m.position.y = y; s.add(m);
  }
  const card = (geo, pos, c) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(...pos); m.lookAt(0, 0, 0); s.add(m); };
  card(new THREE.CircleGeometry(0.115, 32), lampDir.clone().multiplyScalar(2.2).toArray(), [150, 142, 128]);   // small and very bright, as a spotlight is: pinpoints in the water
  card(new THREE.PlaneGeometry(0.5, 2.6), [-1.3, 0.4, -2.4], [9, 9.3, 10]);                                    // behind, either side: light along the can's edges
  card(new THREE.PlaneGeometry(0.4, 2.2), [1.5, 0.3, -2.2], [6, 6.2, 6.6]);
  card(new THREE.PlaneGeometry(1.6, 0.9), [-0.8, 0.9, 3], [0.8, 0.8, 0.76]);
  card(new THREE.PlaneGeometry(2.4, 1.6), [1.7, 0.5, 2.3], [1.15, 1.15, 1.1]);                                  // a broad dim card in front on the shadow side, so that side is not lost
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromScene(s, 0, 0.1, 30).texture;
  pm.dispose();
  return env;
}

// centre: the can's centre; pool: where the drip lands at rest { x, z }
export function buildSet(renderer, centre, pool) {
  const L = LOOK, group = new THREE.Group();

  const spot = new THREE.SpotLight(0xfff4e6, L.spot.power, 0, L.spot.angle, L.spot.soft, 2);
  spot.position.set(...L.spot.pos); spot.target.position.copy(centre);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.radius = 7; spot.shadow.blurSamples = 16;   // radius: how soft the shadow's edge is
  spot.shadow.camera.near = 0.25; spot.shadow.camera.far = 1.3; spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.0006;
  const hemi = new THREE.HemisphereLight(rgb(0.1, 0.5, 0.33), rgb(0, 0.06, 0.035), 0.12);
  group.add(spot, spot.target, hemi);

  // The water on the table builds up from the drips (the designer: start with a couple of drops; every drop leaves its mark where it
  // lands and the mark stays, so after 20 minutes there is a big splotch). It is a list of round marks drawn as one smooth
  // union: a drop that lands in water makes that water bigger, one that lands on dry table leaves a new mark. Each mark's
  // area is the drop's volume over the water's depth (1.75 mm), so about 400 drops (20 minutes at rest) make a pool about
  // 13 cm across. Big marks get a wavy edge; as a mark grows its middle creeps toward the camera (the table leans a hair
  // that way), which keeps the pool in front of where the drop lands, as the designer liked it. Specks from the splash (a few) dry up
  // after 30 s. ?minutes=20 starts with that much already dripped.
  const MAX = 40, DEPTH = 0.00175, K = 0.0012;
  const U = {
    tRefl: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uBlob: { value: Array.from({ length: MAX }, () => new THREE.Vector4(0, 0, 0, 0)) },   // x, z, radius, seed (shapes the edge)
    uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uGloss: { value: new THREE.Vector2(L.gloss, L.blur) },
  };
  const wob = r => { const t = Math.min(1, Math.max(0, (r - 0.004) / 0.026)); return t * t * (3 - 2 * t); };
  const edge = (b, x, z) => {                         // metres inside mark b's edge, as the shader draws it
    const dx = x - b.x, dz = z - b.z, l = Math.hypot(dx, dz), r = Math.sqrt(b.A / Math.PI), w = wob(r), a = Math.atan2(dz, dx), s = b.seed;
    return r + r * w * (0.17 * Math.sin(2 * a + s) + 0.1 * Math.sin(3 * a + s * 1.618 + 2.8) + 0.06 * Math.sin(5 * a + s * 2.414 - 0.9) + 0.035 * Math.sin(9 * a + s * 3.303 + 0.7)) - l;
  };
  const blobs = [];                                   // A: area it is growing to; x, z: where its middle is going; d: what is drawn now
  const rnd = mulberry32(7);
  const add = (x, z, A, speck, t) => blobs.push({ x, z, A, speck, born: t, seed: rnd() * 6.283, d: new THREE.Vector3(x, z, 0) });
  const merge = (j, i) => {                           // j runs into i
    const A = i.A + j.A; i.x = (i.x * i.A + j.x * j.A) / A; i.z = (i.z * i.A + j.z * j.A) / A; i.A = A; j.into = i;
  };
  const live = () => blobs.filter(b => !b.into && !b.gone);
  let ri = 0;
  const impact = (x, z, r, t, amp = 1) => {
    U.uRip.value[ri++ % 8].set(x, z, t, amp);
    const A = 4.18879 * r * r * r / Math.min(DEPTH, r), own = Math.sqrt(A / Math.PI);
    let best = null, bs = -1;
    for (const b of live()) { const s = edge(b, x, z); if (s > bs) { bs = s; best = b; } }
    if (best && bs > 0.5 * own) {                     // it fell in water: that water spreads
      if (amp < 1) return;
      const r0 = Math.sqrt(best.A / Math.PI); best.A = Math.min(best.A + A, Math.PI * 0.12 * 0.12);
      const dr = Math.sqrt(best.A / Math.PI) - r0; best.z += 0.35 * dr; best.x += 0.05 * dr;
      for (const j of live()) {                       // marks it has now covered join it
        const ri2 = Math.sqrt(best.A / Math.PI) * (1 - 0.3 * wob(Math.sqrt(best.A / Math.PI)));
        if (j !== best && Math.hypot(j.x - best.x, j.z - best.z) + Math.sqrt(j.A / Math.PI) < ri2) merge(j, best);
      }
      return;
    }
    if (amp < 1) {                                    // a splash droplet on dry table: only about one in four leaves a speck, and at most 6 are about
      if (rnd() > 0.25) return;
      const sp = live().filter(b => b.speck).sort((a, b) => a.born - b.born);
      if (sp.length >= 6) sp[0].gone = true;
    }
    let L = live();
    if (L.length >= MAX) {                            // full: the oldest splash speck dries, or the two nearest marks run together
      const sp = L.filter(b => b.speck).sort((a, b) => a.born - b.born)[0];
      if (sp) sp.gone = true;
      else {
        let pi = 0, pj = 1, g = Infinity;
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
          const gap = Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z) - Math.sqrt(L[i].A / Math.PI) - Math.sqrt(L[j].A / Math.PI);
          if (gap < g) { g = gap; pi = i; pj = j; }
        }
        if (L[pi].A < L[pj].A) merge(L[pi], L[pj]); else merge(L[pj], L[pi]);
      }
    }
    add(x, z, A, amp < 1, t);
  };
  // a couple of drops to start: one where the drip lands, two small ones near it
  for (const [dx, dz, r] of [[0, 0, 0.003], [0.011, 0.016, 0.0016], [-0.014, 0.007, 0.0011]]) add(pool.x + dx, pool.z + dz, Math.PI * r * r, false, -1);
  for (const b of blobs) b.d.z = Math.sqrt(b.A / Math.PI);
  const update = (t, dt) => {                         // the drawn marks ease toward where the water is going: a fresh drop spreads, a speck dries
    const k = Math.min(1, dt * 7);
    for (const b of blobs) {
      if (b.speck && !b.into && t - b.born > 30) b.gone = true;
      const to = b.into ?? b, rt = b.gone ? 0 : Math.sqrt(to.A / Math.PI);
      b.d.x += (to.x - b.d.x) * k; b.d.y += (to.z - b.d.y) * k; b.d.z += (rt - b.d.z) * k;
    }
    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i], to = b.into;
      if ((b.gone && b.d.z < 2e-5) || (to && Math.abs(b.d.z - to.d.z) < 5e-5 && Math.hypot(b.d.x - to.d.x, b.d.y - to.d.y) < 5e-5)) blobs.splice(i, 1);
      if (to && to.into) b.into = to.into;
    }
    U.uBlob.value.forEach((v, i) => { const b = blobs[i]; if (b) v.set(b.d.x, b.d.y, b.d.z, b.seed); else v.set(0, 0, 0, 0); });
  };
  const prefill = (minutes, rand) => {                // ?minutes=: as if it had been dripping at rest that long (a drop every 3 s)
    for (let i = 0, n = Math.round(minutes * 20); i < n; i++) impact(pool.x, pool.z, 0.0021 + 0.0006 * rand(), -100);
    for (const b of blobs) { const to = b.into ?? b; b.d.set(to.x, to.z, Math.sqrt(to.A / Math.PI)); }
  };

  const gm = new THREE.MeshStandardMaterial({ color: rgb(...L.table), roughness: 0.5, metalness: 0 });
  gm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
uniform sampler2D tRefl; uniform vec2 uRes; uniform float uTime; uniform vec4 uBlob[${MAX}]; uniform vec4 uRip[8]; uniform vec2 uGloss;
varying vec3 vWPos;
float pud(vec2 p){                      // metres inside the water's edge (negative outside): the marks joined with a soft neck where they meet
  float s = -1.;
  for (int i = 0; i < ${MAX}; i++) {
    vec4 b = uBlob[i]; vec2 d = p - b.xy; float l = length(d);
    if (b.z <= 0. || l > b.z*1.37 + .003) continue;
    float w = smoothstep(.004, .03, b.z);
    if (w > 0. && l > 1e-5) { float a = atan(d.y, d.x); l -= b.z*w*(.17*sin(2.*a + b.w) + .1*sin(3.*a + b.w*1.618 + 2.8) + .06*sin(5.*a + b.w*2.414 - .9) + .035*sin(9.*a + b.w*3.303 + .7)); }
    float si = b.z - l, h = clamp(.5 + .5*(si - s)/${K}, 0., 1.);
    s = mix(s, si, h) + ${K}*h*(1. - h);
  }
  return s;
}`)
      .replace('#include <map_fragment>', /* glsl */`
float ps = pud(vWPos.xz), inside = smoothstep(0., .0006, ps);
diffuseColor.rgb *= mix(1., .55, inside);
vec3 nW = vec3(0., 1., 0.);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .04, inside);')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
{
  float e = .0004;
  vec2 gs = ps > -.002 ? vec2(pud(vWPos.xz + vec2(e, 0.)) - ps, pud(vWPos.xz + vec2(0., e)) - ps)/e : vec2(0.);   // dry table away from the water: flat
  vec2 slope = gs*step(0., ps)*.75*exp(-max(ps, 0.)/.0014);            // the rounded edge of the water
  float wet = smoothstep(.0005, .004, ps);
  for (int i = 0; i < 8; i++) {                                          // rings from drops that fell
    vec2 d = vWPos.xz - uRip[i].xy; float r = length(d) + 1e-5, age = uTime - uRip[i].z;
    if (age < 0. || age > 2.5) continue;
    float front = r - .22*age;
    slope += d/r*wet*.28*uRip[i].w*exp(-front*front/.000144)*exp(-age*1.6)/(1. + 25.*r)*cos(front*1142.);   // a touch stronger and longer than before (.28, 1.6): the designer could not see the drop land
  }
  nW = normalize(vec3(-slope.x, 1., -slope.y));
  normal = normalize((viewMatrix*vec4(nW, 0.)).xyz);
}`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse = diffuseColor.rgb * .16; reflectedLight.indirectSpecular *= 0.;')   // the table is lit by the spotlight and a little stray light; what it mirrors is added below
      .replace('#include <opaque_fragment>', /* glsl */`
{
  // what the table mirrors: the scene drawn from below the table, sharp in the water, blurred and faint on the dry top
  vec2 suv = gl_FragCoord.xy/uRes, off = (viewMatrix*vec4(nW.x, 0., nW.z, 0.)).xy;
  float fr = pow(1. - saturate(dot(normalize(vViewPosition), normal)), 5.);
  float k = mix((.04 + .96*fr)*uGloss.x, .02 + .98*fr, inside);
  k = max(k, smoothstep(1., 3.2, length(vViewPosition)));        // far off, the table shows only the backdrop, so the two meet without a line
  vec2 ruv = vec2(1. - suv.x, suv.y) + vec2(-off.x, off.y)*.06; float lod = mix(uGloss.y, 0., inside);
  vec3 refl = vec3(0.);                                             // nine samples in a disc, so a bright thing mirrored in the dry table blurs smoothly
  for (int i = 0; i < 9; i++) { float a = float(i)*2.3999632, rr = sqrt((float(i) + .5)/9.); refl += textureLod(tRefl, ruv + vec2(cos(a), sin(a))*rr*lod*.006, max(lod - 1.5, 0.)).rgb; }
  refl /= 9.;
  outgoingLight = outgoingLight*(1. - k) + refl*k;
}
#include <opaque_fragment>`);
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 96).rotateX(-Math.PI / 2), gm);
  ground.receiveShadow = true;

  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(20, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: rgb(...L.top) }, uHor: { value: rgb(...L.horizon) }, uGlow: { value: rgb(...L.glow) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: /* glsl */`uniform vec3 uTop, uHor, uGlow; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = mix(uHor, uTop, smoothstep(0., .55, max(d.y, 0.)));
        c += uGlow*exp(-(d.x*d.x*2.2 + (d.y - .06)*(d.y - .06)*9.))*smoothstep(0., .5, -d.z);
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  group.add(ground, backdrop);

  const env = makeEnv(renderer, new THREE.Vector3(...L.spot.pos).sub(centre).normalize());
  return { group, ground, spot, U, impact, update, prefill, blobs, env, lampDir: new THREE.Vector3(...L.spot.pos).sub(centre).normalize() };
}
