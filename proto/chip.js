// Prototype: the beat 1 chip built 100% in code. No GLB, no .blend, no exported scene data.
// Stack: three.js + postprocessing (bloom, AgX tone mapping) + n8ao (half-res AO).
// Rough proportions from beat1.png / scene.py units (1 = 1 m in Blender, lid 1.7 square).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { N8AOPostPass } from "n8ao";

const t0 = performance.now();
const stats = (window.__proto = { firstFrameMs: null, error: null, frames: 0 });
const canvas = document.getElementById("chip");
// Phone-test switches (combinable): ?fps shows a readout and keeps the turn running; ?ao=0 ?bloom=0 ?msaa=0 ?dpr=1|1.5|2
const Q = new URLSearchParams(location.search);
const FPS = Q.has("fps");
const FX = { ao: Q.get("ao") !== "0", bloom: Q.get("bloom") !== "0", msaa: Q.get("msaa") !== "0" };
const DPR_Q = Number(Q.get("dpr"));
const reduce = !FPS && matchMedia("(prefers-reduced-motion: reduce)").matches;
const forceFail = new URLSearchParams(location.search).has("nowebgl"); // planted break: fallback path
const fail = (e) => { stats.error = String(e?.message ?? e); canvas.remove(); };

let renderer;
try {
  if (forceFail) throw new Error("WebGL disabled by ?nowebgl");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, depth: true, powerPreference: "high-performance" });
} catch (e) { fail(e); }

// ------------------------------------------------------------------ canvas textures
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const dieTex = () => canvasTex(256, 256, (g, w, h) => {
  // Warm metallic die: brushed gradient, a fine grid, a brighter centre. Used as emissive, so bloom can lift it.
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, "#2a2016"); grd.addColorStop(0.45, "#8a7458"); grd.addColorStop(0.6, "#c9b28c"); grd.addColorStop(1, "#3a2d1e");
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(20,14,8,0.55)"; g.lineWidth = 1;
  for (let i = 8; i < w; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
});
const etchTex = () => canvasTex(512, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.fillStyle = "rgba(205,208,210,0.85)";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "500 64px Helvetica, Arial, sans-serif";
  if ("letterSpacing" in g) g.letterSpacing = "18px";
  g.fillText("WIDEM", w / 2, h * 0.38);
  g.font = "400 22px Helvetica, Arial, sans-serif";
  if ("letterSpacing" in g) g.letterSpacing = "4px";
  g.fillStyle = "rgba(205,208,210,0.55)";
  g.fillText("WD-01  2026  KSA", w / 2, h * 0.78);
});
const floorTex = () => canvasTex(2048, 2048, (g, w, h) => {
  // Soft light pool, offset toward the key (back right), smooth falloff instead of a spotlight disc.
  const c = 0.5 + 0.06 * 12 / 120, r = g.createRadialGradient(w * c, h * (0.5 - 0.03 * 12 / 120), 0, w * c, h * (0.5 - 0.03 * 12 / 120), w * 0.42 * 12 / 120); // plane is 120 wide (horizon past the haze), pool sized for 12
  r.addColorStop(0, "rgb(100,102,102)"); r.addColorStop(0.35, "rgb(48,50,50)"); r.addColorStop(0.7, "rgb(10,11,11)"); r.addColorStop(1, "rgb(2,4,3)");
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});

function rrectShape(s, r) {
  const sh = new THREE.Shape(), h = s / 2;
  sh.moveTo(-h + r, -h); sh.lineTo(h - r, -h); sh.quadraticCurveTo(h, -h, h, -h + r); sh.lineTo(h, h - r);
  sh.quadraticCurveTo(h, h, h - r, h); sh.lineTo(-h + r, h); sh.quadraticCurveTo(-h, h, -h, h - r); sh.lineTo(-h, -h + r);
  sh.quadraticCurveTo(-h, -h, -h + r, -h);
  return sh;
}

