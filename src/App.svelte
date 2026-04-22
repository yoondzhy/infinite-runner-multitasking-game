<script>
//@ts-nocheck - to stop annoying red lines of typescript check

import { onMount, onDestroy } from "svelte";
//onMount - do this the second the component appears on screen
//onDestroy - clean up after losing 
import * as THREE from "three";

//config for physics
const CONFIG = {
    lane: 2.5, //distance between the lanes
    jump: 0.35, //jump hight
    grav: 0.015, //how fast to land after jump
    speed: 0.3 //how fast world is moving towards us
    //typically in infinite runner games the environment is moving, not the player as it may seem
}; 

//variables to track the current state of the game
let score = 0;
let isPlaying = false;
let gameOver = false;
let startScreen = true;

//player position variables
let lane = 0;       //target lane (-2 to 2 for 5 lanes)
let currX = 0;      //actual X position used for smooth transition
let isJumping = false;
let jumpV = 0;      //Jump velocity
let playerY = 0;    //height off the ground

//making the scene
let container, canvas, scene, camera, renderer, player, floor;
let worldObjects = [];
let resizeObserver;

function init(){
    // Creating the universe
    scene = new THREE.Scene();

    //Setup the field of view, aspect ration, near plane, far plane
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 5, 10); //put the camera from the back of the player
    camera.lookAt(0, 0, -5);

    renderer = new THREE.WebGLRenderer({canvas, antialias: true}); //antialias makes edges smooth
    renderer.setPixelRatio(window.devicePixelRatio);

    //adding lights to the scene
    scene.add(new THREE.AmbientLight(0xffffff, 0.8)); //soft general light
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(5, 10, 7); //light from the side
    scene.add(sun);

    //build the ground
    const floorGeo = new THREE.PlaneGeometry(100, 2000);
    floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
    floor.rotation.x = -Math.PI /2; //so it is horizontal plane
    scene.add(floor);

    //to prevent game ratio from looking stretched when you resize the window
    resizeObserver = new ResizeObserver(()=>{
        const {width, height} = container.getBoundingClientRect();
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);
}

function update() {
    if(!isPlaying || gameOver) return; //if paused or lost, do nothing
    score++; //points for surviving longer

    //for smooth movement
    //move 15% of the way every frame to switch to new lane 
    currX += (lane * CONFIG.lane - currX) * 0.15;
    if (player) player.position.x = currX;

    //Jumping math
    if (isJumping) {
        jumpV -= CONFIG.grav; //gravity pulls velocity down
        playerY += jumpV; //Velocity moves the player
        if (playerY <= 0){ //hit the ground
            playerY = 0;
            isJumping = false;
        }
        if(player) player.position.y = playerY;
    }
     
    //obstacle movement & collision
    worldObjects = worldObjects
    .map(obj => {
        //move
        obj.mesh.position.z += CONFIG.speed;

        //detect collision
        if ( //to see if we are close to the object
            Math.abs(obj.mesh.position.z) < 0.8 &&
            obj.lane === lane &&
            playerY < 1
        ) {
            isPlaying = false;
            gameOver = true;
        }
        return obj;
    })
    .filter(obj => {
        //delete obstacles behind us
        const keep = obj.mesh.position.z <= 15;
        if(!keep) scene.remove(obj.mesh);
        return keep;
    });
    // spawn new obstacles every 30 frames
    if (score % 30 === 0) spawn();
}

function spawn(){
    // choose a random lane btw -2 and 2
    const l = Math.floor(Math.random() * 5) - 2;
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.5, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x00fff2 })
    );
    mesh.position.set(l * CONFIG.lane, 0.75, -100); //start far
    scene.add(mesh);
    worldObjects.push({ mesh, lane: l});
}

function startGame(){
    //clear old obstacles
    worldObjects.map(obj => scene.remove(obj.mesh));
    worldObjects = [];

    //creating the player CUBE for now
    if (player) scene.remove(player);
    player = new THREE.Group();
    player.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff })));
    scene.add(player);

    //Resey all variables
    score = 0; lane = 0; playerY = 0; currX = 0; isJumping = false;
    startScreen = false; gameOver = false; isPlaying = true;
}

onMount(() => {
    init(); //build the world

    //the loop of rendering, updating, repeating
    const loop = () => {
        requestAnimationFrame(loop);
        update();
        renderer.render(scene, camera);
    };
    loop();

    //listening to keys
    window.addEventListener("keydown", (e) => {
        if(!isPlaying) return;
        if (e.key === "ArrowLeft" && lane > -2) lane--;
        if (e.key === "ArrowRight" && lane < 2) lane ++;
        if ((e.key === " " || e.key === "ArrowUp") && !isJumping) {
            isJumping = true;
            jumpV = CONFIG.jump;
        }
    });
});

onDestroy(() => resizeObserver?.disconnect()); //disconnect resizeobserver so it doesn;t leak memory adn cpu

</script>

<style>
  /* Make the game full screen */
  :global(body, html) { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
  #wrapper { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  canvas { width: 100% !important; height: 100% !important; display: block; }
  
  /* The UI Overlay */
  .ui { position: absolute; inset: 0; pointer-events: none; color: white; text-align: center; font-family: sans-serif; }
  .modal { pointer-events: auto; background: rgba(0,0,0,0.9); padding: 40px; border-radius: 20px; margin-top: 20vh;}
  button { padding: 15px 40px; background: #00fff2; border: none; cursor: pointer; font-weight: bold; }
</style>

<div id="wrapper" bind:this={container}>
  <canvas bind:this={canvas}></canvas>

  <div class="ui">
    <div style="font-size: 2rem; margin-top: 20px;">{score}</div>
    
    {#if startScreen || gameOver}
      <div class="modal">
        <h1>{gameOver ? 'GAME OVER' : 'CUBE RUNNER'}</h1>
        <p>{gameOver ? 'Final Score: ' + score : 'Arrows to Move • Space to Jump'}</p>
        <button on:click={startGame}>{gameOver ? 'RETRY' : 'START'}</button>
      </div>
    {/if}
  </div>
</div>
