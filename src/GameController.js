// @ts-nocheck
export function handleInput(event, state, config, swapFn) {
  if (!state.isPlaying || state.isDying) return;

  const actions = {
    ArrowLeft: () => state.lane > -2 && state.lane--,
    a: () => state.lane > -2 && state.lane--,
    A: () => state.lane > -2 && state.lane--,
    ArrowRight: () => state.lane < 2 && state.lane++,
    d: () => state.lane < 2 && state.lane++,
    D: () => state.lane < 2 && state.lane++,
    " ": () => !state.isJumping && triggerJump(state, config, swapFn),
    w: () => !state.isJumping && triggerJump(state, config, swapFn),
    W: () => !state.isJumping && triggerJump(state, config, swapFn),
    ArrowUp: () => !state.isJumping && triggerJump(state, config, swapFn)
  };

  actions[event.key]?.();
}

function triggerJump(state, config, swapFn) {
  // This now triggers the 'set' in App.svelte
  state.isJumping = true;
  state.jumpV = config.jump;
  swapFn("Jump.glb");
}

export function processInteraction(target, state, multiplier, duration) {
  if (target.type === state.targetType) {
    const gain = 100 * multiplier;
    state.score += gain;
    state.scorePopups.push({ x: target.x, y: target.y, opacity: 255, life: 1, val: `+${gain}` });
  } else if (target.type === "STAR") {
    state.onActivateBoost(2, duration); // Ask the app to set the boost
    state.scorePopups.push({ x: target.x, y: target.y, opacity: 255, life: 1, val: "X2 BOOST!" });
  } else {
    if (state.lives > 0) state.lives--;
  }
}

export function updatePhysics(state, config, delta, swapFn) {
  // 1. Smooth Lane Shifting
  state.currX += (state.lane * config.lane - state.currX) * 0.18;
  
  // 2. Jump/Gravity Logic
  if (state.isJumping) {
    state.jumpV -= config.grav;
    state.playerY += state.jumpV;
    
    if (state.playerY <= 0) { 
      state.playerY = 0; 
      state.isJumping = false; 
      if (!state.isDying) swapFn("Running.glb"); 
    }
  }
}

export function updateGameFlow(state, delta) {
  if (state.gamePhase === "INSTRUCTIONS") {
    state.instructionTimer -= delta;
    if (state.instructionTimer <= 0) {
      state.gamePhase = "PLAYING";
    }
  }
}