// ------------------------------------------------------------------ the chip
function buildChip() {
  const chip = new THREE.Group();
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xe8b03a, metalness: 1, roughness: 0.15 });
  // Lead tops face up like the lid, so with the lid's black sky they mirrored black. Rougher leads let the key spot's
  // lobe reach the camera (Cycles' brushed gold did the same) without putting light back into the lid's mirror band.
  const leadGold = gold.clone(); leadGold.roughness = 0.38;
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0x030404, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const lidMat = new THREE.MeshPhysicalMaterial({ color: 0x020303, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02 });
  // Low base roughness: at 0.55 the key spot spread a grey sheen over the whole top at this grazing angle.

  // Proportions from scene.py: body 1.7 sq x 0.2, lid 1.7 sq, pins span 2.42. Body sits a little off the floor;
  // the leads carry it (gull-wing), so a dark gap and shadow show under it as in beat1.
  const extrude = (shape, depth, bevel, y) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 20 });
    g.rotateX(-Math.PI / 2); g.translate(0, y, 0); return g;
  };
  // L4 base body: tighter corners than the lid, so the lid reads as a separate plate
  const body = new THREE.Mesh(extrude(rrectShape(1.6, 0.07), 0.17, 0.01, 0.035), ceramic); chip.add(body);
  // gold seam where body meets substrate (the thin hot line in the still)
  const seam = new THREE.Mesh(extrude(rrectShape(1.64, 0.08), 0.012, 0, 0.21), leadGold); chip.add(seam); // rough gold: the key lobe lights it
  // L2 substrate: thin dark step between seam and lid
  const sub = new THREE.Mesh(extrude(rrectShape(1.6, 0.1), 0.018, 0.003, 0.223), ceramic); chip.add(sub);
  // L3 die under the window: emissive canvas texture
  const die = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.74),
    new THREE.MeshStandardMaterial({ color: 0x1a1510, metalness: 0.6, roughness: 0.3, emissive: 0xffffff, emissiveMap: dieTex(), emissiveIntensity: 0.9 }));
  die.rotation.x = -Math.PI / 2; die.position.y = 0.246; chip.add(die);
  // L1 lid: a thin plate that overhangs the body (the step), window as a hole in the shape (no CSG), bevelled edges
  const lidShape = rrectShape(1.68, 0.2);
  lidShape.holes.push(rrectShape(0.7, 0.09));
  const lid = new THREE.Mesh(extrude(lidShape, 0.026, 0.012, 0.255), lidMat); chip.add(lid);
  const LID_TOP = 0.255 + 0.026 + 0.012;
  // WIDEM etch: rough, light-grey marks the key light picks up on the black mirror (plus a dim emissive floor)
  const etchMap = etchTex();
  const etch = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.115),
    new THREE.MeshStandardMaterial({ color: 0xbfc3c4, map: etchMap, transparent: true, roughness: 0.9, metalness: 0,
      emissive: 0xffffff, emissiveMap: etchMap, emissiveIntensity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  etch.rotation.set(-Math.PI / 2, 0, 0);
  etch.position.set(0.1, LID_TOP + 0.0008, 0.56); chip.add(etch);

  // 8 gull-wing leads: one extruded bent strip each (out of the body, down through a bend, flat foot), lightly bevelled
  const T = 0.018, Y0 = 0.1;
  const lead = new THREE.Shape();
  lead.moveTo(0.76, Y0 + T); lead.lineTo(0.9, Y0 + T);
  lead.quadraticCurveTo(0.95, Y0 + T, 0.97, Y0 - 0.02);   // shoulder bend
  lead.lineTo(1.0, T + 0.02);
  lead.quadraticCurveTo(1.02, T, 1.07, T);                // knee bend
  lead.lineTo(1.21, T); lead.lineTo(1.21, 0);
  lead.lineTo(1.06, 0);
  lead.quadraticCurveTo(1.0, 0, 0.98, 0.02);
  lead.lineTo(0.95, Y0 - 0.03);
  lead.quadraticCurveTo(0.935, Y0, 0.9, Y0);
  lead.lineTo(0.76, Y0); lead.closePath();
  const leadGeo = new THREE.ExtrudeGeometry(lead, { depth: 0.11, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 });
  leadGeo.translate(0, 0.003, -0.055);
  for (let side = 0; side < 4; side++) {
    for (const off of [-0.42, 0.42]) {
      const m = new THREE.Mesh(leadGeo, leadGold);
      m.position.z = off;
      const g = new THREE.Group(); g.rotation.y = side * Math.PI / 2; g.add(m); chip.add(g);
    }
  }
  chip.traverse((o) => { if (o.isMesh && o !== etch) { o.castShadow = true; o.receiveShadow = true; } });
  return chip;
}

// ------------------------------------------------------------------ scene
function start() {
  const dpr = [1, 1.5, 2].includes(DPR_Q) ? DPR_Q : Math.min(window.devicePixelRatio || 1, 2); // DPR cap 2, or ?dpr=
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the effect pass
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // Backdrop and fog share one colour, so the floor's far edge dissolves instead of drawing a horizon band.
  // The haze glow is a CSS overlay above the canvas (proto/chip.html), over floor and backdrop alike, so it has no edge.
  const BACKDROP = 0x020403;
  scene.background = new THREE.Color(BACKDROP);
  scene.fog = new THREE.Fog(BACKDROP, 15, 34); // chip sits ~12 from the camera: untouched

  // Lightformer-style environment: emissive strips filmed once into a PMREM cube. No rim light in the scene,
  // so nothing cool lands on the floor; the strips reach only what reflects them.
  const env = new THREE.Scene();
  const strip = (w, h, pos, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.95).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(0, 0.2, 0); env.add(m);
  };
  // The flat top mirrors what sits ~11.5 deg above the horizon behind the chip (the camera's elevation). Keep that band
  // black: the back strip sits high (~26 deg) so only the back and corner bevels, which tilt away, pick it up as thin lines.
  strip(7, 0.25, [-2.77, 3.2, -5.94], 3.5); // strip_back
  // Something for the black mirror to show: a soft vertical gradient (dark at the horizon, dim grey higher) placed along
  // the lid's mirror direction (~11.5 deg up, behind-left). Dim on purpose: beat1's lid is a dark mirror, not a bright one.
  { const tex = canvasTex(8, 128, (g, w, h) => { const l = g.createLinearGradient(0, 0, 0, h);
      l.addColorStop(0, "rgb(150,153,153)"); l.addColorStop(0.5, "rgb(70,72,72)"); l.addColorStop(0.8, "rgb(20,21,21)"); l.addColorStop(1, "rgb(0,0,0)"); g.fillStyle = l; g.fillRect(0, 0, w, h); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.position.set(-4.6, 1.9, -6.6); m.lookAt(0, 1.9, 0); env.add(m); }
  strip(0.6, 0.08, [-3.2, 2.2, 2.4], 14);   // small hot strip front-left: glints on the lead bends, too far off the lid's mirror band
  strip(0.12, 2.5, [4.93, 1.0, -2.49], 8);  // strip_side
  strip(1.2, 1.2, [2.84, 4.2, -2.25], 1.2); // key softbox, dim
  strip(3, 0.15, [-4, 0.6, 3], 5);          // low front-left kicker for the lead faces
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.01).texture;

  // Key: soft spot from the .blend key position, only for shadows and the top-light on the leads.
  const key = new THREE.SpotLight(0xfff6ea, 0, 15, THREE.MathUtils.degToRad(28), 1, 1.5);
  key.position.set(2.84, 4.2, -2.25); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 8; key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const KEY_ON = 30;

  // Floor: unlit radial-gradient pool + a shadow catcher above it.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ map: floorTex() }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.75 }));
  catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.001; catcher.receiveShadow = true; scene.add(catcher);

  const chip = buildChip(); scene.add(chip);

  // Camera: beat 1's camera, 85 mm on a 36 mm sensor with AUTO fit: horizontal fov 23.91 deg across the 16:9 frame
  // (vertical 13.6). The earlier 16.07 was Blender's angle_y from the unused 24 mm sensor height: 18% too wide.
  const V_FOV169 = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(23.913) / 2) / (16 / 9)));
  const cam = new THREE.PerspectiveCamera(V_FOV169, 16 / 9, 0.5, 60);
  const CAM_POS = new THREE.Vector3(6.242, 2.390, 9.990);
  const CAM_DIR = new THREE.Vector3(-0.5605, -0.1704, -0.8104);
  const H_FOV = THREE.MathUtils.degToRad(23.913);

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: FX.msaa ? 4 : 0 });
  composer.addPass(new RenderPass(scene, cam));
  const ao = new N8AOPostPass(scene, cam, 1, 1);
  Object.assign(ao.configuration, { aoRadius: 0.35, distanceFalloff: 0.4, intensity: 2.2, halfRes: true, gammaCorrection: false });
  ao.setQualityMode("Low");
  if (FX.ao) composer.addPass(ao);
  const effects = [new ToneMappingEffect({ mode: ToneMappingMode.AGX })];
  if (FX.bloom) effects.unshift(new BloomEffect({ luminanceThreshold: 1.4, luminanceSmoothing: 0.05, intensity: 0.3, mipmapBlur: true, radius: 0.45 }));
  composer.addPass(new EffectPass(cam, ...effects));
  const meter = FPS ? makeMeter(dpr) : null;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.position.copy(CAM_POS);
    if (cam.aspect >= 1) {
      // Landscape: beat 1's framing (chip right of centre, room for copy on the left).
      cam.fov = cam.aspect >= 16 / 9 ? V_FOV169 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(H_FOV / 2) / cam.aspect));
      cam.lookAt(CAM_POS.clone().add(CAM_DIR));
    } else {
      // Portrait: aim at the chip and frame it larger. A placeholder; the phone composition is design work.
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(15) / 2) / cam.aspect));
      cam.lookAt(0, 0.15, 0);
    }
    cam.updateProjectionMatrix();
  }
  resize(); addEventListener("resize", resize);

  // Load: the key comes up over 2.4 s. Rest: slow turn, +-10 deg.
  let running = !document.hidden, visible = true, raf = 0, begin = performance.now();
  const draw = (now) => {
    const t = (now - begin) / 1000, k = reduce ? 1 : Math.min(1, t / 2.4);
    key.intensity = KEY_ON * (1 - Math.pow(1 - k, 3));
    scene.environmentIntensity = 0.25 + 0.75 * k;
    chip.rotation.y = reduce ? 0 : THREE.MathUtils.degToRad(10 * Math.sin(t * 0.18));
    composer.render();
    meter?.tick(now);
    stats.frames++;
    if (stats.firstFrameMs === null) { stats.firstFrameMs = Math.round(performance.now() - t0); canvas.classList.add("on"); }
  };
  const loop = (now) => { draw(now); raf = running && visible && !reduce ? requestAnimationFrame(loop) : 0; };
  const kick = () => { if (!raf && running && visible) raf = requestAnimationFrame(loop); };
  document.addEventListener("visibilitychange", () => { running = !document.hidden; kick(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(canvas);
  if (reduce) draw(performance.now()); else kick();
  stats.setTime = (sec) => { begin = performance.now() - sec * 1000; draw(performance.now()); };
}

// ------------------------------------------------------------------ ?fps readout
function makeMeter(dpr) {
  const el = document.createElement("div"); el.id = "fps";
  el.style.cssText = "position:fixed;left:8px;top:8px;z-index:9;padding:6px 8px;background:rgba(0,0,0,.72);color:#e8e8e8;" +
    "font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre;pointer-events:none;border-radius:4px";
  document.body.appendChild(el);
  let gpu = "unknown";
  try { const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 48); } catch { /* masked */ }
  const on = Object.entries(FX).map(([k, v]) => `${k} ${v ? "on" : "off"}`).join(", ");
  const samples = []; let last = 0, shown = 0;
  document.addEventListener("visibilitychange", () => { samples.length = 0; last = 0; });
  return { tick(now) {
    // A gap over 250 ms is a paused/hidden tab, not a slow frame: restart the window instead of averaging it in.
    if (last && now - last > 250) samples.length = 0;
    else if (last) samples.push([now, now - last]);
    last = now;
    while (samples.length && now - samples[0][0] > 2000) samples.shift(); // last 2 s
    if (now - shown < 500 || samples.length < 2) return;
    shown = now;
    const dts = samples.map((x) => x[1]).sort((a, b) => a - b);
    const avg = (1000 * dts.length) / dts.reduce((a, b) => a + b, 0);
    const low = dts[Math.min(dts.length - 1, Math.floor(dts.length * 0.99))]; // 1% low = 99th percentile frame time
    el.textContent = `avg ${avg.toFixed(1)} fps (2 s)
1% low ${low.toFixed(1)} ms
dpr ${dpr}  ${innerWidth}x${innerHeight}
${on}
${gpu}`;
  } };
}

// Start last: the texture helpers above are const arrow functions and must exist first.
if (renderer) { try { start(); } catch (e) { fail(e); } }
