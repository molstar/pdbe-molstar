import { decomposeRotationMatrix } from 'molstar/lib/extensions/mvs/load-helpers';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type MVSBuilder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import { ColorT, ComponentExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Axes3D } from 'molstar/lib/mol-math/geometry';
import { Mat3, Quat, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
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

const COLOR_A = 'skyblue' satisfies ColorT;
const COLOR_A_STRONG = 'royalblue' satisfies ColorT;
const COLOR_B = 'orange' satisfies ColorT;
const COLOR_B_STRONG = 'brown' satisfies ColorT;
const COLOR_OTHER = 'magenta' satisfies ColorT;


export function mvsInterface(pdbId: string, assemblyId: string | undefined, partner1: ComponentExpressionT[], partner2: ComponentExpressionT[],
    options?: {
        interfaceSelector1?: ComponentExpressionT[], interfaceSelector2?: ComponentExpressionT[], interface1?: Coords, interface2?: Coords, pca1?: Axes3D, pca2?: Axes3D,
        translate?: Vec3, otherPoints?: Coords, otherPca?: Axes3D, translateAxis?: { origin: Vec3, dir: Vec3 }, cameraPca?: Axes3D,
        anim?: 'forward' | 'backward',
    }
) {
    const TRANSITION_DURATION = 2500;

    const base = mvsBase(pdbId, assemblyId, 2);
    const [structA, structB] = base.structs;

    // Set camera
    if (options?.cameraPca) {
        const visRadius = Math.max(Vec3.magnitude(options.cameraPca.dirA), 2 * Vec3.magnitude(options.cameraPca.dirB))
        const dist = 2 * visRadius;
        base.root.camera({
            target: MvsVector(options.cameraPca.origin),
            position: MvsVector(Vec3.add(_vec, options.cameraPca.origin, Vec3.setMagnitude(_vec, options.cameraPca.dirB, dist))),
            up: MvsVector(options.cameraPca.dirA),
        })
    }

    // Apply initial structure transforms
    const zero: Vector3 = [0, 0, 0];
    const eye = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    structA.transform({
        ref: 'transformA',
        translation: zero,
    });
    structB.transform({
        ref: 'transformB',
        translation: zero,
    });
    structA.transform({
        ref: 'rotateA',
        rotation_center: options?.cameraPca ? MvsVector(options.cameraPca.origin) : zero,
        rotation: eye,
        translation: zero,
    });
    structB.transform({
        ref: 'rotateB',
        rotation_center: options?.cameraPca ? MvsVector(options.cameraPca.origin) : zero,
        rotation: eye,
        translation: zero,
    });

    // Structure representations
    const reprParams: Parameters<MVSBuilder.Component['representation']>[0] = {
        type: 'surface',
        // type: 'ball_and_stick', size_factor: 0.25,
    };
    const reprA = structA.component({ selector: partner1 }).representation(reprParams).color({ color: COLOR_A });
    const reprB = structB.component({ selector: partner2 }).representation(reprParams).color({ color: COLOR_B });
    if (options?.interfaceSelector1) reprA.color({ color: COLOR_A_STRONG, selector: options.interfaceSelector1 });
    if (options?.interfaceSelector2) reprB.color({ color: COLOR_B_STRONG, selector: options.interfaceSelector2 });

    // DEBUG primitives:
    const primitives = base.root.primitives();
    if (options?.interface1) addPoints(primitives, options.interface1, COLOR_A_STRONG);
    if (options?.interface2) addPoints(primitives, options.interface2, COLOR_B_STRONG);
    if (options?.otherPoints) addPoints(primitives, options.otherPoints, COLOR_OTHER);
    if (options?.pca1) addAxes(primitives, options.pca1, COLOR_A_STRONG);
    if (options?.pca2) addAxes(primitives, options.pca2, COLOR_B_STRONG);
    if (options?.otherPca) addAxes(primitives, options.otherPca, COLOR_OTHER);

    const primitivesTransparent = base.root.primitives({ opacity: 0.5, custom: { molstar_mesh_params: { xrayShaded: true } } });
    // if (options?.pca1) addEllipsoid(primitivesTransparent, options.pca1, COLOR_A_STRONG);
    // if (options?.pca2) addEllipsoid(primitivesTransparent, options.pca2, COLOR_B_STRONG);
    // if (options?.otherPca) addEllipsoid(primitivesTransparent, options.otherPca, COLOR_OTHER);
    // addBoundingSphere(primitivesTransparent, 'struct-0', partner1, COLOR_A);
    // addBoundingSphere(primitivesTransparent, 'struct-1', partner2, COLOR_B);
    if (options?.translateAxis) {
        primitives.arrow({
            start: MvsVector(options.translateAxis.origin),
            end: MvsVector(Vec3.add(_vec, options.translateAxis.origin, options.translateAxis.dir)),
            tube_radius: 0.2,
            show_end_cap: true,
            color: COLOR_OTHER,
        });
        const ellipseAxes = getPerpendicular(options.translateAxis.dir);
        primitivesTransparent.ellipse({
            center: MvsVector(options.translateAxis.origin),
            major_axis: MvsVector(ellipseAxes[0]),
            minor_axis: MvsVector(ellipseAxes[1]),
            radius_major: 20,
            as_circle: true,
            color: COLOR_OTHER,
        });
    }

    // Animation translate
    if (options?.anim && options.translate) {
        const anim = base.root.animation();
        const translateA = MvsVector(Vec3.negate(_vec, options.translate));
        const translateB = MvsVector(options.translate);
        anim.interpolate({
            target_ref: 'transformA',
            property: 'translation',
            kind: 'vec3',
            start: options.anim === 'backward' ? translateA : zero,
            end: options.anim === 'backward' ? zero : translateA,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
        anim.interpolate({
            target_ref: 'transformB',
            property: 'translation',
            kind: 'vec3',
            start: options.anim === 'backward' ? translateB : zero,
            end: options.anim === 'backward' ? zero : translateB,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
    }
    // Animation with hinge
    if (options?.anim && !options.translate) {
        if (!options.cameraPca) throw new Error('cameraPca must be provided with anim');
        const anim = base.root.animation();
        const rotB = Mat3.fromRotation(Mat3(), 0.5 * Math.PI, options.cameraPca.dirA);
        const rotA = Mat3.fromRotation(Mat3(), -0.5 * Math.PI, options.cameraPca.dirA);
        Vec3.setMagnitude(_vec, options.cameraPca.dirC, Vec3.magnitude(options.cameraPca.dirB));
        const transB = MvsVector(_vec);
        Vec3.negate(_vec, _vec);
        const transA = MvsVector(_vec);
        anim.interpolate({
            target_ref: 'rotateA',
            property: 'rotation',
            kind: 'rotation_matrix',
            start: options.anim === 'backward' ? rotA : eye,
            end: options.anim === 'backward' ? eye : rotA,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
        anim.interpolate({
            target_ref: 'rotateB',
            property: 'rotation',
            kind: 'rotation_matrix',
            start: options.anim === 'backward' ? rotB : eye,
            end: options.anim === 'backward' ? eye : rotB,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
        anim.interpolate({
            target_ref: 'rotateA',
            property: 'translation',
            kind: 'vec3',
            start: options.anim === 'backward' ? transA : zero,
            end: options.anim === 'backward' ? zero : transA,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
        anim.interpolate({
            target_ref: 'rotateB',
            property: 'translation',
            kind: 'vec3',
            start: options.anim === 'backward' ? transB : zero,
            end: options.anim === 'backward' ? zero : transB,
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
            radius: 0.2,
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

function getPerpendicular(vec: Vec3): [Vec3, Vec3] {
    Vec3.cross(_vec, vec, Vec3.unitX);
    if (Vec3.magnitude(_vec) < 0.00001) {
        Vec3.cross(_vec, vec, Vec3.unitY);
    }
    const first = Vec3.normalize(Vec3(), _vec);
    const second = Vec3.normalize(Vec3(), Vec3.cross(_vec, vec, first));
    return [first, second];
}
