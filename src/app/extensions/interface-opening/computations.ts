import { OrderedSet } from 'molstar/lib/mol-data/int';
import { GridLookup3D, PositionData, Result } from 'molstar/lib/mol-math/geometry';
import { getBoundary } from 'molstar/lib/mol-math/geometry/boundary';
import { Mat3, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import { range } from 'molstar/lib/mol-util/array';


const _vec = Vec3();

export interface Coords { x: Float32Array, y: Float32Array, z: Float32Array }

export const Coords = {
    length(coords: Coords): number{
        return coords.x.length;
    },
    empty(n: number): Coords {
        return {
            x: new Float32Array(n),
            y: new Float32Array(n),
            z: new Float32Array(n),
        };
    },
    flatten({ x, y, z }: Coords): Float32Array {
        const n = x.length;
        const out = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) {
            out[3 * i] = x[i];
            out[3 * i + 1] = y[i];
            out[3 * i + 2] = z[i];
        }
        return out;
    },
    concat(a: Coords, b: Coords): Coords {
        function concatArray(p: Float32Array, q: Float32Array): Float32Array {
            return new Float32Array(Array.from(p).concat(Array.from(q))); // thank you javascript for making this easy for me
            // TODO: do this smarter
        }
        return {
            x: concatArray(a.x, b.x),
            y: concatArray(a.y, b.y),
            z: concatArray(a.z, b.z),
        };
    },
    copy(coords: Coords): Coords {
        return {
            x: new Float32Array(coords.x),
            y: new Float32Array(coords.y),
            z: new Float32Array(coords.z),
        };
    },
    addVector(coords: Coords, vector: Vec3): Coords {
        const n = Coords.length(coords);
        const [x0, y0, z0] = vector;
        const { x, y, z } = Coords.copy(coords);
        for (let i = 0; i < n; i++) {
            x[i] += x0;
            y[i] += y0;
            z[i] += z0;
        }
        return { x, y, z };
    },
    subtractVector(coords: Coords, vector: Vec3): Coords {
        const n = Coords.length(coords);
        const [x0, y0, z0] = vector;
        const { x, y, z } = Coords.copy(coords);
        for (let i = 0; i < n; i++) {
            x[i] -= x0;
            y[i] -= y0;
            z[i] -= z0;
        }
        return { x, y, z };
    },
    getCenter(coords: Coords): Vec3 {
        const sumX = coords.x.reduce((a, b) => a + b, 0);
        const sumY = coords.y.reduce((a, b) => a + b, 0);
        const sumZ = coords.z.reduce((a, b) => a + b, 0);
        const n = Coords.length(coords);
        return Vec3.create(sumX / n, sumY / n, sumZ / n);
    },
    center(coords: Coords): Coords {
        return Coords.subtractVector(coords, Coords.getCenter(coords));
    },
    projectOnPlane(coords: Coords, planeNormal: Vec3, pivot?: Vec3): Coords {
        const n = Coords.length(coords);
        const normal = Vec3.normalize(Vec3(), planeNormal);
        if (pivot) {
            coords = Coords.subtractVector(coords, pivot);
        }
        const out = Coords.empty(n);
        for (let i = 0; i < n; i++) {
            Vec3.set(_vec, coords.x[i], coords.y[i], coords.z[i]);
            Vec3.scaleAndSub(_vec, _vec, normal, Vec3.dot(_vec, normal));
            out.x[i] = _vec[0];
            out.y[i] = _vec[1];
            out.z[i] = _vec[2];
        }
        return pivot ? Coords.addVector(out, pivot) : out;
        // TODO: do this on flat coords for better performance
    },
    toVector(out: Vec3, coords: Coords, i: number) {
        out[0] = coords.x[i];
        out[1] = coords.y[i];
        out[2] = coords.z[i];
        return out;
    },
    getInertia(coords: Coords): Inertia {
        const center = Coords.getCenter(coords);
        let ixx = 0;
        let iyy = 0;
        let izz = 0;
        let ixy = 0;
        let ixz = 0;
        let iyz = 0;
        const n = Coords.length(coords);
        for (let i = 0; i < n; i++) {
            const x = coords.x[i] - center[0];
            const y = coords.y[i] - center[1];
            const z = coords.z[i] - center[2];
            ixx += y * y + z * z;
            iyy += x * x + z * z;
            izz += x * x + y * y;
            ixy -= x * y;
            ixz -= x * z;
            iyz -= y * z;
        }
        const tensor = Mat3.create(
            ixx, ixy, ixz,
            ixy, iyy, iyz,
            ixz, iyz, izz,
        );
        return { center, tensor, mass: n };
    },
};

