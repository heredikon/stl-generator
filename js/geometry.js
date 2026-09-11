import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function createParametricBaseMesh(params, material) {
    const { width, length, baseThickness, hexRadius, hexSpacing, hexChamfer, pillarRadius, pillarHeight, holeSize } = params;
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
    function createHexHole(cx, cy, r, chamfer) {
        const p = new THREE.Path();
        const vertices = [];
        for (let i = 0; i < 6; i++) {
            // Clockwise angle
            const angle = -i * Math.PI / 3;
            vertices.push(new THREE.Vector2(cx + r * Math.cos(angle), cy + r * Math.sin(angle)));
        }

        // Limit chamfer to prevent self-intersection, default to 0 if invalid
        const safeChamfer = (typeof chamfer === 'number' && !isNaN(chamfer)) ? Math.min(chamfer, r * 0.5) : 0;

        if (safeChamfer <= 0) {
            for (let i = 0; i < 6; i++) {
                const v = vertices[i];
                if (i === 0) p.moveTo(v.x, v.y);
                else p.lineTo(v.x, v.y);
            }
            p.lineTo(vertices[0].x, vertices[0].y);
            return p;
        }

        for (let i = 0; i < 6; i++) {
            const v = vertices[i];
            const vPrev = vertices[(i + 5) % 6];
            const vNext = vertices[(i + 1) % 6];

            const dirPrev = new THREE.Vector2().subVectors(vPrev, v).normalize();
            const dirNext = new THREE.Vector2().subVectors(vNext, v).normalize();

            const p1 = new THREE.Vector2().copy(v).add(dirPrev.multiplyScalar(safeChamfer));
            const p2 = new THREE.Vector2().copy(v).add(dirNext.multiplyScalar(safeChamfer));

            if (i === 0) {
                p.moveTo(p1.x, p1.y);
            } else {
                p.lineTo(p1.x, p1.y);
            }

            // Manually draw the fillet to avoid Three.js undersampling small curves into flat chamfers
            const segments = 6;
            for (let j = 1; j <= segments; j++) {
                const t = j / segments;
                const mt = 1 - t;
                const curveX = mt * mt * p1.x + 2 * mt * t * v.x + t * t * p2.x;
                const curveY = mt * mt * p1.y + 2 * mt * t * v.y + t * t * p2.y;
                p.lineTo(curveX, curveY);
            }
        }

        const v0 = vertices[0];
        const v5 = vertices[5];
        const dirPrev0 = new THREE.Vector2().subVectors(v5, v0).normalize();
        const p1_0 = new THREE.Vector2().copy(v0).add(dirPrev0.multiplyScalar(safeChamfer));
        p.lineTo(p1_0.x, p1_0.y);
        p.closePath();
        
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
                baseShape.holes.push(createHexHole(cx, cy, hexRadius, hexChamfer));
            }
        }
    }

    const corners = [
        [-halfW + pillarRadius, -halfL + pillarRadius],
        [halfW - pillarRadius, -halfL + pillarRadius],
        [-halfW + pillarRadius, halfL - pillarRadius],
        [halfW - pillarRadius, halfL - pillarRadius]
    ];

    const hs = holeSize / 2;
    const createSharpSquareHole = (cx, cy) => {
        const p = new THREE.Path();
        p.moveTo(cx - hs, cy + hs);
        p.lineTo(cx + hs, cy + hs);
        p.lineTo(cx + hs, cy - hs);
        p.lineTo(cx - hs, cy - hs);
        p.lineTo(cx - hs, cy + hs);
        return p;
    };

    // Add sharp square holes to the base plate corners (goes all the way through)
    for (const [cx, cy] of corners) {
        baseShape.holes.push(createSharpSquareHole(cx, cy));
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
    pillarShape.holes.push(createSharpSquareHole(0, 0));

    const pillarExtrude = { depth: pillarHeight, bevelEnabled: false, curveSegments: 32 };

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

    const finalMesh = new THREE.Mesh(mergedGeo, material);
    finalMesh.castShadow = true;
    finalMesh.receiveShadow = true;

    return finalMesh;
}
