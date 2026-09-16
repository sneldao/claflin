import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { NightDeskStage, NightDeskView } from './night-desk-fixtures';

export interface NightDeskAnchors {
  evidence: { x: number; y: number; visible: boolean };
  review: { x: number; y: number; visible: boolean };
  ledger: { x: number; y: number; visible: boolean };
}

export interface NightDeskSceneController {
  setView(view: NightDeskView): void;
  setStage(stage: NightDeskStage): void;
  dispose(): void;
}

interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const VIEWS: Record<NightDeskView, CameraPose> = {
  desk: { position: new THREE.Vector3(7.2, 5.4, 11.8), target: new THREE.Vector3(0.1, 0.7, -1.3) },
  evidence: { position: new THREE.Vector3(5.6, 4.8, 8.6), target: new THREE.Vector3(0.1, 0.65, -0.8) },
  review: { position: new THREE.Vector3(2.8, 7.2, 7.8), target: new THREE.Vector3(0, 0.15, 0.7) },
  ledger: { position: new THREE.Vector3(5.8, 5.8, 8.8), target: new THREE.Vector3(2.3, 0.25, 1.5) },
};

const ANCHOR_POINTS = {
  evidence: new THREE.Vector3(1, 1.85, -1),
  review: new THREE.Vector3(0, 0.2, 0.5),
  ledger: new THREE.Vector3(3, 0.5, 2),
};

function roundedSlab(w: number, d: number, h: number, radius: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  const left = -w / 2;
  const bottom = -d / 2;
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
    depth: h,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    curveSegments: 8,
  });
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

