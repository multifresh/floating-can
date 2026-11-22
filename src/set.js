// The set: an emerald tabletop running back into a dark emerald backdrop, one spotlight from above, the room the
// metal and the water reflect, and the puddle on the table. Metres, y up, table at y = 0.
import * as THREE from 'three';

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

// centre: the can's centre; pool: where the puddle lies { x, z }
export function buildSet(renderer, centre, pool) {
  const L = LOOK, group = new THREE.Group();

  const spot = new THREE.SpotLight(0xfff4e6, L.spot.power, 0, L.spot.angle, L.spot.soft, 2);
  spot.position.set(...L.spot.pos); spot.target.position.copy(centre);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.radius = 7; spot.shadow.blurSamples = 16;   // radius: how soft the shadow's edge is
  spot.shadow.camera.near = 0.25; spot.shadow.camera.far = 1.3; spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.0006;
  const hemi = new THREE.HemisphereLight(rgb(0.1, 0.5, 0.33), rgb(0, 0.06, 0.035), 0.12);
  group.add(spot, spot.target, hemi);

  // the puddle: one pool with a wavy edge, and small drops round it (the first four fixed, the rest left by drips that miss)
  const U = {
    tRefl: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uPud: { value: new THREE.Vector3(pool.x, pool.z, 0.042) },
    uSat: { value: [[0.046, 0.012, 0.0062], [-0.03, 0.034, 0.0045], [0.052, -0.02, 0.0034], [-0.047, -0.011, 0.0052], 0, 0, 0, 0].map(q => q ? new THREE.Vector3(pool.x + q[0], pool.z + q[1], q[2]) : new THREE.Vector3(9, 9, 0)) },
    uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -100, 0)) },
    uGloss: { value: new THREE.Vector2(L.gloss, L.blur) },
  };
  const pud = (x, z) => {
    const P = U.uPud.value, dx = x - P.x, dz = z - P.y, a = Math.atan2(dz, dx);
    let s = P.z * (1 + 0.17 * Math.sin(2 * a + 1.3) + 0.1 * Math.sin(3 * a + 4.1) + 0.06 * Math.sin(5 * a + 0.4) + 0.035 * Math.sin(9 * a + 2)) - Math.hypot(dx, dz);
    for (const q of U.uSat.value) s = Math.max(s, q.z - Math.hypot(x - q.x, z - q.y));
    return s;
  };
  let ri = 0, si = 0;
  const impact = (x, z, r, t, amp = 1) => {
    U.uRip.value[ri++ % 8].set(x, z, t, amp);
    if (amp < 1 || pud(x, z) > 0.002) return;
    let near = null;                                   // it missed the water: feed a drop that is there, or leave a new one
    for (const q of U.uSat.value) if (q.z > 0 && Math.hypot(x - q.x, z - q.y) < q.z + 0.004) near = q;
    if (near) near.z = Math.min(0.011, near.z * 1.12); else U.uSat.value[4 + si++ % 4].set(x, z, 0.0032);
  };

  const gm = new THREE.MeshStandardMaterial({ color: rgb(...L.table), roughness: 0.5, metalness: 0 });
  gm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
uniform sampler2D tRefl; uniform vec2 uRes; uniform float uTime; uniform vec3 uPud; uniform vec3 uSat[8]; uniform vec4 uRip[8]; uniform vec2 uGloss;
varying vec3 vWPos;
float pud(vec2 p){                      // metres inside the water's edge (negative outside)
  vec2 d = p - uPud.xy; float a = atan(d.y, d.x);
  float s = uPud.z*(1. + .17*sin(2.*a + 1.3) + .1*sin(3.*a + 4.1) + .06*sin(5.*a + .4) + .035*sin(9.*a + 2.)) - length(d);
  for (int i = 0; i < 8; i++) s = max(s, uSat[i].z - length(p - uSat[i].xy));
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
  vec2 gs = vec2(pud(vWPos.xz + vec2(e, 0.)) - ps, pud(vWPos.xz + vec2(0., e)) - ps)/e;
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
  return { group, ground, spot, U, impact, env, lampDir: new THREE.Vector3(...L.spot.pos).sub(centre).normalize() };
}
