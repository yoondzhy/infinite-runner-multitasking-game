<script>
// @ts-nocheck
import { onMount } from "svelte";
import * as THREE from "three";
import p5 from "p5";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const CONFIG = { lane: 2.5, jump: 0.35, grav: 0.015, speed: 55, playerScale: 1.7 };

let score = 0, isPlaying = false, gameOver = false, startScreen = true;
let attentiveness = 100;
let lane = 0, currX = 0, isJumping = false, jumpV = 0, playerY = 0;
let container, canvas, scene, camera, renderer, p5Container;
let worldObjects = [], animationFrame, p5Instance;
let isDying = false, hitFlash = false;

// 2D Game Logic
let gamePhase = "START"; 
let instructionTimer = 3;
let targetType = "NEURON"; 
let targets = [];

let playerAnchor, currentModel = null, currentMixer = null, swapToken = 0;
let CHUNKS = [];
const CHUNK_COUNT = 3;
const CHUNK_SIZE = 140; 

let uTime = { value: 0 };
const loader = new GLTFLoader();
const clock = new THREE.Clock();
const glbCache = new Map();

// --- P5 SKETCH (HUD, 2D Hammer & Rare Targets) ---
const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
  };

  p.draw = () => {
    p.clear();
    if (!isPlaying) return;

    if (gamePhase === "INSTRUCTIONS") {
      p.fill(0, 180);
      p.rect(0, 0, p.width, p.height);
      p.fill(255);
      p.textAlign(p.CENTER);
      p.textSize(24);
      p.text(`NEURO-MISSION: CLICK THE ${targetType}`, p.width/2, p.height/2 - 20);
      p.textSize(60);
      p.text(Math.ceil(instructionTimer), p.width/2, p.height/2 + 60);
      return;
    }

    // Attentiveness Meter
    p.noFill();
    p.stroke(255, 100);
    p.strokeWeight(2);
    p.rect(20, 20, 200, 20, 10);
    let color = p.lerpColor(p.color(255, 50, 50), p.color(50, 255, 150), attentiveness / 100);
    p.fill(color);
    p.noStroke();
    let w = (attentiveness / 100) * 200;
    if (attentiveness < 30) w += p.sin(p.frameCount * 0.2) * 5;
    p.rect(20, 20, Math.max(0, w), 20, 10);

    // Spawning Rare 2D Targets (0.4% chance)
    if (p.random(1) < 0.004) {
      const types = ["NEURON", "SUGAR", "GLITCH"];
      targets.push({
        x: p.random(p.width * 0.2, p.width * 0.8),
        y: -50,
        type: types[p.floor(p.random(types.length))],
        speed: p.random(1.5, 3),
        rot: 0
      });
    }

    // Process 2D Targets
    for (let i = targets.length - 1; i >= 0; i--) {
      let t = targets[i];
      t.y += t.speed;
      t.rot += 0.02;

      p.push();
      p.translate(t.x, t.y);
      p.rotate(t.rot);
      p.strokeWeight(2);
      if (t.type === "NEURON") {
        p.stroke(0, 255, 200); p.noFill();
        for(let j=0; j<8; j++) p.line(0,0, p.cos(j)*20, p.sin(j)*20);
        p.ellipse(0, 0, 12);
      } else if (t.type === "SUGAR") {
        p.fill(255, 105, 180); p.noStroke();
        p.ellipse(0, 0, 25, 25); p.fill(255); p.ellipse(0, 0, 8);
      } else {
        p.fill(255, 50, 0); p.noStroke();
        p.rect(-12, -12, 24, 24);
      }
      p.pop();

      if (t.y > p.height + 50) targets.splice(i, 1);
    }

    // 2D Hammer
    p.push();
    p.translate(p.mouseX, p.mouseY);
    p.rotate(-0.4);
    p.fill(120, 80, 50); p.noStroke();
    p.rect(-5, 0, 10, 40, 2);
    p.fill(100);
    p.rect(-20, -10, 40, 20, 4);
    p.pop();
  };

  p.mousePressed = () => {
    if (gamePhase !== "PLAYING") return;
    for (let i = targets.length - 1; i >= 0; i--) {
      let t = targets[i];
      if (p.dist(p.mouseX, p.mouseY, t.x, t.y) < 40) {
        if (t.type === targetType) {
          score += 100;
          attentiveness = Math.min(100, attentiveness + 15);
        } else {
          attentiveness -= 20;
        }
        targets.splice(i, 1);
        break;
      }
    }
  };
};

// --- SHADERS ---
const grassVertex = `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 pos = position;
    float sway = sin(uTime * 2.0 + (instanceMatrix[3][0] * 0.5) + (instanceMatrix[3][2] * 0.5)) * 0.15 * uv.y;
    pos.x += sway;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
  }
`;

