<script>
//@ts-nocheck
import { onMount, onDestroy } from "svelte";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const CONFIG = {
    lane: 2.5,
    jump: 0.35,
    grav: 0.015,
    speed: 0.3
};

// UI State
let score = 0, isPlaying = false, gameOver = false, startScreen = true;
let hitFlash = false;

// Physics/Logic State
let lane = 0, currX = 0, isJumping = false, jumpV = 0, playerY = 0;
let isDying = false;
let shake = 0;
let fade = 1;

let container, canvas, scene, camera, renderer;
let worldObjects = [];
let resizeObserver;

// Character Refs
let playerGroup, mixer, currentAction, animations = [];
let clock = new THREE.Clock();

function playAnimation(name, loop = true) {
    if (!mixer || !animations.length) return;
    const clip = animations.find(a => a.name === name);
    if (!clip) return;

    const newAction = mixer.clipAction(clip);
    if (currentAction === newAction) return;

    if (currentAction) currentAction.fadeOut(0.2);

    newAction.reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .fadeIn(0.2)
        .play();

    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    newAction.clampWhenFinished = !loop;
    currentAction = newAction;
}

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, -5);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0x00FFD1, 1.2);
    sun.position.set(5, 10, 7);
    scene.add(sun);

    const floorGeo = new THREE.PlaneGeometry(100, 2000);
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.5 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const loader = new GLTFLoader();
    // Using the RobotExpressive model from your logic reference
    loader.load('https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb', (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.4, 0.4, 0.4);
        model.rotation.y = Math.PI;

        playerGroup = new THREE.Group();
        playerGroup.add(model);
        scene.add(playerGroup);

        animations = gltf.animations;
        mixer = new THREE.AnimationMixer(model);
        playAnimation('Running');
    });

    resizeObserver = new ResizeObserver(() => {
        const { width, height } = container.getBoundingClientRect();
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);
}

function update() {
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

    // 1. Camera Shake Logic
    if (shake > 0) {
        shake -= 0.05;
        camera.position.x = (Math.random() - 0.5) * shake;
        camera.position.y = 5 + (Math.random() - 0.5) * shake;
    } else {
        camera.position.x = 0;
        camera.position.y = 5;
    }

    // 2. Death Fade Logic
    if (isDying && fade > 0) {
        fade -= 0.005;
        playerGroup?.traverse((child) => {
            if (child.isMesh) {
                child.material.transparent = true;
                child.material.opacity = fade;
            }
        });
    }

    // Stop physics if not playing or dying
    if (!isPlaying || isDying || gameOver) return;

    score++;

    // Smooth movement
    currX += (lane * CONFIG.lane - currX) * 0.15;
    if (playerGroup) playerGroup.position.x = currX;

    // Jump Physics
    if (isJumping) {
        jumpV -= CONFIG.grav;
        playerY += jumpV;
        if (playerY <= 0) {
            playerY = 0;
            isJumping = false;
        }
        if (playerGroup) playerGroup.position.y = playerY;
    }

    // Obstacles & Collision
    worldObjects = worldObjects.map(obj => {
        obj.mesh.position.z += CONFIG.speed;

        if (Math.abs(obj.mesh.position.z) < 0.8 && obj.lane === lane && playerY < 1) {
            // --- TRIGGER DEATH SEQUENCE ---
            isDying = true;
            shake = 0.5;
            hitFlash = true;
            playAnimation('Death', false);
            
            setTimeout(() => { hitFlash = false; }, 150);

            setTimeout(() => {
                isPlaying = false;
                gameOver = true;
            }, 3000);
        }
        return obj;
    }).filter(obj => {
        const keep = obj.mesh.position.z <= 15;
        if (!keep) scene.remove(obj.mesh);
        return keep;
    });

    if (score % 30 === 0) spawn();
}

function spawn() {
    const l = Math.floor(Math.random() * 5) - 2;
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.MeshStandardMaterial({ 
            color: 0xFF0055, 
            emissive: 0xFF0055, 
            emissiveIntensity: 0.5 
        })
    );
    mesh.position.set(l * CONFIG.lane, 0.75, -100);
    scene.add(mesh);
    worldObjects.push({ mesh, lane: l });
}

function startGame() {
    worldObjects.forEach(obj => scene.remove(obj.mesh));
    worldObjects = [];

    score = 0; lane = 0; playerY = 0; currX = 0;
    isJumping = false; isDying = false; gameOver = false;
    fade = 1; shake = 0; startScreen = false; isPlaying = true;

    if (playerGroup) {
        playerGroup.position.set(0, 0, 0);
        playerGroup.traverse(child => {
            if (child.isMesh) child.material.opacity = 1;
        });
        playAnimation('Running');
    }
}

onMount(() => {
    init();
    const loop = () => {
        requestAnimationFrame(loop);
        update();
        renderer.render(scene, camera);
    };
    loop();

    window.addEventListener("keydown", (e) => {
        if (!isPlaying || isDying) return;
        if (e.key === "ArrowLeft" && lane > -2) lane--;
        if (e.key === "ArrowRight" && lane < 2) lane++;
        if ((e.key === " " || e.key === "ArrowUp") && !isJumping) {
            isJumping = true;
            jumpV = CONFIG.jump;
            playAnimation('Jump', false);
            // Switch back to running after jump time (approx 800ms)
            setTimeout(() => { if(!isDying) playAnimation('Running'); }, 800);
        }
    });
});

onDestroy(() => resizeObserver?.disconnect());
</script>

<style>
  :global(body, html) { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #050505; }
  #wrapper { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  canvas { width: 100% !important; height: 100% !important; display: block; }
  
  .flash { position: absolute; inset: 0; background: white; z-index: 100; pointer-events: none; }

  .ui { position: absolute; inset: 0; pointer-events: none; color: white; text-align: center; font-family: sans-serif; z-index: 50; }
  
  .modal { 
    pointer-events: auto; 
    background: rgba(0,0,0,0.95); 
    padding: 60px; 
    border: 1px solid #FF0055; 
    box-shadow: 0 0 50px rgba(255, 0, 85, 0.2);
    margin-top: 10vh;
  }

  .score-hud { font-size: 5rem; font-weight: 900; color: #00FFD1; margin-top: 20px; font-style: italic; }

  button { 
    padding: 20px 60px; 
    background: #FF0055; 
    border: none; 
    cursor: pointer; 
    font-weight: 900; 
    color: white; 
    text-transform: uppercase; 
    font-style: italic;
    font-size: 1.5rem;
  }
</style>

<div id="wrapper" bind:this={container}>
  <canvas bind:this={canvas}></canvas>

  {#if hitFlash}
    <div class="flash"></div>
  {/if}

  <div class="ui">
    {#if isPlaying && !gameOver}
        <div class="score-hud">{score}</div>
    {/if}
    
    {#if startScreen || gameOver}
      <div class="modal">
        <h1 style="font-size: 4rem; font-style: italic; font-weight: 900;">
            {gameOver ? 'SYSTEM FAILURE' : 'CYBER RUN'}
        </h1>
        <p style="letter-spacing: 5px; opacity: 0.6; margin-bottom: 40px;">
            {gameOver ? 'FINAL SCORE: ' + score : 'NEURAL LINK READY'}
        </p>
        <button on:click={startGame}>{gameOver ? 'RE-INITIATE' : 'START SIMULATION'}</button>
      </div>
    {/if}
  </div>
</div>