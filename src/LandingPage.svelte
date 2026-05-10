<script>
// @ts-nocheck
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

  export let onStart = () => {};

  let container; 
  let charCanvas;
  let animFrame; // Animation and rendering state
  let charMixer;

  onMount(() => {
    const clock = new THREE.Clock();
    // Alpha: true allows the CSS background-image to show through the canvas
    const charRenderer = new THREE.WebGLRenderer({ 
      canvas: charCanvas, 
      antialias: true, 
      alpha: true 
    });
    const charScene = new THREE.Scene(); //Scene and Camera Configuration
    const charCam = new THREE.PerspectiveCamera(40, charCanvas.clientWidth / charCanvas.clientHeight, 0.1, 200);
    charCam.position.set(0, 3, 13);
    charCam.lookAt(0, 2.5, 0);
    
    // Lighting Setup
    charScene.add(new THREE.AmbientLight(0xffffff, 7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 5, 5);
    charScene.add(dirLight);

    const loader = new GLTFLoader(); //Asset Loading (3D Model & Animation)
    loader.load("3dmodels/hiphop.glb", (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(3.5);
      model.position.y = 0;
      model.position.x = -1;
      charScene.add(model);
      
      if (gltf.animations.length) { // Initialize AnimationMixer if clips are present in the GLB
        charMixer = new THREE.AnimationMixer(model);
        charMixer.clipAction(gltf.animations[0]).play();
      }
    });

    const handleResize = () => { //Responsive Handling
      charRenderer.setSize(charCanvas.clientWidth, charCanvas.clientHeight);
      charCam.aspect = charCanvas.clientWidth / charCanvas.clientHeight;
      charCam.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    function loop() { //Component Animation Loop
      animFrame = requestAnimationFrame(loop);
      const delta = clock.getDelta();
      charRenderer.render(charScene, charCam);
      if (charMixer) charMixer.update(delta);
    }
    loop();

    return () => { //Cleanup & Resource Disposal
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', handleResize);
    };
  });
</script>

<div id="landing-ui" bind:this={container}>
  <div class="content-wrapper">
    <div class="left-section">
      <div class="spacer"></div>
      
      <img src="images/overload_trans.png" alt="Overload Logo" class="game-logo" />

      <p class="game-description">
        Collect targets to maintain focus while navigating through obstacles. Hearts are only for missed or wrong targets,
        it won't save you from crashing into obstacles. The higher the score, you might get reward boosters for setting records!
        Rapid task-switching trains mental flexibility, attention, and working memory.
      </p>

      <button class="start-btn" on:click={onStart}>
        START RUN
      </button>
    </div>

    <div class="right-section">
      <canvas bind:this={charCanvas}></canvas>
    </div>
  </div>
</div>

<style>
  .game-description {
    max-width: 600px; /* Widened slightly for better monospaced flow */
    color: #fff82e;
    /* Retro/Computer game font stack */
    font-family: 'Courier New', Courier, monospace; 
    font-weight: 900;
    font-size: 1.1rem;
    line-height: 1.4;
    text-align: center;
    margin-bottom: 50px;
    padding: 0; /* Removed padding since background is gone */
    background: none; /* Background removed */
    backdrop-filter: none;
    border: none;
    
    /* Strong black outline to keep it readable against the background */
    text-shadow: 
      -2px -2px 0 #0c430c,  
       2px -2px 0 #0b5b26,
      -2px  2px 0 #0b5b26,
       2px  2px 0 #0b5b26,
       0px  4px 10px rgba(0,0,0,1);
       
    text-transform: uppercase; /* Makes it feel more like a retro game UI */
    animation: fadeIn 1s ease-out;
  }

  .left-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center; 
    /* Adjust padding to balance the logo, text, and button */
    padding: 0 0 10vh 5vw; 
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Ensure center alignment for the description in the left section */
  .left-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center; 
    padding: 0 0 15vh 10vw; /* Reduced padding slightly to fit the text */
  }

  #landing-ui {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    background-image: url('/infinite-runner-multitasking-game/images/bggame.png');
    background-size: cover;
    background-position: center;
    display: flex;
    overflow: hidden;
    cursor: auto; 
  }

  .content-wrapper {
    display: flex;
    width: 100%;
    height: 100%;
    z-index: 10;
  }

  /* LOGO STYLING & ANIMATION */
  .game-logo {
    width: 700px; /* Adjust size as needed */
    max-width: 80%;
    margin-bottom: 50px;
    filter: drop-shadow(0 10px 15px rgba(0,0,0,0.3));
    animation: wiggle 3s ease-in-out infinite;
    user-select: none;
    pointer-events: none;
  }

  @keyframes wiggle {
    0%, 100% { transform: rotate(-2deg) translateY(-10px); }
    50% { transform: rotate(2deg) translateY(-10px); }
  }

  .right-section {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
  }

  .right-section canvas {
    width: 100%;
    height: 100%;
  }

  .start-btn {
    padding: 20px 80px;
    background: #f7d94c;
    color: #0d4d45;
    font-size: 2.2rem;
    font-weight: 900;
    border: none;
    border-bottom: 8px solid #b89a00;
    border-radius: 60px;
    cursor: pointer !important;
    transition: transform 0.1s, background 0.2s;
    box-shadow: 0 10px 20px rgba(0,0,0,0.2);
  }

  .start-btn:hover { background: #ffe45e; }
  .start-btn:active { transform: translateY(4px); border-bottom-width: 2px; }

  .spacer { flex-grow: 1; }
</style>