const grassFragment = `
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(mix(vec3(0.12, 0.28, 0.18), vec3(0.5, 0.72, 0.4), vUv.y), 1.0);
  }
`;

// --- WORLD GENERATION ---
const createClouds = (group) => {
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const thickness = 2; 
  const cloudMeshes = Array.from({ length: 20 }).map(() => {
    const w = 10 + Math.random() * 20;
    const d = 10 + Math.random() * 20;
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), cloudMaterial);
    cloud.position.set((Math.random() - 0.5) * 280, 35, (Math.random() - 0.5) * 300);
    return cloud;
  });
  group.add(...cloudMeshes); 
};

const createWorldChunk = (zOffset) => {
  const group = new THREE.Group();
  group.position.z = zOffset;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, CHUNK_SIZE + 0.1), new THREE.MeshStandardMaterial({ color: 0x1e2b21 }));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const count = 7000;
  const geo = new THREE.PlaneGeometry(0.4, 0.9, 1, 2);
  geo.translate(0, 0.45, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime }, vertexShader: grassVertex, fragmentShader: grassFragment,
    side: THREE.DoubleSide, alphaToCoverage: true
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for(let i=0; i<count; i++) {
    let x = (Math.random() - 0.5) * 120;
    if (x > -10 && x < 10) x += (x > 0) ? 10 : -10;
    dummy.position.set(x, 0, (Math.random() - 0.5) * CHUNK_SIZE);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.scale.setScalar(0.7 + Math.random() * 1.6);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  group.add(mesh);
  return group;
};

// --- CORE LOGIC ---
async function getCachedGLTF(file) {
  if (!glbCache.has(file)) glbCache.set(file, await loader.loadAsync(file));
  return glbCache.get(file);
}

async function swapCharacter(file, isDeathAnimation = false) {
  const myToken = ++swapToken;
  const source = await getCachedGLTF(file);
  if (myToken !== swapToken) return;
  const model = cloneSkeleton(source.scene);
  model.scale.setScalar(CONFIG.playerScale);
  model.rotation.y = Math.PI;
  const mixer = new THREE.AnimationMixer(model);
  if (source.animations?.length) {
    const action = mixer.clipAction(source.animations[0]);
    if (isDeathAnimation) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    action.play();
  }
  if (currentModel) playerAnchor.remove(currentModel);
  currentModel = model; currentMixer = mixer;
  playerAnchor.add(currentModel);
}

function init() {
  scene = new THREE.Scene();
  const skyColor = 0x87CEFA;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 150, 350);
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 4.5, 13); 
  camera.lookAt(0, 1, -5);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const lights = [
    new THREE.AmbientLight(0xffffff, 1.8),
    new THREE.DirectionalLight(0xffffff, 1.2)
  ];
  lights[1].position.set(0, 50, 0);
  scene.add(...lights);

  // Re-added Clouds
  const cloudGroup = new THREE.Group();
  createClouds(cloudGroup);
  scene.add(cloudGroup);

  CHUNKS = Array.from({ length: CHUNK_COUNT }).map((_, i) => {
    const chunk = createWorldChunk(-i * CHUNK_SIZE);
    scene.add(chunk);
    return chunk;
  });

  playerAnchor = new THREE.Group();
  scene.add(playerAnchor);

  new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }).observe(container);
}

async function spawn() {
  const l = Math.floor(Math.random() * 5) - 2;
  const source = await getCachedGLTF("Simple computer.glb");
  const model = cloneSkeleton(source.scene);
  const pivot = new THREE.Group();
  pivot.position.set(l * CONFIG.lane, 0, -130);
  model.position.set(0, 0.6, 0); 
  model.rotation.y = Math.PI;    
  model.scale.setScalar(5.5); 
  pivot.add(model);
  scene.add(pivot);
  worldObjects = [...worldObjects, { mesh: pivot, lane: l }];
}