export interface Inertia {
    center: Vec3,
    tensor: Mat3,
    mass: number,
}


/** Get atom coordinates from a structure, ignore hydrogens */
export function getStructureCoords(structure: Structure): Coords {
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];
    const location = StructureElement.Location.create(structure);
    const position = Vec3.zero();

    for (const unit of structure.units) {
        location.unit = unit;
        OrderedSet.forEach(unit.elements, element => {
            location.element = element;
            const typeSymbol = unit.model.atomicHierarchy.atoms.type_symbol.value(element);
            if (typeSymbol !== 'H') {
                StructureElement.Location.position(position, location);
                x.push(position[0]);
                y.push(position[1]);
                z.push(position[2]);
            }
        });
    }

    return { x: Float32Array.from(x), y: Float32Array.from(y), z: Float32Array.from(z) };
}

/** Return subset of points from `coords` which lie within `radius` around any point in `target` */
export function getCoordsWithin(coords: Coords, target: Coords, radius: number): Coords {
    const nCoords = Coords.length(coords);
    const nTarget = Coords.length(target);
    if (radius < 0 || nTarget === 0) return { x: new Float32Array(0), y: new Float32Array(0), z: new Float32Array(0) };

    const targetData = {
        x: target.x,
        y: target.y,
        z: target.z,
        indices: OrderedSet.ofBounds(0, nTarget),
    };
    const lookup = GridLookup3D(targetData, getBoundary(targetData));
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];

    for (let i = 0; i < nCoords; i++) {
        if (lookup.find(coords.x[i], coords.y[i], coords.z[i], radius).count > 0) { // .find could be replaced by .check here
            x.push(coords.x[i]);
            y.push(coords.y[i]);
            z.push(coords.z[i]);
        }
    }

    return { x: Float32Array.from(x), y: Float32Array.from(y), z: Float32Array.from(z) };
}

export function getMidpoints(a: Coords, b: Coords, radius: number): { midpoints: Coords, vectors: Coords } {
    const bData = {
        x: b.x,
        y: b.y,
        z: b.z,
        indices: OrderedSet.ofBounds(0, Coords.length(b)),
    };
    const lookup = GridLookup3D(bData, getBoundary(bData));
    const midX: number[] = [];
    const midY: number[] = [];
    const midZ: number[] = [];
    const diffX: number[] = [];
    const diffY: number[] = [];
    const diffZ: number[] = [];

    const nA = Coords.length(a);
    for (let i = 0; i < nA; i++) {
        const result = lookup.find(a.x[i], a.y[i], a.z[i], radius);
        if (result.count === 0) continue;
        for (let idx = 0; idx < result.count; idx++) { // Cannot iterate over result.indices directly, as it can contain more than result.count elements (hurray undocumented behavior!)
            const j = result.indices[idx];
            midX.push(0.5 * (a.x[i] + b.x[j]));
            midY.push(0.5 * (a.y[i] + b.y[j]));
            midZ.push(0.5 * (a.z[i] + b.z[j]));
            Vec3.set(_vec, b.x[j] - a.x[i], b.y[j] - a.y[i], b.z[j] - a.z[i]);
            Vec3.normalize(_vec, _vec);
            diffX.push(_vec[0]);
            diffY.push(_vec[1]);
            diffZ.push(_vec[2]);
        }
    }
    return {
        midpoints: { x: Float32Array.from(midX), y: Float32Array.from(midY), z: Float32Array.from(midZ) },
        vectors: { x: Float32Array.from(diffX), y: Float32Array.from(diffY), z: Float32Array.from(diffZ) },
    };
}

