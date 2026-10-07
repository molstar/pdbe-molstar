import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type { ComponentExpressionT, MolQLExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import type { Structure } from 'molstar/lib/mol-model/structure';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { getInterfaceOpeningAxes, getInterfaceOpeningCamera, getInterfaceOpeningImpulseTransforms, getInterfaceOpeningTransforms } from './computations';
import { InterfaceInteractionsHighlight } from './interactions-highlight-behavior';
import { mvsDummy, mvsInterface } from './mvs'; // TODO: to PDBconnect


// Examples:
// - 1hlu A-B: nice PyMOL example from https://dgoppenheimer.github.io/oppenheimer-blog/2016/12/30/profilin-actin-movie/
// - 1hda A-B, A-C, A-D: kinda nice
// - 2p9u D-F: ugly twisted interface
// - 8eiu TA-DA: uglissimo (small protein inserted within ribosomal unit)

export { InterfaceInteractionsHighlight } from './interactions-highlight-behavior';

export async function runInterfaceOpening(plugin: PluginContext, pdbId: string, assemblyId: string | undefined, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[]) {
    console.log('runInterfaceOpening', pdbId, assemblyId, partnerA, partnerB);

    const structure = await getStructureDataViaMvs(plugin, pdbId, assemblyId);

    const viewportAspectRatio = plugin.canvas3d ? (plugin.canvas3d.camera.viewport.width / plugin.canvas3d.camera.viewport.height) : 1;
    const cameraAndTransforms = getInterfaceOpeningCameraAndTransforms(structure, partnerA, partnerB, { viewportAspectRatio, impulseRotationFactor: 40, impulseTranslationFactor: 40 });

    // Get interface residue selectors - TEMPORARY SOLUTION
    // TODO: get list of interface residues from an API
    const INTERFACE_RADIUS = 5;
    const partnerA_labelAsymId = partnerA[0]?.label_asym_id;
    const partnerA_instanceId = partnerA[0]?.instance_id;
    const partnerB_labelAsymId = partnerB[0]?.label_asym_id;
    const partnerB_instanceId = partnerB[0]?.instance_id;
    if (!partnerA_labelAsymId || !partnerB_labelAsymId) throw new Error('partnerA and partnerB selectors must contain label_asym_id');
    const interfaceSelectorA = molqlChainSurrounding(partnerB_labelAsymId, partnerB_instanceId, INTERFACE_RADIUS);
    const interfaceSelectorB = molqlChainSurrounding(partnerA_labelAsymId, partnerA_instanceId, INTERFACE_RADIUS);

    const snapshots = (['closed', 'opening', 'open', 'closing'] as const).map(
        animationType => mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            interfaceSelectorA, interfaceSelectorB,
            ...cameraAndTransforms,
            animationType,
        })
    );
    const mvs = MVSData.createMultistate(snapshots, {});
    await loadMVS(plugin, mvs);

    await InterfaceInteractionsHighlight.addOrUpdateBehavior(plugin, { radius: INTERFACE_RADIUS });
    // This must be run when leaving the page!:
    // await InterfaceInteractionsHighlight.removeBehavior(plugin);
}


function molqlChainSurrounding(targetLabelAsymId: string, targetInstanceId: string | undefined, radius: number): MolQLExpressionT {
    const chainTests = [{ head: { name: 'core.rel.eq' }, args: [{ head: { name: 'structure-query.atom-property.macromolecular.label_asym_id' } }, targetLabelAsymId] }];
    if (targetInstanceId) {
        chainTests.push({ head: { name: 'core.rel.eq' }, args: [{ head: { name: 'structure-query.atom-property.core.instance-id' } }, targetInstanceId] });
    }
    const expression = {
        head: { name: 'structure-query.modifier.include-surroundings' },
        args: {
            '0': {
                head: { name: 'structure-query.generator.atom-groups' },
                args: {
                    'chain-test': { head: { name: 'core.logic.and' }, args: chainTests },
                },
            },
            'radius': radius,
            'as-whole-residues': true,
        },
    };
    // The above definition of `expression` is equivalent to the MolScriptBuilder code below.
    // It is instead written without MolScriptBuilder to avoid imports from Molstar.
    // This is not optimal, but acceptable as this is supposed to be a temporary solution.
    //
    // import { MolScriptBuilder } from 'molstar/lib/mol-script/language/builder';
    // const chainTests = [MolScriptBuilder.core.rel.eq([MolScriptBuilder.struct.atomProperty.macromolecular.label_asym_id(), targetLabelAsymId])];
    // if (targetInstanceId !== undefined) {
    //     chainTests.push(MolScriptBuilder.core.rel.eq([MolScriptBuilder.struct.atomProperty.core.instanceId(), targetInstanceId]));
    // }
    // const expression = MolScriptBuilder.struct.modifier.includeSurroundings({
    //     0: MolScriptBuilder.struct.generator.atomGroups({
    //         'chain-test': MolScriptBuilder.core.logic.and(chainTests),
    //     }),
    //     'radius': radius,
    //     'as-whole-residues': true,
    // });
    return { molql: expression };
}

async function getStructureDataViaMvs(plugin: PluginContext, pdbId: string, assemblyId: string | undefined): Promise<Structure> {
    const mvs = mvsDummy(pdbId, assemblyId);
    await loadMVS(plugin, mvs);

    const structures = plugin.managers.structure.hierarchy.current.structures;
    if (structures.length !== 1) throw new Error('Failed to retrieve structure plugin state object');

    const structureData = structures[0].cell.obj?.data;
    if (!structureData) throw new Error('Failed to retrieve structure data');
    return structureData;
}

export function getInterfaceOpeningCameraAndTransforms(structure: Structure, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[], options: { viewportAspectRatio?: number, impulseRotationFactor?: number, impulseTranslationFactor?: number }) {
    const openingAxes = getInterfaceOpeningAxes(structure, partnerA, partnerB);
    const camera = getInterfaceOpeningCamera(openingAxes, { viewportAspectRatio: options.viewportAspectRatio });
    const hingeOpeningTransforms = getInterfaceOpeningTransforms(openingAxes);
    const impulseTransforms = getInterfaceOpeningImpulseTransforms(openingAxes, { rotationFactor: options.impulseRotationFactor, translationFactor: options.impulseTranslationFactor });
    return { camera, hingeOpeningTransforms, impulseTransforms };
}
