/* 3D battle scene (Three.js) + particle FX — browser-only */

import * as THREE from "three";
import { PKMN_ICONS } from "@/data";
import type { Rarity } from "@/data";

export type BattleSide = "player" | "enemy";

export type AttackOpts = {
  crit?: boolean;
};

export type CaptureSeq = {
  result?: boolean;
  onAbsorbed?: () => void;
  onShake?: (n: number) => void;
  onResult?: (success: boolean) => void;
};

type Tween = {
  dur: number;
  t: number;
  update?: (k: number) => void;
  done?: () => void;
};

type Particle = {
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  r: number;
  gc: number;
  b: number;
};

type PokeGroup = THREE.Group & {
  userData: { plane: THREE.Mesh };
};

const RARITY_COLOR: Record<string, number> = {
  c: 0x00f0ff,
  u: 0x00f0ff,
  r: 0xffd700,
  l: 0xff0044,
};

const tweens: Tween[] = [];

function tween(obj: Omit<Tween, "t">): void {
  tweens.push({ ...obj, t: 0 });
}

function stepTweens(dt: number): void {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.update?.(k);
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.done?.();
    }
  }
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeIn = (k: number) => k * k * k;

type SceneState = {
  ok: boolean;
  running: boolean;
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  player: PokeGroup | null;
  enemy: PokeGroup | null;
  ball: THREE.Mesh | null;
  playerAura: THREE.Sprite | null;
  enemyAura: THREE.Sprite | null;
  playerRing: THREE.Mesh | null;
  enemyRing: THREE.Mesh | null;
  rimLight: THREE.PointLight | null;
  floorMat: THREE.MeshBasicMaterial | null;
  raf: number | null;
  clock: { last: number } | null;
  canvas: HTMLCanvasElement | null;
  particles: THREE.Points | null;
  pGeo: THREE.BufferGeometry | null;
  pData: Particle[];
  PMAX: number;
  dust: THREE.Points | null;
  shakePower: number;
  arenaColor: number;
  camY: number;
  onResize: (() => void) | null;
};

const S: SceneState = {
  ok: false,
  running: false,
  renderer: null,
  scene: null,
  camera: null,
  player: null,
  enemy: null,
  ball: null,
  playerAura: null,
  enemyAura: null,
  playerRing: null,
  enemyRing: null,
  rimLight: null,
  floorMat: null,
  raf: null,
  clock: null,
  canvas: null,
  particles: null,
  pGeo: null,
  pData: [],
  PMAX: 500,
  dust: null,
  shakePower: 0,
  arenaColor: 0x00f0ff,
  camY: 1.9,
  onResize: null,
};

let glowTex: THREE.CanvasTexture | null = null;
let tGlobal = 0;

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a0f1e";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(0,240,255,0.35)";
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * 32);
    g.lineTo(256, i * 32);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

function makeBallTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e33";
  g.fillRect(0, 0, 64, 14);
  g.fillStyle = "#111";
  g.fillRect(0, 14, 64, 4);
  g.fillStyle = "#eee";
  g.fillRect(0, 18, 64, 14);
  return new THREE.CanvasTexture(c);
}

function spriteTexture(id: number | string): THREE.Texture {
  const url = PKMN_ICONS[String(id)] ?? "";
  const tex = new THREE.TextureLoader().load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

function makePokeMesh(id: number | string, flip: boolean): PokeGroup {
  const grp = new THREE.Group() as PokeGroup;
  const tex = spriteTexture(id);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), mat);
  if (flip) m.scale.x = -1;
  m.position.y = 0.66;
  grp.add(m);
  grp.userData.plane = m;
  return grp;
}

function makeAura(color: number, size: number): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: glowTex,
    color,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, 1);
  return sp;
}

