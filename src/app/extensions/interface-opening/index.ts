import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { QueryHelper } from '../../helpers';
import { getCoordsWithin, getPca, getStructureCoords } from './computations';
import { mvsDummy, mvsInterface } from './mvs';


// Examples:
// - 1hlu A-B: nice PyMOL example from https://dgoppenheimer.github.io/oppenheimer-blog/2016/12/30/profilin-actin-movie/
// - 1hda A-B, A-C, A-D: kinda nice
// - 2p9u D-F: ugly twisted interface


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
    // console.log(substructure1.elementCount, substructure1, substructure2.elementCount, substructure2)
    const coords1 = getStructureCoords(substructure1);
    const coords2 = getStructureCoords(substructure2);
    // console.log('coords', coords1, coords2)
    const INTERFACE_RADIUS = 5;
    const PCA_TYPE: 'box' | 'moments' = 'moments';
    const interface1 = getCoordsWithin(coords1, coords2, INTERFACE_RADIUS);
    const interface2 = getCoordsWithin(coords2, coords1, INTERFACE_RADIUS);
    const pca1 = getPca(interface1, PCA_TYPE);
    const pca2 = getPca(interface2, PCA_TYPE);


    // Compute interface plane normal:
    // - difference of means of interacting atoms on the two partners
    // - alternatives: averaged direction of vectors between interacting atoms?
    const interfaceNormal = Vec3.normalize(Vec3(), Vec3.sub(_vec, pca2.origin, pca1.origin));
    const interfaceCenter = Vec3.scale(Vec3(), Vec3.add(_vec, pca1.origin, pca2.origin), 0.5);

    // Compute major and minor axis of the interface:
    // - PCA of interacting atoms centered for the whole interface, projected on interface plane
    // - alternatives: PCA of interacting atoms centered for each partner separately, projected on interface plane?

    const translate = Vec3.scale(Vec3(), interfaceNormal, 5);

    console.log('PCA1:', Vec3.magnitude(pca1.dirA), Vec3.magnitude(pca1.dirB), Vec3.magnitude(pca1.dirC))
    console.log('PCA2:', Vec3.magnitude(pca2.dirA), Vec3.magnitude(pca2.dirB), Vec3.magnitude(pca2.dirC))

    const mvs1 = MVSData.createMultistate([
        mvsInterface(pdbId, assemblyId, partner1, partner2, { interface1, interface2, pca1, pca2 }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, { interface1, interface2, pca1, pca2, translate }),
    ], {});
    await loadMVS(plugin, mvs1);
}


function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
}

const _vec = Vec3();
