import { OrderedSet } from 'molstar/lib/mol-data/int';
import { GridLookup3D } from 'molstar/lib/mol-math/geometry';
import { getBoundary } from 'molstar/lib/mol-math/geometry/boundary';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';


export interface Coords { x: Float32Array, y: Float32Array, z: Float32Array }

export const Coords = {
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
        if (lookup.find(coords.x[i], coords.y[i], coords.z[i], radius).count > 0) {
            x.push(coords.x[i]);
            y.push(coords.y[i]);
            z.push(coords.z[i]);
        }
    }

    return { x: Float32Array.from(x), y: Float32Array.from(y), z: Float32Array.from(z) };
}

export function getPca(coords: Coords, type: 'moments' | 'box') {
    const flatCoords = Coords.flatten(coords);
    if (type === 'moments') return PrincipalAxes.calculateMomentsAxes(flatCoords);
    else return PrincipalAxes.ofPositions(flatCoords).boxAxes;
}
