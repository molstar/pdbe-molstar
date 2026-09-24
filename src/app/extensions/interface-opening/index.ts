import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import type { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { type Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { QueryHelper } from '../../helpers';
import { getInterfaceOpeningAxes, getStructureCoords } from './computations';
import { mvsDummy, mvsInterface } from './mvs';


// Examples:
// - 1hlu A-B: nice PyMOL example from https://dgoppenheimer.github.io/oppenheimer-blog/2016/12/30/profilin-actin-movie/
// - 1hda A-B, A-C, A-D: kinda nice
// - 2p9u D-F: ugly twisted interface
// - 8eiu TA-DA: uglissimo (small protein inserted within ribosomal unit)


export async function runInterfaceOpening(plugin: PluginContext, pdbId: string, assemblyId: string | undefined, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[]) {
    console.log('runInterfaceOpening', plugin, pdbId, assemblyId, partnerA, partnerB)

    const structure = await getStructureDataViaMvs(plugin, pdbId, assemblyId);
    const coordsA = getStructureCoords(getSubstructure(structure, partnerA));
    const coordsB = getStructureCoords(getSubstructure(structure, partnerB));

    const openingAxes = getInterfaceOpeningAxes(coordsA, coordsB);

    const descriptionClosed = `### Interface view\n**Close** &mdash; [Open](#opening)`;
    const descriptionOpen = `### Interface view\n[Close](#closing) &mdash; **Open**`; // TODO: construct in MVS function

    const mvs = MVSData.createMultistate([
        mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            snapshotDescription: descriptionClosed,
            axes: openingAxes,
        }),
        mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            snapshotKey: 'opening',
            snapshotDescription: descriptionOpen,
            axes: openingAxes,
            animation: 'opening',
        }),
        mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            snapshotKey: 'closing',
            snapshotDescription: descriptionClosed,
            axes: openingAxes,
            animation: 'closing',
        }),
    ], {});
    await loadMVS(plugin, mvs);
}


async function getStructureDataViaMvs(plugin: PluginContext, pdbId: string, assemblyId: string | undefined) {
    const mvs = mvsDummy(pdbId, assemblyId);
    await loadMVS(plugin, mvs);

    const structures = plugin.managers.structure.hierarchy.current.structures;
    if (structures.length !== 1) throw new Error('Failed to retrieve structure plugin state object');

    const structureData = structures[0].cell.obj?.data;
    if (!structureData) throw new Error('Failed to retrieve structure data');
    return structureData;
}

function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
}