export function getTrueMidpoints(a: Coords, b: Coords, radius: number): { midpoints: Coords, vectors: Coords } {
    const nA = Coords.length(a);
    const nB = Coords.length(b);
    const aData: PositionData = { ...a, indices: OrderedSet.ofBounds(0, nA) };
    const bData: PositionData = { ...b, indices: OrderedSet.ofBounds(0, nB) };
    const lookupA = GridLookup3D(aData, getBoundary(aData));
    const lookupB = GridLookup3D(bData, getBoundary(bData));
    const midX: number[] = [];
    const midY: number[] = [];
    const midZ: number[] = [];
    const diffX: number[] = [];
    const diffY: number[] = [];
    const diffZ: number[] = [];

    const forwardResults = range(nA).map(i => {
        const result = lookupB.find(a.x[i], a.y[i], a.z[i], radius);
        return result.indices.slice(0, result.count);
    });
    const backwardResults = range(nB).map(j => {
        const result = lookupA.find(b.x[j], b.y[j], b.z[j], radius);
        return result.indices.slice(0, result.count);
    });
    const u = Vec3(), v = Vec3(), u_ = Vec3(), v_ = Vec3(), dir = Vec3(), rel = Vec3();
    for (let i = 0; i < nA; i++) {
        const result = forwardResults[i];
        for (const j of result) {
            const backResult = backwardResults[j];
            if (!backResult.includes(i)) throw new Error('Fuuuu'); // DEBUG
            Coords.toVector(u, a, i);
            Coords.toVector(v, b, j);
            const dist = Vec3.distance(u, v);
            Vec3.normalize(dir, Vec3.sub(_vec, v, u));
            const pA: number[] = [];
            const qA: number[] = [];
            for (const i_ of backResult) {
                Coords.toVector(u_, a, i_);
                Vec3.sub(rel, u_, u);
                const p = Vec3.dot(rel, dir);
                const q = Vec3.squaredMagnitude(Vec3.cross(_vec, rel, dir));
                if ((p < 0 || p > dist) && i_ !== i) continue; // Discard points that cannot affect the result, make sure not to discard self due to rounding
                pA.push(p);
                qA.push(q);
            }
            const pB: number[] = [];
            const qB: number[] = [];
            for (const j_ of result) {
                Coords.toVector(v_, b, j_);
                Vec3.sub(rel, v_, u);
                const p = Vec3.dot(rel, dir);
                const q = Vec3.squaredMagnitude(Vec3.cross(_vec, rel, dir));
                if ((p < 0 || p > dist) && j_ !== j) continue; // Discard points that cannot affect the result, make sure not to discard self due to rounding
                pB.push(p);
                qB.push(q);
            }
            const dOpt = sweetSpot(pA, qA, pB, qB, dist);
            if (dOpt < 0 || dOpt > dist) throw new Error(`dOpt out of bounds: ${dOpt} not in [0, ${dist}]`); // DEBUG
            Vec3.scaleAndAdd(_vec, u, dir, dOpt);
            if (Math.abs(dOpt / dist - 0.5) > 1e-8) continue; // Skip non-middle points?

            midX.push(_vec[0]);
            midY.push(_vec[1]);
            midZ.push(_vec[2]);

            diffX.push(dir[0]);
            diffY.push(dir[1]);
            diffZ.push(dir[2]);
        }
    }
    return {
        midpoints: { x: Float32Array.from(midX), y: Float32Array.from(midY), z: Float32Array.from(midZ) },
        vectors: { x: Float32Array.from(diffX), y: Float32Array.from(diffY), z: Float32Array.from(diffZ) },
    };
}

