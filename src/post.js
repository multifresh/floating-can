// Lens and film: glow, tone mapping, grade, port distortion, grain.
import * as THREE from 'three';

const FS_VERT = `void main(){ gl_Position = vec4(position.xy, 0., 1.); }`;

export class FSQuad {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.Camera();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  render(renderer, material, target, clear = true) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    if (clear) renderer.clear();
    renderer.render(this.scene, this.cam);
  }
}

export class Post {
  constructor(w, h, levels = 6) {
    this.quad = new FSQuad();
    this.levels = [];
    let lw = w, lh = h;
    for (let i = 0; i < levels; i++) {
      lw = Math.max(2, Math.round(lw / 2)); lh = Math.max(2, Math.round(lh / 2));
      const o = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      this.levels.push({ down: new THREE.WebGLRenderTarget(lw, lh, o), up: new THREE.WebGLRenderTarget(lw, lh, o) });
    }
    this.downMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform vec2 uTexel;
        void main(){
          vec2 uv = gl_FragCoord.xy*uTexel*.5; vec2 h = uTexel*.5;   // uTexel = 1/source size
          uv = gl_FragCoord.xy*2.*uTexel;
          vec3 s = texture2D(tSrc, uv).rgb*4.;
          s += texture2D(tSrc, uv + vec2(-1., -1.)*uTexel).rgb + texture2D(tSrc, uv + vec2(1., -1.)*uTexel).rgb;
          s += texture2D(tSrc, uv + vec2(-1., 1.)*uTexel).rgb + texture2D(tSrc, uv + vec2(1., 1.)*uTexel).rgb;
          gl_FragColor = vec4(min(s/8., vec3(64.)), 1.);
        }`,
    });
    this.upMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uOut: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`
        uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel; uniform vec2 uOut;
        void main(){
          vec2 uv = gl_FragCoord.xy*uOut; vec2 h = uTexel;           // uTexel = 1/smaller source size
          vec3 s = texture2D(tSrc, uv + vec2(-h.x, 0.)).rgb + texture2D(tSrc, uv + vec2(h.x, 0.)).rgb
                 + texture2D(tSrc, uv + vec2(0., -h.y)).rgb + texture2D(tSrc, uv + vec2(0., h.y)).rgb;
          s += 2.*(texture2D(tSrc, uv + .5*vec2(-h.x, -h.y)).rgb + texture2D(tSrc, uv + .5*vec2(h.x, -h.y)).rgb
                 + texture2D(tSrc, uv + .5*vec2(-h.x, h.y)).rgb + texture2D(tSrc, uv + .5*vec2(h.x, h.y)).rgb);
          gl_FragColor = vec4(mix(texture2D(tAdd, uv).rgb, s/12., .62), 1.);
        }`,
    });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null }, tBloom: { value: null }, uRes: { value: new THREE.Vector2(w, h) },
        uExposure: { value: 1 }, uBloom: { value: 0.14 }, uSeed: { value: 0 }, uGrain: { value: 0.035 },
        uDistort: { value: 0.035 }, uCA: { value: 0.0018 }, uVignette: { value: 0.42 },
        uContrast: { value: 1.08 }, uSaturation: { value: 1.12 },
      },
      vertexShader: FS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor; uniform sampler2D tBloom; uniform vec2 uRes;
        uniform float uExposure, uBloom, uSeed, uGrain, uDistort, uCA, uVignette, uContrast, uSaturation;
        float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec3 agxContrast(vec3 x){
          vec3 x2 = x*x, x4 = x2*x2;
          return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + .4298*x2 + .1191*x - .00232;
        }
        vec3 agx(vec3 v){
          const mat3 m = mat3(.842479062253094, .0423282422610123, .0423756549057051, .0784335999999992, .878468636469772, .0784336, .0792237451477643, .0791661274605434, .879142973793104);
          const mat3 mi = mat3(1.19687900512017, -.0528968517574562, -.0529716355144438, -.0980208811401368, 1.15190312990417, -.0980434501171241, -.0990297440797205, -.0989611768448433, 1.15107367264116);
          v = m*v;
          v = clamp(log2(max(v, 1e-10)), -12.47393, 4.026069);
          v = (v + 12.47393)/16.5;
          v = agxContrast(v);
          // a slightly punchier look than base AgX
          float l = dot(v, vec3(.2126, .7152, .0722));
          v = pow(max(v, 0.), vec3(1.22));
          v = l + 1.25*(v - l);
          v = mi*v;
          return pow(clamp(v, 0., 1.), vec3(2.2));
        }
        vec3 fetch(vec2 uv){ return mix(texture2D(tColor, uv).rgb, texture2D(tBloom, uv).rgb, uBloom); }
        void main(){
          vec2 uv = gl_FragCoord.xy/uRes;
          vec2 c = uv - .5; c.x *= uRes.x/uRes.y;
          float r2 = dot(c, c);
          vec2 d = (uv - .5)*(1. + uDistort*(r2 - .3));
          vec3 col;
          col.r = fetch(.5 + d*(1. + uCA*r2*4.)).r;
          col.g = fetch(.5 + d).g;
          col.b = fetch(.5 + d*(1. - uCA*r2*4.)).b;
          col *= uExposure;
          col *= 1. - uVignette*smoothstep(.05, .75, r2);
          col = agx(col);
          float l = dot(col, vec3(.2126, .7152, .0722));
          col = mix(vec3(l), col, uSaturation);
          col = (col - .18)*uContrast + .18;
          col = max(col, 0.);
          col = mix(col*12.92, 1.055*pow(col, vec3(1./2.4)) - .055, step(.0031308, col));
          float g = hash12(gl_FragCoord.xy + uSeed*37.) + hash12(gl_FragCoord.xy*1.7 + uSeed*91.) - 1.;
          col += g*uGrain*(1. - .6*l);
          gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
        }`,
    });
  }
  render(renderer, src, seed) {
    let prev = src;
    for (const L of this.levels) {
      this.downMat.uniforms.tSrc.value = prev.texture;
      this.downMat.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      this.quad.render(renderer, this.downMat, L.down);
      prev = L.down;
    }
    let small = this.levels.at(-1).down;
    for (let i = this.levels.length - 2; i >= 0; i--) {
      const L = this.levels[i];
      this.upMat.uniforms.tSrc.value = small.texture;
      this.upMat.uniforms.tAdd.value = L.down.texture;
      this.upMat.uniforms.uTexel.value.set(1 / small.width, 1 / small.height);
      this.upMat.uniforms.uOut.value.set(1 / L.up.width, 1 / L.up.height);
      this.quad.render(renderer, this.upMat, L.up);
      small = L.up;
    }
    const f = this.finalMat.uniforms;
    f.tColor.value = src.texture; f.tBloom.value = small.texture; f.uSeed.value = seed;
    this.quad.render(renderer, this.finalMat, null);
  }
}
