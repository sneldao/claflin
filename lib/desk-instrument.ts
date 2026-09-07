import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export type DeskInstrumentStage = 'arrival' | 'conversation' | 'confirmation';

export interface DeskInstrumentController {
  setStage: (stage: DeskInstrumentStage) => void;
  setLabel: (label: string) => void;
  dispose: () => void;
}

export function createDeskInstrument(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  initialStage: DeskInstrumentStage,
  onUnavailable: () => void,
  initialLabel = 'PAPER TRADING / NO LIVE ORDERS',
): DeskInstrumentController {
  let displayLabel = initialLabel;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(7.7, 8.8, 12.4);
  camera.lookAt(0, 0.65, 0);
  const environmentScene = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(environmentScene, 0.04);
  scene.environment = environment.texture;
  environmentScene.dispose();
  generator.dispose();

  const enamel = new THREE.MeshStandardMaterial({ color: '#172e29', metalness: 0.45, roughness: 0.24 });
  const black = new THREE.MeshStandardMaterial({ color: '#0b1713', metalness: 0.25, roughness: 0.31 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b89b63', metalness: 0.86, roughness: 0.3 });
  const darkBrass = new THREE.MeshStandardMaterial({ color: '#6e6144', metalness: 0.8, roughness: 0.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#121915', roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: '#091a12', metalness: 0.18, roughness: 0.19 });
  const indicator = new THREE.MeshStandardMaterial({ color: '#d6b877', emissive: '#b48d44', emissiveIntensity: 0.7 });
  const assembly = new THREE.Group();
  scene.add(assembly);

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent = assembly) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function slab(w: number, d: number, h: number, radius: number, material: THREE.Material, x: number, y: number, z: number, parent = assembly) {
    const shape = new THREE.Shape();
    const left = -w / 2, bottom = -d / 2;
    shape.moveTo(left + radius, bottom);
    shape.lineTo(left + w - radius, bottom);
    shape.quadraticCurveTo(left + w, bottom, left + w, bottom + radius);
    shape.lineTo(left + w, bottom + d - radius);
    shape.quadraticCurveTo(left + w, bottom + d, left + w - radius, bottom + d);
    shape.lineTo(left + radius, bottom + d);
    shape.quadraticCurveTo(left, bottom + d, left, bottom + d - radius);
    shape.lineTo(left, bottom + radius);
    shape.quadraticCurveTo(left, bottom, left + radius, bottom);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: h, bevelEnabled: true, bevelSegments: 3, steps: 1,
      bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 10,
    });
    geometry.rotateX(-Math.PI / 2);
    return mesh(geometry, material, x, y, z, parent);
  }

  slab(6.05, 3.58, 0.15, 0.38, rubber, 0, 0.06, 0);
  slab(5.9, 3.42, 0.12, 0.32, darkBrass, 0, 0.22, 0);
  slab(5.69, 3.24, 0.4, 0.31, enamel, 0, 0.35, 0);
  slab(5.56, 3.1, 0.045, 0.3, brass, 0, 0.74, 0);
  slab(5.48, 3.02, 0.16, 0.28, enamel, 0, 0.80, 0);

  for (const x of [-2.45, 2.45]) {
    for (const z of [-1.24, 1.24]) {
      mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.017, 16), darkBrass, x, 0.987, z);
      mesh(new THREE.BoxGeometry(0.062, 0.009, 0.009), black, x, 1, z);
    }
  }

  const handset = new THREE.Group();
  assembly.add(handset);
  const handle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.0, 1.39, -0.55),
    new THREE.Vector3(-1.5, 1.85, -0.62),
    new THREE.Vector3(0, 2.03, -0.64),
    new THREE.Vector3(1.5, 1.85, -0.62),
    new THREE.Vector3(2.0, 1.39, -0.55),
  ]);
  mesh(new THREE.TubeGeometry(handle, 64, 0.205, 16, false), black, 0, 0, 0, handset);
  const inset = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.75, 1.71, -0.427),
    new THREE.Vector3(-1.05, 1.97, -0.445),
    new THREE.Vector3(0, 2.075, -0.449),
    new THREE.Vector3(1.05, 1.97, -0.445),
    new THREE.Vector3(1.75, 1.71, -0.427),
  ]);
  mesh(new THREE.TubeGeometry(inset, 48, 0.015, 6, false), brass, 0, 0, 0, handset);

  for (const x of [-2, 2]) {
    mesh(new THREE.CylinderGeometry(0.34, 0.49, 0.36, 48), black, x, 1.3, -0.55, handset);
    mesh(new THREE.CylinderGeometry(0.495, 0.495, 0.045, 48), brass, x, 1.125, -0.55, handset);
    mesh(new THREE.CylinderGeometry(0.46, 0.43, 0.10, 48), black, x, 1.055, -0.55, handset);
    slab(0.42, 0.7, 0.20, 0.10, darkBrass, x * 0.83, 0.96, -0.6);
    for (let i = 0; i < 3; i++) {
      mesh(new THREE.TorusGeometry(0.14 + i * 0.08, 0.012, 6, 28), darkBrass, x, 1.28, -0.082, handset);
    }
  }

  slab(3.3, 0.98, 0.042, 0.1, darkBrass, -0.63, 0.98, 0.73);
  slab(3.15, 0.83, 0.045, 0.06, glass, -0.63, 1.023, 0.73);
  const displayCanvas = document.createElement('canvas');
  displayCanvas.width = 1024;
  displayCanvas.height = 256;
  const displayContext = displayCanvas.getContext('2d');
  const displayTexture = new THREE.CanvasTexture(displayCanvas);
  displayTexture.colorSpace = THREE.SRGBColorSpace;
  const displayMaterial = new THREE.MeshBasicMaterial({ map: displayTexture, toneMapped: false });
  const display = mesh(new THREE.PlaneGeometry(2.96, 0.66), displayMaterial, -0.63, 1.085, 0.73);
  display.rotation.x = -Math.PI / 2;

  mesh(new THREE.CylinderGeometry(0.54, 0.58, 0.06, 64), darkBrass, 1.65, 1.01, 0.72);
  mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.20, 64), black, 1.65, 1.13, 0.72);
  mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.018, 64), brass, 1.65, 1.24, 0.72);
  mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.02, 48), enamel, 1.65, 1.255, 0.72);
  mesh(new THREE.BoxGeometry(0.035, 0.012, 0.17), brass, 1.65, 1.275, 0.50);
  for (let i = 0; i < 36; i++) {
    const angle = i * Math.PI * 2 / 36;
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 4), darkBrass, 1.65 + Math.cos(angle) * 0.467, 1.13, 0.72 + Math.sin(angle) * 0.467);
  }
  mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.025, 24), darkBrass, 2.34, 0.99, 0.15);
  const lamp = mesh(new THREE.SphereGeometry(0.043, 16, 8), indicator, 2.34, 1.016, 0.15);
  void lamp;

  // The slip: a paper estimate that prints forward out of the front
  // slot when an instruction reaches review. Retracts when the desk
  // returns to idle — a physical read on desk state, not decoration.
  const paperMat = new THREE.MeshStandardMaterial({ color: '#e7dfc9', roughness: 0.92, metalness: 0.02 });
  const slip = mesh(new THREE.BoxGeometry(1.5, 0.018, 1.05), paperMat, -0.55, 0.97, 1.28);
  slip.castShadow = true;
  // The slip carries what it prints: the instrument line, painted onto
  // its face so a close read shows the instruction, not blank paper.
  const slipCanvas = document.createElement('canvas');
  slipCanvas.width = 512;
  slipCanvas.height = 340;
  const slipContext = slipCanvas.getContext('2d');
  const slipTexture = new THREE.CanvasTexture(slipCanvas);
  slipTexture.colorSpace = THREE.SRGBColorSpace;
  const slipPrint = new THREE.Mesh(
    new THREE.PlaneGeometry(1.32, 0.88),
    new THREE.MeshBasicMaterial({ map: slipTexture, transparent: true, toneMapped: false }),
  );
  slipPrint.rotation.x = -Math.PI / 2;
  slipPrint.position.set(0, 0.011, 0.02);
  slip.add(slipPrint);
  slip.visible = false;
  // The needle on the brass dial — settles to a new bearing per stage.
  const needlePivot = new THREE.Group();
  needlePivot.position.set(1.65, 1.285, 0.72);
  assembly.add(needlePivot);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.028), brass);
  needle.position.x = 0.12;
  needle.castShadow = true;
  needlePivot.add(needle);
  mesh(new THREE.SphereGeometry(0.035, 16, 8), brass, 1.65, 1.29, 0.72);

  for (let i = 0; i < 10; i++) {
    slab(0.04, 0.43, 0.012, 0.015, black, -0.86 + i * 0.19, 0.97, -0.78);
  }
  for (let i = 0; i < 3; i++) {
    mesh(new THREE.BoxGeometry(3.6 - i * 0.27, 0.018, 0.01), darkBrass, 0, 0.43 + i * 0.07, 1.647);
  }

  const cordPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 260; i++) {
    const t = i / 260;
    const angle = t * Math.PI * 2 * 25;
    cordPoints.push(new THREE.Vector3(
      2.45 + t * 1.6 + Math.sin(t * Math.PI) * 0.5,
      0.15 + Math.pow(1 - t, 5) * 0.86 + Math.cos(angle) * 0.07,
      -0.48 + t * 3.25 + Math.sin(angle) * 0.07,
    ));
  }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPoints), 340, 0.025, 6, false), rubber, 0, 0, 0);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: '#030906', opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.HemisphereLight('#e9dfc4', '#31443a', 2.2));
  const key = new THREE.DirectionalLight('#fff0d0', 4);
  key.position.set(-4, 9, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 25 });
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.0002;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#a5c9b3', 2.1);
  rim.position.set(3, 4, -5);
  scene.add(rim);

  let stage = initialStage;
  let disposed = false;
  let lost = false;
  let visible = true;
  let frame = 0;
  let lastTime = 0;
  let targetX = 0;
  let targetY = 0;
  let slipProgress = stage === 'confirmation' ? 1 : 0;
  let slipTarget = slipProgress;
  let needleAngle = stage === 'confirmation' ? 0.55 : stage === 'conversation' ? 0 : -0.55;
  let needleTarget = needleAngle;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  function paintSlip() {
    if (!slipContext) return;
    const c = slipContext;
    c.clearRect(0, 0, 512, 340);
    c.strokeStyle = '#27362b';
    c.lineWidth = 4;
    c.strokeRect(18, 18, 476, 304);
    c.fillStyle = '#27362b';
    c.font = '28px monospace';
    c.fillText('CLAFLIN & CO.', 44, 66);
    c.font = '22px monospace';
    c.fillText('QUOTATION SLIP — PAPER', 44, 104);
    c.moveTo(44, 128); c.lineTo(468, 128); c.lineWidth = 2; c.stroke();
    c.font = '30px monospace';
    c.fillText(displayLabel.slice(0, 22), 44, 182);
    c.font = '22px monospace';
    c.fillStyle = '#59614d';
    c.fillText('SIMULATION — NO ORDER PLACED', 44, 240);
    c.fillText('NOT AN OFFER', 44, 274);
    slipTexture.needsUpdate = true;
  }

  function paintDisplay() {
    if (!displayContext) return;
    displayContext.fillStyle = '#0a1913';
    displayContext.fillRect(0, 0, 1024, 256);
    displayContext.fillStyle = '#a9bc91';
    displayContext.font = '26px monospace';
    displayContext.fillText('CLAFLIN  /  PRIVATE LINE', 46, 63);
    displayContext.fillStyle = '#e4c485';
    displayContext.font = '54px monospace';
    displayContext.fillText(stage === 'arrival' ? 'HETTY  —  AT THE DESK' : stage === 'conversation' ? 'CONVERSATION STUDY' : 'REVIEW INSTRUCTION', 46, 146);
    displayContext.fillStyle = '#a9bc91';
    displayContext.font = '24px monospace';
    displayContext.fillText(displayLabel, 46, 207);
    displayTexture.needsUpdate = true;
    indicator.emissiveIntensity = stage === 'conversation' ? 1.5 : 0.7;
    paintSlip();
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function render(time: number) {
    frame = 0;
    if (disposed || lost || !visible || document.hidden) return;
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 9);
    const lift = stage === 'conversation' ? 0.27 : 0;
    const x = reducedMotion.matches ? 0 : targetX;
    const y = reducedMotion.matches ? 0 : targetY;
    assembly.rotation.y += (x - assembly.rotation.y) * blend;
    assembly.rotation.x += (y - assembly.rotation.x) * blend;
    handset.position.y += (lift - handset.position.y) * blend;
    handset.rotation.z = handset.position.y * -0.1;
    slipProgress += (slipTarget - slipProgress) * blend;
    slip.position.z = 1.28 + slipProgress * 1.05;
    slip.rotation.x = slipProgress * -0.14;
    slip.visible = slipProgress > 0.02;
    // During a call the needle sweeps the dial — a live "line is open"
    // reading. Otherwise it eases to the stage's bearing.
    if (stage === 'conversation' && !reducedMotion.matches) {
      needleTarget = Math.sin(time * 0.0016) * 0.55;
    }
    needleAngle += (needleTarget - needleAngle) * blend;
    needlePivot.rotation.y = needleAngle;
    renderer.render(scene, camera);
    const sweeping = stage === 'conversation' && !reducedMotion.matches;
    const unsettled = Math.abs(assembly.rotation.y - x) + Math.abs(assembly.rotation.x - y) + Math.abs(handset.position.y - lift)
      + Math.abs(slipTarget - slipProgress) + Math.abs(needleTarget - needleAngle);
    if (sweeping || unsettled > 0.0005) frame = requestAnimationFrame(render);
    else lastTime = 0;
  }

  function schedule() {
    if (!frame && !disposed && !lost && visible && !document.hidden) frame = requestAnimationFrame(render);
  }

  function resize() {
    if (disposed || lost) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.set(7.7, 8.8, 12.4).multiplyScalar(Math.max(1, 1.22 / camera.aspect));
    camera.lookAt(0, 0.65, 0);
    camera.updateProjectionMatrix();
    schedule();
  }

  function pointerMove(event: PointerEvent) {
    if (reducedMotion.matches || !finePointer.matches) return;
    const bounds = host.getBoundingClientRect();
    targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.12;
    targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.035;
    schedule();
  }

  function pointerLeave() {
    targetX = 0;
    targetY = 0;
    schedule();
  }

  function visibilityChange() {
    if (document.hidden) stop();
    else schedule();
  }

  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    stop();
    onUnavailable();
  }

  const sizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
    else stop();
  });
  sizeObserver.observe(host);
  visibilityObserver.observe(host);
  host.addEventListener('pointermove', pointerMove);
  host.addEventListener('pointerleave', pointerLeave);
  document.addEventListener('visibilitychange', visibilityChange);
  reducedMotion.addEventListener('change', pointerLeave);
  finePointer.addEventListener('change', pointerLeave);
  canvas.addEventListener('webglcontextlost', contextLost);
  paintDisplay();
  resize();

  return {
    setStage(nextStage) {
      stage = nextStage;
      slipTarget = nextStage === 'confirmation' ? 1 : 0;
      needleTarget = nextStage === 'confirmation' ? 0.55 : nextStage === 'conversation' ? 0 : -0.55;
      paintDisplay();
      schedule();
    },
    setLabel(nextLabel) {
      displayLabel = nextLabel;
      paintDisplay();
      schedule();
    },
    dispose() {
      disposed = true;
      stop();
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      host.removeEventListener('pointermove', pointerMove);
      host.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibilityChange);
      reducedMotion.removeEventListener('change', pointerLeave);
      finePointer.removeEventListener('change', pointerLeave);
      canvas.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      displayTexture.dispose();
      slipTexture.dispose();
      environment.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
