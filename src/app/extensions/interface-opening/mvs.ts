import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type MVSBuilder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import type { MVSNodeParams } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-tree';
import type { ColorT, ComponentExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';


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

interface TransformParams {
    rotation_center: Vector3,
    rotation: number[] | undefined,
    translation: Vector3,
}
export interface InterfaceAnimationTransforms {
    a: TransformParams,
    b: TransformParams,
}

const zero: Vector3 = [0, 0, 0];
const eye = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 'open', 'closed' refer to static states without animation; 'opening', 'closing' refer to animated states */
type AnimationType = 'opening' | 'open' | 'closing' | 'closed';

export function mvsInterface(params: {
    pdbId: string, assemblyId: string | undefined, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[],
    camera: MVSNodeParams<'camera'>,
    hingeOpeningTransforms: InterfaceAnimationTransforms,
    impulseTransforms?: InterfaceAnimationTransforms,
    interfaceSelectorA?: ComponentExpressionT[], interfaceSelectorB?: ComponentExpressionT[],
    animation: AnimationType,
}) {
    const TRANSITION_DURATION = 2500;

    const base = mvsBase(params.pdbId, params.assemblyId, 2);
    const [structA, structB] = base.structs;

    base.root.camera(params.camera);

    // Structure representations
    const reprParams: Parameters<MVSBuilder.Component['representation']>[0] = { type: 'surface' }; // TODO: fall back to gaussian surface when structures big?
    const reprA = structA.component({ selector: params.partnerA }).representation(reprParams).color({ color: COLOR_A });
    const reprB = structB.component({ selector: params.partnerB }).representation(reprParams).color({ color: COLOR_B });
    if (params.interfaceSelectorA) reprA.color({ color: COLOR_A_STRONG, selector: params.interfaceSelectorA });
    if (params.interfaceSelectorB) reprB.color({ color: COLOR_B_STRONG, selector: params.interfaceSelectorB });

    // Animation with impulses
    if (params.impulseTransforms) {
        animateImpulses({ root: base.root, structA, structB, transforms: params.impulseTransforms, animation: params.animation, animationDurationMs: TRANSITION_DURATION });
    }

    // Animation with hinge
    animateHingeOpening({ root: base.root, structA, structB, transforms: params.hingeOpeningTransforms, animation: params.animation, animationDurationMs: TRANSITION_DURATION });

    const snapshotKey = params.animation;
    const description = (params.animation === 'opening' || params.animation === 'open') ?
        `### Interface view\n[Close](#closing) &mdash; **Open**`
        : `### Interface view\n**Close** &mdash; [Open](#opening)`;

    return base.root.getSnapshot({
        key: snapshotKey,
        description,
        description_format: 'markdown',
        linger_duration_ms: 1000,
        transition_duration_ms: TRANSITION_DURATION,
    });
}


function animateHingeOpening(params: { root: MVSBuilder.Root, structA: MVSBuilder.Structure, structB: MVSBuilder.Structure, transforms: InterfaceAnimationTransforms, animation: AnimationType, animationDurationMs: number }) {
    const startsOpen = params.animation === 'open' || params.animation === 'closing';
    const endsOpen = params.animation === 'open' || params.animation === 'opening';
    const isAnimated = params.animation === 'opening' || params.animation === 'closing';

    const { a, b } = params.transforms;
    const aRotation = a.rotation ?? eye;
    const bRotation = b.rotation ?? eye;

    // Apply structure transforms (even in static state, to ensure correct state tree reconciliation)
    params.structA.transform({
        ref: 'rotateA-hinge',
        rotation_center: a.rotation_center,
        rotation: startsOpen ? aRotation : eye,
        translation: startsOpen ? a.translation : zero,
    });
    params.structB.transform({
        ref: 'rotateB-hinge',
        rotation_center: b.rotation_center,
        rotation: startsOpen ? bRotation : eye,
        translation: startsOpen ? b.translation : zero,
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
        start: startsOpen ? aRotation : eye,
        end: endsOpen ? aRotation : eye,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateB-hinge',
        property: 'rotation',
        kind: 'rotation_matrix',
        start: startsOpen ? bRotation : eye,
        end: endsOpen ? bRotation : eye,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateA-hinge',
        property: 'translation',
        kind: 'vec3',
        start: startsOpen ? a.translation : zero,
        end: endsOpen ? a.translation : zero,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateB-hinge',
        property: 'translation',
        kind: 'vec3',
        start: startsOpen ? b.translation : zero,
        end: endsOpen ? b.translation : zero,
    });
}

function animateImpulses(params: { root: MVSBuilder.Root, structA: MVSBuilder.Structure, structB: MVSBuilder.Structure, transforms: InterfaceAnimationTransforms, animation: AnimationType, animationDurationMs: number }) {
    const { a, b } = params.transforms;

    // Apply structure transforms (even in static state, to ensure correct state tree reconciliation)
    params.structA.transform({
        ref: 'rotateA-impulses',
        rotation_center: a.rotation_center,
        rotation: eye,
        translation: zero,
    });
    params.structB.transform({
        ref: 'rotateB-impulses',
        rotation_center: b.rotation_center,
        rotation: eye,
        translation: zero,
    });

    const isAnimated = params.animation === 'opening' || params.animation === 'closing';
    if (!isAnimated) return;

    const animation = params.root.animation();
    const IMPULSE_DURATION = 0.5 * params.animationDurationMs;
    const common = {
        start_ms: params.animation === 'closing' ? params.animationDurationMs - IMPULSE_DURATION : 0,
        duration_ms: IMPULSE_DURATION,
        easing: 'sin-in-out',
        frequency: 2,
        alternate_direction: true,
    } satisfies Partial<Parameters<MVSBuilder.Animation['interpolate']>[0]>;

    if (a.rotation) { // Do not apply small rotations as they may be interpolated incorrectly
        animation.interpolate({
            ...common,
            target_ref: 'rotateA-impulses', property: 'rotation', kind: 'rotation_matrix',
            start: eye, end: a.rotation,
        });
    }
    if (b.rotation) { // Do not apply small rotations as they may be interpolated incorrectly
        animation.interpolate({
            ...common,
            target_ref: 'rotateB-impulses', property: 'rotation', kind: 'rotation_matrix',
            start: eye, end: b.rotation,
        });
    }
    animation.interpolate({
        ...common,
        target_ref: 'rotateA-impulses', property: 'translation', kind: 'vec3',
        start: zero, end: a.translation,
    });
    animation.interpolate({
        ...common,
        target_ref: 'rotateB-impulses', property: 'translation', kind: 'vec3',
        start: zero, end: b.translation,
    });
}
