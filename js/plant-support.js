import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { createParametricPlantSupportMesh } from './geometry.js';

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
camera.position.set(160, 140, 220);

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
        const finalMesh = createParametricPlantSupportMesh(params, defaultMaterial);

        if (currentMesh) {
            scene.remove(currentMesh);
            currentMesh.geometry.dispose();
            if (currentMesh.userData.ringMesh) currentMesh.userData.ringMesh.geometry.dispose();
            if (currentMesh.userData.stakesMesh) currentMesh.userData.stakesMesh.geometry.dispose();
            if (currentMesh.userData.singleStakeMesh) currentMesh.userData.singleStakeMesh.geometry.dispose();
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
        innerDiameter: parseFloat(document.getElementById('innerDiameter').value),
        ringWidth: parseFloat(document.getElementById('ringWidth').value),
        ringHeight: parseFloat(document.getElementById('ringHeight').value),
        openingAngle: parseFloat(document.getElementById('openingAngle').value),
        stakeHeight: parseFloat(document.getElementById('stakeHeight').value),
        slotSize: parseFloat(document.getElementById('slotSize').value),
        tipLength: parseFloat(document.getElementById('tipLength').value),
        snapAllowance: parseFloat(document.getElementById('snapAllowance').value),
        fitClearance: parseFloat(document.getElementById('fitClearance').value)
    };
}

function downloadMeshAsSTL(mesh, filename) {
    const exporter = new STLExporter();
    const stlString = exporter.parse(mesh);

    const blob = new Blob([stlString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

document.getElementById('btn-generate').addEventListener('click', () => {
    generateModel(getParams());
});

document.getElementById('btn-download-ring').addEventListener('click', () => {
    if (!currentMesh || !currentMesh.userData.ringMesh) {
        alert("Please generate a model first.");
        return;
    }
    downloadMeshAsSTL(currentMesh.userData.ringMesh, 'plant_support_ring.stl');
});

document.getElementById('btn-download-stakes').addEventListener('click', () => {
    if (!currentMesh || !currentMesh.userData.stakesMesh) {
        alert("Please generate a model first.");
        return;
    }
    downloadMeshAsSTL(currentMesh.userData.stakesMesh, 'plant_support_stakes.stl');
});

document.getElementById('btn-download-single-stake').addEventListener('click', () => {
    if (!currentMesh || !currentMesh.userData.singleStakeMesh) {
        alert("Please generate a model first.");
        return;
    }
    downloadMeshAsSTL(currentMesh.userData.singleStakeMesh, 'plant_support_single_stake.stl');
});

// Initial Generation
generateModel(getParams());
