// @ts-nocheck
import { createObstacle } from './obstacles.js';

export class ObstacleFactory {
  static async spawnRandom(glbCache, loader, laneWidth) {
    const isRare = Math.random() < 0.2;
    const modelFile = isRare ? "bird_in_a_claw_machine.glb" : "Simple computer.glb";
    const fullPath = `3dmodels/${modelFile}`;
    // Check if we have it, if not, load it 
    if (!glbCache.has(fullPath)) {
        glbCache.set(fullPath, await loader.loadAsync(fullPath));
    }
    const source = glbCache.get(fullPath);
    return createObstacle(isRare, source, laneWidth);
  }
}