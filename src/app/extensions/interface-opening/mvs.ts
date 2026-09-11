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
        hingepoint?: Vec3, invertAnimation?: boolean,
    }
) {
    const TRANSITION_DURATION = 2500;

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

    const eye3 = [
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
    ];
    structA.transform({
        rotation_center: options?.hingepoint ? MvsVector(options.hingepoint) : [0, 0, 0],
        rotation: eye3,
        ref: 'rotateA',
    });
    structB.transform({
        rotation_center: options?.hingepoint ? MvsVector(options.hingepoint) : [0, 0, 0],
        rotation: eye3,
        ref: 'rotateB',
    });

    const reprParams: Parameters<MVSBuilder.Component['representation']>[0] = {
        type: 'surface',
        // type: 'ball_and_stick', size_factor: 0.25,
    };
    const reprA = structA.component({ selector: partner1 }).representation(reprParams).color({ color: COLOR_A });
    const reprB = structB.component({ selector: partner2 }).representation(reprParams).color({ color: COLOR_B });
    if (options?.interfaceSelector1) reprA.color({ color: COLOR_A_STRONG, selector: options.interfaceSelector1 });
    if (options?.interfaceSelector2) reprB.color({ color: COLOR_B_STRONG, selector: options.interfaceSelector2 });

    // DEBUG:
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

    if (options?.cameraPca) {
        base.root.focus({
            direction: MvsVector(Vec3.negate(_vec, options.cameraPca.dirB)),
            up: MvsVector(options.cameraPca.dirA),
        });
    }

    // Animation translate
    if (options?.translate) {
        const anim = base.root.animation();
        const translateA = MvsVector(Vec3.negate(_vec, options.translate));
        const translateB = MvsVector(options.translate);
        anim.interpolate({
            target_ref: 'transformA',
            property: 'translation',
            kind: 'vec3',
            start: options.invertAnimation ? translateA : [0, 0, 0],
            end: options.invertAnimation ? [0, 0, 0] : translateA,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
        anim.interpolate({
            target_ref: 'transformB',
            property: 'translation',
            kind: 'vec3',
            start: options.invertAnimation ? translateB : [0, 0, 0],
            end: options.invertAnimation ? [0, 0, 0] : translateB,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
    }
    // Animation with hinge
    if (options?.hingepoint) {
        if (!options.cameraPca) throw new Error('cameraPca must be provided with hingepoint');
        if (options.translate) throw new Error('translate must NOT be provided with hingepoint');
        const anim = base.root.animation();
        options.cameraPca.dirA;
        // TODO: compute rotation matrix for 90deg around options.cameraPca.dirA
        // const q = Quat.setAxisAngle(Quat(), options.cameraPca.dirA, 0.25 * Math.PI);
        const rotA = Mat3.fromRotation(Mat3(), -0.5 * Math.PI, options.cameraPca.dirA);
        const rotB = Mat3.fromRotation(Mat3(), 0.5 * Math.PI, options.cameraPca.dirA);
        anim.interpolate({
            target_ref: 'rotateA',
            property: 'rotation',
            kind: 'rotation_matrix',
            start: options.invertAnimation ? rotA : eye3,
            end: options.invertAnimation ? eye3 : rotA,
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
        });
        anim.interpolate({
            target_ref: 'rotateB',
            property: 'rotation',
            kind: 'rotation_matrix',
            start: options.invertAnimation ? rotB : eye3,
            end: options.invertAnimation ? eye3 : rotB,
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
