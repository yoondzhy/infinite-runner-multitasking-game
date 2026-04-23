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
  speed: 0.3,
  gameOverDelay: 1400,
  playerScale: 1.25
};

let score = 0;
let isPlaying = false;
let gameOver = false;
let startScreen = true;
let showGameOverModal = false;

let lane = 0;
let currX = 0;
let isJumping = false;
let jumpV = 0;
let playerY = 0;

let container, canvas, scene, camera, renderer, floor;
let worldObjects = [];
let resizeObserver;
let animationFrame;

let isDying = false;
let hitFlash = false;
let shake = 0;

let playerAnchor;
let currentModel = null;
let currentMixer = null;
let currentAction = null;
let currentState = "run";
let swapToken = 0;

const loader = new GLTFLoader();
const clock = new THREE.Clock();
const glbCache = new Map();

function normalizeModel(root) {
  root.scale.setScalar(CONFIG.playerScale);
  root.rotation.y = Math.PI;

  root.traverse((obj) => {
    if (obj.isMesh || obj.isSkinnedMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
    }
    if (obj.isBone) {
      obj.frustumCulled = false;
    }
  });

  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box.getCenter(center);

  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;

  root.updateMatrixWorld(true);
  return root;
}

async function getCachedGLTF(file) {
  if (!glbCache.has(file)) {
    const gltf = await loader.loadAsync(file);
    glbCache.set(file, gltf);
  }
  return glbCache.get(file);
}

function disposeCurrentCharacter() {
  if (currentMixer) {
    currentMixer.stopAllAction();
  }

  if (currentModel && playerAnchor) {
    playerAnchor.remove(currentModel);
  }

  currentModel = null;
  currentMixer = null;
  currentAction = null;
}

async function swapCharacter(file, stateName, { loop = true } = {}) {
  const myToken = ++swapToken;

  const source = await getCachedGLTF(file);
  if (myToken !== swapToken) return;

  const model = normalizeModel(cloneSkeleton(source.scene));
  const mixer = new THREE.AnimationMixer(model);

  let action = null;
  if (source.animations && source.animations.length > 0) {
    action = mixer.clipAction(source.animations[0]);
    if (loop) {
      action.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.reset();
    action.play();
  }

  disposeCurrentCharacter();

  currentModel = model;
  currentMixer = mixer;
  currentAction = action;
  currentState = stateName;

  playerAnchor.add(currentModel);
}

function showRun() {
  return swapCharacter("Running.glb", "run", { loop: true });
}

function showJump() {
  return swapCharacter("Jumping.glb", "jump", { loop: false });
}

function showDeath() {
  return swapCharacter("Falling Back Death.glb", "death", { loop: false });
}

function triggerGameOver() {
  if (isDying || gameOver) return;

  isPlaying = false;
  gameOver = true;
  isDying = true;
  hitFlash = true;
  shake = 0.35;

  showDeath();

  setTimeout(() => {
    hitFlash = false;
  }, 150);

  setTimeout(() => {
    showGameOverModal = true;
  }, CONFIG.gameOverDelay);
}

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, -5);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(5, 10, 7);
  scene.add(sun);

  const floorGeo = new THREE.PlaneGeometry(100, 2000);
  floor = new THREE.Mesh(
    floorGeo,
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  playerAnchor = new THREE.Group();
  scene.add(playerAnchor);

  resizeObserver = new ResizeObserver(() => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });

  resizeObserver.observe(container);
}

function spawn() {
  const l = Math.floor(Math.random() * 5) - 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x00fff2 })
  );
  mesh.position.set(l * CONFIG.lane, 0.75, -100);
  scene.add(mesh);
  worldObjects.push({ mesh, lane: l });
}

