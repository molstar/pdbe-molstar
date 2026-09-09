import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type MVSBuilder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import { ColorT, ComponentExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Axes3D } from 'molstar/lib/mol-math/geometry';
import { getBoundary } from 'molstar/lib/mol-math/geometry/boundary';
import { GridLookup3D } from 'molstar/lib/mol-math/geometry/lookup3d/grid';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { Structure, StructureElement, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { range } from 'molstar/lib/mol-util/array';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { QueryHelper } from '../../helpers';


// Examples:
// - 1hlu A-B: nice PyMOL example from https://dgoppenheimer.github.io/oppenheimer-blog/2016/12/30/profilin-actin-movie/
// - 1hda A-B, A-C, A-D: kinda nice
// - 2p9u D-F: ugly twisted interface


export async function runInterfaceOpening(plugin: PluginContext, pdbId: string, assemblyId: string | undefined, partner1: ComponentExpressionT[], partner2: ComponentExpressionT[]) {
    console.log('runInterfaceOpening', plugin, pdbId, assemblyId, partner1, partner2)

    const mvs0 = mvsDummy(pdbId, assemblyId);
    await loadMVS(plugin, mvs0);

    const structures = plugin.managers.structure.hierarchy.current.structures;
    if (structures.length !== 1) throw new Error('Failed to retrieve structure properly');
    const structure = structures[0].cell.obj?.data;
    if (!structure) throw new Error('Failed to retrieve structure data');

    const substructure1 = getSubstructure(structure, partner1);
    const substructure2 = getSubstructure(structure, partner2);
    // console.log(substructure1.elementCount, substructure1, substructure2.elementCount, substructure2)
    const coords1 = getCoords(substructure1);
    const coords2 = getCoords(substructure2);
    // console.log('coords', coords1, coords2)
    const INTERFACE_RADIUS = 5;
    const PCA_TYPE: 'box' | 'moments' = 'moments';
    const interface1 = getCoordsWithin(coords1, coords2, INTERFACE_RADIUS);
    const interface2 = getCoordsWithin(coords2, coords1, INTERFACE_RADIUS);
    const pca1 = getPca(interface1, PCA_TYPE);
    const pca2 = getPca(interface2, PCA_TYPE);


    // Compute interface plane normal:
    // - difference of means of interacting atoms on the two partners
    // - alternatives: averaged direction of vectors between interacting atoms?
    const interfaceNormal = Vec3.normalize(Vec3(), Vec3.sub(_vec, pca2.origin, pca1.origin));
    const interfaceCenter = Vec3.scale(Vec3(), Vec3.add(_vec, pca1.origin, pca2.origin), 0.5);

    // Compute major and minor axis of the interface:
    // - PCA of interacting atoms centered for the whole interface, projected on interface plane
    // - alternatives: PCA of interacting atoms centered for each partner separately, projected on interface plane?
    
    const translate = Vec3.scale(Vec3(), interfaceNormal, 5);

    console.log('PCA1:', Vec3.magnitude(pca1.dirA), Vec3.magnitude(pca1.dirB), Vec3.magnitude(pca1.dirC))
    console.log('PCA2:', Vec3.magnitude(pca2.dirA), Vec3.magnitude(pca2.dirB), Vec3.magnitude(pca2.dirC))

    await sleep(10);
    const mvs1 = MVSData.createMultistate([
        mvsInterface(pdbId, assemblyId, partner1, partner2, { interface1, interface2, pca1, pca2 }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, { interface1, interface2, pca1, pca2, translate }),
    ], {});
    await loadMVS(plugin, mvs1);
}


function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
}


