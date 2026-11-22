// A cold 12 oz can hanging an inch over an emerald table under one spotlight. Drag to turn it about its centre;
// drag the golf ball to pick it up and throw it.
//   ?art=0          blank can (bare aluminium)        ?art=assets/other.png   other artwork, laid out on Crown's template
//   ?ink=0..1       how metallic the printed inks are (0 paint, 1 tinted metal)
//   ?drops=1        how much water (2 doubles every count)      ?mist=0..1   frosting of fine condensation (off)
//   ?lean= ?pitch= ?yaw=   the resting tilt, radians   ?seed=   another arrangement of water
//   ?ball=0  no golf ball   ?ballx= ?ballz=  where it sits (metres)   ?logo=0  no logo on it   ?inkhits=1  a single hit of ink
//   ?dist= ?camh= ?camx= ?fov= ?looky=    camera                      ?exposure=   ?dpr=   ?detail=0.5 (smaller water maps)
import * as THREE from 'three';
import { Post } from './post.js?v=ba8e72d3';
import { buildCan, canSamples } from './can.js?v=ba8e72d3';
import { mulberry32, bodyWater, discWater, buildBeads, waterMaterial, Drips, WATER } from './water.js?v=ba8e72d3';
import { buildSet } from './set.js?v=ba8e72d3';
import { buildBall, Ball } from './ball.js?v=ba8e72d3';

const Q = new URLSearchParams(location.search), num = (k, d) => Q.has(k) ? Number(Q.get(k)) : d;
const touch = matchMedia('(pointer: coarse)').matches;   // a phone or tablet: smaller water maps (memory, load time) and a touch hint
const canvas = document.getElementById('c'), hint = document.getElementById('hint');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;   // src/post.js does the tone mapping
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap; renderer.shadowMap.autoUpdate = false;

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const turnQ = (a, r) => new THREE.Quaternion().setFromAxisAngle(a, r);
// at rest: leaning to the right and a little toward the camera, so the front bottom edge is lowest and the drip shows
const REST = turnQ(X, num('pitch', 0.2)).multiply(turnQ(Z, -num('lean', 0.36))).multiply(turnQ(Y, num('yaw', 0)));
const samples = canSamples(), tmp = new THREE.Vector3(), lowRest = new THREE.Vector3(0, Infinity, 0);
for (const p of samples) { tmp.copy(p).applyQuaternion(REST); if (tmp.y < lowRest.y) lowRest.copy(tmp); }
const CY = 0.0254 - lowRest.y * 0.001, centre = new THREE.Vector3(0, CY, 0);      // its lowest point hangs one inch up

const CAM = { fov: num('fov', 27), dist: num('dist', 0.6), h: num('camh', 0.1), x: num('camx', -0.019) };   // dist: in a tall phone screen the camera comes 20 % closer, so can and ball read 25 % bigger (see frame()); x: the camera stands a little left of the can, so can and ball together are centred
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(CAM.fov, 1, 0.05, 40), refl = new THREE.PerspectiveCamera(), look = new THREE.Vector3();
refl.layers.set(1);                                                                // the view from under the table sees everything but the table
let can, set, drips, ball, post, rtMain, rtRefl, time = 0, last = 0, frameNo = 0, zoom = CAM.dist, zoomTo = CAM.dist;

// ---------------------------------------------------------------- turning the can
// The can turns about its own centre, like a ball joint. Dragging turns it about the screen's up and across axes;
// with Shift (or the right button) it rolls about the line of sight. Let go while moving and it coasts to a stop.
const spin = new THREE.Vector3(), w = new THREE.Vector3(), dq = new THREE.Quaternion();
let drag = null, home = false, holding = false;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), canWas = new THREE.Matrix4();
const pointerRay = e => { const b = canvas.getBoundingClientRect(); ndc.set((e.clientX - b.left) / b.width * 2 - 1, 1 - (e.clientY - b.top) / b.height * 2); ray.setFromCamera(ndc, cam); return ray.ray; };
const turn = v => { const a = v.length(); if (a > 1e-7) can.group.quaternion.premultiply(dq.setFromAxisAngle(tmp.copy(v).divideScalar(a), a)); };
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); hint.classList.add('gone');
  if (ball?.grab(pointerRay(e))) { holding = true; document.body.classList.add('grabbing'); return; }
  drag = { x: e.clientX, y: e.clientY, t: performance.now() }; spin.set(0, 0, 0); home = false; document.body.classList.add('grabbing'); hint.classList.add('gone'); });