function update() {
  const delta = clock.getDelta();

  if (currentMixer) {
    currentMixer.update(delta);
  }

  if (shake > 0.001) {
    shake *= 0.9;
    camera.position.x = (Math.random() - 0.5) * shake;
  } else {
    shake = 0;
    camera.position.x += (0 - camera.position.x) * 0.2;
  }

  if (playerAnchor) {
    playerAnchor.position.set(currX, playerY, 0);
  }

  if (!isPlaying) return;

  score++;
  currX += (lane * CONFIG.lane - currX) * 0.15;

  if (isJumping) {
    jumpV -= CONFIG.grav;
    playerY += jumpV;

    if (playerY <= 0) {
      playerY = 0;
      isJumping = false;
      if (!isDying) showRun();
    }
  }

  worldObjects = worldObjects
    .map((obj) => {
      obj.mesh.position.z += CONFIG.speed;

      if (
        Math.abs(obj.mesh.position.z) < 0.8 &&
        obj.lane === lane &&
        playerY < 1
      ) {
        triggerGameOver();
      }

      return obj;
    })
    .filter((obj) => {
      const keep = obj.mesh.position.z <= 15;
      if (!keep) scene.remove(obj.mesh);
      return keep;
    });

  if (score % 30 === 0) spawn();
}

async function startGame() {
  worldObjects.forEach((obj) => scene.remove(obj.mesh));
  worldObjects = [];

  score = 0;
  isPlaying = true;
  gameOver = false;
  startScreen = false;
  showGameOverModal = false;

  lane = 0;
  currX = 0;
  isJumping = false;
  jumpV = 0;
  playerY = 0;

  isDying = false;
  hitFlash = false;
  shake = 0;

  if (playerAnchor) {
    playerAnchor.position.set(0, 0, 0);
    playerAnchor.rotation.set(0, 0, 0);
  }

  await showRun();
}

function handleKeyDown(e) {
  if (!isPlaying || isDying) return;

  if (e.key === "ArrowLeft" && lane > -2) lane--;
  if (e.key === "ArrowRight" && lane < 2) lane++;

  if ((e.key === " " || e.key === "ArrowUp") && !isJumping) {
    isJumping = true;
    jumpV = CONFIG.jump;
    showJump();
  }
}

onMount(() => {
  init();

  const loop = () => {
    animationFrame = requestAnimationFrame(loop);
    update();
    renderer.render(scene, camera);
  };

  loop();
  window.addEventListener("keydown", handleKeyDown);

  return () => {
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("keydown", handleKeyDown);
    resizeObserver?.disconnect();

    if (currentMixer) currentMixer.stopAllAction();
    renderer?.dispose();
  };
});
</script>

<style>
  :global(body, html) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    background: #000;
  }

  #wrapper {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  canvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
  }

  .ui {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: white;
    text-align: center;
    font-family: sans-serif;
  }

  .score {
    font-size: 2rem;
    margin-top: 20px;
  }

  .modal {
    pointer-events: auto;
    background: rgba(0, 0, 0, 0.9);
    padding: 40px;
    border-radius: 20px;
    margin-top: 20vh;
    border: 1px solid #00fff2;
    display: inline-block;
    min-width: 280px;
  }

  button {
    padding: 15px 40px;
    background: #00fff2;
    border: none;
    cursor: pointer;
    font-weight: bold;
    color: black;
    text-transform: uppercase;
  }

  .flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: white;
    opacity: 0;
    animation: flash-hit 180ms ease-out forwards;
    z-index: 10;
  }

  @keyframes flash-hit {
    0% { opacity: 0.95; }
    100% { opacity: 0; }
  }
</style>

<div id="wrapper" bind:this={container}>
  <canvas bind:this={canvas}></canvas>

  {#if hitFlash}
    <div class="flash"></div>
  {/if}

  <div class="ui">
    <div class="score">{score}</div>

    {#if startScreen || showGameOverModal}
      <div class="modal">
        <h1>{showGameOverModal ? "GAME OVER" : "RUNNER"}</h1>
        <p>{showGameOverModal ? "Score: " + score : "Arrows to Move • Space to Jump"}</p>
        <button on:click={startGame}>
          {showGameOverModal ? "RETRY" : "START"}
        </button>
      </div>
    {/if}
  </div>
</div>