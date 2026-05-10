// @ts-nocheck
export class GameManager {
  static SPAWN_INTERVAL = 40;
  static currentDistance = 0;

  static shouldSpawn(moveStep) {
    this.currentDistance += moveStep;
    if (this.currentDistance >= this.SPAWN_INTERVAL) {
      this.currentDistance = 0;
      return true;
    }
    return false;
  }
  
  // Example of a static utility for difficulty scaling
  static calculateSpeed(currentSpeed, acceleration, delta, maxSpeed) {
    if (currentSpeed < maxSpeed) {
      return currentSpeed + (acceleration * delta);
    }
    return currentSpeed;
  }
}