canvas.addEventListener('pointermove', e => {
  if (holding) return ball.move(pointerRay(e));
  if (!drag || !can) return;
  const now = performance.now(), dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(4, now - drag.t) / 1000, k = 3.6 / Math.min(canvas.clientWidth, canvas.clientHeight);
  if (e.shiftKey || e.buttons === 2) w.set(0, 0, -dx * k); else w.set(dy * k, dx * k, 0);
  turn(w); spin.lerp(w.divideScalar(dt), 0.4);
  drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
});
const drop = () => { if (holding) { ball.release(); holding = false; document.body.classList.remove('grabbing'); return; }
  if (drag && performance.now() - drag.t > 90) spin.set(0, 0, 0); drag = null; document.body.classList.remove('grabbing'); };
canvas.addEventListener('pointerup', drop); canvas.addEventListener('pointercancel', drop);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('dblclick', () => { home = true; spin.set(0, 0, 0); });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomTo = Math.min(1.0, Math.max(0.24, zoomTo * Math.exp(e.deltaY * 0.0012))); }, { passive: false });

// ---------------------------------------------------------------- build
function resize() {
  const cw = canvas.clientWidth, ch = canvas.clientHeight;   // drawn at the size it shows at, so nothing is stretched (iPhone toolbars change it)
  if (!cw || !ch) return;                              // a hidden tab has no size yet
  renderer.setPixelRatio(Math.min(devicePixelRatio, num('dpr', 1.5))); renderer.setSize(cw, ch, false);
  const W = canvas.width, H = canvas.height;
  rtMain?.dispose(); rtRefl?.dispose(); post?.levels.forEach(l => { l.down.dispose(); l.up.dispose(); });
  rtMain = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  rtRefl = new THREE.WebGLRenderTarget(W >> 1, H >> 1, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  post = new Post(W, H);
  Object.entries({ uExposure: num('exposure', 1), uBloom: 0.11, uGrain: 0.018, uDistort: 0, uCA: 0.0005, uVignette: 0.5, uContrast: 1.06, uSaturation: 1.15 }).forEach(([k, v]) => { post.finalMat.uniforms[k].value = v; });
  set.U.uRes.value.set(W, H); set.U.tRefl.value = rtRefl.texture;
  cam.aspect = W / H; cam.updateProjectionMatrix();
}

async function init() {
  const rand = mulberry32(num('seed', 11));
  WATER.amount = num('drops', 1); WATER.mist = num('mist', 0);
  let art = null;
  if (Q.get('art') !== '0') {
    art = await new THREE.TextureLoader().loadAsync(Q.get('art') ?? './assets/label.png?v=ba8e72d3');
    art.colorSpace = THREE.SRGBColorSpace; art.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  const body = bodyWater(REST, rand, num('detail', touch ? 0.5 : 1));
  can = buildCan({ body: body.maps, lid: discWater(rand, true), bottom: discWater(rand, false) }, art);
  if (Q.has('ink')) can.body.material.userData.U.uInk.value = num('ink', 0.35);
  can.group.scale.setScalar(0.001); can.group.position.copy(centre); can.group.quaternion.copy(REST);
  set = buildSet(renderer, centre, { x: lowRest.x * 0.001, z: lowRest.z * 0.001 });   // where the drip lands at rest: the water starts there as a couple of drops
  if (Q.has('minutes')) set.prefill(num('minutes', 20), rand);
  const water = waterMaterial(set.lampDir);
  can.inner.add(buildBeads(body.beads, water));
  scene.add(can.group, set.group); scene.environment = set.env;
  if (Q.get('ball') !== '0') {                                        // a golf ball on the table, left of the can and a little forward
    const logo = Q.get('logo') === '0' ? null : await new THREE.TextureLoader().loadAsync('./assets/ball-logo.svg?v=ba8e72d3');
    if (logo) { logo.colorSpace = THREE.SRGBColorSpace; logo.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
    const m = buildBall(logo, num('inkhits', 2)); m.scale.setScalar(0.001);
    ball = new Ball(m, num('ballx', -0.074), num('ballz', 0.035));   // 1.4 cm nearer the can than before (-0.088); 2.6 cm clear of it
    m.lookAt(CAM.x, CAM.h, CAM.dist); m.rotateZ(-0.15); m.rotateOnWorldAxis(Y, 0.3);   // the logo toward the camera, tipped and turned a little, as in the designer's photo
    scene.add(m);
    can.group.updateMatrixWorld(true); canWas.copy(can.group.matrixWorld);
  }
  drips = new Drips(scene, water, samples, set.impact, rand);
  scene.traverse(o => { if (o !== set.ground) o.layers.enable(1); });
  resize(); addEventListener('resize', resize);
  hint.textContent = touch ? 'Drag to spin  ·  Throw the ball' : 'Drag to spin  ·  Shift-drag to roll  ·  Throw the ball  ·  Scroll to zoom  ·  Double-click to reset';
  window.__can = can; window.__set = set; window.__turn = (x, y, z, wq) => can.group.quaternion.set(x, y, z, wq).normalize(); window.__zoom = d => { zoomTo = d; }; window.__ball = ball; window.__drips = drips; window.__info = { beads: body.beads.length, centre: CY };
  tick(frame);
}

// ---------------------------------------------------------------- every frame
const tick = Q.has('bg') ? f => setTimeout(() => f(performance.now()), 60) : f => requestAnimationFrame(f);   // ?bg: keep drawing in a tab that is not in front (for checks)
function frame(now) {
  tick(frame);
  if (!rtMain) return resize();
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time += dt;
  if (!drag) {
    if (home) { can.group.quaternion.slerp(REST, 1 - Math.exp(-7 * dt)); if (can.group.quaternion.angleTo(REST) < 0.002) { can.group.quaternion.copy(REST); home = false; } }
    else if (spin.lengthSq() > 1e-5) { turn(w.copy(spin).multiplyScalar(dt)); spin.multiplyScalar(Math.exp(-2.2 * dt)); }
  }
  can.group.position.y = CY + 0.0026 * Math.sin(time * 1.1) + 0.001 * Math.sin(time * 0.67 + 1);     // it hovers
  can.group.updateMatrixWorld(true);
  drips.update(time, dt, can.group);
  set.update(time, dt);
  set.U.uTime.value = time;

  zoom += (zoomTo - zoom) * Math.min(1, dt * 8);
  const a = cam.aspect, phone = 1 - Math.min(1, Math.max(0, (a - 0.6) / 0.4));   // 1 in a tall phone screen (a <= 0.6), 0 from square to wide
  cam.position.set(CAM.x, CAM.h, zoom * (a < 1 ? Math.pow(a, -0.75) : 1) * (1 - 0.2 * phone * phone * (3 - 2 * phone)));   // the designer: bigger on the phone, as before on a desktop
  look.set(CAM.x, num('looky', CY - 0.008), 0);
  cam.lookAt(look); cam.updateMatrixWorld(true);
  if (ball) { ball.update(dt, cam, { group: can.group, prev: canWas, spin, free: !drag }); }
  canWas.copy(can.group.matrixWorld);
  // the same view from under the table, for what the table and the puddle mirror
  refl.fov = cam.fov; refl.aspect = cam.aspect; refl.near = cam.near; refl.far = cam.far; refl.updateProjectionMatrix();
  refl.position.set(cam.position.x, -cam.position.y, cam.position.z); refl.up.set(0, -1, 0); refl.lookAt(look.x, -look.y, look.z); refl.updateMatrixWorld(true);

  renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(rtRefl); renderer.render(scene, refl);
  renderer.setRenderTarget(rtMain); renderer.render(scene, cam);
  post.render(renderer, rtMain, frameNo++);
  window.__ready = true;
}

init().catch(err => { console.error('init failed', err.stack ?? err); window.__error = String(err.stack ?? err); hint.textContent = 'Something failed: ' + err.message; });
