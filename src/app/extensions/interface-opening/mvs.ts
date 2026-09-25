import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type MVSBuilder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import type { ColorT, ComponentExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Mat3, Vec3 } from 'molstar/lib/mol-math/linear-algebra'; // TODO: expose in PDBeMolstar


const _vec = Vec3();

function mvsBase(pdbId: string, assemblyId: string | undefined, nStructureCopies: number) {
    const root = MVSData.createBuilder();
    const model = root
        .download({ url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}.bcif` })
        .parse({ format: 'bcif' });
    const structs: MVSBuilder.Structure[] = [];
    for (let i = 0; i < nStructureCopies; i++) {
        const struct = assemblyId ?
            model.assemblyStructure({ assembly_id: assemblyId, ref: `struct-${i}` })
            : model.modelStructure({ ref: `struct-${i}` });
        structs.push(struct);
    }
    return { root, structs };
}

export function mvsDummy(pdbId: string, assemblyId: string | undefined) {
    const base = mvsBase(pdbId, assemblyId, 1);
    return base.root.getState();
}

const COLOR_A = 'skyblue' satisfies ColorT;
const COLOR_A_STRONG = 'royalblue' satisfies ColorT;
const COLOR_B = 'orange' satisfies ColorT;
const COLOR_B_STRONG = 'brown' satisfies ColorT;

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
    impulses?: { a: { linear: Vec3, angular: Vec3 }, b: { linear: Vec3, angular: Vec3 } },
}

const zero: Vector3 = [0, 0, 0];
const eye = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 'open', 'closed' refer to static states without animation; 'opening', 'closing' refer to animated states */
type AnimationType = 'opening' | 'open' | 'closing' | 'closed';

export function mvsInterface(params: {
    pdbId: string, assemblyId: string | undefined, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[],
    axes: InterfaceOpeningAxes,
    viewportAspectRatio?: number,
    interfaceSelectorA?: ComponentExpressionT[], interfaceSelectorB?: ComponentExpressionT[],
    animation: AnimationType,
    snapshotKey?: string, snapshotDescription?: string,
}) {
    const TRANSITION_DURATION = 2500;

    const base = mvsBase(params.pdbId, params.assemblyId, 2);
    const [structA, structB] = base.structs;

    // Set camera
    const aspectRatio = params.viewportAspectRatio ?? 1;
    const rX = params.axes.openingRadius + Vec3.magnitude(params.axes.outAxis);
    const rY = Vec3.magnitude(params.axes.hingeAxis);
    const visRadius = Math.max(rX / aspectRatio, rY);
    const dist = 2 * visRadius;
    const cameraCenter = MvsVector(params.axes.center);
    base.root.camera({
        target: cameraCenter,
        position: MvsVector(Vec3.add(_vec, params.axes.center, Vec3.setMagnitude(_vec, params.axes.outAxis, dist))),
        up: MvsVector(params.axes.hingeAxis),
    });

    // Structure representations
    const reprParams: Parameters<MVSBuilder.Component['representation']>[0] = { type: 'surface' }; // TODO: fall back to gaussian surface when structures big?
    const reprA = structA.component({ selector: params.partnerA }).representation(reprParams).color({ color: COLOR_A });
    const reprB = structB.component({ selector: params.partnerB }).representation(reprParams).color({ color: COLOR_B });
    if (params.interfaceSelectorA) reprA.color({ color: COLOR_A_STRONG, selector: params.interfaceSelectorA });
    if (params.interfaceSelectorB) reprB.color({ color: COLOR_B_STRONG, selector: params.interfaceSelectorB });

    // Animation with impulses
    animateImpulses({ root: base.root, structA, structB, axes: params.axes, animation: params.animation, animationDurationMs: TRANSITION_DURATION });

    // Animation with hinge
    animateHingeOpening({ root: base.root, structA, structB, axes: params.axes, animation: params.animation, animationDurationMs: TRANSITION_DURATION });

    return base.root.getSnapshot({
        key: params.snapshotKey,
        description: params.snapshotDescription,
        description_format: 'markdown',
        linger_duration_ms: 1000,
        transition_duration_ms: TRANSITION_DURATION,
    });
}


function MvsVector(vec3: Vec3): Vector3 {
    return [vec3[0], vec3[1], vec3[2]];
}

function animateHingeOpening(params: { root: MVSBuilder.Root, structA: MVSBuilder.Structure, structB: MVSBuilder.Structure, axes: InterfaceOpeningAxes, animation: AnimationType, animationDurationMs: number }) {
    const rotB = Mat3.fromRotation(Mat3(), 0.5 * Math.PI, params.axes.hingeAxis);
    const rotA = Mat3.fromRotation(Mat3(), -0.5 * Math.PI, params.axes.hingeAxis);
    Vec3.setMagnitude(_vec, params.axes.movementAxis, params.axes.openingRadius);
    const transB = MvsVector(_vec);
    Vec3.negate(_vec, _vec);
    const transA = MvsVector(_vec);

    const startsOpen = params.animation === 'open' || params.animation === 'closing';
    const endsOpen = params.animation === 'open' || params.animation === 'opening';
    const isAnimated = params.animation === 'opening' || params.animation === 'closing';

    params.structA.transform({
        ref: 'rotateA-hinge',
        rotation_center: MvsVector(params.axes.center),
        rotation: startsOpen ? rotA : eye,
        translation: startsOpen ? transA : zero,
    });
    params.structB.transform({
        ref: 'rotateB-hinge',
        rotation_center: MvsVector(params.axes.center),
        rotation: startsOpen ? rotB : eye,
        translation: startsOpen ? transB : zero,
    });

    if (!isAnimated) return;

    const animation = params.root.animation();
    const common = {
        start_ms: 0,
        duration_ms: params.animationDurationMs,
        easing: 'sin-in-out',
    } satisfies Partial<Parameters<MVSBuilder.Animation['interpolate']>[0]>;

    animation.interpolate({
        ...common,
        target_ref: 'rotateA-hinge',
        property: 'rotation',
        kind: 'rotation_matrix',
        start: startsOpen ? rotA : eye,
        end: endsOpen ? rotA : eye,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateB-hinge',
        property: 'rotation',
        kind: 'rotation_matrix',
        start: startsOpen ? rotB : eye,
        end: endsOpen ? rotB : eye,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateA-hinge',
        property: 'translation',
        kind: 'vec3',
        start: startsOpen ? transA : zero,
        end: endsOpen ? transA : zero,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateB-hinge',
        property: 'translation',
        kind: 'vec3',
        start: startsOpen ? transB : zero,
        end: endsOpen ? transB : zero,
    });
}

function animateImpulses(params: { root: MVSBuilder.Root, structA: MVSBuilder.Structure, structB: MVSBuilder.Structure, axes: InterfaceOpeningAxes, animation: AnimationType, animationDurationMs: number }) {
    if (!params.axes.impulses) return;

    // Apply structure transforms (even in static state, to ensure correct state tree reconciliation)
    params.structA.transform({
        ref: 'rotateA-impulses',
        rotation_center: MvsVector(params.axes.center),
        rotation: eye,
        translation: zero,
    });
    params.structB.transform({
        ref: 'rotateB-impulses',
        rotation_center: MvsVector(params.axes.center),
        rotation: eye,
        translation: zero,
    });

    const isAnimated = params.animation === 'opening' || params.animation === 'closing';
    if (!isAnimated) return;

    const TORQUE_FACTOR = 50;
    const FORCE_FACTOR = TORQUE_FACTOR;

    const transVecA = Vec3.scale(Vec3(), params.axes.impulses.a.linear, FORCE_FACTOR);
    const transVecB = Vec3.scale(Vec3(), params.axes.impulses.b.linear, FORCE_FACTOR);
    const rotVecA = Vec3.scale(Vec3(), params.axes.impulses.a.angular, TORQUE_FACTOR);
    const rotVecB = Vec3.scale(Vec3(), params.axes.impulses.b.angular, TORQUE_FACTOR);

    // Limit rotation to axis parallel to interface normal
    const forcedAxis = params.axes.movementAxis;
    Vec3.projectOnVector(rotVecA, rotVecA, forcedAxis);
    Vec3.projectOnVector(rotVecB, rotVecB, forcedAxis);
    // Limit translation to interface plane
    Vec3.projectOnPlane(transVecA, transVecA, forcedAxis);
    Vec3.projectOnPlane(transVecB, transVecB, forcedAxis);

    // Ensure rotations do not exceed half turn (would cause incorrect interpolation)
    const MAX_ROT = .99 * Math.PI;
    const safeguardFactor = 1 / Math.max(Vec3.magnitude(rotVecA) / MAX_ROT, Vec3.magnitude(rotVecB) / MAX_ROT, 1);
    if (safeguardFactor !== 1) {
        Vec3.scale(rotVecA, rotVecA, safeguardFactor);
        Vec3.scale(rotVecB, rotVecB, safeguardFactor);
    }

    const transA = MvsVector(transVecA);
    const transB = MvsVector(transVecB);
    const rotA = Mat3.fromRotation(Mat3(), Vec3.magnitude(rotVecA), rotVecA);
    const rotB = Mat3.fromRotation(Mat3(), Vec3.magnitude(rotVecB), rotVecB);

    const animation = params.root.animation();
    const IMPULSE_DURATION = 0.5 * params.animationDurationMs;
    const common = {
        start_ms: params.animation === 'closing' ? params.animationDurationMs - IMPULSE_DURATION : 0,
        duration_ms: IMPULSE_DURATION,
        easing: 'sin-in-out',
        frequency: 2,
        alternate_direction: true,
    } satisfies Partial<Parameters<MVSBuilder.Animation['interpolate']>[0]>;

    if (Vec3.magnitude(rotVecA) >= 1e-3) { // Do not apply small rotations as they may be interpolated incorrectly
        animation.interpolate({
            ...common,
            target_ref: 'rotateA-impulses', property: 'rotation', kind: 'rotation_matrix',
            start: eye, end: rotA,
        });
    }
    if (Vec3.magnitude(rotVecB) >= 1e-3) { // Do not apply small rotations as they may be interpolated incorrectly
        animation.interpolate({
            ...common,
            target_ref: 'rotateB-impulses', property: 'rotation', kind: 'rotation_matrix',
            start: eye, end: rotB,
        });
    }
    animation.interpolate({
        ...common,
        target_ref: 'rotateA-impulses', property: 'translation', kind: 'vec3',
        start: zero, end: transA,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateB-impulses', property: 'translation', kind: 'vec3',
        start: zero, end: transB,
    });
}
