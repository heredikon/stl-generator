import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Helper to draw a clockwise hexagon (clockwise = hole)
export function createHexHole(cx, cy, r, chamfer) {
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

export function createParametricStraightBracketMesh(params, material) {
    const { length, width, thickness, hexRadius, hexSpacing, hexChamfer } = params;
    
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, width);
    shape.lineTo(0, width);
    shape.lineTo(0, 0);

    if (hexRadius > 0) {
        const colStep = 1.5 * hexRadius + hexSpacing;
        const rowStep = Math.sqrt(3) * hexRadius + hexSpacing;
        const cols = Math.ceil(length / colStep);
        const rows = Math.ceil(width / rowStep);
        const margin = hexSpacing;

        for (let r = -1; r <= rows + 1; r++) {
            for (let c = -1; c <= cols + 1; c++) {
                let cx = c * colStep;
                let cy = r * rowStep;
                if (Math.abs(c % 2) === 1) cy += rowStep / 2;

                const hexRadiusY = (Math.sqrt(3) / 2) * hexRadius;
                if (
                    cx - hexRadius > margin &&
                    cx + hexRadius < length - margin &&
                    cy - hexRadiusY > margin &&
                    cy + hexRadiusY < width - margin
                ) {
                    shape.holes.push(createHexHole(cx, cy, hexRadius, hexChamfer));
                }
            }
        }
    }

    const extrudeSettings = { depth: thickness, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(Math.PI / 2); // Z is [0, width]
    geo.translate(-length / 2, thickness, -width / 2); // Center along X and Z
    
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

export function createParametricLBracketMesh(params, material) {
    const { lengthX, lengthY, width, thickness, hexRadius, hexSpacing, hexChamfer } = params;
    
    const geometries = [];

    // Horizontal Leg (X-axis)
    const shapeH = new THREE.Shape();
    shapeH.moveTo(0, 0);
    shapeH.lineTo(lengthX, 0);
    shapeH.lineTo(lengthX, width);
    shapeH.lineTo(0, width);
    shapeH.lineTo(0, 0);

    // Vertical Leg (Y-axis)
    // X goes from 0 to width (depth). Y goes from 0 to lengthY (height)
    const shapeV = new THREE.Shape();
    shapeV.moveTo(0, 0);
    shapeV.lineTo(width, 0);
    shapeV.lineTo(width, lengthY);
    shapeV.lineTo(0, lengthY);
    shapeV.lineTo(0, 0);

    if (hexRadius > 0) {
        const colStep = 1.5 * hexRadius + hexSpacing;
        const rowStep = Math.sqrt(3) * hexRadius + hexSpacing;
        const margin = hexSpacing;
        
        // Holes for Horizontal Leg
        const colsH = Math.ceil(lengthX / colStep);
        const rowsH = Math.ceil(width / rowStep);
        for (let r = -1; r <= rowsH + 1; r++) {
            for (let c = -1; c <= colsH + 1; c++) {
                let cx = c * colStep;
                let cy = r * rowStep;
                if (Math.abs(c % 2) === 1) cy += rowStep / 2;

                const hexRadiusY = (Math.sqrt(3) / 2) * hexRadius;
                if (
                    cx - hexRadius > thickness + margin &&
                    cx + hexRadius < lengthX - margin &&
                    cy - hexRadiusY > margin &&
                    cy + hexRadiusY < width - margin
                ) {
                    shapeH.holes.push(createHexHole(cx, cy, hexRadius, hexChamfer));
                }
            }
        }

        // Holes for Vertical Leg
        const colsV = Math.ceil(width / colStep);
        const rowsV = Math.ceil(lengthY / rowStep);
        for (let r = -1; r <= rowsV + 1; r++) {
            for (let c = -1; c <= colsV + 1; c++) {
                let cx = c * colStep;
                let cy = r * rowStep;
                if (Math.abs(c % 2) === 1) cy += rowStep / 2;

                const hexRadiusY = (Math.sqrt(3) / 2) * hexRadius;
                // Avoid corner joint intersection (cy > thickness + margin)
                if (
                    cx - hexRadius > margin &&
                    cx + hexRadius < width - margin &&
                    cy - hexRadiusY > thickness + margin &&
                    cy + hexRadiusY < lengthY - margin
                ) {
                    shapeV.holes.push(createHexHole(cx, cy, hexRadius, hexChamfer));
                }
            }
        }
    }

    const extrudeSettings = { depth: thickness, bevelEnabled: false };
    
    // Horizontal Leg Geometry
    const geoH = new THREE.ExtrudeGeometry(shapeH, extrudeSettings);
    geoH.rotateX(Math.PI / 2); 
    geoH.translate(0, thickness, 0); // Y: 0 -> thickness. Z: 0 -> -width
    geometries.push(geoH);

    // Vertical Leg Geometry
    const geoV = new THREE.ExtrudeGeometry(shapeV, extrudeSettings);
    // Extrude creates depth along Z (0 -> thickness).
    // shapeV: X: 0 -> width, Y: 0 -> lengthY
    // Rotate around Y by -90 deg: X becomes -Z, Z becomes X.
    // Result: X: 0 -> -thickness, Y: 0 -> lengthY, Z: 0 -> width
    geoV.rotateY(-Math.PI / 2);
    geoV.translate(thickness, 0, 0); // X: 0 -> thickness, Z: 0 -> width
    geometries.push(geoV);

    const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
    mergedGeo.computeVertexNormals();
    // Center the L-bracket
    mergedGeo.translate(-lengthX / 2, 0, -width / 2);

    const mesh = new THREE.Mesh(mergedGeo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

export function createParametricCornerBracketMesh(params, material) {
    const { lengthX, lengthY, baseWidth, wallHeight, thickness, patternPlacement = 'both', hexRadius, hexSpacing, hexChamfer } = params;
    const geometries = [];
    const extrudeSettings = { depth: thickness, bevelEnabled: false };

    // 1. Base Plate (L-Shape)
    const shapeBase = new THREE.Shape();
    shapeBase.moveTo(0, 0);
    shapeBase.lineTo(lengthX, 0);
    shapeBase.lineTo(lengthX, baseWidth);
    shapeBase.lineTo(baseWidth, baseWidth);
    shapeBase.lineTo(baseWidth, lengthY);
    shapeBase.lineTo(0, lengthY);
    shapeBase.lineTo(0, 0);

    if (hexRadius > 0 && (patternPlacement === 'both' || patternPlacement === 'base')) {
        const colStep = 1.5 * hexRadius + hexSpacing;
        const rowStep = Math.sqrt(3) * hexRadius + hexSpacing;
        const margin = hexSpacing;
        
        const cols = Math.ceil(Math.max(lengthX, lengthY) / colStep);
        const rows = Math.ceil(Math.max(lengthX, lengthY) / rowStep);
        
        for (let r = -1; r <= rows + 1; r++) {
            for (let c = -1; c <= cols + 1; c++) {
                let cx = c * colStep;
                let cy = r * rowStep;
                if (Math.abs(c % 2) === 1) cy += rowStep / 2;

                const hexRadiusY = (Math.sqrt(3) / 2) * hexRadius;
                
                const inLeg1 = (
                    cx - hexRadius > thickness + margin &&
                    cx + hexRadius < lengthX - margin &&
                    cy - hexRadiusY > thickness + margin &&
                    cy + hexRadiusY < baseWidth - margin
                );
                const inLeg2 = (
                    cx - hexRadius > thickness + margin &&
                    cx + hexRadius < baseWidth - margin &&
                    cy - hexRadiusY > thickness + margin &&
                    cy + hexRadiusY < lengthY - margin
                );
                
                if (inLeg1 || inLeg2) {
                    shapeBase.holes.push(createHexHole(cx, cy, hexRadius, hexChamfer));
                }
            }
        }
    }

    const geoBase = new THREE.ExtrudeGeometry(shapeBase, extrudeSettings);
    geoBase.rotateX(Math.PI / 2);
    geoBase.translate(0, thickness, 0);
    geometries.push(geoBase);

    // 2. Wall 1 (along X-axis)
    const shapeW1 = new THREE.Shape();
    shapeW1.moveTo(0, 0);
    shapeW1.lineTo(lengthX, 0);
    shapeW1.lineTo(lengthX, wallHeight);
    shapeW1.lineTo(0, wallHeight);
    shapeW1.lineTo(0, 0);

    if (hexRadius > 0 && (patternPlacement === 'both' || patternPlacement === 'walls')) {
        const colStep = 1.5 * hexRadius + hexSpacing;
        const rowStep = Math.sqrt(3) * hexRadius + hexSpacing;
        const margin = hexSpacing;
        const cols = Math.ceil(lengthX / colStep);
        const rows = Math.ceil(wallHeight / rowStep);
        for (let r = -1; r <= rows + 1; r++) {
            for (let c = -1; c <= cols + 1; c++) {
                let cx = c * colStep;
                let cy = r * rowStep;
                if (Math.abs(c % 2) === 1) cy += rowStep / 2;

                const hexRadiusY = (Math.sqrt(3) / 2) * hexRadius;
                if (
                    cx - hexRadius > thickness + margin &&
                    cx + hexRadius < lengthX - margin &&
                    cy - hexRadiusY > thickness + margin &&
                    cy + hexRadiusY < wallHeight - margin
                ) {
                    shapeW1.holes.push(createHexHole(cx, cy, hexRadius, hexChamfer));
                }
            }
        }
    }

    const geoW1 = new THREE.ExtrudeGeometry(shapeW1, extrudeSettings);
    geometries.push(geoW1);

    // 3. Wall 2 (along Z-axis)
    const shapeW2 = new THREE.Shape();
    shapeW2.moveTo(0, 0);
    shapeW2.lineTo(lengthY, 0);
    shapeW2.lineTo(lengthY, wallHeight);
    shapeW2.lineTo(0, wallHeight);
    shapeW2.lineTo(0, 0);

    if (hexRadius > 0 && (patternPlacement === 'both' || patternPlacement === 'walls')) {
        const colStep = 1.5 * hexRadius + hexSpacing;
        const rowStep = Math.sqrt(3) * hexRadius + hexSpacing;
        const margin = hexSpacing;
        const cols = Math.ceil(lengthY / colStep);
        const rows = Math.ceil(wallHeight / rowStep);
        for (let r = -1; r <= rows + 1; r++) {
            for (let c = -1; c <= cols + 1; c++) {
                let cx = c * colStep;
                let cy = r * rowStep;
                if (Math.abs(c % 2) === 1) cy += rowStep / 2;

                const hexRadiusY = (Math.sqrt(3) / 2) * hexRadius;
                if (
                    cx - hexRadius > thickness + margin &&
                    cx + hexRadius < lengthY - margin &&
                    cy - hexRadiusY > thickness + margin &&
                    cy + hexRadiusY < wallHeight - margin
                ) {
                    shapeW2.holes.push(createHexHole(cx, cy, hexRadius, hexChamfer));
                }
            }
        }
    }

    const geoW2 = new THREE.ExtrudeGeometry(shapeW2, extrudeSettings);
    geoW2.rotateY(-Math.PI / 2);
    geoW2.translate(thickness, 0, 0);
    geometries.push(geoW2);

    const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
    mergedGeo.computeVertexNormals();
    
    // Center the bracket
    mergedGeo.translate(-lengthX / 2, 0, -lengthY / 2);

    const mesh = new THREE.Mesh(mergedGeo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

export function createParametricPlantSupportMesh(params, material) {
    const {
        innerDiameter = 90,
        ringWidth = 14,
        ringHeight = 6,
        openingAngle = 45,
        stakeHeight = 120,
        slotSize = 7,
        tipLength = 22,
        snapAllowance = 0.6,
        fitClearance = 0.2
    } = params;

    const geometries = [];

    // ==========================================
    // 1. C-RING WITH 3 RECTANGULAR STAKE SLOTS
    // ==========================================
    const rIn = Math.max(10, innerDiameter / 2);
    const bandWidth = Math.max(4, ringWidth);
    const rOut = rIn + bandWidth;
    const rMid = rIn + bandWidth / 2;
    const rCap = bandWidth / 2;

    const clampedOpeningDeg = Math.min(Math.max(openingAngle, 10), 160);
    const alpha = (clampedOpeningDeg * Math.PI) / 180;

    // Place opening at bottom-right (-45 deg) to match the drawing
    const gapCenterAngle = -Math.PI / 4;
    const startAngle = gapCenterAngle + alpha / 2;
    const endAngle = gapCenterAngle + Math.PI * 2 - alpha / 2;

    const ringShape = new THREE.Shape();

    // Start at outer arc start
    ringShape.absarc(0, 0, rOut, startAngle, endAngle, false);

    // Rounded semicircular cap at endAngle
    const endCapCx = rMid * Math.cos(endAngle);
    const endCapCy = rMid * Math.sin(endAngle);
    ringShape.absarc(endCapCx, endCapCy, rCap, endAngle, endAngle + Math.PI, false);

    // Inner arc back from endAngle to startAngle (clockwise)
    ringShape.absarc(0, 0, rIn, endAngle, startAngle, true);

    // Rounded semicircular cap at startAngle
    const startCapCx = rMid * Math.cos(startAngle);
    const startCapCy = rMid * Math.sin(startAngle);
    ringShape.absarc(startCapCx, startCapCy, rCap, startAngle - Math.PI, startAngle, false);
    ringShape.closePath();

    // 3 square slots spaced evenly around the ring
    const squareHoleSize = Math.max(3, Math.min(slotSize, bandWidth - 2));
    const holeTangential = squareHoleSize;
    const holeRadial = squareHoleSize;
    const halfT = holeTangential / 2;
    const halfR = holeRadial / 2;

    // Distribute 3 slots along the active arc
    const arcSpan = endAngle - startAngle;
    const slotAngles = [
        startAngle + arcSpan * (1 / 6),
        startAngle + arcSpan * (3 / 6),
        startAngle + arcSpan * (5 / 6)
    ];

    for (const theta of slotAngles) {
        const urX = Math.cos(theta);
        const urY = Math.sin(theta);
        const utX = -Math.sin(theta);
        const utY = Math.cos(theta);

        const cx = rMid * urX;
        const cy = rMid * urY;

        // Clockwise path for hole
        const p1x = cx - halfR * urX + halfT * utX;
        const p1y = cy - halfR * urY + halfT * utY;
        const p2x = cx + halfR * urX + halfT * utX;
        const p2y = cy + halfR * urY + halfT * utY;
        const p3x = cx + halfR * urX - halfT * utX;
        const p3y = cy + halfR * urY - halfT * utY;
        const p4x = cx - halfR * urX - halfT * utX;
        const p4y = cy - halfR * urY - halfT * utY;

        const holePath = new THREE.Path();
        holePath.moveTo(p1x, p1y);
        holePath.lineTo(p2x, p2y);
        holePath.lineTo(p3x, p3y);
        holePath.lineTo(p4x, p4y);
        holePath.lineTo(p1x, p1y);
        ringShape.holes.push(holePath);
    }

    const rHeight = Math.max(2, ringHeight);
    const ringExtrude = {
        depth: rHeight,
        bevelEnabled: false,
        curveSegments: 64
    };
    const ringGeo = new THREE.ExtrudeGeometry(ringShape, ringExtrude);
    ringGeo.deleteAttribute('uv');
    // Rotate so ring lies flat on XZ plane, Y in [0, rHeight]
    ringGeo.rotateX(Math.PI / 2);
    ringGeo.translate(0, rHeight, 0);
    ringGeo.computeVertexNormals();
    geometries.push(ringGeo);

    // Standalone centered Ring mesh for individual STL export
    const ringExportGeo = ringGeo.clone();
    const ringMesh = new THREE.Mesh(ringExportGeo, material);

    // ==========================================
    // 2. THREE CLICK-FIT STAKES (FLAT ON BED)
    // ==========================================
    // Anatomy of the Click-Fit Stake (along Y in 2D shape -> Z in 3D):
    // - Top Snap Head with lead-in taper, outward snap ridge, and central flex relief slot
    // - Locking Groove (Neck) matching ringHeight (rh) + clearance
    // - Support Shoulder Collar that stops the ring from sliding down
    // - Uniform straight shaft + pointed spike tip at the bottom
    const totalH = Math.max(40, stakeHeight);
    const clearance = Math.min(Math.max(0.05, fitClearance), 0.8);
    const bump = Math.min(Math.max(0.2, snapAllowance), 2.0);

    const stakeThickness = Math.max(2.0, holeRadial - clearance);
    const shaftW = holeTangential;
    const neckW = Math.max(2.2, holeTangential - clearance);
    const snapHeadBaseW = neckW + 2 * bump;
    const snapTipW = Math.max(1.8, neckW - 0.8);
    const collarW = holeTangential + 3.2;

    const headRampLen = 4.0;
    const headRetainBevel = 0.8;
    const neckLen = rHeight + Math.max(0.2, clearance);
    const collarLen = 3.0;
    const collarChamfer = 1.6;
    const spikeLen = Math.min(Math.max(8, tipLength), totalH * 0.4);

    // Relief slot in the center of the snap head so prongs flex inward and click
    const slotW = Math.min(Math.max(1.2, neckW * 0.26), neckW - 1.6);
    const slotDepth = headRampLen + headRetainBevel + neckLen + 1.5;

    function createSingleStakeGeometry() {
        // Draw in 2D (x = width, y = length along stake from +totalH/2 top to -totalH/2 tip)
        // After rotateX(Math.PI / 2), y becomes +Z (so top is at -Z, tip is at +Z)
        const yTop = totalH / 2;
        const yRidge = yTop - headRampLen;
        const yNeckTop = yRidge - headRetainBevel;
        const yNeckBot = yNeckTop - neckLen;
        const yCollarBot = yNeckBot - collarLen;
        const yShaftTop = yCollarBot - collarChamfer;
        const ySpikeStart = -totalH / 2 + spikeLen;
        const yTip = -totalH / 2;

        const ySlotBottom = yTop - slotDepth;
        const halfSlot = slotW / 2;

        const s = new THREE.Shape();

        // Start at bottom pointed spike tip (0, yTip) and trace counter-clockwise:
        // Right side (bottom -> top)
        s.moveTo(0, yTip);
        s.lineTo(shaftW / 2, ySpikeStart);
        s.lineTo(shaftW / 2, yShaftTop);
        s.lineTo(collarW / 2, yCollarBot);
        s.lineTo(collarW / 2, yNeckBot);
        s.lineTo(neckW / 2, yNeckBot);
        s.lineTo(neckW / 2, yNeckTop);
        s.lineTo(snapHeadBaseW / 2, yRidge);
        s.lineTo(snapTipW / 2, yTop);

        // Top right prong tip -> down into center flex relief slot
        s.lineTo(halfSlot, yTop);
        s.lineTo(halfSlot, ySlotBottom + halfSlot);
        // Semicircular stress-relief arc at bottom of flex slot (clockwise from 0 to -PI)
        s.absarc(0, ySlotBottom + halfSlot, halfSlot, 0, Math.PI, true);
        s.lineTo(-halfSlot, yTop);

        // Left side (top -> bottom)
        s.lineTo(-snapTipW / 2, yTop);
        s.lineTo(-snapHeadBaseW / 2, yRidge);
        s.lineTo(-neckW / 2, yNeckTop);
        s.lineTo(-neckW / 2, yNeckBot);
        s.lineTo(-collarW / 2, yNeckBot);
        s.lineTo(-collarW / 2, yCollarBot);
        s.lineTo(-shaftW / 2, yShaftTop);
        s.lineTo(-shaftW / 2, ySpikeStart);
        s.lineTo(0, yTip);
        s.closePath();

        const stakeGeo = new THREE.ExtrudeGeometry(s, {
            depth: stakeThickness,
            bevelEnabled: false,
            curveSegments: 16
        });
        stakeGeo.deleteAttribute('uv');
        // Rotate so stake lies flat on XZ build plate, Y in [0, stakeThickness]
        stakeGeo.rotateX(Math.PI / 2);
        stakeGeo.translate(0, stakeThickness, 0);
        stakeGeo.computeVertexNormals();
        return stakeGeo;
    }

    const stakeSpacing = collarW + 10;
    const firstStakeX = rOut + 18 + collarW / 2;
    const stakeExportGeometries = [];

    for (let i = 0; i < 3; i++) {
        const stakeGeo = createSingleStakeGeometry();
        stakeGeo.translate(firstStakeX + i * stakeSpacing, 0, 0);
        geometries.push(stakeGeo);

        // Centered stakes for individual STL export (-stakeSpacing, 0, +stakeSpacing)
        const centeredStakeGeo = createSingleStakeGeometry();
        centeredStakeGeo.translate((i - 1) * stakeSpacing, 0, 0);
        stakeExportGeometries.push(centeredStakeGeo);
    }

    const stakesExportGeo = BufferGeometryUtils.mergeGeometries(stakeExportGeometries);
    stakesExportGeo.computeVertexNormals();
    const stakesMesh = new THREE.Mesh(stakesExportGeo, material);

    // Single centered stake for individual STL export
    const singleStakeGeo = createSingleStakeGeometry();
    const singleStakeMesh = new THREE.Mesh(singleStakeGeo, material);

    // ==========================================
    // 3. MERGE & CENTER ON BUILD PLATE
    // ==========================================
    const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
    mergedGeo.computeVertexNormals();

    // Center the combined layout along X so ring + 3 stakes sit balanced at the origin
    const minX = -rOut;
    const maxX = firstStakeX + 2 * stakeSpacing + collarW / 2;
    const centerX = (minX + maxX) / 2;
    mergedGeo.translate(-centerX, 0, 0);

    const mesh = new THREE.Mesh(mergedGeo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { ringMesh, stakesMesh, singleStakeMesh };
    return mesh;
}
