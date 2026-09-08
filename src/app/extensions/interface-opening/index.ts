import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { QueryHelper } from '../../helpers';


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
    console.log(substructure1.elementCount, substructure1, substructure2.elementCount, substructure2)

    await sleep(1000);
    const mvs1 = mvsInterface(pdbId, assemblyId, partner1, partner2);
    await loadMVS(plugin, mvs1);
}


function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
}

function mvsBase(pdbId: string, assemblyId: string | undefined) {
    const root = MVSData.createBuilder();
    const model = root
        .download({ url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}.bcif` })
        .parse({ format: 'bcif' });
    const struct = assemblyId ? model.assemblyStructure({ assembly_id: assemblyId }) : model.modelStructure();
    return { root, struct };
}

function mvsDummy(pdbId: string, assemblyId: string | undefined) {
    const base = mvsBase(pdbId, assemblyId);
    base.struct.component().representation({ type: 'putty', size_factor: 0.25 }); // DEBUG
    return base.root.getState();
}

function mvsInterface(pdbId: string, assemblyId: string | undefined, partner1: ComponentExpressionT[], partner2: ComponentExpressionT[]) {
    const base = mvsBase(pdbId, assemblyId);
    base.struct
        .component({ selector: partner1 })
        .representation({ type: 'cartoon' })
        .color({ color: 'skyblue' });
    base.struct
        .component({ selector: partner2 })
        .representation({ type: 'cartoon' })
        .color({ color: 'orange' });
    return base.root.getState();
}
