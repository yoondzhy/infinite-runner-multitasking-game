// @ts-nocheck
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export function createObstacle(isRare, source, laneWidth) {
  const model = cloneSkeleton(source.scene);
  const pivot = new THREE.Group();
  const l = Math.floor(Math.random() * 5) - 2;
  
  pivot.position.set(l * laneWidth, 0, -130);

  if (isRare) {
    // Claw Machine Settings
    model.position.set(0, 3.0, 0); 
    model.rotation.y = 0; 
    model.scale.setScalar(0.6); 
  } else {
    // Computer Settings
    model.position.set(0, 0.6, 0); 
    model.rotation.y = Math.PI; 
    model.scale.setScalar(5.5);
  }
  
  pivot.add(model);
  
  return {
    mesh: pivot,
    lane: l,
    isTall: isRare
  };
}

export function handleCollisions(worldObjects, playerLane, playerY, onCollision) {
  return worldObjects.map(obj => {
    // We assume movement is handled in the main loop for sync, 
    // but collision logic is centralized here.
    const isInLane = obj.lane === playerLane;
    const isHitZ = Math.abs(obj.mesh.position.z) < 1.5;
    const isHitHeight = obj.isTall || playerY < 1.5;

    if (isHitZ && isInLane && isHitHeight) {
      onCollision();
    }
    return obj;
  });
}