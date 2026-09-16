import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { QueryHelper } from '../../helpers';
import { Coords, getCoordsWithin, getForceAndTorque, getMidpoints, getPca, getStructureCoords, getTrueContactMidpoints, getTrueMidpoints } from './computations';
import { mvsDummy, mvsInterface } from './mvs';


// Examples:
// - 1hlu A-B: nice PyMOL example from https://dgoppenheimer.github.io/oppenheimer-blog/2016/12/30/profilin-actin-movie/
// - 1hda A-B, A-C, A-D: kinda nice
// - 2p9u D-F: ugly twisted interface
// - 8eiu TA-DA: uglissimo (small protein inserted within ribosomal unit)


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
    const INTERFACE_RADIUS = 8;
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

    console.time('getMidpoints')
    const midpoints = getMidpoints(interface1, interface2, INTERFACE_RADIUS);
    console.timeEnd('getMidpoints')
    console.log('midpoints', interface1.x.length, interface2.x.length, midpoints.midpoints.x.length)

    console.time('getTrueMidpoints')
    const midpointsTrue = getTrueMidpoints(interface1, interface2, INTERFACE_RADIUS);
    console.timeEnd('getTrueMidpoints')
    console.log('midpointsSmart', interface1.x.length, interface2.x.length, midpointsTrue.midpoints.x.length)

    console.time('getTrueContactMidpoints')
    const midpointsContact = getTrueContactMidpoints(interface1, interface2, INTERFACE_RADIUS);
    console.timeEnd('getTrueContactMidpoints')
    console.log('midpointsContact', interface1.x.length, interface2.x.length, midpointsContact.midpoints.x.length)

    const inertiaA = Coords.getInertia(coords1);
    const inertiaB = Coords.getInertia(coords2);
    const forces = {
        ...getForceAndTorque({ ...midpointsContact, surfaceA: interface1, surfaceB: interface2 }, inertiaA.center, inertiaB.center),
        inertiaA,
        inertiaB,
    };

    // TODO: try to make midpoints smoother (closer to the real mid-surface of the interface)
    const meanVector = Coords.getCenter(midpoints.vectors);
    console.log('meanVector', meanVector, Vec3.magnitude(meanVector))
    const midpointsPca = getPca(midpoints.midpoints, PCA_TYPE);
    const trueMidpointsPca = getPca(midpointsTrue.midpoints, PCA_TYPE);
    const contactMidpointsPca = getPca(midpointsContact.midpoints, PCA_TYPE);

    console.log('PCA1:', Vec3.magnitude(pca1.dirA), Vec3.magnitude(pca1.dirB), Vec3.magnitude(pca1.dirC))
    console.log('PCA2:', Vec3.magnitude(pca2.dirA), Vec3.magnitude(pca2.dirB), Vec3.magnitude(pca2.dirC))
    console.log('PCAmidpoints:', Vec3.magnitude(midpointsPca.dirA), Vec3.magnitude(midpointsPca.dirB), Vec3.magnitude(midpointsPca.dirC), Vec3.normalize(Vec3(), midpointsPca.dirC))
    console.log('PCAmidpointsSmart:', Vec3.magnitude(trueMidpointsPca.dirA), Vec3.magnitude(trueMidpointsPca.dirB), Vec3.magnitude(trueMidpointsPca.dirC), Vec3.normalize(Vec3(), trueMidpointsPca.dirC))
    console.log('PCAmidpointsContact:', Vec3.magnitude(contactMidpointsPca.dirA), Vec3.magnitude(contactMidpointsPca.dirB), Vec3.magnitude(contactMidpointsPca.dirC), Vec3.normalize(Vec3(), contactMidpointsPca.dirC))

    // const openingPca = PrincipalAxes.calculateNormalizedAxes(midpointsPca);
    // const openingPca = PrincipalAxes.calculateNormalizedAxes(trueMidpointsPca);
    const openingPca = PrincipalAxes.calculateNormalizedAxes(contactMidpointsPca);
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
    const OPENING_RADIUS_FACTOR = 1.1;
    const OPENING_RADIUS_EXTRA = 5;
    const openingRadius = Vec3.magnitude(box.dirB) * OPENING_RADIUS_FACTOR + OPENING_RADIUS_EXTRA;
    Vec3.setMagnitude(box.dirB, box.dirB, openingRadius);
    Vec3.setMagnitude(box.dirA, box.dirA, Vec3.magnitude(box.dirA) * OPENING_RADIUS_FACTOR + OPENING_RADIUS_EXTRA);

    // TODO: increase box.dirB to avoid overlap of whole chains (2p9u C-D almost touching)
    // const translate = Vec3.setMagnitude(Vec3(), interfaceNormal, 20);
    // const translate = Vec3.setMagnitude(Vec3(), pca1.dirC, 20);
    // const translate = Vec3.setMagnitude(Vec3(), meanVector, 20);
    const translate = Vec3.setMagnitude(Vec3(), box.dirC, 20);

    const descriptionClosed = `### Interface view\n**Close** &mdash; [Open](#opening)`;
    const descriptionOpen = `### Interface view\n[Close](#closing) &mdash; **Open**`;

    const mvs1 = MVSData.createMultistate([
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotDescription: descriptionClosed,
            // interface1, interface2,
            // otherPoints: midpoints.midpoints,
            // otherPoints2: midpointsContact.midpoints,
            // pca1, pca2, otherPca: midpointsPca,
            cameraPca: box,
            // translateAxis: { origin: Coords.getCenter(interfaceMerged), dir: translate },
        }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotKey: 'opening',
            snapshotDescription: descriptionOpen,
            cameraPca: box,
            // translate,
            forces,
            anim: 'forward',
        }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotKey: 'closing',
            snapshotDescription: descriptionClosed,
            cameraPca: box,
            // translate,
            forces,
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
