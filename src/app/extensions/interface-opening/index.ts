import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { QueryHelper } from '../../helpers';
import { Coords, getCoordsWithin, getMidPoints, getPca, getStructureCoords } from './computations';
import { mvsDummy, mvsInterface } from './mvs';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';


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
    // - PCA of interacting atoms centered for the whole interface, projected on the interface plane
    // - alternatives: PCA of interacting atoms centered for each partner separately, projected on the interface plane?
    const interfaceMerged = Coords.concat(interface1, interface2);
    // const projected = Coords.projectOnPlane(Coords.center(interfaceMerged), interfaceNormal);
    // const projected = Coords.projectOnPlane(interfaceMerged, interfaceNormal, Coords.getCenter(interfaceMerged));
    // const projected = Coords.addVector(Coords.projectOnPlane(Coords.center(interfaceMerged), interfaceNormal), Coords.getCenter(interfaceMerged))

    const { midpoints, vectors } = getMidPoints(interface1, interface2, INTERFACE_RADIUS);
    console.log('midpoints', interface1.x.length, interface2.x.length, midpoints.x.length)
    // TODO: try to make midpoints smoother (closer to the real mid-surface of the interface)
    const meanVector = Coords.getCenter(vectors);
    console.log('meanVector', meanVector, Vec3.magnitude(meanVector))
    const midpointsPca = getPca(midpoints, PCA_TYPE);

    const openingPca = PrincipalAxes.calculateNormalizedAxes(midpointsPca);
    const center1 = Coords.getCenter(interface1);
    const center2 = Coords.getCenter(interface2);
    const centerInterface = Vec3.center(Vec3(), center1, center2);
    const centerProteins = Vec3.center(Vec3(), Coords.getCenter(coords1), Coords.getCenter(coords2));
    if (Vec3.dot(openingPca.dirC, Vec3.sub(Vec3(), center2, center1)) < 0) {
        Vec3.negate(openingPca.dirC, openingPca.dirC); // right on screen (direction of movement of the second partner)
    }
    if (Vec3.dot(openingPca.dirB, Vec3.sub(Vec3(), centerInterface, centerProteins)) < 0) {
        Vec3.negate(openingPca.dirB, openingPca.dirB); // out on screen (out of the opening interface)
    }
    Vec3.cross(openingPca.dirA, openingPca.dirB, openingPca.dirC); // up on screen (hinge axis)
    console.log('openingPca', openingPca)

    const box = PrincipalAxes.calculateBoxAxes(Coords.flatten(interfaceMerged), openingPca);
    console.log('box', box)
    const OPENING_RADIUS_FACTOR = 1.2;
    const OPENING_RADIUS_EXTRA = 5;
    const openingRadius = Vec3.magnitude(box.dirB) * OPENING_RADIUS_FACTOR + OPENING_RADIUS_EXTRA;
    Vec3.setMagnitude(box.dirB, box.dirB, openingRadius);
    Vec3.setMagnitude(box.dirA, box.dirA, Vec3.magnitude(box.dirA) * OPENING_RADIUS_FACTOR + OPENING_RADIUS_EXTRA);

    // const translate = Vec3.scale(Vec3(), interfaceNormal, 20);
    // const translate = Vec3.scale(Vec3(), pca1.dirC, 5);
    // const translate = Vec3.scale(Vec3(), meanVector, 20 / Vec3.magnitude(meanVector));
    const translate = Vec3.scale(Vec3(), midpointsPca.dirC, 5);

    console.log('PCA1:', Vec3.magnitude(pca1.dirA), Vec3.magnitude(pca1.dirB), Vec3.magnitude(pca1.dirC))
    console.log('PCA2:', Vec3.magnitude(pca2.dirA), Vec3.magnitude(pca2.dirB), Vec3.magnitude(pca2.dirC))
    console.log('PCAmidpoints:', Vec3.magnitude(midpointsPca.dirA), Vec3.magnitude(midpointsPca.dirB), Vec3.magnitude(midpointsPca.dirC))

    const descriptionClosed = `### Interface view\n**[Close](#closing)** &mdash; [Open](#opening)`;
    const descriptionOpen = `### Interface view\n[Close](#closing) &mdash; **[Open](#opening)**`;

    const mvs1 = MVSData.createMultistate([
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            // interface1, interface2,
            snapshotDescription: descriptionClosed,
            pca1, pca2,
            // otherPoints: midpoints,
            otherPca: midpointsPca,
            cameraPca: box,
            // openingRadius: openingRadiusExtended,
            translateAxis: { origin: Coords.getCenter(interfaceMerged), dir: translate },
        }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotKey: 'opening',
            snapshotDescription: descriptionOpen,
            cameraPca: box,
            // openingRadius: openingRadiusExtended,
            anim: 'forward',
        }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotKey: 'closing',
            snapshotDescription: descriptionClosed,
            cameraPca: box,
            // openingRadius: openingRadiusExtended,
            anim: 'backward',
        }),
    ], {});
    await loadMVS(plugin, mvs1);
}


function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
}

const _vec = Vec3();
