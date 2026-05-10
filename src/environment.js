// @ts-nocheck
import * as THREE from "three";

export const skyColors = {
  day: new THREE.Color(0x87CEFA),
  night: new THREE.Color(0x02050a)
};

export function updateEnvironment(uTime, scene, lights, celestial) {
  const { ambientLight, sunLight, headLight } = lights;
  const { sun, moon } = celestial;

  // Calculate cycle (0 = Day, 1 = Night)
  let cycleProgress = (uTime % 100) / 100;
  let nightAlpha = Math.pow(Math.sin(cycleProgress * Math.PI), 2);

  // Interpolate Background and Fog
  const currentSky = skyColors.day.clone().lerp(skyColors.night, nightAlpha);
  scene.background.copy(currentSky);
  if (scene.fog) scene.fog.color.copy(currentSky);

  // Adjust Light Intensities
  if (ambientLight) ambientLight.intensity = THREE.MathUtils.lerp(1.5, 0.2, nightAlpha);
  if (sunLight) sunLight.intensity = THREE.MathUtils.lerp(1.0, 0.1, nightAlpha);
  if (headLight) headLight.intensity = THREE.MathUtils.lerp(0, 2.5, nightAlpha);

  // Move Sun and Moon
  if (sun) sun.position.y = THREE.MathUtils.lerp(100, -100, nightAlpha);
  if (moon) moon.position.y = THREE.MathUtils.lerp(-100, 100, nightAlpha);
  
  return nightAlpha; // Return alpha in case you want to use it for other effects
}