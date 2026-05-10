<script>
// @ts-nocheck
import LandingPage from './LandingPage.svelte';
import { onMount, tick } from "svelte";
import * as THREE from "three";
import p5 from "p5";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
  
import { loadLeaderboard, saveScore, playerName, leaderboard , hasSubmitted } from './leaderboard.js';

let showLanding = true;
let lastTime = performance.now();

async function handleStart() {
  showLanding = false;
  // Wait for Svelte to render the #wrapper and canvas
  await tick();
  
  init();
  p5Instance = new p5(sketch, p5Container);
  lastTime = performance.now();// Ensure lastTime is reset to "now" so delta doesn't jump
  // Start the game logic
  startGame();
  
  // Start the render loop
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
let skyColors = {
  day: new THREE.Color(0x87CEFA),
  night: new THREE.Color(0x02050a)
};
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

const sketch = (p) => {
  // --- FOOLPROOF IMAGE LOADER ---
  p.setup = async () => {
    const w = container?.clientWidth || p.windowWidth;
    const h = container?.clientHeight || p.windowHeight;
    p.createCanvas(w, h);

    const loadImg = (path) => new Promise(resolve => {
      p.loadImage(path, img => resolve(img), () => resolve(null));
    });

    textures.STRAWBERRY = await loadImg('strawberry.png');
    textures.WATERMELON = await loadImg('watermelon.png');
    textures.BLUEBERRY = await loadImg('blubb.png');
    textures.STAR = await loadImg('star.png');
  };

  const drawHeart = (x, y, size, active) => {
      p.push();
      p.noStroke();
      // Use red if active, grey if dead
      p.fill(active ? [255, 50, 50] : [100, 100, 100, 150]);
      const s = size / 5;
      p.rect(x + s, y, s, s); p.rect(x + 3 * s, y, s, s);
      p.rect(x, y + s, 5 * s, s);
      p.rect(x, y + 2 * s, 5 * s, s);
      p.rect(x + s, y + 3 * s, 3 * s, s);
      p.rect(x + 2 * s, y + 4 * s, s, s);
      p.pop();
    };

  p.draw = () => {
    p.clear();
    if (!isPlaying) return;

    // --- MULTIPLIER HUD ---
    if (multiplierTimer > 0) {
      p.push();
      p.fill(255, 215, 0); // Golden color
      p.textSize(24);
      p.textStyle(p.BOLD);
      p.textAlign(p.RIGHT);
      p.text(`BOOST: ${Math.ceil(multiplierTimer)}s`, p.width - 20, 100);
      p.pop();
      
      // Optional: Add a subtle golden border to the screen
      p.noFill();
      p.stroke(255, 215, 0, 100);
      p.strokeWeight(10);
      p.rect(0, 0, p.width, p.height);
    }

    // Inside p.draw, near your other spawning logic
    if (score > 0 && score % 10000 < 50 && score - lastStarScore >= 10000) {
      lastStarScore = score;
      targets.push({
        x: -50, // Start off-screen left
        y: p.random(p.height * 0.2, p.height * 0.5), // Random vertical height
        type: "STAR",
        speedX: p.random(6, 9), // Fly fast horizontally
        speedY: 0,
        rot: 0
      });
    }

    if (gamePhase === "INSTRUCTIONS") {
      p.fill(0, 200); // Darken background
      p.rect(0, 0, p.width, p.height);
      
      p.fill(255);
      p.textAlign(p.CENTER);
      p.textFont('Segoe UI');
      p.textStyle(p.BOLD);
      
      // The Mission Text
      p.textSize(28);
      p.text(`MISSION: COLLECT`, p.width / 2, p.height / 2 - 100);
      
      // Draw the target icon to collect
      const targetImg = textures[targetType];
      if (targetImg) {
        p.imageMode(p.CENTER);
        p.image(targetImg, p.width / 2, p.height / 2 - 20, 80, 80);
      }
      
      p.textSize(32);
      p.fill(0, 255, 200); // Cyan color for the target name
      p.text(targetType, p.width / 2, p.height / 2 + 60);
      
      // Countdown
      p.fill(255);
      p.textSize(80);
      p.text(Math.ceil(instructionTimer), p.width / 2, p.height / 2 + 160);
      return;
    }
    // --- RENDER HEARTS ---
    for (let i = 0; i < 5; i++) { // Always run 5 times
      drawHeart(20 + (i * 35), 20, 25, i < lives);
    }


    if (p.random(1) < 0.004) {
      const types = ["STRAWBERRY", "WATERMELON", "BLUEBERRY"];
      targets.push({
        x: p.random(p.width * 0.2, p.width * 0.8),
        y: -50,
        type: types[p.floor(p.random(types.length))],
        speed: p.random(1.5, 3),
        rot: 0
      });
    }

    // Inside p.draw(), top-left corner
    p.push();
    p.fill(0, 150); // Translucent dark background
    p.rect(10, 60, 120, 140, 15); 
    p.fill(255);
    p.textSize(14);
    p.textAlign(p.CENTER);
    p.text("CURRENT TARGET", 70, 85);

    const targetImg = textures[targetType];
    if (targetImg) {
      p.image(targetImg, 70, 135, 60, 60);
    }
    p.fill(0, 255, 200);
    p.text(targetType, 70, 185);
    p.pop();
    
    // --- RENDER IMAGES ---
    for (let i = targets.length - 1; i >= 0; i--) {
      let t = targets[i];
      if (t.type === "STAR") {
        t.x += t.speedX; // Move horizontal
      } else {
        t.y += t.speed;  // Move vertical
      }

      t.rot += 0.02;

      p.push();
      p.translate(t.x, t.y);
      p.rotate(t.rot);
      p.imageMode(p.CENTER);

      // Check if the texture exists before trying to draw it
      const img = textures[t.type];
      if (img) {
        // Draw the image. Scale it to 40x40 pixels (adjust as needed)
        const size = t.type === "STAR" ? 120 : 100;
        p.image(img, 0, 0, size, size);
      } 
      p.pop();

      if (t.y > p.height + 50 || t.x > p.width + 50) {
        // If the one we missed was the target, lose a life
        if (t.type === targetType && lives > 0) {
          lives--;
        }
        targets.splice(i, 1);
      }
    }

    // --- RENDER FLOATING SCORE POPUPS ---
    for (let i = scorePopups.length - 1; i >= 0; i--) {
      let pop = scorePopups[i];
      if (!pop.val) continue; // Safety check: skip if value is missing
      
      p.push();
      p.textAlign(p.CENTER);
      p.textStyle(p.BOLD);
      p.textSize(32 + (1 - pop.life) * 20); // Gets bigger as it rises
      
      // Yellow color with fading alpha
      p.fill(255, 230, 0, pop.opacity);
      p.text(pop.val, pop.x, pop.y);
      p.pop();

      // Animate: Move up and fade out
      pop.y -= 2; 
      pop.life -= 0.02;
      pop.opacity = pop.life * 255;

      // Remove when faded
      if (pop.life <= 0) {
        scorePopups.splice(i, 1);
      }
    }

    // --- 2D HAMMER ---
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
      if (p.dist(p.mouseX, p.mouseY, t.x, t.y) < 60) {
        if (t.type === targetType) {
          // Apply multiplier to normal hits
          const gain = 100 * scoreMultiplier;
          score += gain;
          scorePopups.push({ x: t.x, y: t.y, opacity: 255, life: 1, val: `+${gain}` });
        } else if(t.type === "STAR") {
          // Trigger the 2x Boost
          scoreMultiplier = 2;
          multiplierTimer = BOOST_DURATION;
          scorePopups.push({ x: t.x, y: t.y, opacity: 255, life: 1, val: "X2 BOOST!" });
        }else {
          if (lives > 0) lives--;
        }
        targets.splice(i, 1);
        break;
      }
    }
  };
};

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