function seededGrainTexture(size: number, base: [number, number, number], spread: number, horizontal: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const image = context.createImageData(size, size);
    let seed = 1929;
    for (let y = 0; y < size; y++) {
      let seedRow = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      seed = seedRow;
      for (let x = 0; x < size; x++) {
        seedRow = (Math.imul(seedRow, 1664525) + 1013904223) >>> 0;
        const wave = horizontal ? Math.sin(y * 0.35) * 0.5 + Math.sin(y * 0.07) : Math.sin(x * 0.35) * 0.5 + Math.sin(x * 0.07);
        const grain = (seedRow % 100) / 100;
        const t = 0.5 + wave * 0.22 + (grain - 0.5) * 0.3;
        const i = (y * size + x) * 4;
        image.data[i] = Math.max(0, Math.min(255, base[0] + t * spread));
        image.data[i + 1] = Math.max(0, Math.min(255, base[1] + t * spread * 0.82));
        image.data[i + 2] = Math.max(0, Math.min(255, base[2] + t * spread * 0.6));
        image.data[i + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createNightDeskScene(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  initialView: NightDeskView,
  onReady: () => void,
  onUnavailable: () => void,
  onAnchors?: (anchors: NightDeskAnchors) => void,
): NightDeskSceneController {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch {
    onUnavailable();
    return { setView() {}, setStage() {}, dispose() {} };
  }
  renderer.setClearColor(0x0d1218, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d1218, 24, 52);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);

  const environmentScene = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(environmentScene, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.22;
  environmentScene.dispose();
  generator.dispose();
  RectAreaLightUniformsLib.init();

  const textures: THREE.Texture[] = [];
  const walnutTexture = seededGrainTexture(512, [66, 44, 30], 26, true);
  walnutTexture.repeat.set(3, 1.4);
  textures.push(walnutTexture);
  const paperTexture = seededGrainTexture(256, [222, 209, 178], 10, false);
  textures.push(paperTexture);
  const wallTexture = seededGrainTexture(256, [30, 36, 46], 8, false);
  wallTexture.repeat.set(4, 2);
  textures.push(wallTexture);
  const bumpTexture = seededGrainTexture(512, [128, 128, 128], 40, false);
  bumpTexture.colorSpace = THREE.NoColorSpace;
  textures.push(bumpTexture);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    shadowContext.fillStyle = gradient;
    shadowContext.fillRect(0, 0, 128, 128);
  }
  const contactTexture = new THREE.CanvasTexture(shadowCanvas);
  textures.push(contactTexture);
  const contactMat = new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false });
  function contactShadow(w: number, d: number, x: number, z: number, opacity: number) {
    const mat = contactMat.clone();
    mat.opacity = opacity;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.008, z);
    pad.renderOrder = 1;
    scene.add(pad);
  }

  const walnut = new THREE.MeshStandardMaterial({ map: walnutTexture, color: '#ffffff', roughness: 0.48, metalness: 0 });
  const walnutDark = new THREE.MeshStandardMaterial({ color: '#3a2a1d', roughness: 0.6, metalness: 0 });
  const leather = new THREE.MeshStandardMaterial({ color: '#16382c', roughness: 0.72, metalness: 0, bumpMap: bumpTexture, bumpScale: 0.012 });
  const burgundy = new THREE.MeshStandardMaterial({ color: '#4a1f24', roughness: 0.72, metalness: 0, bumpMap: bumpTexture, bumpScale: 0.012 });
  const charcoal = new THREE.MeshStandardMaterial({ color: '#1d2026', roughness: 0.42, metalness: 0.35 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b3905a', roughness: 0.27, metalness: 0.8 });
  const darkBrass = new THREE.MeshStandardMaterial({ color: '#6b5a38', roughness: 0.45, metalness: 0.8 });
  const paperMat = new THREE.MeshStandardMaterial({ map: paperTexture, color: '#e8ddc2', roughness: 0.9, metalness: 0 });
  const cream = new THREE.MeshStandardMaterial({ color: '#efe6cd', roughness: 0.85, metalness: 0 });
  const opaline = new THREE.MeshStandardMaterial({ color: '#6d937b', roughness: 0.3, metalness: 0, emissive: '#f4c877', emissiveIntensity: 0.05, side: THREE.DoubleSide });
  const glassPane = new THREE.MeshStandardMaterial({ color: '#233246', roughness: 0.18, metalness: 0.4, transparent: true, opacity: 0.28 });
  const fluteMat = new THREE.MeshStandardMaterial({ color: '#41556e', roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.25 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, color: '#5a6a80', roughness: 0.9, metalness: 0 });
  const cityMat = new THREE.MeshBasicMaterial({ color: '#0a0f16' });
  const litWindowMat = new THREE.MeshBasicMaterial({ color: '#d8a45e' });
  const inkMat = new THREE.MeshBasicMaterial({ color: '#4a4234' });

  function place(object: THREE.Mesh, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#17140f', roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.4;
  floor.receiveShadow = true;
  scene.add(floor);

  const nightBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ color: '#0a0f16' }));
  nightBackdrop.position.set(0, 6, -18);
  scene.add(nightBackdrop);

  const city = new THREE.Group();
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  const towerData = [
    [-8.5, 6, 1.6], [-6.8, 8.5, 1.1], [-5.4, 5, 1.3], [-3.6, 9.5, 1.5], [-1.6, 6.5, 1.2],
    [0.4, 10.5, 1.4], [2.4, 7, 1.1], [4.2, 9, 1.6], [6.2, 5.5, 1.2], [8.4, 8, 1.4],
  ];
  for (const [x, h, w] of towerData) {
    const tower = new THREE.Mesh(towerGeo, cityMat);
    tower.scale.set(w, h, 1);
    tower.position.set(x, -3 + h / 2, -14);
    city.add(tower);
  }
  const litGeo = new THREE.PlaneGeometry(0.1, 0.14);
  const litWindows = new THREE.InstancedMesh(litGeo, litWindowMat, 40);
  const matrix = new THREE.Matrix4();
  let seed = 421;
  for (let i = 0; i < 40; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const [x, h] = towerData[seed % towerData.length];
    const wx = x + ((seed % 97) / 97 - 0.5) * 0.8;
    const wy = -2.5 + ((seed % 89) / 89) * (h - 1.5);
    matrix.makeTranslation(wx, wy, -13.4);
    litWindows.setMatrixAt(i, matrix);
  }
  city.add(litWindows);
  scene.add(city);

  const wallTop = new THREE.Mesh(new THREE.PlaneGeometry(40, 5), wallMat);
  wallTop.position.set(0, 10.5, -9.9);
  wallTop.receiveShadow = true;
  scene.add(wallTop);
  const wallBottom = new THREE.Mesh(new THREE.PlaneGeometry(40, 6.5), wallMat);
  wallBottom.position.set(0, -6.25, -9.9);
  wallBottom.receiveShadow = true;
  scene.add(wallBottom);
  for (const side of [-1, 1]) {
    const wallSide = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 12), wallMat);
    wallSide.position.set(side * 15.5, 3, -9.9);
    wallSide.receiveShadow = true;
    scene.add(wallSide);
  }

  const mullionGeo = new THREE.BoxGeometry(0.16, 12, 0.24);
  const paneGeo = new THREE.PlaneGeometry(2.9, 11);
  const fluteGeo = new THREE.BoxGeometry(0.012, 11, 0.035);
  for (let i = 0; i < 7; i++) {
    const x = -9.6 + i * 3.2;
    place(new THREE.Mesh(mullionGeo, walnutDark), x, 3, -9.6);
    const pane = new THREE.Mesh(paneGeo, glassPane);
    pane.position.set(x + 1.6, 3, -9.55);
    scene.add(pane);
    for (let f = 0; f < 7; f++) {
      const flute = new THREE.Mesh(fluteGeo, fluteMat);
      flute.position.set(x + 0.35 + f * 0.42, 3, -9.45);
      scene.add(flute);
    }
  }
  place(new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 0.3), walnutDark), 0, 8.9, -9.6);
  place(new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 0.5), walnutDark), 0, -2.9, -9.6);

  const deskTop = roundedSlab(14, 7.5, 0.35, 0.4, walnut);
  place(deskTop, 0, -0.35, 0);
  place(new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.7, 6.9), walnutDark), 0, -1.05, 0);
  for (const x of [-5.6, 5.6]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.7, 5.6), walnutDark), x, -2.1, 0);
    place(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 5.7), brass), x, -0.85, 0);
  }
  const blotter = roundedSlab(6.4, 3.8, 0.04, 0.25, leather);
  place(blotter, 0, 0.02, 0.3);
  place(new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.02, 0.06), brass), 0, 0.05, 2.22);

  const duplex = new THREE.Group();
  duplex.position.set(1, 0, -1);
  duplex.scale.y = 0.78;
  scene.add(duplex);
  for (const x of [-1.9, 1.9]) {
    for (const z of [-0.9, 0.9]) {
      place(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 16), brass), x, 0.08, z, duplex);
    }
  }
  place(roundedSlab(4.5, 2.3, 1.0, 0.3, charcoal), 0, 0.16, 0, duplex);
  place(roundedSlab(4.2, 2.0, 0.28, 0.24, charcoal), 0, 1.16, 0, duplex);
  place(new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.05, 2.04), brass), 0, 1.16, 0, duplex);
  place(new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.08, 2.35), darkBrass), 0, 0.2, 0, duplex);

  const ribbonGeo = new THREE.BoxGeometry(3.4, 0.025, 0.44);
  const rollerGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 20);
  rollerGeo.rotateZ(Math.PI / 2);
  const headGeo = new THREE.BoxGeometry(0.5, 0.22, 0.5);
  for (const z of [-0.45, 0.45]) {
    place(new THREE.Mesh(ribbonGeo, cream), 0, 1.48, z, duplex);
    for (const x of [-1.55, 1.55]) {
      place(new THREE.Mesh(rollerGeo, brass), x, 1.53, z, duplex);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 10), darkBrass);
      axle.rotation.z = Math.PI / 2;
      place(axle, x, 1.53, z, duplex);
    }
    place(new THREE.Mesh(headGeo, charcoal), 0.4, 1.62, z, duplex);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.36), brass), 0.4, 1.65, z, duplex);
    for (let r = 0; r < 9; r++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.09), inkMat);
      tick.position.set(-1.45 + r * 0.36, 1.496, z - 0.17);
      duplex.add(tick);
    }
  }
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 256;
  nameCanvas.height = 48;
  const nameContext = nameCanvas.getContext('2d');
  if (nameContext) {
    nameContext.fillStyle = '#a8894f';
    nameContext.font = '20px Georgia, serif';
    nameContext.textAlign = 'center';
    nameContext.textBaseline = 'middle';
    nameContext.fillText('CLAFLIN / DUPLEX', 128, 24);
  }
  const nameTexture = new THREE.CanvasTexture(nameCanvas);
  nameTexture.colorSpace = THREE.SRGBColorSpace;
  textures.push(nameTexture);
  const namePlate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), new THREE.MeshBasicMaterial({ map: nameTexture, transparent: true, toneMapped: false }));
  namePlate.position.set(0, 0.75, 1.16);
  duplex.add(namePlate);
  for (const x of [-1.9, -0.95, 0, 0.95, 1.9]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.04), darkBrass);
    rib.position.set(x, 0.6, 1.13);
    duplex.add(rib);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), brass);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, 0.6, 1.16);
    duplex.add(screw);
  }
  const glass = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.04, 1.5), glassPane.clone());
  place(glass, 0, 1.84, 0, duplex);
  const archGeo = new THREE.TorusGeometry(0.9, 0.035, 8, 24, Math.PI);
  for (const x of [-1.6, 1.6]) {
    const arch = new THREE.Mesh(archGeo, brass);
    arch.position.set(x, 1.5, 0);
    arch.rotation.y = Math.PI / 2;
    arch.castShadow = true;
    duplex.add(arch);
  }
  function labelMesh(text: string) {
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = labelCanvas.height = 64;
    const labelContext = labelCanvas.getContext('2d');
    if (labelContext) {
      labelContext.fillStyle = '#d8c8a0';
      labelContext.font = '44px Georgia, serif';
      labelContext.textAlign = 'center';
      labelContext.textBaseline = 'middle';
      labelContext.fillText(text, 32, 34);
    }
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
  }
  const labelOne = labelMesh('I');
  labelOne.rotation.x = -Math.PI / 2;
  labelOne.position.set(-1.1, 1.51, -0.45);
  const labelTwo = labelMesh('II');
  labelTwo.rotation.x = -Math.PI / 2;
  labelTwo.position.set(-1.1, 1.51, 0.45);
  duplex.add(labelOne, labelTwo);

  const lamp = new THREE.Group();
  lamp.position.set(-3, 0, -2);
  scene.add(lamp);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.14, 32), darkBrass), 0, 0.07, 0, lamp);
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.14, 0),
    new THREE.Vector3(0.15, 1.4, -0.1),
    new THREE.Vector3(0.7, 2.3, -0.15),
    new THREE.Vector3(1.3, 2.45, -0.1),
  ]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 32, 0.05, 10, false), brass);
  stem.castShadow = true;
  lamp.add(stem);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 0.7, 32), opaline);
  shade.position.set(1.45, 2.35, -0.1);
  shade.rotation.z = 0.25;
  shade.castShadow = true;
  lamp.add(shade);
  const shadeRim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 8, 32), brass);
  shadeRim.position.set(1.36, 2.0, -0.1);
  shadeRim.rotation.x = Math.PI / 2;
  shadeRim.rotation.z = 0.25;
  lamp.add(shadeRim);
  const bulbGlow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffe9c4' }));
  bulbGlow.position.set(1.42, 2.2, -0.1);
  lamp.add(bulbGlow);
  const lampLight = new THREE.SpotLight('#ffc98a', 45, 16, 0.85, 0.55, 1.6);
  lampLight.position.set(-1.55, 2.2, -2.1);
  lampLight.target.position.set(0.6, 0, -0.6);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.normalBias = 0.03;
  lampLight.shadow.bias = -0.0002;
  scene.add(lampLight, lampLight.target);

  const ledger = new THREE.Group();
  ledger.position.set(3, 0.02, 2);
  ledger.rotation.y = -0.35;
  scene.add(ledger);
  place(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 2.6), paperMat), 0, 0.17, 0, ledger);
  place(new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.06, 2.75), burgundy), 0, 0.05, 0, ledger);
  const coverPivot = new THREE.Group();
  coverPivot.position.set(-1.02, 0.33, 0);
  ledger.add(coverPivot);
  const topCover = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.05, 2.75), burgundy);
  topCover.position.set(1.02, 0, 0);
  topCover.castShadow = true;
  coverPivot.add(topCover);
  const titleCanvas = document.createElement('canvas');
  titleCanvas.width = 512;
  titleCanvas.height = 256;
  const titleContext = titleCanvas.getContext('2d');
  if (titleContext) {
    titleContext.fillStyle = '#efe6cd';
    titleContext.fillRect(0, 0, 512, 256);
    titleContext.fillStyle = '#4a4234';
    titleContext.font = '26px Georgia, serif';
    titleContext.textAlign = 'center';
    titleContext.fillText('CLAFLIN & CO.', 256, 52);
    titleContext.font = '16px Georgia, serif';
    titleContext.fillText('THE LEDGER', 256, 82);
    titleContext.strokeStyle = 'rgba(74,66,52,0.35)';
    titleContext.lineWidth = 1;
    for (let y = 110; y < 250; y += 24) {
      titleContext.beginPath();
      titleContext.moveTo(40, y);
      titleContext.lineTo(472, y);
      titleContext.stroke();
    }
  }
  const titleTexture = new THREE.CanvasTexture(titleCanvas);
  titleTexture.colorSpace = THREE.SRGBColorSpace;
  textures.push(titleTexture);
  const titlePage = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: titleTexture, toneMapped: false }));
  titlePage.rotation.x = -Math.PI / 2;
  titlePage.rotation.z = Math.PI / 2;
  titlePage.position.set(0, 0.317, 0);
  ledger.add(titlePage);
  for (let i = 0; i < 3; i++) {
    const spineLine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 2.5), brass);
    spineLine.position.set(-0.95 - i * 0.06, 0.03, 0);
    topCover.add(spineLine);
  }
  for (let i = 0; i < 5; i++) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.012, 2.56), cream);
    edge.position.set(0, 0.06 + i * 0.05, 0);
    ledger.add(edge);
  }

  const phone = new THREE.Group();
  phone.position.set(-3.4, 0, 1.6);
  phone.rotation.y = 0.5;
  scene.add(phone);
  place(roundedSlab(1.5, 1.1, 0.3, 0.18, charcoal), 0, 0.0, 0, phone);
  for (const x of [-0.5, 0.5]) {
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 12), darkBrass), x, 0.5, 0, phone);
  }
  const handsetCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.62, 0.78, 0),
    new THREE.Vector3(-0.3, 0.95, 0),
    new THREE.Vector3(0, 1.0, 0),
    new THREE.Vector3(0.3, 0.95, 0),
    new THREE.Vector3(0.62, 0.78, 0),
  ]);
  const handset = new THREE.Mesh(new THREE.TubeGeometry(handsetCurve, 32, 0.09, 12, false), charcoal);
  handset.castShadow = true;
  phone.add(handset);
  for (const x of [-0.62, 0.62]) {
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.16, 20), charcoal), x, 0.74, 0, phone);
  }
  const cordPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const angle = t * Math.PI * 2 * 14;
    cordPoints.push(new THREE.Vector3(
      0.62 + t * 0.8 + Math.cos(angle) * 0.045,
      0.72 - t * 0.5 + Math.sin(t * Math.PI) * -0.18,
      0.15 + t * 0.5 + Math.sin(angle) * 0.045,
    ));
  }
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPoints), 140, 0.02, 6, false), charcoal);
  phone.add(cord);

  for (let i = 0; i < 3; i++) {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 2.3), cream);
    sheet.position.set(-0.7 + i * 0.16, 0.12 + i * 0.015, 0.5 - i * 0.1);
    sheet.rotation.y = -0.12 + i * 0.09;
    sheet.receiveShadow = true;
    sheet.castShadow = true;
    scene.add(sheet);
  }
  const penStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 10), darkBrass);
  penStem.rotation.z = Math.PI / 2 - 0.06;
  penStem.rotation.y = 0.4;
  place(penStem, 1.4, 0.12, 1.5);

  contactShadow(6.2, 3.4, 1, -1, 0.3);
  contactShadow(2.4, 1.8, -3.4, 1.6, 0.3);
  contactShadow(2.8, 3.4, 3, 2, 0.3);

  const paperSlip = new THREE.Group();
  const slipSheet = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 2.1), cream);
  slipSheet.castShadow = true;
  slipSheet.receiveShadow = true;
  paperSlip.add(slipSheet);
  for (let i = 0; i < 4; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.006, 0.03), inkMat);
    line.position.set(0, 0.012, -0.7 + i * 0.4);
    paperSlip.add(line);
  }
  const slipSeal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), brass);
  slipSeal.position.set(0.5, 0.015, 0.8);
  paperSlip.add(slipSeal);
  paperSlip.position.set(-4.5, 0.15, 0.5);
  paperSlip.rotation.y = 0.2;
  paperSlip.visible = false;
  scene.add(paperSlip);
  const paperPos = paperSlip.position.clone();
  const paperGoal = paperSlip.position.clone();
  let paperSpin = paperSlip.rotation.y;
  let paperSpinGoal = paperSpin;

  scene.add(new THREE.HemisphereLight('#5a6c85', '#1a140d', 0.28));
  const windowFill = new THREE.DirectionalLight('#7d9cc4', 0.65);
  windowFill.position.set(2, 5, -6);
  scene.add(windowFill);
  const rectGlow = new THREE.RectAreaLight('#ffc98a', 2.5, 5, 2);
  rectGlow.position.set(1, 5, 4);
  rectGlow.lookAt(1, 0, -1);
  scene.add(rectGlow);

  let stage: NightDeskStage = 'arrival';
  let view: NightDeskView = initialView;
  let disposed = false;
  let lost = false;
  let visible = true;
  let frame = 0;
  let lastTime = 0;
  let firstFrame = true;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  const camPos = VIEWS[initialView].position.clone();
  const camTarget = VIEWS[initialView].target.clone();
  const posGoal = camPos.clone();
  const targetGoal = camTarget.clone();
  const parallax = new THREE.Vector2(0, 0);
  const parallaxGoal = new THREE.Vector2(0, 0);
  let ledgerOpen = 0;
  let ledgerTarget = 0;
  let lampGlow = 1;
  let lampTarget = 1;

  const projected = new THREE.Vector3();
  function projectAnchor(point: THREE.Vector3) {
    projected.copy(point).project(camera);
    const width = host.clientWidth;
    const height = host.clientHeight;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const inFront = projected.z < 1 && projected.z > -1;
    return { x, y, visible: inFront && x > -40 && x < width + 40 && y > -40 && y < height + 40 };
  }

  function applyStage() {
    lampTarget = stage === 'arrival' ? 0.8 : 1;
    opaline.emissiveIntensity = stage === 'arrival' ? 0.05 : 0.08;
    if (stage === 'revised') {
      paperPos.x = -0.45;
      paperGoal.set(0.1, 0.17, 0.6);
      paperSpinGoal = 0.12;
    } else if (stage === 'quote') {
      paperGoal.set(0.1, 0.17, 0.6);
      paperSpinGoal = -0.08;
    } else if (stage === 'filed') {
      paperGoal.set(2.1, 0.15, 1.1);
      paperSpinGoal = 0.45;
    } else {
      paperGoal.set(-4.5, 0.15, 0.5);
      paperSpinGoal = 0.2;
    }
    if (stage === 'quote' || stage === 'revised' || stage === 'filed') paperSlip.visible = true;
  }
  function applyView() {
    posGoal.copy(VIEWS[view].position);
    targetGoal.copy(VIEWS[view].target);
    ledgerTarget = view === 'ledger' ? 0.65 : 0;
  }
  applyStage();
  applyView();
  if (reducedMotion.matches) {
    camPos.copy(posGoal);
    camTarget.copy(targetGoal);
    ledgerOpen = ledgerTarget;
    lampGlow = lampTarget;
    paperPos.copy(paperGoal);
    paperSlip.position.copy(paperGoal);
    paperSlip.rotation.y = paperSpinGoal;
  }

  function renderFrame(time: number) {
    frame = 0;
    if (disposed || lost || !visible || document.hidden) return;
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = time;
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-delta * 8.5);
    camPos.lerp(posGoal, blend);
    camTarget.lerp(targetGoal, blend);
    parallax.lerp(parallaxGoal, blend);
    ledgerOpen += (ledgerTarget - ledgerOpen) * blend;
    lampGlow += (lampTarget - lampGlow) * blend;
    paperPos.lerp(paperGoal, blend);
    paperSpin += (paperSpinGoal - paperSpin) * blend;
    coverPivot.rotation.z = ledgerOpen;
    lampLight.intensity = 45 * lampGlow;
    paperSlip.position.copy(paperPos);
    paperSlip.rotation.y = paperSpin;
    if (paperPos.distanceTo(paperGoal) < 0.01 && paperGoal.x < -4) paperSlip.visible = false;
    camera.position.set(camPos.x + parallax.x, camPos.y + parallax.y * 0.6, camPos.z);
    camera.lookAt(camTarget.x + parallax.x * 0.4, camTarget.y + parallax.y * 0.3, camTarget.z);
    renderer.render(scene, camera);
    onAnchors?.({
      evidence: projectAnchor(ANCHOR_POINTS.evidence),
      review: projectAnchor(ANCHOR_POINTS.review),
      ledger: projectAnchor(ANCHOR_POINTS.ledger),
    });
    if (firstFrame) {
      firstFrame = false;
      onReady();
    }
    const unsettled =
      camPos.distanceTo(posGoal) + camTarget.distanceTo(targetGoal) +
      Math.abs(parallax.x - parallaxGoal.x) + Math.abs(parallax.y - parallaxGoal.y) +
      Math.abs(ledgerTarget - ledgerOpen) + Math.abs(lampTarget - lampGlow) +
      paperPos.distanceTo(paperGoal) + Math.abs(paperSpinGoal - paperSpin);
    if (unsettled > 0.0008) frame = requestAnimationFrame(renderFrame);
    else lastTime = 0;
  }

  function schedule() {
    if (!frame && !disposed && !lost && visible && !document.hidden) frame = requestAnimationFrame(renderFrame);
  }

  function resize() {
    if (disposed || lost) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    schedule();
  }

  const pointerSource = host.parentElement ?? host;
  function pointerMove(event: PointerEvent) {
    if (reducedMotion.matches || !finePointer.matches) return;
    const bounds = host.getBoundingClientRect();
    parallaxGoal.set(
      Math.max(-0.175, Math.min(0.175, ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.35)),
      Math.max(-0.11, Math.min(0.11, -((event.clientY - bounds.top) / bounds.height - 0.5) * 0.22)),
    );
    schedule();
  }

  function pointerLeave() {
    parallaxGoal.set(0, 0);
    schedule();
  }

  function visibilityChange() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    } else {
      schedule();
    }
  }

  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    onUnavailable();
  }

  const sizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
    else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  sizeObserver.observe(host);
  visibilityObserver.observe(host);
  pointerSource.addEventListener('pointermove', pointerMove);
  pointerSource.addEventListener('pointerleave', pointerLeave);
  document.addEventListener('visibilitychange', visibilityChange);
  reducedMotion.addEventListener('change', pointerLeave);
  finePointer.addEventListener('change', pointerLeave);
  canvas.addEventListener('webglcontextlost', contextLost);
  resize();

  return {
    setView(nextView) {
      view = nextView;
      applyView();
      schedule();
    },
    setStage(nextStage) {
      stage = nextStage;
      applyStage();
      schedule();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      frame = 0;
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      pointerSource.removeEventListener('pointermove', pointerMove);
      pointerSource.removeEventListener('pointerleave', pointerLeave);
      document.removeEventListener('visibilitychange', visibilityChange);
      reducedMotion.removeEventListener('change', pointerLeave);
      finePointer.removeEventListener('change', pointerLeave);
      canvas.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      environment.dispose();
      lampLight.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
