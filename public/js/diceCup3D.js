/**
 * 3D Automatic Glass Dome Dice Cup
 * Faithful casino Sic Bo dice shaker matching authentic casino automated cup.
 * Features:
 * - Clear acrylic/glass dome with multi-layer specular highlights & reflections
 * - Gunmetal beveled base pedestal with brass collar and vibrating solenoid plate
 * - 3 Translucent ruby-red casino dice with Macau-style circular pips (custom Face 1)
 * - Full 3D jumping, tumbling, collision physics and controlled landing
 */

import * as THREE from 'three';

// --- Procedural Canvas Texture Generator for Ruby Red Casino Dice ---
function createDiceFaceCanvas(value) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Base background: deep luxury translucent ruby crimson with subtle inner bevel
  const bgGrad = ctx.createRadialGradient(128, 128, 20, 128, 128, 140);
  bgGrad.addColorStop(0, '#e51a32');
  bgGrad.addColorStop(0.65, '#b50e22');
  bgGrad.addColorStop(1, '#680511');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 256, 256);

  // Soft rounded border bevel simulation
  ctx.strokeStyle = 'rgba(255, 140, 160, 0.45)';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 242);

  ctx.strokeStyle = 'rgba(40, 0, 5, 0.6)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);

  // Coordinates for standard 3x3 pip grid
  const L = 64, C = 128, R = 192;
  const T = 64, M = 128, B = 192;
  const pipRadius = 26;

  function drawWhitePip(x, y, rad = pipRadius) {
    // Subtle pip indentation drop shadow
    ctx.beginPath();
    ctx.arc(x, y + 2, rad + 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(50, 0, 5, 0.45)';
    ctx.fill();

    // Crisp white pip with glossy radial gradient
    const grad = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 2, x, y, rad);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.85, '#f0f0f0');
    grad.addColorStop(1, '#d5d5d5');

    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle edge rim
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Draw Macau / Asian Casino Style Face 1 (Large iconic red dot inside crisp white ring)
  if (value === 1) {
    const bigRad = 52;
    // Outer shadow
    ctx.beginPath();
    ctx.arc(C, C + 3, bigRad + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 0, 5, 0.5)';
    ctx.fill();

    // White disc background
    const whiteDiscGrad = ctx.createRadialGradient(C - 10, C - 10, 5, C, C, bigRad);
    whiteDiscGrad.addColorStop(0, '#ffffff');
    whiteDiscGrad.addColorStop(0.85, '#f5f5f5');
    whiteDiscGrad.addColorStop(1, '#e0e0e0');
    ctx.beginPath();
    ctx.arc(C, C, bigRad, 0, Math.PI * 2);
    ctx.fillStyle = whiteDiscGrad;
    ctx.fill();

    // Center deep red dot
    const innerRedRad = 32;
    const redGrad = ctx.createRadialGradient(C - 6, C - 6, 2, C, C, innerRedRad);
    redGrad.addColorStop(0, '#ff3b4b');
    redGrad.addColorStop(0.7, '#c80e22');
    redGrad.addColorStop(1, '#780410');
    ctx.beginPath();
    ctx.arc(C, C, innerRedRad, 0, Math.PI * 2);
    ctx.fillStyle = redGrad;
    ctx.fill();
    return canvas;
  }

  // Draw Standard White Pips for Faces 2 - 6
  let coords = [];
  switch (value) {
    case 2:
      coords = [[L, T], [R, B]];
      break;
    case 3:
      coords = [[L, T], [C, M], [R, B]];
      break;
    case 4:
      coords = [[L, T], [R, T], [L, B], [R, B]];
      break;
    case 5:
      coords = [[L, T], [R, T], [C, M], [L, B], [R, B]];
      break;
    case 6:
      coords = [[L, T], [R, T], [L, M], [R, M], [L, B], [R, B]];
      break;
  }

  for (const [x, y] of coords) {
    drawWhitePip(x, y);
  }

  return canvas;
}

