<script>
// @ts-nocheck
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

  export let onStart = () => {};

  let container; 
  let charCanvas;
  let animFrame;
  let charMixer;

  onMount(() => {
    const clock = new THREE.Clock();

    const charRenderer = new THREE.WebGLRenderer({ 
      canvas: charCanvas, 
      antialias: true, 
      alpha: true 
    });
    const charScene = new THREE.Scene();
    const charCam = new THREE.PerspectiveCamera(40, charCanvas.clientWidth / charCanvas.clientHeight, 0.1, 200);
    
    charCam.position.set(0, 3, 13);
    charCam.lookAt(0, 2.5, 0);
    
    charScene.add(new THREE.AmbientLight(0xffffff, 7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 5, 5);
    charScene.add(dirLight);

    const loader = new GLTFLoader();
    loader.load("3dmodels/hiphop.glb", (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(3.5);
      model.position.y = 0;
      model.position.x = -1;
      charScene.add(model);
      
      if (gltf.animations.length) {
        charMixer = new THREE.AnimationMixer(model);
        charMixer.clipAction(gltf.animations[0]).play();
      }
    });

    const handleResize = () => {
      charRenderer.setSize(charCanvas.clientWidth, charCanvas.clientHeight);
      charCam.aspect = charCanvas.clientWidth / charCanvas.clientHeight;
      charCam.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    function loop() {
      animFrame = requestAnimationFrame(loop);
      const delta = clock.getDelta();
      charRenderer.render(charScene, charCam);
      if (charMixer) charMixer.update(delta);
    }
    loop();

    return () => {
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
  #landing-ui {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    background-image: url('images/bggame.png');
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

  .left-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center; /* Changed to center to align logo and button */
    padding: 0 0 25vh 10vw; 
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