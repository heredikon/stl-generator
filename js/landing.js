import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createParametricBaseMesh } from './geometry.js';

// --- Scene Setup ---
const container = document.getElementById('preview-canvas-1');
const scene = new THREE.Scene();
// No background color, make it transparent to blend with the box
// Or use the panel background color. We set alpha: true on renderer.

// Camera
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
camera.position.set(150, 100, 200);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = 2.0;
controls.enableZoom = false; // Disable scroll zoom on landing page so it doesn't block scrolling
controls.target.set(0, 0, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(100, 200, 50);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 200;
dirLight.shadow.camera.bottom = -200;
dirLight.shadow.camera.left = -200;
dirLight.shadow.camera.right = 200;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 500;
dirLight.shadow.mapSize.width = 512; // optimized for small preview
dirLight.shadow.mapSize.height = 512;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xaaccff, 0.3);
fillLight.position.set(-100, 0, -100);
scene.add(fillLight);

// Generate Mesh
const defaultMaterial = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide
});

const defaultParams = {
    width: 120,
    length: 120,
    baseThickness: 4,
    hexRadius: 8,
    hexSpacing: 2,
    hexChamfer: 1,
    pillarRadius: 8,
    pillarHeight: 25,
    holeSize: 5
};

try {
    const mesh = createParametricBaseMesh(defaultParams, defaultMaterial);
    scene.add(mesh);
} catch (e) {
    console.error("Error creating preview mesh:", e);
}

// --- Window Resize ---
window.addEventListener('resize', () => {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
});

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();
