import { OrderedSet } from 'molstar/lib/mol-data/int';
import { GridLookup3D } from 'molstar/lib/mol-math/geometry';
import { getBoundary } from 'molstar/lib/mol-math/geometry/boundary';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';


const _vec = Vec3();

export interface Coords { x: Float32Array, y: Float32Array, z: Float32Array }

export const Coords = {
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
        const n = coords.x.length;
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
        const n = coords.x.length;
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
        const n = coords.x.length;
        return Vec3.create(sumX / n, sumY / n, sumZ / n);
    },
    center(coords: Coords): Coords {
        return Coords.subtractVector(coords, Coords.getCenter(coords));
    },
    projectOnPlane(coords: Coords, planeNormal: Vec3, pivot?: Vec3): Coords {
        const n = coords.x.length;
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
        // if (pivot) {
        //     return {
        //         x: new Float32Array([pivot[0]]),
        //         y: new Float32Array([pivot[1]]),
        //         z: new Float32Array([pivot[2]]),
        //     };
        // }
        return pivot ? Coords.addVector(out, pivot) : out;
        // TODO: do this on flat coords for better performance
    },
};


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
    if (radius < 0 || target.x.length === 0) return { x: new Float32Array(0), y: new Float32Array(0), z: new Float32Array(0) };

    const targetData = {
        x: target.x,
        y: target.y,
        z: target.z,
        indices: OrderedSet.ofBounds(0, target.x.length),
    };
    const lookup = GridLookup3D(targetData, getBoundary(targetData));
    const x: number[] = [];
    const y: number[] = [];
    const z: number[] = [];

    for (let i = 0; i < coords.x.length; i++) {
        if (lookup.find(coords.x[i], coords.y[i], coords.z[i], radius).count > 0) { // .find could be replaced by .check here
            x.push(coords.x[i]);
            y.push(coords.y[i]);
            z.push(coords.z[i]);
        }
    }

    return { x: Float32Array.from(x), y: Float32Array.from(y), z: Float32Array.from(z) };
}

export function getMidPoints(a: Coords, b: Coords, radius: number): { midpoints: Coords, vectors: Coords } {
    const bData = {
        x: b.x,
        y: b.y,
        z: b.z,
        indices: OrderedSet.ofBounds(0, b.x.length),
    };
    const lookup = GridLookup3D(bData, getBoundary(bData));
    const midX: number[] = [];
    const midY: number[] = [];
    const midZ: number[] = [];
    const diffX: number[] = [];
    const diffY: number[] = [];
    const diffZ: number[] = [];

    const nA = a.x.length;
    for (let i = 0; i < nA; i++) {
        const result = lookup.find(a.x[i], a.y[i], a.z[i], radius);
        // console.log('sqd', ...result.squaredDistances.slice(0, result.count))
        if (result.count === 0) continue;
        // let best = 0;
        // for (let idx = 0; idx < result.count; idx++) { // Cannot iterate over result.indices directly, as it can contain more than result.count elements (hurray undocumented behavior!)
        //     if (result.squaredDistances[idx] < result.squaredDistances[best]) best = idx;
        // }
        // const idx = best;
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

export function getPca(coords: Coords, type: 'moments' | 'box') {
    const flatCoords = Coords.flatten(coords);
    if (type === 'moments') return PrincipalAxes.calculateMomentsAxes(flatCoords);
    else return PrincipalAxes.ofPositions(flatCoords).boxAxes;
}

