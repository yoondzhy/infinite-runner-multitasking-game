<script>
// @ts-nocheck
import LandingPage from './LandingPage.svelte';
import { onMount, tick } from "svelte";
import * as THREE from "three";
import p5 from "p5";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
  
import { loadLeaderboard, saveScore, playerName, leaderboard , hasSubmitted } from './leaderboard.js';
import { updateEnvironment, skyColors } from './environment.js';
import { createObstacle, handleCollisions } from './obstacles.js';
import { createSketch } from './p5overlay.js';
import { 
  handleInput, 
  processInteraction, 
  updatePhysics,
  updateGameFlow // Add this
} from './GameController.js';

import { 
  createWorldChunk, 
  createClouds, 
  moveWorld,
  animateClouds     // Added this
} from './WorldScene.js';
import { ObstacleFactory } from './ObstacleFactory.js';
import { GameManager } from './GameManager.js';

let showLanding = true;
let lastTime = performance.now();

async function handleStart() {
  showLanding = false;
  await tick();
  init();

  // 3. Setup the Bridge Object
  const gameState = {
    get isPlaying() { return isPlaying; },
    get score() { return score; },
    set score(v) { score = v; },
    get lives() { return lives; },
    set lives(v) { lives = v; },
    get multiplierTimer() { return multiplierTimer; },
    get targetType() { return targetType; },
    get instructionTimer() { return instructionTimer; },
    set instructionTimer(v) { instructionTimer = v; },
    get gamePhase() { return gamePhase; },
    set gamePhase(v) { gamePhase = v; },
    get lastStarScore() { return lastStarScore; },
    set lastStarScore(v) { lastStarScore = v; },
    
    // FIX: Use getters for the arrays so they don't get stale!
    get targets() { return targets; },
    get scorePopups() { return scorePopups; },
    
    onHit: (t) => {
    // MVC: Delegate the 'Decision' to the Controller
      processInteraction(t, gameState, scoreMultiplier, BOOST_DURATION);
    },
    onActivateBoost: (mult, dur) => {
      scoreMultiplier = mult;
      multiplierTimer = dur;
    }
      };

  // 4. Initialize p5 now that p5Container exists
  p5Instance = new p5(createSketch(gameState, textures), p5Container);
  
  lastTime = performance.now();
  startGame();
  
  const loop = () => { 
    animationFrame = requestAnimationFrame(loop); 
    update(); 
    if (renderer && scene && camera) {
      renderer.render(scene, camera); 
    }
  };
  loop();
}


const CONFIG = { 
  lane: 2.5, 
  jump: 0.35, 
  grav: 0.015, 
  playerScale: 1.7,
  START_SPEED: 45,   // Initial slow speed
  MAX_SPEED: 95,     // The "chaos" threshold
  ACCELERATION: 1,  // Speed added per second
  CYCLE_INTERVAL: 7000
};

let currentSpeed = CONFIG.START_SPEED;
let score = 0, isPlaying = false, gameOver = false, startScreen = true;
let attentiveness = 100;
let lives = 5;
let lane = 0, currX = 0, isJumping = false, jumpV = 0, playerY = 0;
let container, canvas, scene, camera, renderer, p5Container;
let worldObjects = [], animationFrame, p5Instance;
let isDying = false, hitFlash = false;

let spawnDistanceTracker = 0;
const SPAWN_INTERVAL = 40; // Physical distance between obstacles
let cloudGroup;

let sun, moon, ambientLight, sunLight, headLight;

// 2D Game Logic
let gamePhase = "START"; 
let instructionTimer = 3;
let targetType = "STRAWBERRY"; 
let targets = [];
let scorePopups = []; // To track the floating +100 labels

let playerAnchor, currentModel = null, currentMixer = null, swapToken = 0;
let CHUNKS = [];
const CHUNK_COUNT = 3;
const CHUNK_SIZE = 140; 

let uTime = { value: 0 };
const loader = new GLTFLoader();
const glbCache = new Map();

let textures = {};

let scoreMultiplier = 1;
let multiplierTimer = 0; // Remaining seconds of boost
let lastStarScore = 0; // Add this line to prevent the crash
const BOOST_DURATION = 20; // 20 seconds

async function getCachedGLTF(file) {
  if (!glbCache.has(file)) glbCache.set(file, await loader.loadAsync(file));
  return glbCache.get(file);
}