function initParticles(): void {
  if (!S.scene || !glowTex) return;
  S.pGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(S.PMAX * 3);
  const col = new Float32Array(S.PMAX * 3);
  S.pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  S.pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  S.pData = [];
  for (let i = 0; i < S.PMAX; i++) {
    S.pData.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, g: 0, r: 1, gc: 1, b: 1 });
    pos[i * 3 + 1] = -999;
  }
  const mat = new THREE.PointsMaterial({
    size: 0.09,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  S.particles = new THREE.Points(S.pGeo, mat);
  S.particles.frustumCulled = false;
  S.scene.add(S.particles);
}

function burst(
  p: { x: number; y: number; z: number },
  colorHex: number,
  count: number,
  speed: number,
  life: number,
  gravity: number,
  spread?: number,
): void {
  if (!S.pGeo || !S.pData.length) return;
  const c = new THREE.Color(colorHex);
  let spawned = 0;
  for (let i = 0; i < S.PMAX && spawned < count; i++) {
    const d = S.pData[i];
    if (d.life > 0) continue;
    spawned++;
    d.life = d.maxLife = life * (0.5 + Math.random() * 0.8);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const sp = speed * (0.4 + Math.random() * 0.9);
    const sd = spread ?? 1;
    d.vx = Math.sin(ph) * Math.cos(th) * sp * sd;
    d.vy = Math.abs(Math.cos(ph)) * sp * (gravity < 0 ? 0.9 : 0.5) + speed * 0.25;
    d.vz = Math.sin(ph) * Math.sin(th) * sp * 0.6;
    d.g = gravity;
    d.r = c.r;
    d.gc = c.g;
    d.b = c.b;
    const pos = S.pGeo.attributes.position.array as Float32Array;
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
  }
}

function stepParticles(dt: number): void {
  if (!S.pGeo) return;
  const pos = S.pGeo.attributes.position.array as Float32Array;
  const col = S.pGeo.attributes.color.array as Float32Array;
  for (let i = 0; i < S.PMAX; i++) {
    const d = S.pData[i];
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) {
      pos[i * 3 + 1] = -999;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
      continue;
    }
    d.vy += d.g * dt;
    pos[i * 3] += d.vx * dt;
    pos[i * 3 + 1] += d.vy * dt;
    pos[i * 3 + 2] += d.vz * dt;
    if (pos[i * 3 + 1] < 0.02 && d.g !== 0) {
      pos[i * 3 + 1] = 0.02;
      d.vy *= -0.4;
      d.vx *= 0.7;
      d.vz *= 0.7;
    }
    const k = d.life / d.maxLife;
    col[i * 3] = d.r * k;
    col[i * 3 + 1] = d.gc * k;
    col[i * 3 + 2] = d.b * k;
  }
  S.pGeo.attributes.position.needsUpdate = true;
  S.pGeo.attributes.color.needsUpdate = true;
}

function initDust(): void {
  if (!S.scene || !glowTex) return;
  const n = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 8;
    pos[i * 3 + 1] = Math.random() * 3.2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.045,
    map: glowTex,
    color: S.arenaColor,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  S.dust = new THREE.Points(geo, mat);
  S.dust.frustumCulled = false;
  S.scene.add(S.dust);
}

function loop(): void {
  if (!S.ok || !S.renderer || !S.scene || !S.camera || !S.clock) return;
  S.raf = requestAnimationFrame(loop);
  const now = performance.now();
  let dt = (now - S.clock.last) / 1000;
  S.clock.last = now;
  dt = Math.min(dt, 0.05);
  tGlobal += dt;

  if (S.player) {
    S.player.position.y = Math.sin(tGlobal * 2.2) * 0.05;
    if (S.playerAura) {
      S.playerAura.material.opacity = 0.4 + Math.sin(tGlobal * 3) * 0.12;
    }
  }
  if (S.enemy) {
    S.enemy.position.y = Math.sin(tGlobal * 2.6 + 1.3) * 0.05;
    if (S.enemyAura) {
      S.enemyAura.material.opacity = 0.45 + Math.sin(tGlobal * 3.4) * 0.15;
      S.enemyAura.scale.setScalar(1.9 + Math.sin(tGlobal * 2) * 0.12);
    }
  }
  if (S.playerRing) S.playerRing.rotation.z += dt * 0.5;
  if (S.enemyRing) S.enemyRing.rotation.z -= dt * 0.5;
  if (S.dust) {
    const pos = S.dust.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3 + 1] += dt * 0.12;
      if (pos[i * 3 + 1] > 3.4) pos[i * 3 + 1] = 0;
    }
    S.dust.geometry.attributes.position.needsUpdate = true;
  }

  if (S.shakePower > 0.001) {
    S.camera.position.x = (Math.random() - 0.5) * S.shakePower;
    S.camera.position.y = 1.95 + (Math.random() - 0.5) * S.shakePower;
    S.shakePower *= Math.pow(0.001, dt);
  } else {
    S.camera.position.x = 0;
    S.camera.position.y = S.camY || 1.9;
  }

  stepTweens(dt);
  stepParticles(dt);
  if (S.running) S.renderer.render(S.scene, S.camera);
}

