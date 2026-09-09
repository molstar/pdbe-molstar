import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type MVSBuilder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import { ColorT, ComponentExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Axes3D } from 'molstar/lib/mol-math/geometry';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { range } from 'molstar/lib/mol-util/array';
import { Coords } from './computations';


const _vec = Vec3();

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

export function mvsDummy(pdbId: string, assemblyId: string | undefined) {
    const base = mvsBase(pdbId, assemblyId, 1);
    base.structs[0].component().representation({ type: 'putty', size_factor: 0.25 }); // DEBUG
    return base.root.getState();
}

export function mvsInterface(pdbId: string, assemblyId: string | undefined, partner1: ComponentExpressionT[], partner2: ComponentExpressionT[],
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
    if (options?.pca1) addAxes(primitives, options.pca1, 'darkblue');
    if (options?.pca2) addAxes(primitives, options.pca2, 'brown');

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

function addEllipsoid(primitives: MVSBuilder.Primitives, pca: Axes3D, color: ColorT) {
    primitives.ellipsoid({
        center: MvsVector(pca.origin),
        major_axis: MvsVector(pca.dirA),
        minor_axis: MvsVector(pca.dirB),
        radius: [Vec3.magnitude(pca.dirA), Vec3.magnitude(pca.dirB), Vec3.magnitude(pca.dirC)],
        color,
    });
}

function addAxes(primitives: MVSBuilder.Primitives, axis: Axes3D, color: ColorT) {
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
    addAxis(axis.origin, axis.dirA, 'full');
    addAxis(axis.origin, axis.dirB, 'full');
    addAxis(axis.origin, axis.dirC, 'dash');
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