interface Coords { x: Float32Array, y: Float32Array, z: Float32Array }
const Coords = {
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

/** Get atom coordinates */
function getCoords(structure: Structure): Coords {
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

function getPca(coords: Coords, type: 'moments' | 'box') {
    const flatCoords = Coords.flatten(coords);
    if (type === 'moments') return PrincipalAxes.calculateMomentsAxes(flatCoords);
    else return PrincipalAxes.ofPositions(flatCoords).boxAxes;
}

function mvsBase(pdbId: string, assemblyId: string | undefined, nStructureCopies: number) {
    const root = MVSData.createBuilder();
    const model = root
        .download({ url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}.bcif` })
        .parse({ format: 'bcif' });
    const structs = range(nStructureCopies).map(
        i => assemblyId ? model.assemblyStructure({ assembly_id: assemblyId, ref: `struct-${i}` }) : model.modelStructure({ ref: `struct-${i}` })
    );
    return { root, structs };
}

function mvsDummy(pdbId: string, assemblyId: string | undefined) {
    const base = mvsBase(pdbId, assemblyId, 1);
    base.structs[0].component().representation({ type: 'putty', size_factor: 0.25 }); // DEBUG
    return base.root.getState();
}

function mvsInterface(pdbId: string, assemblyId: string | undefined, partner1: ComponentExpressionT[], partner2: ComponentExpressionT[],
    options?: { interfaceSelector1?: ComponentExpressionT[], interfaceSelector2?: ComponentExpressionT[], interface1?: Coords, interface2?: Coords, pca1?: Axes3D, pca2?: Axes3D, translate?: Vec3 }
) {
    const TRANSITION_DURATION = 5000;

    const base = mvsBase(pdbId, assemblyId, 2);
    const [structA, structB] = base.structs;
    structA.transform({
        translation: [0, 0, 0],
        ref: 'transformA',
    });
    structB.transform({
        translation: [0, 0, 0],
        ref: 'transformB',
    });
    const reprA = structA
        .component({ selector: partner1 })
        .representation({ type: 'ball_and_stick', size_factor: 0.5 })
        .color({ color: 'skyblue' });
    const reprB = structB
        .component({ selector: partner2 })
        .representation({ type: 'ball_and_stick', size_factor: 0.5 })
        .color({ color: 'orange' });
    if (options?.interfaceSelector1) reprA.color({ color: 'darkblue', selector: options.interfaceSelector1 });
    if (options?.interfaceSelector2) reprB.color({ color: 'brown', selector: options.interfaceSelector2 });

    // DEBUG:
    const primitives = base.root.primitives();
    if (options?.interface1) addPoints(primitives, options.interface1, 'darkblue');
    if (options?.interface2) addPoints(primitives, options.interface2, 'brown');
    if (options?.pca1) addPcaAxes(primitives, options.pca1, 'darkblue');
    if (options?.pca2) addPcaAxes(primitives, options.pca2, 'brown');

    const primitivesTransparent = base.root.primitives({ opacity: 0.5, custom: { molstar_mesh_params: { xrayShaded: true } } });
    if (options?.pca1) addEllipsoid(primitivesTransparent, options.pca1, 'darkblue');
    if (options?.pca2) addEllipsoid(primitivesTransparent, options.pca2, 'brown');
    addBoundingSphere(primitivesTransparent, 'struct-0', partner1, 'skyblue');
    addBoundingSphere(primitivesTransparent, 'struct-1', partner2, 'orange');


    // Animation
    if (options?.translate) {
        const anim = base.root.animation();
        anim.interpolate({
            target_ref: 'transformA',
            property: 'translation',
            kind: 'vec3',
            start: [0, 0, 0],
            end: MvsVector(Vec3.negate(_vec, options.translate)),
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
        anim.interpolate({
            target_ref: 'transformB',
            property: 'translation',
            kind: 'vec3',
            start: [0, 0, 0],
            end: MvsVector(options.translate),
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
    }

    return base.root.getSnapshot({ linger_duration_ms: 5000, transition_duration_ms: options?.translate ? 0 : TRANSITION_DURATION });
}

function addPoints(primitives: MVSBuilder.Primitives, points: Coords, color: ColorT) {
    for (let i = 0; i < points.x.length; i++) {
        primitives.sphere({
            center: [points.x[i], points.y[i], points.z[i]],
            radius: 0.5,
            color,
        });
    }
}

const _vec = Vec3();

function addEllipsoid(primitives: MVSBuilder.Primitives, pca: Axes3D, color: ColorT) {
    primitives.ellipsoid({
        center: MvsVector(pca.origin),
        major_axis: MvsVector(pca.dirA),
        minor_axis: MvsVector(pca.dirB),
        radius: [Vec3.magnitude(pca.dirA), Vec3.magnitude(pca.dirB), Vec3.magnitude(pca.dirC)],
        color,
    });
}
function addPcaAxes(primitives: MVSBuilder.Primitives, pca: Axes3D, color: ColorT) {
    function addAxis(origin: Vec3, dir: Vec3, dash: 'full' | 'dash') {
        primitives.arrow({
            start: MvsVector(Vec3.add(_vec, origin, dir)),
            end: MvsVector(Vec3.sub(_vec, origin, dir)),
            tube_radius: 0.2,
            show_start_cap: true,
            show_end_cap: true,
            tube_dash_length: dash === 'dash' ? 0.2 : undefined,
            color,
        });
    }
    addAxis(pca.origin, pca.dirA, 'full');
    addAxis(pca.origin, pca.dirB, 'full');
    addAxis(pca.origin, pca.dirC, 'dash');
}
function addBoundingSphere(primitives: MVSBuilder.Primitives, structRef: string, selector: ComponentExpressionT[], color: ColorT) {
    primitives.sphere({
        center: { structure_ref: structRef, expressions: selector, expression_schema: 'all_atomic' },
        color,
    });
}


function MvsVector(vec3: Vec3): Vector3 {
    return [vec3[0], vec3[1], vec3[2]];
}