function resize(): void {
  if (!S.ok || !S.canvas || !S.renderer || !S.camera) return;
  const w = S.canvas.clientWidth || S.canvas.parentElement?.clientWidth || 0;
  const h = S.canvas.clientHeight || S.canvas.parentElement?.clientHeight || 0;
  if (!w || !h) return;
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / h;
  if (w / h < 1) {
    S.camera.fov = 66;
    S.camY = 2.15;
    S.camera.position.z = 5.2;
  } else {
    S.camera.fov = 48;
    S.camY = 1.9;
    S.camera.position.z = 4.5;
  }
  S.camera.position.y = S.camY;
  S.camera.lookAt(0, 0.7, 0.1);
  S.camera.updateProjectionMatrix();
}

function clearSide(side: BattleSide): void {
  if (!S.scene) return;
  const g = side === "player" ? S.player : S.enemy;
  if (g) S.scene.remove(g);
  const a = side === "player" ? S.playerAura : S.enemyAura;
  if (a) S.scene.remove(a);
  if (side === "player") {
    S.player = null;
    S.playerAura = null;
  } else {
    S.enemy = null;
    S.enemyAura = null;
  }
}

function spawnIn(g: THREE.Object3D, x: number, z: number, color: number): void {
  burst({ x, y: 0.8, z }, color, 40, 1.6, 0.8, -1.5);
  const target = g.scale.x || 1;
  g.scale.setScalar(0.01);
  tween({
    dur: 0.45,
    update(k) {
      g.scale.setScalar(0.01 + (target - 0.01) * easeOut(k));
    },
  });
}

function hitReact(mesh: PokeGroup): void {
  const plane = mesh.userData.plane;
  const mat = plane.material as THREE.MeshBasicMaterial;
  const baseX = mesh.position.x;
  tween({
    dur: 0.35,
    update(k) {
      mesh.position.x = baseX + Math.sin(k * 40) * 0.08 * (1 - k);
      mat.opacity = k < 0.5 ? 0.4 : 0.4 + (k - 0.5) * 1.2;
    },
    done() {
      mesh.position.x = baseX;
      mat.opacity = 1;
    },
  });
}