async function swapCharacter(file, isDeathAnimation = false) {
  const myToken = ++swapToken;
  const source = await getCachedGLTF(`3dmodels/${file}`);
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
  if (!canvas || !container) return; // Safety check
  scene = new THREE.Scene();
  const skyColor = 0x87CEFA;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 150, 350);
  
  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.2, 1000);
  camera.position.set(0, 5.5, 13); 
  camera.lookAt(0, -1, -5);
  
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);

  const lights = [
    new THREE.AmbientLight(0xffffff, 1.8),
    new THREE.DirectionalLight(0xffffff, 1.2)
  ];
  lights[1].position.set(0, 50, 0);
  scene.add(...lights);

  cloudGroup = new THREE.Group();
  createClouds(cloudGroup);
  scene.add(cloudGroup);

  CHUNKS = Array.from({ length: CHUNK_COUNT }).map((_, i) => {
    const chunk = createWorldChunk(-i * CHUNK_SIZE, uTime);
    scene.add(chunk);
    return chunk;
  });

  playerAnchor = new THREE.Group();
  scene.add(playerAnchor);

  const ro = new ResizeObserver(() => {
    if (!container || !renderer) return;
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  ro.observe(container);

  // 1. Update Fog to use the day color
  scene.fog = new THREE.Fog(skyColors.day, 150, 300);

  // 2. Setup Lights
  ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
  sunLight.position.set(0, 50, -50);
  
  // 3. Add the "Headlight" to the camera (stays off during day)
  headLight = new THREE.PointLight(0x00d2ff, 0, 40);
  camera.add(headLight);
  scene.add(camera, ambientLight, sunLight);

  // 4. Create Low-Poly Sun and Moon
  const lowPolyGeo = new THREE.IcosahedronGeometry(10, 1);
  sun = new THREE.Mesh(lowPolyGeo, new THREE.MeshBasicMaterial({ color: 0xffffcc }));
  moon = new THREE.Mesh(lowPolyGeo, new THREE.MeshBasicMaterial({ color: 0x94b0ff }));
  
  // Position them at opposite poles
  sun.position.set(60, 100, -250);
  moon.position.set(60, -100, -250);
  scene.add(sun, moon);
}

async function spawn() {
  const isRare = Math.random() < 0.2; 
  const modelFile = isRare ? "bird_in_a_claw_machine.glb" : "Simple computer.glb";
  
  const source = await getCachedGLTF(modelFile);
  // Call the module function
  const obstacleData = createObstacle(isRare, source, CONFIG.lane);
  
  scene.add(obstacleData.mesh);
  worldObjects = [...worldObjects, obstacleData];
}

function update() {
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  uTime.value += delta;
  if (currentMixer) currentMixer.update(delta);
  if (!isPlaying) return;

  // --- ADD THIS LINE HERE ---
  // This updates the instruction timer and switches the phase
  updateGameFlow({
    get gamePhase() { return gamePhase; },
    set gamePhase(v) { gamePhase = v; },
    get instructionTimer() { return instructionTimer; },
    set instructionTimer(v) { instructionTimer = v; }
  }, delta);

  // If we are still in instructions, stop the rest of the game logic 
  // (like movement and spawning) so the player doesn't die while reading.
  if (gamePhase === "INSTRUCTIONS") return;

  const moveStep = currentSpeed * delta;

  // 1. Environment Controller
  updateEnvironment(uTime.value, scene, { ambientLight, sunLight, headLight }, { sun, moon });

  // 2. World Controller
  moveWorld(CHUNKS, moveStep, CHUNK_SIZE, CHUNK_COUNT);
  animateClouds(cloudGroup, moveStep);

  // 3. Player Physics Controller
  updatePhysics(
    { 
      get lane() { return lane; }, 
      get currX() { return currX; }, set currX(v) { currX = v; },
      get playerY() { return playerY; }, set playerY(v) { playerY = v; },
      get isJumping() { return isJumping; }, set isJumping(v) { isJumping = v; },
      get jumpV() { return jumpV; }, set jumpV(v) { jumpV = v; },
      isDying 
    }, 
    CONFIG, delta, swapCharacter
  );

  // Apply visual positions to the actual 3D objects
  playerAnchor.position.x = currX;
  playerAnchor.position.y = playerY;

  // 4. Obstacle Controller
  worldObjects.forEach(obj => { obj.mesh.position.z += moveStep; });
  worldObjects = handleCollisions(worldObjects, lane, playerY, triggerGameOver);
  worldObjects = worldObjects.filter(obj => {
    const active = obj.mesh.position.z < 25;
    if (!active) scene.remove(obj.mesh);
    return active;
  });

  // 5. Scoring & Spawning Logic
  if (multiplierTimer > 0) {
    multiplierTimer -= delta;
    if (multiplierTimer <= 0) { multiplierTimer = 0; scoreMultiplier = 1; }
  }
  
  score += Math.floor((currentSpeed / 40) * scoreMultiplier);
  if (currentSpeed < CONFIG.MAX_SPEED) currentSpeed += CONFIG.ACCELERATION * delta;

  // 1. Ask the Static Manager if we should spawn
  if (GameManager.shouldSpawn(moveStep)) {
      // 2. Pass 'loader' so the factory can fetch models if needed
      ObstacleFactory.spawnRandom(glbCache, loader, CONFIG.lane).then(obstacle => {
          scene.add(obstacle.mesh);
          worldObjects = [...worldObjects, obstacle];
      });
  }
  // spawnDistanceTracker += moveStep;
  // if (spawnDistanceTracker >= SPAWN_INTERVAL) {
  //   spawn();
  //   spawnDistanceTracker = 0;
  // }
}


function triggerGameOver() {
  isPlaying = false; gameOver = true; isDying = true; hitFlash = true;
  hasSubmitted.set(false); // Allow a new submission for this game over
  loadLeaderboard();    // Refresh board to show latest rankings
  swapCharacter("Falling Back Death.glb", true); 
  setTimeout(() => hitFlash = false, 150);
}

async function startGame() {
  if (!scene) return;
  currentSpeed = CONFIG.START_SPEED;
  // Choose a random target type for this mission
  const types = ["STRAWBERRY", "WATERMELON", "BLUEBERRY"];
  targetType = types[Math.floor(Math.random() * types.length)];
  worldObjects.forEach(obj => scene.remove(obj.mesh));
  targets.length = 0; 
  scorePopups.length = 0;
  worldObjects = [];
  spawnDistanceTracker = 0;
  score = 0; isPlaying = true; gameOver = false; startScreen = false; lives = 5; // Reset lives
  gamePhase = "INSTRUCTIONS"; instructionTimer = 3;
  lane = 0; currX = 0; isJumping = false; jumpV = 0; playerY = 0; isDying = false;
  CHUNKS.forEach((chunk, i) => { chunk.position.z = -i * CHUNK_SIZE; });
  await swapCharacter("Running.glb");
}

const handleKeyDown = (e) => {
  // MVC: Delegate keyboard input to the Controller
  handleInput(e, 
    { 
      isPlaying, 
      isDying, 
      // Use getters/setters so the Controller can actually change the Model
      get lane() { return lane; }, 
      set lane(v) { lane = v; },
      get isJumping() { return isJumping; },
      set isJumping(v) { isJumping = v; },
      get jumpV() { return jumpV; },
      set jumpV(v) { jumpV = v; }
    }, 
    CONFIG, 
    swapCharacter
  );
};

onMount(() => {
  loadLeaderboard();
  window.addEventListener("keydown", handleKeyDown);
  return () => { 
    cancelAnimationFrame(animationFrame); 
    window.removeEventListener("keydown", handleKeyDown);
    if (p5Instance) p5Instance.remove();
    if (renderer) renderer.dispose();
  };
});
</script>

{#if showLanding}
  <LandingPage onStart={handleStart} />
{:else}
  <div id="wrapper" bind:this={container}>
    <!-- The 3D Game World -->
    <canvas bind:this={canvas}></canvas>
    
    <!-- The 2D P5.js Overlay (Hearts, Hammer, Fruit) -->
    <div class="p5-hud" bind:this={p5Container}></div> 
    
    {#if hitFlash} <div class="flash"></div> {/if}

    <!-- TOP-RIGHT LEADERBOARD  -->
    <div class="side-hud">
      <div class="leaderboard-view">
        <h3>TOP RUNNERS</h3>
        <ul>
          {#if $leaderboard.length > 0}
            {#each $leaderboard as entry, i}
              <li>
                <span>{i + 1}. {entry.name}</span> 
                <span>{entry.score}</span>
              </li>
            {/each}
          {:else}
            <li style="opacity: 0.5; justify-content: center;">No scores yet</li>
          {/if}
        </ul>
      </div>
    </div>

    <!-- 2. GAME UI OVERLAY -->
    <div class="ui">
      <!-- Live Score -->
      <div class="score">{score}</div>

      <!-- Game Over Modal -->
      {#if gameOver}
        <div class="modal">
          <h1>GAME OVER</h1>
          <p>Final Score: <strong>{score}</strong></p>
          
          <!-- Only show the save input if they haven't submitted yet -->
          {#if !$hasSubmitted}
            <div class="leaderboard-entry">
              <input 
                type="text" 
                bind:value={$playerName} 
                placeholder="ENTER NAME" 
                maxlength="10" 
              />
              <button class="save-btn" on:click={() => saveScore(score)}>SAVE TO BOARD</button>
            </div>
          {:else}
            <p class="saved-msg">SCORE SAVED!</p>
          {/if}
          
          <button class="retry-btn" on:click={startGame}>PLAY AGAIN</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(body, html) { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #8cd0f8; cursor: none; }
  #wrapper { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; width: 100vw; height: 100vh; }
  canvas { width: 100% !important; height: 100% !important; display: block; }
  .p5-hud { position: absolute; top: 0; left: 0; pointer-events: auto; z-index: 10; width: 100%; height: 100%; }
  .ui { position: absolute; inset: 0; pointer-events: none; color: white; text-align: center; font-family: 'Segoe UI', sans-serif; z-index: 11 }
  .score { font-size: 2.5rem; margin-top: 60px; font-weight: 800; text-shadow: 0 4px 10px rgba(0,0,0,0.2); }
  .modal { pointer-events: auto; background: rgba(255, 255, 255, 0.98); padding: 40px; border-radius: 30px; margin-top: 5vh; color: #1e2b21; display: inline-block; box-shadow: 0 25px 60px rgba(0,0,0,0.15); width: 320px; }
  .leaderboard-entry { margin: 20px 0; }
  input { width: 80%; padding: 12px; border: 2px solid #eee; border-radius: 10px; font-family: inherit; font-weight: bold; text-align: center; margin-bottom: 10px; }
  
  /* New Sidebar Container */
  .side-hud { 
    position: absolute; 
    top: 20px; 
    right: 20px; 
    width: 220px; 
    z-index: 15; 
    pointer-events: none; /* Let clicks pass through to the game if needed */
  }

  /* Updated Leaderboard View */
  .leaderboard-view { 
    background: rgba(255, 255, 255, 0.2); 
    backdrop-filter: blur(10px); 
    border: 1px solid rgba(255,255,255,0.3); 
    border-radius: 15px; 
    padding: 15px; 
    text-align: left; 
    color: white; 
    box-shadow: 0 8px 32px rgba(0,0,0,0.1); 
  }

  /* Ensure buttons and inputs still work */
  input, button {
    pointer-events: auto; 
  }
  .leaderboard-view h3 { 
    margin-top: 0; 
    text-align: center; 
    font-size: 0.8rem; 
    letter-spacing: 2px; 
    color: hsl(308, 100%, 87%); /* Change color to cyan to match your theme */
    text-transform: uppercase;
  }
  
  li { 
    display: flex; 
    justify-content: space-between; 
    padding: 5px 0; 
    border-bottom: 1px solid rgba(255,255,255,0.1); /* Lighter border */
    font-weight: bold; 
    font-size: 0.9rem; 
  }
  ul { list-style: none; padding: 0; margin: 0; }

  button { width: 100%; padding: 15px; border: none; border-radius: 12px; cursor: pointer; font-weight: bold; font-size: 1rem; transition: all 0.2s; }
  .save-btn { background: #ff4ed3; color: white; margin-bottom: 5px; }
  .retry-btn { background: #1e2b21; color: white; margin-top: 10px; }
  button:hover { transform: translateY(-2px); filter: brightness(1.1); }
  
  .flash { position: absolute; inset: 0; background: white; z-index: 20; pointer-events: none; }
</style>