import { OrderedSet } from 'molstar/lib/mol-data/int';
import { GridLookup3D, PositionData, Result } from 'molstar/lib/mol-math/geometry';
import { getBoundary } from 'molstar/lib/mol-math/geometry/boundary';
import { Mat3, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';


/** Cartesian coordinates of points in 3D */
export interface Coords {
    x: Float32Array,
    y: Float32Array,
    z: Float32Array,
}

export const Coords = {
    /** Get number of points in `coords` */
    length(coords: Coords): number {
        return coords.x.length;
    },
    /** Create new `Coords` object from arrays of x, y, z coordinates */
    create(x: number[], y: number[], z: number[]): Coords {
        const n = x.length;
        if (y.length !== n || z.length !== n) throw new Error('Arrays must have the same length');
        return { x: Float32Array.from(x), y: Float32Array.from(y), z: Float32Array.from(z) };
    },
    /** Convert `Coords` to a flat Float32Array with x,y,z stored in triplets */
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
    /** Concatenate two `Coords` */
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
    /** Get center of mass of `Coords` */
    getCenter(coords: Coords): Vec3 {
        const sumX = coords.x.reduce((a, b) => a + b, 0);
        const sumY = coords.y.reduce((a, b) => a + b, 0);
        const sumZ = coords.z.reduce((a, b) => a + b, 0);
        const n = Coords.length(coords);
        return Vec3.create(sumX / n, sumY / n, sumZ / n);
    },
    /** Get vector position of point `i` in `coords` and store it to `out` */
    toVector(out: Vec3, coords: Coords, i: number) {
        out[0] = coords.x[i];
        out[1] = coords.y[i];
        out[2] = coords.z[i];
        return out;
    },
    /** Get moments of inertia of a set of points, assuming unit mass of each point */
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


/** Moments of inertia of an object */
export interface Inertia {
    /** Center of mass */
    center: Vec3,
    /** Mass of the object */
    mass: number,
    /** Tensor of moments of inertia of the object (always symmetric) */
    tensor: Mat3,
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

/** Get pairs of points in `a` and `b` which form "true contacts", i.e. the midpoint of the pair is not closer to any other point in `a` or `b`. */
export function getTrueContacts(a: Coords, b: Coords, radius: number): { midpoints: Coords, pointsInA: Coords, pointsInB: Coords } {
    const nA = Coords.length(a);
    const nB = Coords.length(b);
    const aData: PositionData = { ...a, indices: OrderedSet.ofBounds(0, nA) };
    const bData: PositionData = { ...b, indices: OrderedSet.ofBounds(0, nB) };
    const lookupA = GridLookup3D(aData, getBoundary(aData));
    const lookupB = GridLookup3D(bData, getBoundary(bData));
    const midX: number[] = [];
    const midY: number[] = [];
    const midZ: number[] = [];
    const startsX: number[] = [];
    const startsY: number[] = [];
    const startsZ: number[] = [];
    const endsX: number[] = [];
    const endsY: number[] = [];
    const endsZ: number[] = [];

    const lookupResult = Result.create(); // to avoid reusing lookupB's internal result object within nested loop
    const u = Vec3(), v = Vec3(), mid = Vec3();
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
            startsX.push(u[0]);
            startsY.push(u[1]);
            startsZ.push(u[2]);
            endsX.push(v[0]);
            endsY.push(v[1]);
            endsZ.push(v[2]);
        }
    }
    return {
        midpoints: Coords.create(midX, midY, midZ),
        pointsInA: Coords.create(startsX, startsY, startsZ),
        pointsInB: Coords.create(endsX, endsY, endsZ),
    };
}

/** Get theoretical force and torque resulting from mutual repulsion of pairs of points */
export function getForceAndTorque(contacts: ReturnType<typeof getTrueContacts>, pivotA: Vec3, pivotB: Vec3) {
    const { pointsInA, pointsInB } = contacts;
    const n = Coords.length(pointsInA);
    const u = Vec3(), v = Vec3(), f = Vec3(), t = Vec3();
    const forceA = Vec3.zero(), torqueA = Vec3.zero(), forceB = Vec3.zero(), torqueB = Vec3.zero();
    for (let i = 0; i < n; i++) {
        Coords.toVector(u, pointsInA, i);
        Coords.toVector(v, pointsInB, i);
        Vec3.normalize(f, Vec3.sub(f, v, u));
        Vec3.cross(t, Vec3.sub(t, v, pivotB), f);
        Vec3.add(forceB, forceB, f);
        Vec3.add(torqueB, torqueB, t);
        Vec3.negate(f, f);
        Vec3.cross(t, Vec3.sub(t, u, pivotA), f);
        Vec3.add(forceA, forceA, f);
        Vec3.add(torqueA, torqueA, t);
    }
    return { forceA, torqueA, forceB, torqueB };
}

/** Return linear and angular impulse (change of momentum) resulting from given force and torque applied on an object with given inertia over given time. */
export function getImpulse(inertia: Inertia, force: Vec3, torque: Vec3, time: number): { linear: Vec3, angular: Vec3 } {
    const linear = Vec3.scale(Vec3(), force, time / inertia.mass);
    const angular = Vec3.transformMat3(Vec3(), torque, Mat3.invert(Mat3(), inertia.tensor));
    Vec3.scale(angular, angular, time);
    return { linear, angular };
}

/** Return true if the lookup result contains any index other than `otherThan` */
function lookupResultHasOtherThan<T>(result: Result<T>, otherThan: T) {
    for (let i = 0; i < result.count; i++) {
        if (result.indices[i] !== otherThan) return true;
    }
    return false;
}