function init(canvas: HTMLCanvasElement): boolean {
  if (typeof window === "undefined") return false;
  // 已绑定同一 canvas：直接复用。canvas 因 React remount 换了新节点则先 dispose 再绑定。
  if (S.ok && S.canvas === canvas) return true;
  if (S.ok && S.canvas !== canvas) dispose();
  try {
    S.canvas = canvas;
    S.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    glowTex = makeGlowTexture();

    S.scene = new THREE.Scene();
    // 透明底:场景艺术图(SceneBg)从 canvas 下方透出,不再用纯色/雾遮盖
    S.scene.fog = null;

    S.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 60);
    S.camera.position.set(0, 1.9, 4.5);
    S.camera.lookAt(0, 0.7, 0.1);

    S.scene.add(new THREE.AmbientLight(0x8090c0, 0.9));
    const key = new THREE.DirectionalLight(0xbfd8ff, 0.8);
    key.position.set(2, 5, 4);
    S.scene.add(key);
    const rim = new THREE.PointLight(0x00f0ff, 0.9, 12);
    rim.position.set(0, 2.5, -2);
    S.scene.add(rim);
    S.rimLight = rim;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshBasicMaterial({ map: makeFloorTexture(), transparent: true, opacity: 0.22 }),
    );
    floor.rotation.x = -Math.PI / 2;
    S.scene.add(floor);
    S.floorMat = floor.material as THREE.MeshBasicMaterial;

    const ringGeo = new THREE.RingGeometry(0.55, 0.68, 40);
    const mkRing = (color: number, x: number, z: number) => {
      const r = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, 0.015, z);
      S.scene!.add(r);
      return r;
    };
    S.playerRing = mkRing(0x00ff88, -0.95, 1.0);
    S.enemyRing = mkRing(0x00f0ff, 0.95, -0.3);

    S.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 14),
      new THREE.MeshBasicMaterial({ map: makeBallTexture() }),
    );
    S.ball.visible = false;
    S.scene.add(S.ball);

    initParticles();
    initDust();
    S.onResize = () => resize();
    window.addEventListener("resize", S.onResize);
    S.clock = { last: performance.now() };
    S.ok = true;
    resize();
    loop();
    return true;
  } catch (e) {
    console.warn("WebGL init failed", e);
    return false;
  }
}

function setPlayer(id: number | string): void {
  if (!S.ok || !S.scene) return;
  clearSide("player");
  const g = makePokeMesh(id, true);
  g.position.set(-0.95, 0, 1.0);
  S.scene.add(g);
  S.player = g;
  S.playerAura = makeAura(0x00ff88, 1.5);
  S.playerAura.position.set(-0.95, 0.66, 0.86);
  S.scene.add(S.playerAura);
  spawnIn(g, -0.95, 1.0, 0x00ff88);
}

function setEnemy(id: number | string, rarity?: Rarity | string, isBoss?: boolean): void {
  if (!S.ok || !S.scene || !S.enemyRing || !S.rimLight) return;
  clearSide("enemy");
  const g = makePokeMesh(id, false);
  const scale = isBoss ? 1.55 : 1;
  g.scale.setScalar(scale);
  g.position.set(0.95, 0, -0.3);
  S.scene.add(g);
  S.enemy = g;
  const color = RARITY_COLOR[rarity ?? "c"] ?? 0x00f0ff;
  S.enemyAura = makeAura(color, isBoss ? 2.6 : 1.9);
  S.enemyAura.position.set(0.95, 0.76 * scale, -0.44);
  S.scene.add(S.enemyAura);
  (S.enemyRing.material as THREE.MeshBasicMaterial).color.setHex(color);
  S.rimLight.color.setHex(color);
  S.arenaColor = color;
  if (S.dust) (S.dust.material as THREE.PointsMaterial).color.setHex(color);
  spawnIn(g, 0.95, -0.3, color);
}

function attack(side: BattleSide, opts?: AttackOpts, onImpact?: () => void): void {
  if (!S.ok || !S.scene || !glowTex) {
    onImpact?.();
    return;
  }
  const o = opts ?? {};
  const from = side === "player" ? S.player : S.enemy;
  const to = side === "player" ? S.enemy : S.player;
  if (!from || !to) {
    onImpact?.();
    return;
  }
  const crit = !!o.crit;
  const color = crit ? 0xffe259 : side === "player" ? 0x66ffcc : 0xff6688;
  const fp = from.position;
  const tp = to.position;
  const ox = fp.x;
  const oz = fp.z;
  tween({
    dur: 0.16,
    update(k) {
      const e = easeOut(k);
      fp.x = ox + (tp.x - ox) * 0.35 * e;
      fp.z = oz + (tp.z - oz) * 0.35 * e;
    },
    done() {
      tween({
        dur: 0.22,
        update(k) {
          fp.x = ox + (tp.x - ox) * 0.35 * (1 - easeOut(k));
          fp.z = oz + (tp.z - oz) * 0.35 * (1 - easeOut(k));
        },
      });
    },
  });
  const proj = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  proj.scale.setScalar(crit ? 0.7 : 0.45);
  S.scene.add(proj);
  const sy = 0.75;
  tween({
    dur: 0.3,
    update(k) {
      const e = easeIn(k);
      proj.position.set(
        fp.x + (tp.x - fp.x) * e,
        sy + Math.sin(k * Math.PI) * 0.35,
        fp.z + (tp.z - fp.z) * e,
      );
      if (Math.random() < 0.6) burst(proj.position, color, 2, 0.3, 0.3, 0);
    },
    done() {
      S.scene?.remove(proj);
      proj.material.dispose();
      const hp = { x: tp.x, y: 0.7, z: tp.z };
      burst(hp, color, crit ? 90 : 55, crit ? 3.2 : 2.2, 0.9, -3);
      burst(hp, 0xffffff, 20, 1.4, 0.5, -1);
      hitReact(to);
      S.shakePower = crit ? 0.22 : 0.1;
      onImpact?.();
    },
  });
}

