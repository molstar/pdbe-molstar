import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type MVSBuilder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import type { ColorT, ComponentExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import type { Axes3D } from 'molstar/lib/mol-math/geometry';
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

export function mvsInterface(params: {
    pdbId: string, assemblyId: string | undefined, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[],
    /** Axes3D object, where
     * `origin` is center of the interface,
     * `dirA` is the direction of opening animation hinge axis (displayed bottom-up),
     * `dirB` is the direction from the hinge axis to the interface center (displayed out-from-screen),
     * `dirC` is direction of partnerB when opening (displayed left-to-right).
     * Sizes of axis correspond to the bounding box of the interface to be focused. */
    cameraAxes: Axes3D,
    /** Radius from opening hinge axis to the interface center */
    openingRadius?: number,
    viewportAspectRatio?: number,
    interfaceSelectorA?: ComponentExpressionT[], interfaceSelectorB?: ComponentExpressionT[],
    animation?: 'opening' | 'closing',
    snapshotKey?: string, snapshotDescription?: string,
    impulses?: { a: { linear: Vec3, angular: Vec3 }, b: { linear: Vec3, angular: Vec3 } },
}) {
    const TRANSITION_DURATION = 2500;

    const base = mvsBase(params.pdbId, params.assemblyId, 2);
    const [structA, structB] = base.structs;

    // Set camera
    const aspectRatio = params.viewportAspectRatio ?? 1;
    const rX = params.openingRadius !== undefined ? params.openingRadius + Vec3.magnitude(params.cameraAxes.dirB) : 2 * Vec3.magnitude(params.cameraAxes.dirB);
    const rY = Vec3.magnitude(params.cameraAxes.dirA);
    const visRadius = Math.max(rX / aspectRatio, rY);
    const dist = 2 * visRadius;
    const cameraCenter = MvsVector(params.cameraAxes.origin);
    base.root.camera({
        target: cameraCenter,
        position: MvsVector(Vec3.add(_vec, params.cameraAxes.origin, Vec3.setMagnitude(_vec, params.cameraAxes.dirB, dist))),
        up: MvsVector(params.cameraAxes.dirA),
    });

    // Apply initial structure transforms
    const zero: Vector3 = [0, 0, 0];
    const eye = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    structA.transform({
        ref: 'rotateA-impulses',
        rotation_center: cameraCenter,
        rotation: eye,
        translation: zero,
    });
    structB.transform({
        ref: 'rotateB-impulses',
        rotation_center: cameraCenter,
        rotation: eye,
        translation: zero,
    });
    structA.transform({
        ref: 'rotateA-hinge',
        rotation_center: cameraCenter,
        rotation: eye,
        translation: zero,
    });
    structB.transform({
        ref: 'rotateB-hinge',
        rotation_center: cameraCenter,
        rotation: eye,
        translation: zero,
    });

    // Structure representations
    const reprParams: Parameters<MVSBuilder.Component['representation']>[0] = { type: 'surface' }; // TODO: fall back to gaussian surface when structures big?
    const reprA = structA.component({ selector: params.partnerA }).representation(reprParams).color({ color: COLOR_A });
    const reprB = structB.component({ selector: params.partnerB }).representation(reprParams).color({ color: COLOR_B });
    if (params.interfaceSelectorA) reprA.color({ color: COLOR_A_STRONG, selector: params.interfaceSelectorA });
    if (params.interfaceSelectorB) reprB.color({ color: COLOR_B_STRONG, selector: params.interfaceSelectorB });

    if (params.animation) {
        if (params.impulses) {
            // Animation with forces
            const anim = base.root.animation();
            const TORQUE_FACTOR = 50;
            const FORCE_FACTOR = TORQUE_FACTOR;

            const transVecA = Vec3.scale(Vec3(), params.impulses.a.linear, FORCE_FACTOR);
            const transVecB = Vec3.scale(Vec3(), params.impulses.b.linear, FORCE_FACTOR);
            const rotVecA = Vec3.scale(Vec3(), params.impulses.a.angular, TORQUE_FACTOR);
            const rotVecB = Vec3.scale(Vec3(), params.impulses.b.angular, TORQUE_FACTOR);

            // Limit rotation to axis parallel to interface normal
            const forcedAxis = params.cameraAxes.dirC;
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

            const FORCE_DURATION = 0.2 * TRANSITION_DURATION;
            const INV_FORCE_DURATION = 0.3 * TRANSITION_DURATION;
            const common1 = {
                start_ms: params.animation === 'closing' ? TRANSITION_DURATION - FORCE_DURATION - INV_FORCE_DURATION : 0,
                duration_ms: params.animation === 'closing' ? INV_FORCE_DURATION : FORCE_DURATION,
                easing: 'sin-in-out',
            } satisfies Partial<Parameters<typeof anim['interpolate']>[0]>;
            const common2 = {
                start_ms: params.animation === 'closing' ? TRANSITION_DURATION - FORCE_DURATION : FORCE_DURATION,
                duration_ms: params.animation === 'closing' ? FORCE_DURATION : INV_FORCE_DURATION,
                easing: 'sin-in-out',
            } satisfies Partial<Parameters<typeof anim['interpolate']>[0]>;

            if (Vec3.magnitude(rotVecA) >= 1e-3) { // Do apply small rotations as they may be interpolated incorrectly
                anim.interpolate({
                    ...common1,
                    target_ref: 'rotateA-impulses', property: 'rotation', kind: 'rotation_matrix',
                    start: eye, end: rotA,
                });
                anim.interpolate({
                    ...common2,
                    target_ref: 'rotateA-impulses', property: 'rotation', kind: 'rotation_matrix',
                    start: rotA, end: eye,
                });
            }
            if (Vec3.magnitude(rotVecB) >= 1e-3) { // Do apply small rotations as they may be interpolated incorrectly
                anim.interpolate({
                    ...common1,
                    target_ref: 'rotateB-impulses', property: 'rotation', kind: 'rotation_matrix',
                    start: eye, end: rotB,
                });
                anim.interpolate({
                    ...common2,
                    target_ref: 'rotateB-impulses', property: 'rotation', kind: 'rotation_matrix',
                    start: rotB, end: eye,
                });
            }
            anim.interpolate({
                ...common1,
                target_ref: 'rotateA-impulses', property: 'translation', kind: 'vec3',
                start: zero, end: transA,
            });
            anim.interpolate({
                ...common2,
                target_ref: 'rotateA-impulses', property: 'translation', kind: 'vec3',
                start: transA, end: zero,
            });
            anim.interpolate({
                ...common1,
                target_ref: 'rotateB-impulses', property: 'translation', kind: 'vec3',
                start: zero, end: transB,
            });
            anim.interpolate({
                ...common2,
                target_ref: 'rotateB-impulses', property: 'translation', kind: 'vec3',
                start: transB, end: zero,
            });
        }
        // Animation with hinge
        const anim = base.root.animation();
        const rotB = Mat3.fromRotation(Mat3(), 0.5 * Math.PI, params.cameraAxes.dirA);
        const rotA = Mat3.fromRotation(Mat3(), -0.5 * Math.PI, params.cameraAxes.dirA);
        Vec3.setMagnitude(_vec, params.cameraAxes.dirC, params.openingRadius ?? Vec3.magnitude(params.cameraAxes.dirB));
        const transB = MvsVector(_vec);
        Vec3.negate(_vec, _vec);
        const transA = MvsVector(_vec);

        const common = {
            start_ms: 0,
            duration_ms: TRANSITION_DURATION,
            easing: 'sin-in-out',
        } satisfies Partial<Parameters<typeof anim['interpolate']>[0]>;

        anim.interpolate({
            ...common,
            target_ref: 'rotateA-hinge',
            property: 'rotation',
            kind: 'rotation_matrix',
            start: params.animation === 'closing' ? rotA : eye,
            end: params.animation === 'closing' ? eye : rotA,
        });
        anim.interpolate({
            ...common,
            target_ref: 'rotateB-hinge',
            property: 'rotation',
            kind: 'rotation_matrix',
            start: params.animation === 'closing' ? rotB : eye,
            end: params.animation === 'closing' ? eye : rotB,
        });
        anim.interpolate({
            ...common,
            target_ref: 'rotateA-hinge',
            property: 'translation',
            kind: 'vec3',
            start: params.animation === 'closing' ? transA : zero,
            end: params.animation === 'closing' ? zero : transA,
        });
        anim.interpolate({
            ...common,
            target_ref: 'rotateB-hinge',
            property: 'translation',
            kind: 'vec3',
            start: params.animation === 'closing' ? transB : zero,
            end: params.animation === 'closing' ? zero : transB,
        });
    }

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
