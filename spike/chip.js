// Spike: beat 1 chip drawn live with three.js. Not wired into the site; FrameCanvas is untouched.
// Light setup mirrors widem_chip.blend (scene-info.json): one key from above-behind-right, a weak cool rim,
// and the strip lights as an emissive environment so the gold leads and lid edge catch hot lines.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const t0 = performance.now();
const stats = (window.__spike = { firstFrameMs: null, error: null, frames: 0 });
const canvas = document.getElementById("chip");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const forceFail = new URLSearchParams(location.search).has("nowebgl"); // planted break: fallback path

// Blender Z-up -> three Y-up
const b2t = ([x, y, z]) => new THREE.Vector3(x, z, -y);

function fail(err) {
  stats.error = String(err && err.message ? err.message : err);
  canvas.remove(); // poster stays; the page never depended on the scene
}

let renderer;
try {
  if (forceFail) throw new Error("WebGL disabled by ?nowebgl");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
} catch (e) { fail(e); }

if (renderer) start().catch(fail);

async function start() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // DPR cap 2
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping; // the .blend renders with AgX
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x020403, 1);

  const scene = new THREE.Scene();

  // Environment: dark room with the three strip lights as emissive bars (reflections only).
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const bar = (w, h, pos, intensity) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0.1, 0); env.add(m);
  };
  bar(7, 0.35, b2t([-2.77, 5.94, 1.5]), 3);     // strip_back
  bar(7, 0.25, b2t([-2.77, 5.94, 1.7]), 2.5);   // strip_lid_gleam
  bar(0.15, 2.5, b2t([4.93, 2.49, 1.0]), 4);    // strip_side
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.02).texture;
  scene.environmentIntensity = 0.8;

  // Key: one light finding the chip in the dark. Spot from the key's position, wide soft penumbra.
  const key = new THREE.SpotLight(0xf0f7ff, 0, 14, THREE.MathUtils.degToRad(24), 0.75, 1.6);
  key.position.copy(b2t([2.84, 2.25, 4.2]));
  key.target.position.set(0.2, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const KEY_ON = 45;

  const rim = new THREE.PointLight(0xd1ebff, 1.2, 12, 2);
  rim.position.copy(b2t([-5.19, 2.65, 0.9]));
  scene.add(rim);

  const draco = new DRACOLoader().setDecoderPath("./draco/");
  const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync("./chip.glb");
  const root = gltf.scene;
  const chip = new THREE.Group();
  root.traverse((o) => {
    if (o.isLight) o.visible = false; // exported lights are replaced by the rig above
    if (o.isMesh) {
      if (/^(haze|window_cutter)/.test(o.name)) { o.visible = false; return; } // volume / boolean cutter, not drawable
      const m = o.material;
      // Procedural finishes (bump, brushing, the die grid) do not export; these stand in for them.
      // KHR anisotropy without exported tangents blew the lid and leads out to white; brushing is lost anyway.
      if (m.anisotropy) m.anisotropy = 0;
      if (m.name === "ground") { m.color.setScalar(0.045); m.specularIntensity = 0; m.envMapIntensity = 0; m.roughness = 1; }
      if (m.name === "nickel_dark_brushed") m.roughness = 0.08; // tighter lobe: the spot washed the lid grey at 0.16 // Cycles lit the floor through the haze volume; no volume here
      if (m.name === "die_silicon_grid") { m.color.setRGB(0.32, 0.27, 0.2); m.roughness = 0.35; }
      o.castShadow = !o.name.startsWith("ground");
      o.receiveShadow = true;
    }
  });
  scene.add(root);
  // Turn group: everything except ground/camera/lights turns about the chip centre.
  const movers = root.children.filter((o) => o.isMesh || o.type === "Object3D" || o.isGroup)
    .filter((o) => !/ground|haze|camera|key|rim|strip|aim|focus/i.test(o.name));
  movers.forEach((o) => chip.attach(o));
  scene.add(chip);

  const cam = gltf.cameras[0] || new THREE.PerspectiveCamera(16, 16 / 9, 0.1, 100);
  const H_FOV = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16.07) / 2) * (16 / 9)); // the still's horizontal fov
  cam.updateMatrixWorld();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // Landscape: keep the still's vertical fov. Portrait: keep its horizontal fov so the chip is not cropped.
    const vfov = cam.aspect >= 16 / 9 ? 16.07 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(H_FOV / 2) / cam.aspect));
    cam.fov = vfov;
    cam.updateProjectionMatrix();
  }
  resize();
  addEventListener("resize", resize);

  // Load moment: the key light comes up over 2.4 s. Rest: slow turn, +-10 deg (scene.py TURN_DEG 20).
  let running = !document.hidden, visible = true, raf = 0, start = performance.now();
  const draw = (now) => {
    const t = (now - start) / 1000;
    const k = reduce ? 1 : Math.min(1, t / 2.4);
    key.intensity = KEY_ON * (1 - Math.pow(1 - k, 3));
    chip.rotation.y = reduce ? 0 : THREE.MathUtils.degToRad(10 * Math.sin(t * 0.18));
    renderer.render(scene, cam);
    stats.frames++;
    if (stats.firstFrameMs === null) {
      stats.firstFrameMs = Math.round(performance.now() - t0);
      stats.firstFrameSinceNav = Math.round(performance.now());
      canvas.classList.add("on");
    }
  };
  const loop = (now) => { draw(now); raf = (running && visible && !reduce) ? requestAnimationFrame(loop) : 0; };
  const kick = () => { if (!raf && running && visible) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", () => { running = !document.hidden; kick(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(canvas);
  if (reduce) { key.intensity = KEY_ON; draw(performance.now()); } else kick();
  window.__spike.setTime = (sec) => { start = performance.now() - sec * 1000; draw(performance.now()); };
}
