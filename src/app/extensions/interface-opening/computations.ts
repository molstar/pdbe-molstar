import type { MVSNodeParams } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-tree';
import type { ComponentExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { GridLookup3D, PositionData, Result } from 'molstar/lib/mol-math/geometry';
import { getBoundary } from 'molstar/lib/mol-math/geometry/boundary';
import { Mat3, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { StructureQuery, StructureSelection, type Structure } from 'molstar/lib/mol-model/structure';
import { QueryHelper } from '../../helpers';
import type { InterfaceAnimationTransforms } from './mvs';


/** Cartesian coordinates of points in 3D */
interface Coords {
    x: Float32Array,
    y: Float32Array,
    z: Float32Array,
}

const Coords = {
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
        return {
            x: concatArrays(a.x, b.x),
            y: concatArrays(a.y, b.y),
            z: concatArrays(a.z, b.z),
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

function concatArrays(p: Float32Array, q: Float32Array): Float32Array {
    const out = new Float32Array(p.length + q.length);
    out.set(p, 0);
    out.set(q, p.length);
    return out;
}


/** Moments of inertia of an object */
interface Inertia {
    /** Center of mass */
    center: Vec3,
    /** Mass of the object */
    mass: number,
    /** Tensor of moments of inertia of the object (always symmetric) */
    tensor: Mat3,
}


/** Get atom coordinates from a structure, ignore hydrogens */
function getStructureCoords(structure: Structure): Coords {
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];

    for (const unit of structure.units) {
        const hierarchy = unit.model.atomicHierarchy;
        const conformation = unit.conformation;
        OrderedSet.forEach(unit.elements, element => {
            const typeSymbol = hierarchy.atoms.type_symbol.value(element);
            if (typeSymbol !== 'H') {
                x.push(conformation.x(element));
                y.push(conformation.y(element));
                z.push(conformation.z(element));
            }
        });
    }

    return { x: Float32Array.from(x), y: Float32Array.from(y), z: Float32Array.from(z) };
}

function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
}

/** Return subset of points from `coords` which lie within `radius` around any point in `target` */
function getCoordsWithin(coords: Coords, target: Coords, radius: number): Coords {
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

export interface InterfaceOpeningAxes {
    /** Center of the interface bounding box, target for camera focus */
    center: Vec3,
    /** Direction of opening hinge axis (displayed bottom-up on screen), with size 1/2 of interface bounding box */
    hingeAxis: Vec3,
    /** Direction from opening hinge axis towards the interface center (displayed out-from-screen), with size 1/2 of interface bounding box */
    outAxis: Vec3,
    /** Direction of partnerB when opening (displayed left-to-right) */
    movementAxis: Vec3,
    /** Radius from opening hinge axis to the interface center */
    openingRadius: number,
    /** Optional linear and angular impulses for nicer animation */
    impulses?: { a: { linear: Vec3, angular: Vec3, pivot: Vec3 }, b: { linear: Vec3, angular: Vec3, pivot: Vec3 } },
}

/** Return axes and measurements for interface opening animation */
export function getInterfaceOpeningAxes(structure: Structure, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[]) {
    const coordsA = getStructureCoords(getSubstructure(structure, partnerA));
    const coordsB = getStructureCoords(getSubstructure(structure, partnerB));

    const INTERFACE_RADIUS = 8;
    const interfaceA = getCoordsWithin(coordsA, coordsB, INTERFACE_RADIUS);
    const interfaceB = getCoordsWithin(coordsB, coordsA, INTERFACE_RADIUS);
    const interfaceMerged = Coords.concat(interfaceA, interfaceB);

    const contacts = getTrueContacts(interfaceA, interfaceB, INTERFACE_RADIUS);
    const openingPca = PrincipalAxes.calculateNormalizedAxes(PrincipalAxes.calculateMomentsAxes(Coords.flatten(contacts.midpoints)));
    const centerA = Coords.getCenter(interfaceA);
    const centerB = Coords.getCenter(interfaceB);
    const centerInterface = Vec3.center(Vec3(), centerA, centerB);
    const centerProteins = Vec3.center(Vec3(), Coords.getCenter(coordsA), Coords.getCenter(coordsB));
    const _vec = Vec3();
    if (Vec3.dot(openingPca.dirC, Vec3.sub(_vec, centerB, centerA)) < 0) {
        Vec3.negate(openingPca.dirC, openingPca.dirC); // right on screen (direction of movement of the second partner)
    }
    if (Vec3.dot(openingPca.dirB, Vec3.sub(_vec, centerInterface, centerProteins)) < 0) {
        Vec3.negate(openingPca.dirB, openingPca.dirB); // out of screen (out of the opening interface)
    }
    Vec3.cross(openingPca.dirA, openingPca.dirB, openingPca.dirC); // up on screen (hinge axis)

    const box = PrincipalAxes.calculateBoxAxes(Coords.flatten(interfaceMerged), openingPca);
    const OPENING_RADIUS_FACTOR = 1.05;
    const OPENING_RADIUS_EXTRA = 1;
    const boxWholeA = PrincipalAxes.calculateBoxAxes(Coords.flatten(coordsA), openingPca);
    const openingRadiusA = Vec3.magnitude(Vec3.projectOnVector(_vec, Vec3.sub(_vec, Vec3.sub(_vec, boxWholeA.origin, boxWholeA.dirB), box.origin), box.dirB));
    const boxWholeB = PrincipalAxes.calculateBoxAxes(Coords.flatten(coordsB), openingPca);
    const openingRadiusB = Vec3.magnitude(Vec3.projectOnVector(_vec, Vec3.sub(_vec, Vec3.sub(_vec, boxWholeB.origin, boxWholeB.dirB), box.origin), box.dirB));
    const openingRadius = (openingRadiusA + openingRadiusB) / 2 * OPENING_RADIUS_FACTOR + OPENING_RADIUS_EXTRA;

    const BOX_SIZE_FACTOR = 1.05;
    const BOX_SIZE_EXTRA = 5;
    Vec3.setMagnitude(box.dirA, box.dirA, Vec3.magnitude(box.dirA) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);
    Vec3.setMagnitude(box.dirB, box.dirB, Vec3.magnitude(box.dirB) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);
    Vec3.setMagnitude(box.dirC, box.dirC, Vec3.magnitude(box.dirB) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);

    const inertiaA = Coords.getInertia(coordsA);
    const inertiaB = Coords.getInertia(coordsB);
    const forces = getForceAndTorque(contacts, inertiaA.center, inertiaB.center);
    const impulses = {
        a: getImpulse(inertiaA, forces.forceA, forces.torqueA, 1),
        b: getImpulse(inertiaB, forces.forceB, forces.torqueB, 1),
    };
    return { center: box.origin, hingeAxis: box.dirA, outAxis: box.dirB, movementAxis: box.dirC, openingRadius, impulses };
}


/** Get pairs of points in `a` and `b` which form "true contacts", i.e. the midpoint of the pair is not closer to any other point in `a` or `b`. */
function getTrueContacts(a: Coords, b: Coords, radius: number): { midpoints: Coords, pointsInA: Coords, pointsInB: Coords } {
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
function getForceAndTorque(contacts: ReturnType<typeof getTrueContacts>, pivotA: Vec3, pivotB: Vec3) {
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
function getImpulse(inertia: Inertia, force: Vec3, torque: Vec3, time: number): { linear: Vec3, angular: Vec3, pivot: Vec3 } {
    const linear = Vec3.scale(Vec3(), force, time / inertia.mass);
    const angular = Vec3.transformMat3(Vec3(), torque, Mat3.invert(Mat3(), inertia.tensor));
    Vec3.scale(angular, angular, time);
    return { linear, angular, pivot: inertia.center };
}

/** Return true if the lookup result contains any index other than `otherThan` */
function lookupResultHasOtherThan<T>(result: Result<T>, otherThan: T) {
    for (let i = 0; i < result.count; i++) {
        if (result.indices[i] !== otherThan) return true;
    }
    return false;
}


export function getInterfaceOpeningCamera(axes: InterfaceOpeningAxes, options?: { viewportAspectRatio?: number }): MVSNodeParams<'camera'> {
    const viewportAspectRatio = options?.viewportAspectRatio ?? 1;
    const rX = axes.openingRadius + Vec3.magnitude(axes.outAxis);
    const rY = Vec3.magnitude(axes.hingeAxis);
    const visRadius = Math.max(rX / viewportAspectRatio, rY);
    const dist = 2 * visRadius;

    return {
        target: MvsVector(axes.center),
        position: MvsVector(Vec3.add(Vec3(), axes.center, Vec3.setMagnitude(Vec3(), axes.outAxis, dist))),
        up: MvsVector(axes.hingeAxis),
    };
}

export function getInterfaceOpeningTransforms(axes: InterfaceOpeningAxes): InterfaceAnimationTransforms {
    const rotation_center = MvsVector(axes.center);
    const rotA = Mat3.fromRotation(Mat3(), -0.5 * Math.PI, axes.hingeAxis);
    const rotB = Mat3.fromRotation(Mat3(), 0.5 * Math.PI, axes.hingeAxis);
    const translation = Vec3.setMagnitude(Vec3(), axes.movementAxis, axes.openingRadius);
    const transA: Vector3 = MvsVector(Vec3.negate(Vec3(), translation));
    const transB: Vector3 = MvsVector(translation);

    return {
        a: { rotation_center, rotation: rotA, translation: transA },
        b: { rotation_center, rotation: rotB, translation: transB },
    };
}

export function getInterfaceOpeningImpulseTransforms(axes: InterfaceOpeningAxes, options?: { rotationFactor?: number, translationFactor?: number }): InterfaceAnimationTransforms | undefined {
    if (!axes.impulses) return undefined;

    const rotationFactor = options?.rotationFactor ?? 40;
    const translationFactor = options?.translationFactor ?? 40;

    const transVecA = Vec3.scale(Vec3(), axes.impulses.a.linear, translationFactor);
    const transVecB = Vec3.scale(Vec3(), axes.impulses.b.linear, translationFactor);
    const rotVecA = Vec3.scale(Vec3(), axes.impulses.a.angular, rotationFactor);
    const rotVecB = Vec3.scale(Vec3(), axes.impulses.b.angular, rotationFactor);

    // Limit rotation to axis parallel to interface normal
    Vec3.projectOnVector(rotVecA, rotVecA, axes.movementAxis);
    Vec3.projectOnVector(rotVecB, rotVecB, axes.movementAxis);
    // Limit translation to interface plane
    Vec3.projectOnPlane(transVecA, transVecA, axes.movementAxis);
    Vec3.projectOnPlane(transVecB, transVecB, axes.movementAxis);

    // Ensure rotations do not exceed half turn (would cause incorrect interpolation)
    const MAX_ROT = .99 * Math.PI;
    const safeguardFactor = 1 / Math.max(Vec3.magnitude(rotVecA) / MAX_ROT, Vec3.magnitude(rotVecB) / MAX_ROT, 1);
    if (safeguardFactor !== 1) {
        Vec3.scale(rotVecA, rotVecA, safeguardFactor);
        Vec3.scale(rotVecB, rotVecB, safeguardFactor);
    }

    const rotAngleA = Vec3.magnitude(rotVecA);
    const rotAngleB = Vec3.magnitude(rotVecB);
    // Do not apply small rotations as they may be interpolated incorrectly
    const rotA = rotAngleA >= 1e-3 ? Mat3.fromRotation(Mat3(), rotAngleA, rotVecA) : undefined;
    const rotB = rotAngleB >= 1e-3 ? Mat3.fromRotation(Mat3(), rotAngleB, rotVecB) : undefined;

    return {
        a: {
            rotation_center: MvsVector(axes.impulses.a.pivot),
            rotation: rotA,
            translation: MvsVector(transVecA),
        },
        b: {
            rotation_center: MvsVector(axes.impulses.b.pivot),
            rotation: rotB,
            translation: MvsVector(transVecB),
        },
    };
}

function MvsVector(vec3: Vec3): Vector3 {
    return [vec3[0], vec3[1], vec3[2]];
}