function hit(side: BattleSide): void {
  const g = side === "player" ? S.player : S.enemy;
  if (g) hitReact(g);
}

function heal(side: BattleSide): void {
  const g = side === "player" ? S.player : S.enemy;
  if (!g) return;
  const p = { x: g.position.x, y: 0.3, z: g.position.z };
  burst(p, 0x00ff88, 45, 1.1, 1.3, 1.2);
  burst(p, 0xbfffd9, 20, 0.7, 1.0, 1.5);
}

function ko(side: BattleSide, done?: () => void): void {
  const g = side === "player" ? S.player : S.enemy;
  if (!g) {
    done?.();
    return;
  }
  const p = { x: g.position.x, y: 0.5, z: g.position.z };
  burst(p, 0x8888aa, 50, 1.5, 1.2, -2);
  const plane = g.userData.plane;
  const mat = plane.material as THREE.MeshBasicMaterial;
  tween({
    dur: 0.7,
    update(k) {
      g.position.y = -easeIn(k) * 0.7;
      mat.opacity = 1 - k;
      g.rotation.z = (side === "player" ? 1 : -1) * easeIn(k) * 0.5;
    },
    done() {
      done?.();
    },
  });
}

function capture(seq: CaptureSeq = {}): void {
  if (!S.ok || !S.ball || !S.scene) {
    seq.onResult?.(!!seq.result);
    return;
  }
  const tp = S.enemy ? S.enemy.position : { x: 0.95, y: 0, z: -0.3 };
  const scale = S.enemy ? S.enemy.scale.x : 1;
  const color = S.enemyAura ? S.enemyAura.material.color.getHex() : 0x00f0ff;
  S.ball.visible = true;
  S.ball.position.set(-0.95, 1.4, 1.0);
  S.ball.rotation.set(0, 0, 0);

  const dropAndShake = () => {
    if (!S.ball) return;
    tween({
      dur: 0.35,
      update(k) {
        if (!S.ball) return;
        S.ball.position.y =
          1.4 - 1.0 - 0.4 * easeIn(k) + Math.abs(Math.sin(k * Math.PI * 2)) * 0.12 * (1 - k);
        S.ball.position.x = tp.x;
        S.ball.position.z = tp.z;
      },
      done() {
        if (!S.ball) return;
        S.ball.position.y = 0.17;
        let n = 0;
        const shakeOnce = () => {
          n++;
          seq.onShake?.(n);
          tween({
            dur: 0.5,
            update(k) {
              if (!S.ball) return;
              S.ball.rotation.z = Math.sin(k * Math.PI * 4) * 0.5 * (1 - k * 0.5);
            },
            done() {
              if (n < 3) setTimeout(shakeOnce, 250);
              else
                setTimeout(() => {
                  const success = !!seq.result;
                  if (success) {
                    if (S.ball) {
                      burst(S.ball.position, 0xffd700, 70, 2.4, 1.1, -2);
                      burst(S.ball.position, 0xff3355, 30, 1.6, 0.9, -2);
                    }
                    S.shakePower = 0.12;
                  } else {
                    if (S.ball) S.ball.visible = false;
                    if (S.enemy) {
                      S.enemy.visible = true;
                      spawnIn(S.enemy, tp.x, tp.z, color);
                    }
                    burst({ x: tp.x, y: 0.8, z: tp.z }, color, 40, 2, 0.8, -2);
                  }
                  seq.onResult?.(success);
                }, 350);
            },
          });
        };
        setTimeout(shakeOnce, 400);
      },
    });
  };

  tween({
    dur: 0.55,
    update(k) {
      if (!S.ball) return;
      const e = k;
      S.ball.position.x = -0.95 + (tp.x + 0.95) * e;
      S.ball.position.z = 1.0 + (tp.z - 1.0) * e;
      S.ball.position.y = 1.4 - 1.0 * e + Math.sin(k * Math.PI) * 0.8;
      S.ball.rotation.x += 0.3;
    },
    done() {
      burst({ x: tp.x, y: 0.8, z: tp.z }, 0xff3355, 40, 1.8, 0.6, -1);
      if (S.enemy) {
        const plane = S.enemy.userData.plane;
        const mat = plane.material as THREE.MeshBasicMaterial;
        tween({
          dur: 0.3,
          update(k) {
            if (!S.enemy) return;
            S.enemy.scale.setScalar(Math.max(0.01, scale * (1 - k)));
            mat.opacity = 1 - k;
          },
          done() {
            if (S.enemy) {
              S.enemy.visible = false;
              mat.opacity = 1;
              S.enemy.scale.setScalar(scale);
            }
            seq.onAbsorbed?.();
            dropAndShake();
          },
        });
      } else {
        seq.onAbsorbed?.();
        dropAndShake();
      }
    },
  });
}

