<script>
// @ts-nocheck
import { onMount } from "svelte";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const CONFIG = {
  lane: 2.5,
  jump: 0.35,
  grav: 0.015,
  speed: 55, // Keeping your faster speed
  playerScale: 1.7 // Increased size significantly
};

let score = 0, isPlaying = false, gameOver = false, startScreen = true;
let lane = 0, currX = 0, isJumping = false, jumpV = 0, playerY = 0;
let container, canvas, scene, camera, renderer;
let worldObjects = [], animationFrame;
let isDying = false, hitFlash = false;

let playerAnchor, currentModel = null, currentMixer = null, swapToken = 0;

// Treadmill System
const CHUNKS = [];
const CHUNK_COUNT = 3;
const CHUNK_SIZE = 140; 

let uTime = { value: 0 };
const loader = new GLTFLoader();
const clock = new THREE.Clock();
const glbCache = new Map();

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

function createWorldChunk(zOffset) {
  const group = new THREE.Group();
  group.position.z = zOffset;
  
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(160, CHUNK_SIZE + 0.1),
    new THREE.MeshStandardMaterial({ color: 0x1e2b21 })
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const count = 7000; // Adjusted for slightly larger floor
  const geo = new THREE.PlaneGeometry(0.4, 0.9, 1, 2);
  geo.translate(0, 0.45, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: grassVertex,
    fragmentShader: grassFragment,
    side: THREE.DoubleSide,
    alphaToCoverage: true
  });
  
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    let x = (Math.random() - 0.5) * 120;
    if (x > -10 && x < 10) x += (x > 0) ? 10 : -10;
    let z = (Math.random() - 0.5) * CHUNK_SIZE;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.scale.setScalar(0.7 + Math.random() * 1.6);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  group.add(mesh);
  return group;
}

async function getCachedGLTF(file) {
  if (!glbCache.has(file)) {
    const gltf = await loader.loadAsync(file);
    glbCache.set(file, gltf);
  }
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
    
    if (isDeathAnimation) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true; // STOPS AT THE LAST FRAME
      action.play();
    } else {
      action.play();
    }
  }
  
  if (currentModel) playerAnchor.remove(currentModel);
  currentModel = model; currentMixer = mixer;
  playerAnchor.add(currentModel);
}

function init() {
  scene = new THREE.Scene();
  const skyColor = 0xa4c3b2;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 35, 150);

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 4.5, 13); // Lowered slightly to match bigger player
  camera.lookAt(0, 1, -5);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));

  for (let i = 0; i < CHUNK_COUNT; i++) {
    const chunk = createWorldChunk(-i * CHUNK_SIZE);
    CHUNKS.push(chunk);
    scene.add(chunk);
  }

  playerAnchor = new THREE.Group();
  scene.add(playerAnchor);

  new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }).observe(container);
}

function spawn() {
  const l = Math.floor(Math.random() * 5) - 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.8, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  );
  mesh.position.set(l * CONFIG.lane, 0.9, -130);
  scene.add(mesh);
  worldObjects.push({ mesh, lane: l });
}

function update() {
  const delta = clock.getDelta();
  uTime.value = clock.getElapsedTime();

  if (currentMixer) currentMixer.update(delta);
  if (!isPlaying) return;

  const moveStep = CONFIG.speed * delta;
  score++;

  CHUNKS.forEach(chunk => {
    chunk.position.z += moveStep;
    if (chunk.position.z > CHUNK_SIZE) {
      chunk.position.z -= CHUNK_SIZE * CHUNK_COUNT;
    }
  });

  currX += (lane * CONFIG.lane - currX) * 0.18;
  playerAnchor.position.x = currX;

  if (isJumping) {
    jumpV -= CONFIG.grav;
    playerY += jumpV;
    if (playerY <= 0) {
      playerY = 0; 
      isJumping = false; 
      if (!isDying) swapCharacter("Running.glb");
    }
  }
  playerAnchor.position.y = playerY;

  worldObjects = worldObjects.map(obj => {
    obj.mesh.position.z += moveStep;
    // Collision box adjusted for larger character
    if (Math.abs(obj.mesh.position.z) < 1.3 && obj.lane === lane && playerY < 1.5) triggerGameOver();
    return obj;
  }).filter(obj => {
    const keep = obj.mesh.position.z < 25;
    if (!keep) scene.remove(obj.mesh);
    return keep;
  });

  if (score % 30 === 0) spawn();
}

function triggerGameOver() {
  isPlaying = false; gameOver = true; isDying = true; hitFlash = true;
  swapCharacter("Falling Back Death.glb", true); // Pass 'true' for death logic
  setTimeout(() => hitFlash = false, 150);
}

async function startGame() {
  worldObjects.forEach(obj => scene.remove(obj.mesh));
  worldObjects = [];
  score = 0; isPlaying = true; gameOver = false; startScreen = false;
  lane = 0; currX = 0; isJumping = false; jumpV = 0; playerY = 0; isDying = false;
  
  CHUNKS.forEach((chunk, i) => {
    chunk.position.z = -i * CHUNK_SIZE;
  });
  
  await swapCharacter("Running.glb");
}

function handleKeyDown(e) {
  if (!isPlaying || isDying) return;
  if (e.key === "ArrowLeft" && lane > -2) lane--;
  if (e.key === "ArrowRight" && lane < 2) lane++;
  if ((e.key === " " || e.key === "ArrowUp") && !isJumping) {
    isJumping = true; jumpV = CONFIG.jump; swapCharacter("Jumping.glb");
  }
}

onMount(() => {
  init();
  const loop = () => { animationFrame = requestAnimationFrame(loop); update(); renderer.render(scene, camera); };
  loop();
  window.addEventListener("keydown", handleKeyDown);
  return () => { cancelAnimationFrame(animationFrame); window.removeEventListener("keydown", handleKeyDown); };
});
</script>

<style>
  :global(body, html) { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #a4c3b2; }
  #wrapper { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  canvas { width: 100% !important; height: 100% !important; display: block; }
  .ui { position: absolute; inset: 0; pointer-events: none; color: white; text-align: center; font-family: 'Segoe UI', sans-serif; }
  .score { font-size: 2.5rem; margin-top: 30px; font-weight: 800; text-shadow: 0 4px 10px rgba(0,0,0,0.2); }
  .modal { pointer-events: auto; background: rgba(255, 255, 255, 0.98); padding: 50px; border-radius: 30px; margin-top: 10vh; color: #1e2b21; display: inline-block; box-shadow: 0 25px 60px rgba(0,0,0,0.15); }
  button { padding: 18px 50px; background: #1e2b21; color: white; border: none; border-radius: 15px; cursor: pointer; font-weight: bold; font-size: 1.2rem; transition: all 0.2s; }
  button:hover { transform: translateY(-3px); background: #2b3d2f; }
  .flash { position: absolute; inset: 0; background: white; z-index: 10; pointer-events: none; }
</style>

<div id="wrapper" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
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