export function getTrueContactMidpoints(a: Coords, b: Coords, radius: number): { midpoints: Coords, vectors: Coords, indicesA: number[], indicesB: number[] } {
    const nA = Coords.length(a);
    const nB = Coords.length(b);
    const aData: PositionData = { ...a, indices: OrderedSet.ofBounds(0, nA) };
    const bData: PositionData = { ...b, indices: OrderedSet.ofBounds(0, nB) };
    const lookupA = GridLookup3D(aData, getBoundary(aData));
    const lookupB = GridLookup3D(bData, getBoundary(bData));
    const midX: number[] = [];
    const midY: number[] = [];
    const midZ: number[] = [];
    const diffX: number[] = [];
    const diffY: number[] = [];
    const diffZ: number[] = [];
    const indicesA: number[] = [];
    const indicesB: number[] = [];

    const lookupResult = Result.create(); // to avoid reusing lookupB's internal result object within nested loop
    const u = Vec3(), v = Vec3(), dir = Vec3(), mid = Vec3();
    for (let i = 0; i < nA; i++) {
        lookupB.find(a.x[i], a.y[i], a.z[i], radius, lookupResult);
        for (let idx = 0; idx < lookupResult.count; idx++) { // Cannot iterate over result.indices directly, as it can contain more than result.count elements (hurray undocumented behavior!)
            const j = lookupResult.indices[idx];
            Coords.toVector(u, a, i);
            Coords.toVector(v, b, j);
            Vec3.center(mid, u, v);
            const dist = Vec3.distance(u, v);
            const resA = lookupA.find(mid[0], mid[1], mid[2], 0.5 * dist);
            if (lookupResultHasOtherThan(resA, i)) continue;
            const resB = lookupB.find(mid[0], mid[1], mid[2], 0.5 * dist);
            if (lookupResultHasOtherThan(resB, j)) continue;

            midX.push(mid[0]);
            midY.push(mid[1]);
            midZ.push(mid[2]);

            Vec3.normalize(dir, Vec3.sub(dir, v, u));
            diffX.push(dir[0]);
            diffY.push(dir[1]);
            diffZ.push(dir[2]);

            indicesA.push(i);
            indicesB.push(j);
        }
    }
    return {
        midpoints: { x: Float32Array.from(midX), y: Float32Array.from(midY), z: Float32Array.from(midZ) },
        vectors: { x: Float32Array.from(diffX), y: Float32Array.from(diffY), z: Float32Array.from(diffZ) },
        indicesA,
        indicesB,
    };
}

export function getForceAndTorque(contacts: ReturnType<typeof getTrueContactMidpoints> & { surfaceA: Coords, surfaceB: Coords }, pivotA: Vec3, pivotB: Vec3) {
    const { vectors, indicesA, indicesB, surfaceA, surfaceB } = contacts;
    const n = indicesA.length;
    const u = Vec3(), v = Vec3(), f = Vec3(), t = Vec3();
    const sumFa = Vec3.zero(), sumTa = Vec3.zero(), sumFb = Vec3.zero(), sumTb = Vec3.zero();
    for (let i = 0; i < n; i++) {
        Coords.toVector(u, surfaceA, indicesA[i]);
        Coords.toVector(v, surfaceB, indicesB[i]);
        Coords.toVector(f, vectors, i);
        Vec3.cross(t, Vec3.sub(t, v, pivotB), f);
        Vec3.add(sumFb, sumFb, f);
        Vec3.add(sumTb, sumTb, t);
        Vec3.negate(f, f);
        Vec3.cross(t, Vec3.sub(t, u, pivotA), f);
        Vec3.add(sumFa, sumFa, f);
        Vec3.add(sumTa, sumTa, t);
    }
    return {
        // forceA: Vec3.scale(sumFa, sumFa, 1 / n),
        // torqueA: Vec3.scale(sumTa, sumTa, 1 / n),
        // forceB: Vec3.scale(sumFb, sumFb, 1 / n),
        // torqueB: Vec3.scale(sumTb, sumTb, 1 / n),
        forceA: sumFa,
        torqueA: sumTa,
        forceB: sumFb,
        torqueB: sumTb,
    };
}