function endCapture(hideBall?: boolean): void {
  if (hideBall !== false && S.ball) S.ball.visible = false;
}

function setRunning(v: boolean): void {
  S.running = v;
  if (v) resize();
}

function burstAt(side: BattleSide, colorHex: number, count?: number): void {
  const g = side === "player" ? S.player : S.enemy;
  if (g && S.ok) {
    burst({ x: g.position.x, y: 0.8, z: g.position.z }, colorHex, count ?? 30, 2, 0.8, -2);
  }
}

function comboAura(level: number): void {
  if (S.playerAura) {
    const hot = Math.min(1, level / 8);
    S.playerAura.material.color.setHSL(0.35 - hot * 0.35, 1, 0.55);
    S.playerAura.scale.setScalar(1.5 + hot * 0.7);
  }
}

function dispose(): void {
  if (typeof window !== "undefined" && S.onResize) {
    window.removeEventListener("resize", S.onResize);
    S.onResize = null;
  }
  if (S.raf != null) {
    cancelAnimationFrame(S.raf);
    S.raf = null;
  }
  tweens.length = 0;
  clearSide("player");
  clearSide("enemy");
  if (S.scene) {
    S.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
        const geom = (obj as THREE.Mesh).geometry;
        if (geom) geom.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      }
    });
  }
  if (S.renderer) {
    S.renderer.dispose();
    S.renderer = null;
  }
  if (glowTex) {
    glowTex.dispose();
    glowTex = null;
  }
  S.scene = null;
  S.camera = null;
  S.ball = null;
  S.particles = null;
  S.pGeo = null;
  S.pData = [];
  S.dust = null;
  S.playerRing = null;
  S.enemyRing = null;
  S.rimLight = null;
  S.floorMat = null;
  S.canvas = null;
  S.clock = null;
  S.running = false;
  S.ok = false;
  tGlobal = 0;
}

export const BattleFX = {
  init,
  setPlayer,
  setEnemy,
  attack,
  hit,
  heal,
  ko,
  /** alias of ko */
  faint: ko,
  capture,
  endCapture,
  setRunning,
  resize,
  dispose,
  burstAt,
  comboAura,
  get ok() {
    return S.ok;
  },
};

export default BattleFX;
