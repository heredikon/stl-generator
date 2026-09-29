import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createParametricBaseMesh, createParametricLBracketMesh, createParametricStraightBracketMesh, createParametricCornerBracketMesh } from './geometry.js';

function initPreview(containerId, meshGenerator, defaultParams) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 2000);
    camera.position.set(150, 100, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;
    controls.enableZoom = false;
    controls.target.set(0, 0, 0);

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
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.3);
    fillLight.position.set(-100, 0, -100);
    scene.add(fillLight);

    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.4,
        metalness: 0.1,
        side: THREE.DoubleSide
    });

    try {
        const mesh = meshGenerator(defaultParams, defaultMaterial);
        scene.add(mesh);
    } catch (e) {
        console.error("Error creating preview mesh for " + containerId + ":", e);
    }

    window.addEventListener('resize', () => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        }
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

// 1. Table Base
initPreview('preview-canvas-1', createParametricBaseMesh, {
    width: 120,
    length: 120,
    baseThickness: 4,
    hexRadius: 8,
    hexSpacing: 2,
    hexChamfer: 1,
    pillarRadius: 8,
    pillarHeight: 25,
    holeSize: 5
});

// 2. L-Bracket
initPreview('preview-canvas-2', createParametricLBracketMesh, {
    lengthX: 100,
    lengthY: 100,
    width: 50,
    thickness: 4,
    hexRadius: 8,
    hexSpacing: 2,
    hexChamfer: 1
});

// 3. Straight Bracket
initPreview('preview-canvas-3', createParametricStraightBracketMesh, {
    length: 150,
    width: 50,
    thickness: 4,
    hexRadius: 8,
    hexSpacing: 2,
    hexChamfer: 1
});

// 4. Corner Bracket
initPreview('preview-canvas-4', createParametricCornerBracketMesh, {
    lengthX: 100,
    lengthY: 100,
    baseWidth: 30,
    wallHeight: 40,
    thickness: 4,
    patternPlacement: 'both',
    hexRadius: 8,
    hexSpacing: 2,
    hexChamfer: 1
});