// Generate Three.js textures for all 6 faces
const diceTextures = {};
for (let i = 1; i <= 6; i++) {
  const canvas = createDiceFaceCanvas(i);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  diceTextures[i] = tex;
}

/**
 * Three.js BoxFace arrangement:
 * Box face material index order:
 * 0: +X (Right)  -> 3
 * 1: -X (Left)   -> 4
 * 2: +Y (Top)    -> 1
 * 3: -Y (Bottom) -> 6
 * 4: +Z (Front)  -> 2
 * 5: -Z (Back)   -> 5
 * (Opposite sides sum to 7: 1+6, 2+5, 3+4)
 */
function createRubyDiceMaterials() {
  const faceValues = [3, 4, 1, 6, 2, 5];
  return faceValues.map(val => {
    return new THREE.MeshPhongMaterial({
      map: diceTextures[val],
      color: 0xffffff,
      specular: 0xffaaaa,
      shininess: 90,
      transparent: true,
      opacity: 0.94,
      reflectivity: 0.6
    });
  });
}

/**
 * Calculates rotation (quaternion) to bring a given target face (1-6) pointing straight UP (+Y)
 */
function getOrientationForFace(targetVal, yawAngle = 0) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  euler.y = yawAngle;

  switch (targetVal) {
    case 1: // +Y is already 1
      euler.x = 0;
      euler.z = 0;
      break;
    case 6: // -Y is 6 -> flip 180 on X
      euler.x = Math.PI;
      euler.z = 0;
      break;
    case 2: // +Z is 2 -> rotate -90 on X
      euler.x = -Math.PI / 2;
      euler.z = 0;
      break;
    case 5: // -Z is 5 -> rotate +90 on X
      euler.x = Math.PI / 2;
      euler.z = 0;
      break;
    case 3: // +X is 3 -> rotate +90 on Z
      euler.x = 0;
      euler.z = Math.PI / 2;
      break;
    case 4: // -X is 4 -> rotate -90 on Z
      euler.x = 0;
      euler.z = -Math.PI / 2;
      break;
  }

  const q = new THREE.Quaternion();
  q.setFromEuler(euler);
  return q;
}

/**
 * Main 3D Automatic Dice Cup Factory
 */
