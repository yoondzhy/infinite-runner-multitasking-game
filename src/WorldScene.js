// @ts-nocheck
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

const CHUNK_SIZE = 140;

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

export function createWorldChunk(zOffset, uTime) {
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
}

export function createClouds(group) {
  const cloudMaterial = new THREE.MeshLambertMaterial({ 
    color: 0xffffff, 
    transparent: true, 
    opacity: 0.8 
  });
  
  const thickness = 2; 
  for (let i = 0; i < 40; i++) {
    const w = 10 + Math.random() * 20;
    const d = 10 + Math.random() * 20;
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(w, thickness, d), cloudMaterial);
    const y = 30 + Math.random() * 25;
    const z = (Math.random() * -450) + 50; 
    
    cloud.position.set((Math.random() - 0.5) * 280, y, z);
    group.add(cloud);
  }
}

export function moveWorld(chunks, moveStep, chunkSize, count) {
  chunks.forEach(chunk => {
    chunk.position.z += moveStep;
    // Logic for looping the world
    if (chunk.position.z > chunkSize) {
      chunk.position.z -= chunkSize * count;
    }
  });
}
export function animateClouds(cloudGroup, moveStep) {
  if (!cloudGroup) return;

  cloudGroup.children.forEach(cloud => {
    cloud.position.z += moveStep * 0.4; 

    // Reset cloud position further back to -400
    // This way they stay hidden behind the fog until they naturally drift forward
    if (cloud.position.z > 100) {
      cloud.position.z = -400; 
      cloud.position.x = (Math.random() - 0.5) * 280; 
    }
  });
}