const createClouds = (group) => {
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const thickness = 2; 
  for (let i = 0; i < 20; i++) {
    const w = 10 + Math.random() * 20;
    const d = 10 + Math.random() * 20;
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), cloudMaterial);
    const y = 30 + Math.random() * 25;
    cloud.position.set((Math.random() - 0.5) * 280, y, (Math.random() - 0.5) * 300);
    group.add(cloud);
  }
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
    const chunk = createWorldChunk(-i * CHUNK_SIZE);
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
const l = Math.floor(Math.random() * 5) - 2;
  const isRare = Math.random() < 0.2; 
  const modelFile = isRare ? "bird_in_a_claw_machine.glb" : "Simple computer.glb";
  
  const source = await getCachedGLTF(modelFile);
  const model = cloneSkeleton(source.scene);
  const pivot = new THREE.Group();
  
  pivot.position.set(l * CONFIG.lane, 0, -130);

  if (isRare) {
    model.position.set(0, 3.0, 0); 
    model.rotation.y = 0; 
    model.scale.setScalar(0.6); 
  } else {
    model.position.set(0, 0.6, 0); 
    model.rotation.y = Math.PI; 
    model.scale.setScalar(5.5);
  }
  
  pivot.add(model);
  scene.add(pivot);
  
  // ADD THIS: Save the type so the collision logic knows it's tall
  worldObjects = [...worldObjects, { mesh: pivot, lane: l, isTall: isRare }];
}