export function createDiceCup(container, options = {}) {
  if (!container) return null;

  const width = options.width || container.clientWidth || 320;
  const height = options.height || container.clientHeight || 280;

  // 1. Scene Setup
  const scene = new THREE.Scene();

  // 2. Camera Setup (Centered on Dome and Dice)
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 3.8, 6.2);
  camera.lookAt(0, 1.35, 0);

  // 3. Renderer Setup
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    console.error('Failed to create WebGLRenderer:', err);
    return null;
  }
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // 4. Lighting Setup (Casino Velvet & Overhead Spotlight)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambientLight);

  const mainSpot = new THREE.DirectionalLight(0xfff6dd, 1.8);
  mainSpot.position.set(3, 7, 5);
  mainSpot.castShadow = true;
  mainSpot.shadow.mapSize.width = 1024;
  mainSpot.shadow.mapSize.height = 1024;
  scene.add(mainSpot);

  const rimLight = new THREE.DirectionalLight(0x70c0ff, 1.2);
  rimLight.position.set(-4, 4, -4);
  scene.add(rimLight);

  // 5. Build Cup Pedestal Base (Gunmetal & Metallic Stepped Ring)
  const baseGroup = new THREE.Group();
  scene.add(baseGroup);

  // Outer dark beveled base pedestal
  const baseOuterGeo = new THREE.CylinderGeometry(2.35, 2.5, 0.55, 48);
  const baseOuterMat = new THREE.MeshStandardMaterial({
    color: 0x111316,
    roughness: 0.35,
    metalness: 0.85
  });
  const baseOuter = new THREE.Mesh(baseOuterGeo, baseOuterMat);
  baseOuter.position.y = -0.275;
  baseOuter.receiveShadow = true;
  baseGroup.add(baseOuter);

  // Polished Rose-Gold / Brass Retaining Collar (holding the dome, as in reference photo)
  const collarGeo = new THREE.CylinderGeometry(1.92, 2.05, 0.22, 48);
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xd49b6a,
    roughness: 0.25,
    metalness: 0.95
  });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.y = 0.05;
  baseGroup.add(collar);

  // Inner Shaker Plate (Green Felt / Rubber disc that pops/vibrates)
  const plateRadius = 1.76;
  const plateGeo = new THREE.CylinderGeometry(plateRadius, plateRadius, 0.12, 48);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x224940, // Felt slate-teal
    roughness: 0.75,
    metalness: 0.1
  });
  const shakerPlate = new THREE.Mesh(plateGeo, plateMat);
  shakerPlate.position.y = 0.06;
  shakerPlate.receiveShadow = true;
  baseGroup.add(shakerPlate);

  // 6. Build Clear Glass / Acrylic Dome
  const domeRadius = 1.82;
  const cylinderHeight = 1.75;
  const domeGroup = new THREE.Group();
  scene.add(domeGroup);

  // Glass Cylinder Body
  const glassCylinderGeo = new THREE.CylinderGeometry(domeRadius, domeRadius, cylinderHeight, 48, 1, true);
  const glassMat = new THREE.MeshPhongMaterial({
    color: 0xebf5fb,
    specular: 0xffffff,
    shininess: 120,
    transparent: true,
    opacity: 0.32,
    reflectivity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glassCylinder = new THREE.Mesh(glassCylinderGeo, glassMat);
  glassCylinder.position.y = 0.1 + cylinderHeight / 2;
  domeGroup.add(glassCylinder);

  // Glass Hemispherical Top Cap
  const domeCapGeo = new THREE.SphereGeometry(domeRadius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const glassCap = new THREE.Mesh(domeCapGeo, glassMat);
  glassCap.position.y = 0.1 + cylinderHeight;
  domeGroup.add(glassCap);

  // Decorative Curved Specular Highlight Reflection (giving the photo's glossy white curved highlight)
  const arcCurve = new THREE.EllipseCurve(0, 0, domeRadius * 0.95, domeRadius * 0.95, 0.2, 1.4, false, 0);
  const arcPoints = arcCurve.getPoints(32);
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints.map(p => new THREE.Vector3(p.x, 1.8, p.y)));
  const arcMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, linewidth: 2 });
  const highlightArc = new THREE.Line(arcGeo, arcMat);
  domeGroup.add(highlightArc);

  // 7. Three Ruby Red Casino Dice Setup (Larger size)
  const dieSize = 0.82;
  const dice = [];
  const diceMaterials = createRubyDiceMaterials();
  const diceGeo = new THREE.BoxGeometry(dieSize, dieSize, dieSize);

  // Rest layout positions on shaker plate (forming a balanced triangle matching photo)
  const restPositions = [
    new THREE.Vector3(-0.56, 0.12 + dieSize / 2, 0.30),
    new THREE.Vector3(0.56, 0.12 + dieSize / 2, 0.26),
    new THREE.Vector3(-0.02, 0.12 + dieSize / 2, -0.56)
  ];

  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(diceGeo, diceMaterials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    dice.push({
      mesh,
      position: mesh.position,
      velocity: new THREE.Vector3(0, 0, 0),
      angularVelocity: new THREE.Vector3(0, 0, 0),
      targetFace: i + 1,
      targetPos: restPositions[i].clone(),
      targetRot: getOrientationForFace(i + 1, (i * 1.3) + 0.5),
      currentFace: i + 1,
      settled: true,
      settleAlpha: 1.0,
      settleBounce: 0
    });
  }

  // Position settled dice initially
  function resetToSettled(values = [1, 2, 3]) {
    for (let i = 0; i < 3; i++) {
      const d = dice[i];
      const val = values[i] || (i + 1);
      d.targetFace = val;
      d.currentFace = val;
      d.targetRot = getOrientationForFace(val, (i * 1.4) + 0.3);
      d.mesh.position.copy(d.targetPos);
      d.mesh.quaternion.copy(d.targetRot);
      d.velocity.set(0, 0, 0);
      d.angularVelocity.set(0, 0, 0);
      d.settled = true;
      d.settleAlpha = 1.0;
      d.settleBounce = 0;
    }
  }
  resetToSettled([1, 2, 3]);

  // 8. Physics & Rolling State Machine
  let isRolling = false;
  let rollStartTime = 0;
  let rollDuration = 5000;
  let targetOutcome = [1, 2, 3];
  let plateVibrationY = 0;

  function roll(officialDice, durationMs = 5000) {
    targetOutcome = officialDice || [1, 2, 3];
    rollDuration = durationMs;
    rollStartTime = performance.now();
    isRolling = true;

    // Launch each die with vigorous initial jump
    for (let i = 0; i < 3; i++) {
      const d = dice[i];
      d.settled = false;
      d.settleAlpha = 0;
      d.targetFace = targetOutcome[i];
      d.targetRot = getOrientationForFace(targetOutcome[i], Math.random() * Math.PI * 2);

      // Random 3D launch velocity
      d.velocity.set(
        (Math.random() - 0.5) * 3.8,
        3.8 + Math.random() * 3.2,
        (Math.random() - 0.5) * 3.8
      );
      // High rotational tumble spin
      d.angularVelocity.set(
        (Math.random() - 0.5) * 26,
        (Math.random() - 0.5) * 26,
        (Math.random() - 0.5) * 26
      );
    }
  }

  // 9. Animation Update Loop (60 FPS Physics Simulation)
  let lastTime = performance.now();
  let animId = null;

  function animate(now) {
    animId = requestAnimationFrame(animate);

    const dt = Math.min((now - lastTime) / 1000, 0.033);
    lastTime = now;

    const floorY = 0.12 + dieSize / 2;
    const maxDomeH = cylinderHeight + domeRadius * 0.9;
    const maxWallR = domeRadius * 0.85;

    if (isRolling) {
      const elapsed = now - rollStartTime;
      const progress = Math.min(elapsed / rollDuration, 1.0);

      // --- Base Plate Vibration Simulation ---
      // Vigorous rapid solenoid popping (60Hz) during shaking phase
      if (progress < 0.72) {
        const shakeIntensity = 1.0 - Math.max(0, (progress - 0.55) / 0.17);
        plateVibrationY = Math.sin(now * 0.08) * 0.045 * shakeIntensity;
        shakerPlate.position.y = 0.06 + plateVibrationY;
      } else {
        plateVibrationY *= 0.85;
        shakerPlate.position.y = 0.06 + plateVibrationY;
      }

      // --- Dice Physics Updates ---
      for (let i = 0; i < 3; i++) {
        const d = dice[i];

        if (progress < 0.70) {
          // PHASE 1: JUMPING & TUMBLING
          // Apply gravity
          d.velocity.y -= 22.0 * dt;

          // Apply velocity
          d.position.addScaledVector(d.velocity, dt);

          // Rotate by angular velocity
          const qSpin = new THREE.Quaternion();
          const angle = d.angularVelocity.length() * dt;
          if (angle > 0.0001) {
            const axis = d.angularVelocity.clone().normalize();
            qSpin.setFromAxisAngle(axis, angle);
            d.mesh.quaternion.premultiply(qSpin);
          }

          // Floor collision (Vibrating base plate pops dice upward)
          if (d.position.y <= floorY + plateVibrationY) {
            d.position.y = floorY + plateVibrationY;
            // Pop upward with energy from plate!
            d.velocity.y = Math.abs(d.velocity.y) * 0.75 + (2.5 + Math.random() * 2.5);
            // Random horizontal deflections from plate vibrations
            d.velocity.x += (Math.random() - 0.5) * 3.2;
            d.velocity.z += (Math.random() - 0.5) * 3.2;
            // Additional tumble impulse
            d.angularVelocity.x += (Math.random() - 0.5) * 14;
            d.angularVelocity.y += (Math.random() - 0.5) * 14;
            d.angularVelocity.z += (Math.random() - 0.5) * 14;
          }

          // Dome Ceiling collision
          if (d.position.y >= maxDomeH) {
            d.position.y = maxDomeH;
            d.velocity.y = -Math.abs(d.velocity.y) * 0.65;
          }

          // Dome Glass Wall collision (radial boundary)
          const radDist = Math.sqrt(d.position.x * d.position.x + d.position.z * d.position.z);
          if (radDist > maxWallR) {
            const normX = d.position.x / radDist;
            const normZ = d.position.z / radDist;
            d.position.x = normX * maxWallR;
            d.position.z = normZ * maxWallR;

            // Reflect horizontal velocity
            const dot = d.velocity.x * normX + d.velocity.z * normZ;
            d.velocity.x = (d.velocity.x - 1.6 * dot * normX) * 0.75;
            d.velocity.z = (d.velocity.z - 1.6 * dot * normZ) * 0.75;
          }

          // Dice-to-Dice Collisions
          for (let j = i + 1; j < 3; j++) {
            const other = dice[j];
            const delta = d.position.clone().sub(other.position);
            const dist = delta.length();
            const minSpace = dieSize * 1.05;
            if (dist < minSpace && dist > 0.001) {
              const pushDir = delta.normalize();
              const overlap = (minSpace - dist) * 0.5;
              d.position.addScaledVector(pushDir, overlap);
              other.position.addScaledVector(pushDir, -overlap);

              // Elastic bounce transfer
              const vRel = d.velocity.clone().sub(other.velocity);
              const speed = vRel.dot(pushDir);
              if (speed < 0) {
                d.velocity.addScaledVector(pushDir, -speed * 0.8);
                other.velocity.addScaledVector(pushDir, speed * 0.8);
              }
            }
          }

        } else if (progress < 0.92) {
          // PHASE 2: DECELERATION & SMOOTH ROTATION LOCK-IN
          const settleProgress = (progress - 0.70) / 0.22; // 0 -> 1

          // Guide smoothly toward rest positions
          d.position.lerp(d.targetPos, dt * 6.5);

          // Floor damping bounce
          const currentFloor = floorY + Math.sin(settleProgress * Math.PI * 4) * 0.08 * (1.0 - settleProgress);
          if (d.position.y < currentFloor) {
            d.position.y = currentFloor;
          }

          // Smoothly slerp rotation toward target outcome face
          d.mesh.quaternion.slerp(d.targetRot, dt * 8.0);

        } else {
          // PHASE 3: FINAL TOUCHDOWN & MICRO-BOUNCE SETTLE
          const finalSub = (progress - 0.92) / 0.08; // 0 -> 1
          d.position.copy(d.targetPos);
          d.mesh.quaternion.copy(d.targetRot);

          // Micro settling dampening
          const bounceOffset = Math.sin(finalSub * Math.PI * 2) * 0.02 * (1.0 - finalSub);
          d.mesh.position.y = floorY + Math.max(0, bounceOffset);

          if (progress >= 1.0) {
            d.mesh.position.y = floorY;
            d.settled = true;
          }
        }
      }

      if (progress >= 1.0) {
        isRolling = false;
        resetToSettled(targetOutcome);
      }
    } else {
      // Idle / Resting state - dice sit stably on the plate
      shakerPlate.position.y = 0.06;
      for (let i = 0; i < 3; i++) {
        const d = dice[i];
        d.mesh.position.copy(d.targetPos);
        d.mesh.quaternion.copy(d.targetRot);
      }
    }

    renderer.render(scene, camera);
  }

  animId = requestAnimationFrame(animate);

  // Resize handler
  function resize(newW, newH) {
    const w = newW || container.clientWidth || 320;
    const h = newH || container.clientHeight || 280;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', () => resize());

  return {
    roll,
    resetToSettled,
    resize,
    destroy() {
      if (animId) cancelAnimationFrame(animId);
      renderer.dispose();
      container.innerHTML = '';
    }
  };
}

// Export to window for global browser access
if (typeof window !== 'undefined') {
  window.SicBoDiceCup = { createDiceCup };
  window.dispatchEvent(new CustomEvent('dicecup:ready', { detail: { createDiceCup } }));
}