function update() {
  const delta = clock.getDelta();
  uTime.value = clock.getElapsedTime();
  if (currentMixer) currentMixer.update(delta);
  if (!isPlaying) return;

  if (gamePhase === "INSTRUCTIONS") {
    instructionTimer -= delta;
    if (instructionTimer <= 0) gamePhase = "PLAYING";
    return;
  }

  const moveStep = CONFIG.speed * delta;
  score++;
  attentiveness -= 0.05;
  if (attentiveness <= 0) triggerGameOver();

  CHUNKS.forEach(chunk => {
    chunk.position.z += moveStep;
    if (chunk.position.z > CHUNK_SIZE) chunk.position.z -= CHUNK_SIZE * CHUNK_COUNT;
  });

  currX += (lane * CONFIG.lane - currX) * 0.18;
  playerAnchor.position.x = currX;

  if (isJumping) {
    jumpV -= CONFIG.grav;
    playerY += jumpV;
    if (playerY <= 0) { playerY = 0; isJumping = false; if (!isDying) swapCharacter("Running.glb"); }
  }
  playerAnchor.position.y = playerY;

  worldObjects = worldObjects.map(obj => {
    obj.mesh.position.z += moveStep;
    if (Math.abs(obj.mesh.position.z) < 1.5 && obj.lane === lane && playerY < 1.5) triggerGameOver();
    return obj;
  }).filter(obj => {
    const active = obj.mesh.position.z < 25;
    if (!active) { scene.remove(obj.mesh); attentiveness = Math.min(100, attentiveness + 2); }
    return active;
  });

  if (score % 30 === 0) spawn();
}

function triggerGameOver() {
  isPlaying = false; gameOver = true; isDying = true; hitFlash = true;
  swapCharacter("Falling Back Death.glb", true); 
  setTimeout(() => hitFlash = false, 150);
}

async function startGame() {
  worldObjects.forEach(obj => scene.remove(obj.mesh));
  worldObjects = [];
  targets = [];
  score = 0; attentiveness = 100; isPlaying = true; gameOver = false; startScreen = false;
  gamePhase = "INSTRUCTIONS"; instructionTimer = 3;
  lane = 0; currX = 0; isJumping = false; jumpV = 0; playerY = 0; isDying = false;
  CHUNKS.forEach((chunk, i) => { chunk.position.z = -i * CHUNK_SIZE; });
  await swapCharacter("Running.glb");
}

const handleKeyDown = (e) => {
  if (!isPlaying || isDying) return;
  const actions = {
    ArrowLeft: () => lane > -2 && lane--, a: () => lane > -2 && lane--, A: () => lane > -2 && lane--,
    ArrowRight: () => lane < 2 && lane++, d: () => lane < 2 && lane++, D: () => lane < 2 && lane++,
    " ": () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jumping.glb")),
    ArrowUp: () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jumping.glb")),
    w: () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jumping.glb")),
    W: () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jumping.glb"))
  };
  actions[e.key]?.();
};

onMount(() => {
  init();
  p5Instance = new p5(sketch, p5Container);
  const loop = () => { animationFrame = requestAnimationFrame(loop); update(); renderer.render(scene, camera); };
  loop();
  window.addEventListener("keydown", handleKeyDown);
  return () => { 
    cancelAnimationFrame(animationFrame); 
    window.removeEventListener("keydown", handleKeyDown);
    if (p5Instance) p5Instance.remove();
  };
});
</script>

<style>
  :global(body, html) { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #8cd0f8; cursor: none; }
  #wrapper { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  canvas { width: 100% !important; height: 100% !important; display: block; }
  .p5-hud { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 10; width: 100%; height: 100%; }
  .ui { position: absolute; inset: 0; pointer-events: none; color: white; text-align: center; font-family: 'Segoe UI', sans-serif; }
  .score { font-size: 2.5rem; margin-top: 60px; font-weight: 800; text-shadow: 0 4px 10px rgba(0,0,0,0.2); }
  .modal { pointer-events: auto; background: rgba(255, 255, 255, 0.98); padding: 50px; border-radius: 30px; margin-top: 10vh; color: #1e2b21; display: inline-block; box-shadow: 0 25px 60px rgba(0,0,0,0.15); }
  button { padding: 18px 50px; background: #1e2b21; color: white; border: none; border-radius: 15px; cursor: pointer; font-weight: bold; font-size: 1.2rem; transition: all 0.2s; }
  button:hover { transform: translateY(-3px); background: #2b3d2f; }
  .flash { position: absolute; inset: 0; background: white; z-index: 20; pointer-events: none; }
</style>

<div id="wrapper" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
  <div class="p5-hud" bind:this={p5Container}></div> 
  {#if hitFlash} <div class="flash"></div> {/if}
  <div class="ui">
    <div class="score">{score}</div>
    {#if startScreen || gameOver}
      <div class="modal">
        <h1 style="margin: 0 0 10px 0; font-size: 2.5rem;">{gameOver ? "NEURO BREAK" : "NEURO RUNNER"}</h1>
        <p style="margin-bottom: 35px; font-size: 1.1rem; opacity: 0.7;">{gameOver ? "Final Score: " + score : "Ready to focus?"}</p>
        <button on:click={startGame}>{gameOver ? "RETRY" : "START RUN"}</button>
      </div>
    {/if}
  </div>
</div>