function update() {
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;

  uTime.value += delta;
  if (currentMixer) currentMixer.update(delta);
  if (!isPlaying) return;

  // --- MULTIPLIER COUNTDOWN ---
  if (multiplierTimer > 0) {
    multiplierTimer -= delta;
    if (multiplierTimer <= 0) {
      multiplierTimer = 0;
      scoreMultiplier = 1;
    }
  }

  // --- DAY/NIGHT CYCLE LOGIC START ---
  
  // Calculate alpha (0 = Day, 1 = Night) using a sine wave based on score
  // let cycleProgress = (score % (CONFIG.CYCLE_INTERVAL * 2)) / (CONFIG.CYCLE_INTERVAL * 2); 
  let cycleProgress = (uTime.value % 60) / 60;
  let nightAlpha = Math.pow(Math.sin(cycleProgress * Math.PI), 2); 

  // Interpolate Background and Fog colors
  const currentSky = skyColors.day.clone().lerp(skyColors.night, nightAlpha);
  scene.background.copy(currentSky);
  scene.fog.color.copy(currentSky);
  
  // Adjust Light Intensities
  ambientLight.intensity = THREE.MathUtils.lerp(1.5, 0.2, nightAlpha);
  sunLight.intensity = THREE.MathUtils.lerp(1.0, 0.1, nightAlpha);
  headLight.intensity = THREE.MathUtils.lerp(0, 2.5, nightAlpha); 

  // Move Sun and Moon (Sun goes down, Moon comes up)
  sun.position.y = THREE.MathUtils.lerp(100, -100, nightAlpha);
  moon.position.y = THREE.MathUtils.lerp(-100, 100, nightAlpha);

  // --- DAY/NIGHT CYCLE LOGIC END ---

  if (gamePhase === "INSTRUCTIONS") {
    instructionTimer -= delta;
    if (instructionTimer <= 0) gamePhase = "PLAYING";
    return;
  }

  if (currentSpeed < CONFIG.MAX_SPEED) {
    currentSpeed += CONFIG.ACCELERATION * delta;
  }

  const moveStep = currentSpeed * delta;
  // --- BOOSTED DISTANCE SCORE ---
  // We apply the multiplier to the floor calculation
  score += Math.floor((currentSpeed / 40) * scoreMultiplier);

  

  if (cloudGroup) {
    // Moving at 40% speed (moveStep * 0.4) creates a nice parallax depth
    cloudGroup.children.forEach(cloud => {
      cloud.position.z += moveStep * 0.4; 

      // Reset cloud position if it goes too far behind the camera
      if (cloud.position.z > 50) {
        cloud.position.z = -250;
        cloud.position.x = (Math.random() - 0.5) * 280; // Randomize X again for variety
      }
    });
  }

  if (lives <= 0) triggerGameOver();

  CHUNKS.forEach(chunk => {
    chunk.position.z += moveStep;
    if (chunk.position.z > CHUNK_SIZE) chunk.position.z -= CHUNK_SIZE * CHUNK_COUNT;
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

    // Collision detection
    const isInLane = obj.lane === lane;
    const isHitZ = Math.abs(obj.mesh.position.z) < 1.5;
    
    // NEW LOGIC: If it's a tall object, playerY doesn't matter. 
    // If it's a short object (computer), you only hit if playerY < 1.5.
    const isHitHeight = obj.isTall || playerY < 1.5;

    if (isHitZ && isInLane && isHitHeight) {
      triggerGameOver();
    }
    return obj;
  }).filter(obj => {
    if (!obj) return false;
    const active = obj.mesh.position.z < 25;
    if (!active) scene.remove(obj.mesh);
    return active;
  });

  // Normal Obstacle Spawning
  spawnDistanceTracker += moveStep;
  if (spawnDistanceTracker >= SPAWN_INTERVAL) {
    spawn();
    spawnDistanceTracker = 0;
  
  }
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
  worldObjects = [];
  targets = []; scorePopups = [];
  spawnDistanceTracker = 0;
  score = 0; isPlaying = true; gameOver = false; startScreen = false; lives = 5; // Reset lives
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
    " ": () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jump.glb")),
    ArrowUp: () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jump.glb")),
    w: () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jump.glb")),
    W: () => !isJumping && (isJumping = true, jumpV = CONFIG.jump, swapCharacter("Jump.glb"))
  };
  actions[e.key]?.();
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