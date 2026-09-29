import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { createParametricStraightBracketMesh } from './geometry.js';

// --- Scene Setup ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0a0a');
scene.fog = new THREE.Fog('#0a0a0a', 200, 1000);

// Grid & Helpers
const gridHelper = new THREE.GridHelper(400, 40, 0x333333, 0x222222);
gridHelper.position.y = -0.1;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(50);
scene.add(axesHelper);

// Camera
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
camera.position.set(150, 100, 200);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
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
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xaaccff, 0.3);
fillLight.position.set(-100, 0, -100);
scene.add(fillLight);

// Material
const defaultMaterial = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide
});

// Main Mesh Reference
let currentMesh = null;

// --- Window Resize ---
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// --- Geometry Generation Engine ---
async function generateModel(params) {
    document.getElementById('loading').classList.add('active');

    // UI update breather
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        const finalMesh = createParametricStraightBracketMesh(params, defaultMaterial);

        if (currentMesh) {
            scene.remove(currentMesh);
            currentMesh.geometry.dispose();
        }

        currentMesh = finalMesh;
        scene.add(currentMesh);

    } catch (e) {
        console.error("Error generating geometry:", e);
        alert("An error occurred during generation. Check console for details.");
    } finally {
        document.getElementById('loading').classList.remove('active');
    }
}

// --- UI Logic ---
function getParams() {
    return {
        length: parseFloat(document.getElementById('length').value),
        width: parseFloat(document.getElementById('width').value),
        thickness: parseFloat(document.getElementById('thickness').value),
        hexRadius: parseFloat(document.getElementById('hexRadius').value),
        hexSpacing: parseFloat(document.getElementById('hexSpacing').value),
        hexChamfer: parseFloat(document.getElementById('hexChamfer').value)
    };
}

document.getElementById('btn-generate').addEventListener('click', () => {
    generateModel(getParams());
});

document.getElementById('btn-download').addEventListener('click', () => {
    if (!currentMesh) {
        alert("Please generate a model first.");
        return;
    }

    const exporter = new STLExporter();
    const stlString = exporter.parse(scene);

    const blob = new Blob([stlString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = 'parametric_straight_bracket.stl';

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// Initial Generation
generateModel(getParams());