/** Return true if the lookup result contains index other than `otherThan` */
function lookupResultHasOtherThan<T>(result: Result<T>, otherThan: T) {
    for (let i = 0; i < result.count; i++) {
        if (result.indices[i] !== otherThan) return true;
    }
    return false;
}

export function getPca(coords: Coords, type: 'moments' | 'box') {
    const flatCoords = Coords.flatten(coords);
    if (type === 'moments') return PrincipalAxes.calculateMomentsAxes(flatCoords);
    else return PrincipalAxes.ofPositions(flatCoords).boxAxes;
}

/** Return real number x from interval [0, xMax], such that
 * F(x) == G(x),
 * where
 * * F(x) = min(f(i, x) for i from 0 to nA-1)
 * * G(x) = min(g(j, x) for j from 0 to nB-1),
 * * f(i, x) = x > pA[i] ? (x - pA[i])**2 + qA[i] : qA[i],
 * * g(j, x) = x < pB[j] ? (pB[j] - x)**2 + qB[j] : qB[j],
 *  */
function sweetSpot(pA: number[], qA: number[], pB: number[], qB: number[], xMax: number) {
    const nA = pA.length;
    const nB = pB.length;
    const evaluateF = (x: number) => {
        let value = Infinity;
        for (let i = 0; i < nA; i++) {
            const delta = x - pA[i];
            const candidate = (delta > 0 ? delta * delta : 0) + qA[i];
            if (candidate < value) value = candidate;
        }
        return value;
    };
    const evaluateG = (x: number) => {
        let value = Infinity;
        for (let j = 0; j < nB; j++) {
            const delta = pB[j] - x;
            const candidate = (delta > 0 ? delta * delta : 0) + qB[j];
            if (candidate < value) value = candidate;
        }
        return value;
    };
    const objective = (x: number) => evaluateF(x) - evaluateG(x);

    let low = 0;
    let high = xMax;
    if (objective(low) >= 0) return low;
    if (objective(high) <= 0) return high;

    const MAX_ITERS = 64;
    const TOLERANCE = 0;
    for (let iter = 0; iter < MAX_ITERS; iter++) {
        const middle = 0.5 * (low + high);
        const obj = objective(middle);
        if (Math.abs(obj) <= TOLERANCE) return middle;
        if (obj <= 0) low = middle;
        else high = middle;
    }

    const out = 0.5 * (low + high);
    return out;
}


const EPSILON = 1e-6;
function assertEqual(x: number, y: number, epsilon: number = EPSILON) {
    if (Math.abs(x - y) > epsilon) {
        throw new Error(`Fuuu x!==y: ${x} ${y}`);
    }
}

// INTERFACE_RADIUS 6 (1hlu):
// getMidpoints: 1 ms
// getTrueMidpoints: 5099 ms (ref sweetSpot)
// getTrueMidpoints: 67 ms (sweetSpot with seq search)
// getTrueMidpoints: 16 ms (sweetSpot with bin search)


// INTERFACE_RADIUS 8 (1hlu):
// getMidpoints: 2.5 ms
// getTrueMidpoints: 48635 ms (ref sweetSpot)
// getTrueMidpoints: 344 ms (sweetSpot with seq search)
// getTrueMidpoints: 90 ms (sweetSpot with bin search)
// getTrueMidpoints: 69 ms (avoid vec allocation)

// INTERFACE_RADIUS 10 (1hlu):
// getMidpoints: 2.8 ms
// getTrueMidpoints: 348 ms (sweetSpot with bin search)
// getTrueMidpoints: 278 ms (avoid vec allocation)
