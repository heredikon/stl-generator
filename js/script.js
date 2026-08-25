import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

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
        const { width, length, baseThickness, hexRadius, hexSpacing, pillarRadius, pillarHeight, holeSize } = params;
        const geometries = [];
        const halfW = width / 2;
        const halfL = length / 2;

        // ==========================================
        // 1. BASE PLATE (WITH HONEYCOMB HOLES)
        // ==========================================
        const baseShape = new THREE.Shape();
        const pr = pillarRadius;

        // Start bottom edge (after left curve)
        baseShape.moveTo(-halfW + pr, -halfL);
        baseShape.lineTo(halfW - pr, -halfL);
        // Bottom-Right corner arc
        baseShape.absarc(halfW - pr, -halfL + pr, pr, -Math.PI / 2, 0, false);
        // Right edge
        baseShape.lineTo(halfW, halfL - pr);
        // Top-Right corner arc
        baseShape.absarc(halfW - pr, halfL - pr, pr, 0, Math.PI / 2, false);
        // Top edge
        baseShape.lineTo(-halfW + pr, halfL);
        // Top-Left corner arc
        baseShape.absarc(-halfW + pr, halfL - pr, pr, Math.PI / 2, Math.PI, false);
        // Left edge
        baseShape.lineTo(-halfW, -halfL + pr);
        // Bottom-Left corner arc
        baseShape.absarc(-halfW + pr, -halfL + pr, pr, Math.PI, Math.PI * 1.5, false);

        // Helper to draw a clockwise hexagon (clockwise = hole)
        function createHexHole(cx, cy, r) {
            const p = new THREE.Path();
            for (let i = 0; i < 6; i++) {
                // Clockwise angle
                const angle = -i * Math.PI / 3;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                if (i === 0) p.moveTo(x, y);
                else p.lineTo(x, y);
            }
            p.lineTo(cx + r, cy);
            return p;
        }

        // Tiling Math for flat-topped hexagons
        const colStep = 1.5 * hexRadius + hexSpacing;
        const rowStep = Math.sqrt(3) * hexRadius + hexSpacing;
        const cols = Math.ceil(width / colStep);
        const rows = Math.ceil(length / rowStep);
        const margin = pillarRadius + 1;

        for (let r = -rows; r <= rows; r++) {
            for (let c = -cols; c <= cols; c++) {
                let cx = c * colStep;
                let cy = r * rowStep;
                // Offset every other column for honeycomb interlocking
                if (Math.abs(c % 2) === 1) cy += rowStep / 2;

                // Only add hole if fully inside safe area
                const hexRadiusY = (Math.sqrt(3) / 2) * hexRadius;
                if (
                    cx + hexRadius < halfW - margin &&
                    cx - hexRadius > -halfW + margin &&
                    cy + hexRadiusY < halfL - margin &&
                    cy - hexRadiusY > -halfL + margin
                ) {
                    baseShape.holes.push(createHexHole(cx, cy, hexRadius));
                }
            }
        }

        const baseExtrude = { depth: baseThickness, bevelEnabled: false, curveSegments: 6 };
        const baseGeo = new THREE.ExtrudeGeometry(baseShape, baseExtrude);
        // Rotate so it lays flat on the XZ plane, moving Y from 0 to -depth
        baseGeo.rotateX(Math.PI / 2);
        // Translate up so it sits on the ground
        baseGeo.translate(0, baseThickness, 0);
        geometries.push(baseGeo);


        // ==========================================
        // 2. CORNER PILLARS (WITH SQUARE HOLES)
        // ==========================================
        const pillarShape = new THREE.Shape();
        pillarShape.absarc(0, 0, pillarRadius, 0, Math.PI * 2, false); // Counter-clockwise outer

        // Square hole (clockwise)
        const holePath = new THREE.Path();
        const hs = holeSize / 2;
        holePath.moveTo(-hs, hs);
        holePath.lineTo(hs, hs);
        holePath.lineTo(hs, -hs);
        holePath.lineTo(-hs, -hs);
        holePath.lineTo(-hs, hs);
        pillarShape.holes.push(holePath);

        const pillarExtrude = { depth: pillarHeight, bevelEnabled: false, curveSegments: 32 };

        const corners = [
            [-halfW + pillarRadius, -halfL + pillarRadius],
            [halfW - pillarRadius, -halfL + pillarRadius],
            [-halfW + pillarRadius, halfL - pillarRadius],
            [halfW - pillarRadius, halfL - pillarRadius]
        ];

        for (const [cx, cy] of corners) {
            const pGeo = new THREE.ExtrudeGeometry(pillarShape, pillarExtrude);
            pGeo.rotateX(Math.PI / 2);
            pGeo.translate(cx, pillarHeight, cy);
            geometries.push(pGeo);
        }


        // ==========================================
        // 3. SWEEPING SIDE SUPPORTS
        // ==========================================
        const wallThickness = baseThickness;

        // Shape for X-axis edges (Front and Back)
        const sweepShapeX = new THREE.Shape();
        const startX = -halfW + pillarRadius;
        const endX = halfW - pillarRadius;

        sweepShapeX.moveTo(startX, baseThickness);
        sweepShapeX.lineTo(startX, pillarHeight);
        // Parabolic curve swooping down to the center
        sweepShapeX.quadraticCurveTo(0, baseThickness, endX, pillarHeight);
        sweepShapeX.lineTo(endX, baseThickness);
        sweepShapeX.lineTo(startX, baseThickness);

        const sweepExtrudeX = { depth: wallThickness, bevelEnabled: false, curveSegments: 24 };

        // Front wall
        const frontGeo = new THREE.ExtrudeGeometry(sweepShapeX, sweepExtrudeX);
        frontGeo.translate(0, 0, halfL - wallThickness);
        geometries.push(frontGeo);

        // Back wall
        const backGeo = new THREE.ExtrudeGeometry(sweepShapeX, sweepExtrudeX);
        backGeo.translate(0, 0, -halfL);
        geometries.push(backGeo);

        // Shape for Z-axis edges (Left and Right)
        const sweepShapeZ = new THREE.Shape();
        const startZ = -halfL + pillarRadius;
        const endZ = halfL - pillarRadius;

        sweepShapeZ.moveTo(startZ, baseThickness);
        sweepShapeZ.lineTo(startZ, pillarHeight);
        sweepShapeZ.quadraticCurveTo(0, baseThickness, endZ, pillarHeight);
        sweepShapeZ.lineTo(endZ, baseThickness);
        sweepShapeZ.lineTo(startZ, baseThickness);

        // Left wall (Rotate 90 degrees around Y)
        const leftGeo = new THREE.ExtrudeGeometry(sweepShapeZ, sweepExtrudeX);
        leftGeo.rotateY(Math.PI / 2);
        leftGeo.translate(-halfW, 0, 0);
        geometries.push(leftGeo);

        // Right wall
        const rightGeo = new THREE.ExtrudeGeometry(sweepShapeZ, sweepExtrudeX);
        rightGeo.rotateY(Math.PI / 2);
        rightGeo.translate(halfW - wallThickness, 0, 0);
        geometries.push(rightGeo);


        // ==========================================
        // 4. MERGE & RENDER
        // ==========================================
        const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
        mergedGeo.computeVertexNormals();

        const finalMesh = new THREE.Mesh(mergedGeo, defaultMaterial);
        finalMesh.castShadow = true;
        finalMesh.receiveShadow = true;

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
        width: parseFloat(document.getElementById('width').value),
        length: parseFloat(document.getElementById('length').value),
        baseThickness: parseFloat(document.getElementById('baseThickness').value),
        hexRadius: parseFloat(document.getElementById('hexRadius').value),
        hexSpacing: parseFloat(document.getElementById('hexSpacing').value),
        pillarRadius: parseFloat(document.getElementById('pillarRadius').value),
        pillarHeight: parseFloat(document.getElementById('pillarHeight').value),
        holeSize: parseFloat(document.getElementById('holeSize').value)
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
    link.download = 'parametric_base.stl';

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

// Initial Generation
generateModel(getParams());
