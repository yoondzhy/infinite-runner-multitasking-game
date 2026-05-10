// @ts-nocheck
export const createSketch = (state, texturesRef) => {
  return (p) => {
    // --- PRIVATE UTILITIES ---
    const drawHeart = (x, y, size, active) => {
      const s = size / 5;
      
      // Helper to draw the 8-bit grid shape
      const drawShape = (posX, posY, pixelSize) => {
        p.rect(posX + pixelSize, posY, pixelSize, pixelSize); 
        p.rect(posX + 3 * pixelSize, posY, pixelSize, pixelSize);
        p.rect(posX, posY + pixelSize, 5 * pixelSize, pixelSize);
        p.rect(posX, posY + 2 * pixelSize, 5 * pixelSize, pixelSize);
        p.rect(posX + pixelSize, posY + 3 * pixelSize, 3 * pixelSize, pixelSize);
        p.rect(posX + 2 * pixelSize, posY + 4 * pixelSize, pixelSize, pixelSize);
      };
      p.push();
      p.noStroke();
      // 1. Draw the Outline (Black, slightly offset/larger)
      p.fill(0);
      // We draw it 2 pixels wider in all directions for that thick Minecraft border
      drawShape(x - 2, y - 2, (size + 4) / 5);

      // 2. Draw the Inner Heart
      p.fill(active ? [255, 50, 50] : [60, 60, 60, 180]);
      drawShape(x, y, s);

      // 3. Add a "Highlight" pixel (Minecraft hearts have a little white glint)
      if (active) {
        p.fill(255, 150);
        p.rect(x + s, y + s, s, s);
      }
      p.pop();
    };

    p.setup = async () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      const loadImg = (path) => new Promise(resolve => {
        p.loadImage(`images/${path}`, img => resolve(img), () => resolve(null));
      });

      texturesRef.STRAWBERRY = await loadImg('strawberry.png');
      texturesRef.WATERMELON = await loadImg('watermelon.png');
      texturesRef.BLUEBERRY = await loadImg('blubb.png');
      texturesRef.STAR = await loadImg('star.png');
    };

    p.draw = () => {
      p.clear();
      if (!state.isPlaying) return;

      // 1. Multiplier HUD
      if (state.multiplierTimer > 0) {
        p.push();
        p.fill(255, 215, 0);
        p.textSize(24);
        p.textStyle(p.BOLD);
        p.textAlign(p.RIGHT);
        p.text(`BOOST: ${Math.ceil(state.multiplierTimer)}s`, p.width - 20, 100);
        p.noFill();
        p.stroke(255, 215, 0, 100);
        p.strokeWeight(10);
        p.rect(0, 0, p.width, p.height);
        p.pop();
      }

      // 2. Star Spawning
      if (state.score > 0 && state.score % 10000 < 50 && state.score - state.lastStarScore >= 10000) {
        state.lastStarScore = state.score;
        state.targets.push({
          x: -50, y: p.random(p.height * 0.2, p.height * 0.5),
          type: "STAR", speedX: p.random(6, 9), rot: 0
        });
      }

      // 3. Instruction Phase
      if (state.gamePhase === "INSTRUCTIONS") {
        p.fill(0, 200); p.rect(0, 0, p.width, p.height);
        p.fill(255); p.textAlign(p.CENTER); p.textSize(28);
        p.text(`MISSION: COLLECT`, p.width / 2, p.height / 2 - 100);
        const targetImg = texturesRef[state.targetType];
        if (targetImg) p.image(targetImg, p.width / 2 - 40, p.height / 2 - 60, 80, 80);
        p.fill(0, 255, 200); p.text(state.targetType, p.width / 2, p.height / 2 + 60);
        p.fill(255); p.textSize(80);
        p.text(Math.ceil(state.instructionTimer), p.width / 2, p.height / 2 + 160);
        return;
      }

      // 4. Render Hearts
      Array.from({ length: 5 }).map((_, i) => drawHeart(25 + (i * 60), 25, 45, i < state.lives));

      // 5. Random Target Spawning
      if (p.random(1) < 0.004) {
        const types = ["STRAWBERRY", "WATERMELON", "BLUEBERRY"];
        state.targets.push({
          x: p.random(p.width * 0.2, p.width * 0.8), y: -50,
          type: types[p.floor(p.random(types.length))], speed: p.random(1.5, 3), rot: 0
        });
      }

      // 6. Current Target Box
      p.push();
      p.fill(0, 150); p.rect(10, 80, 140, 140, 15);
      p.fill(255); p.textSize(14); p.textAlign(p.CENTER);
      p.text("CURRENT TARGET",80, 105);
      const boxImg = texturesRef[state.targetType];
      if (boxImg) p.image(boxImg, 40, 120, 70, 70);
      p.fill(0, 255, 200); p.text(state.targetType, 80, 210);
      p.pop();

      // 7. Render/Move Targets
      for (let i = state.targets.length - 1; i >= 0; i--) {
        let t = state.targets[i];
        t.type === "STAR" ? t.x += t.speedX : t.y += t.speed;
        t.rot += 0.02;
        p.push();
        p.translate(t.x, t.y); p.rotate(t.rot);
        const img = texturesRef[t.type];
        if (img) p.image(img, -50, -50, t.type === "STAR" ? 120 : 100, t.type === "STAR" ? 120 : 100);
        p.pop();
        if (t.y > p.height + 50 || t.x > p.width + 50) {
          if (t.type === state.targetType && state.lives > 0) state.lives--;
          state.targets.splice(i, 1);
        }
      }

      // 8. Popups & Hammer
      renderPopups(p, state.scorePopups);
      drawHammer(p);
    };

    const renderPopups = (p, popups) => {
      for (let i = popups.length - 1; i >= 0; i--) {
        let pop = popups[i];
        if (!pop || !pop.val) continue; // SKIP IF DATA IS MISSING
        p.push();
        p.fill(255, 230, 0, pop.opacity);
        p.textSize(32 + (1 - pop.life) * 20);
        p.text(pop.val, pop.x, pop.y);
        p.pop();
        pop.y -= 2; pop.life -= 0.02; pop.opacity = pop.life * 255;
        if (pop.life <= 0) popups.splice(i, 1);
      }
    };

    const drawHammer = (p) => {
      p.push();
      p.translate(p.mouseX, p.mouseY); p.rotate(-0.4);
      p.fill(120, 80, 50); p.rect(-5, 0, 10, 40, 2);
      p.fill(100); p.rect(-20, -10, 40, 20, 4);
      p.pop();
    };

    p.mousePressed = () => {
    // The View (p5) detects the raw click...
    const clickedTarget = state.targets.find(t => p.dist(p.mouseX, p.mouseY, t.x, t.y) < 60);
    
    if (clickedTarget) {
        // ...but the Controller (state.onHit) decides what the rules are.
        state.onHit(clickedTarget);
        // Remove from View list
        state.targets.splice(state.targets.indexOf(clickedTarget), 1);
    }
    };
  };
};