import { MolScriptBuilder } from 'molstar/lib/commonjs/mol-script/language/builder';
import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type { MVSNodeParams } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-tree';
import { ComponentExpressionT, MolQLExpressionT, Vector3 } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Mat3, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { QueryHelper, addOrUpdateExtensionBehavior, removeExtensionBehavior } from '../../helpers';
import { getInterfaceOpeningAxes, getStructureCoords, type InterfaceOpeningAxes } from './computations';
import { InterfaceInteractionsHighlight } from './interactions-highlight-behavior';
import { mvsDummy, mvsInterface, type InterfaceAnimationTransforms } from './mvs';


// Examples:
// - 1hlu A-B: nice PyMOL example from https://dgoppenheimer.github.io/oppenheimer-blog/2016/12/30/profilin-actin-movie/
// - 1hda A-B, A-C, A-D: kinda nice
// - 2p9u D-F: ugly twisted interface
// - 8eiu TA-DA: uglissimo (small protein inserted within ribosomal unit)


export async function runInterfaceOpening(plugin: PluginContext, pdbId: string, assemblyId: string | undefined, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[]) {
    console.log('runInterfaceOpening', plugin, pdbId, assemblyId, partnerA, partnerB);

    const structure = await getStructureDataViaMvs(plugin, pdbId, assemblyId);
    const coordsA = getStructureCoords(getSubstructure(structure, partnerA));
    const coordsB = getStructureCoords(getSubstructure(structure, partnerB));

    const viewportAspectRatio = plugin.canvas3d ? (plugin.canvas3d.camera.viewport.width / plugin.canvas3d.camera.viewport.height) : 1;
    const openingAxes = getInterfaceOpeningAxes(coordsA, coordsB);
    const camera = getInterfaceOpeningCamera(openingAxes, { viewportAspectRatio });
    const hingeOpeningTransforms = getInterfaceOpeningTransforms(openingAxes);
    const impulseTransforms = getInterfaceOpeningImpulseTransforms(openingAxes, { rotationFactor: 40, translationFactor: 40 });

    // Get interface residue selectors - TEMPORARY SOLUTION
    // TODO: get list of interface residues from an API
    const INTERFACE_RADIUS = 5;
    const partnerA_labelAsymId = partnerA[0]?.label_asym_id;
    const partnerB_labelAsymId = partnerB[0]?.label_asym_id;
    if (!partnerA_labelAsymId || !partnerB_labelAsymId) throw new Error('partnerA and partnerB selectors must contain label_asym_id');
    const interfaceSelectorA = molqlChainSurrounding(partnerB_labelAsymId, INTERFACE_RADIUS);
    const interfaceSelectorB = molqlChainSurrounding(partnerA_labelAsymId, INTERFACE_RADIUS);

    const snapshots = (['closed', 'opening', 'open', 'closing'] as const).map(
        animation => mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            interfaceSelectorA, interfaceSelectorB,
            camera,
            hingeOpeningTransforms,
            impulseTransforms,
            animation,
        })
    );
    const mvs = MVSData.createMultistate(snapshots, {});
    await loadMVS(plugin, mvs);

    await addOrUpdateExtensionBehavior(plugin, InterfaceInteractionsHighlight);
    setTimeout(() => addOrUpdateExtensionBehavior(plugin, InterfaceInteractionsHighlight, { radius: 15 }), 5_000);
    setTimeout(() => removeExtensionBehavior(plugin, InterfaceInteractionsHighlight), 7_500);
    setTimeout(() => addOrUpdateExtensionBehavior(plugin, InterfaceInteractionsHighlight), 10_000);
}


function molqlChainSurrounding(targetLabelAsymId: string, radius: number): MolQLExpressionT {
    const targetChainExpr = MolScriptBuilder.struct.generator.atomGroups({
        'chain-test': MolScriptBuilder.core.rel.eq([MolScriptBuilder.struct.atomProperty.macromolecular.label_asym_id(), targetLabelAsymId]),
    });
    const surroundingExpr = MolScriptBuilder.struct.modifier.includeSurroundings({
        0: targetChainExpr, 'radius': radius, 'as-whole-residues': true,
    });
    return { molql: surroundingExpr };
}

async function getStructureDataViaMvs(plugin: PluginContext, pdbId: string, assemblyId: string | undefined) {
    const mvs = mvsDummy(pdbId, assemblyId);
    await loadMVS(plugin, mvs);

    const structures = plugin.managers.structure.hierarchy.current.structures;
    // if (structures.length !== 1) throw new Error('Failed to retrieve structure plugin state object');  // DEBUG TODO: uncomment

    const structureData = structures[0].cell.obj?.data;
    if (!structureData) throw new Error('Failed to retrieve structure data');
    return structureData;
}

function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
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
