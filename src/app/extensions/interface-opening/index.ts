import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { QueryHelper } from '../../helpers';
import { Coords, getCoordsWithin, getForceAndTorque, getStructureCoords, getTrueContactMidpoints } from './computations';
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

    const coords1 = getStructureCoords(getSubstructure(structure, partner1));
    const coords2 = getStructureCoords(getSubstructure(structure, partner2));
    const INTERFACE_RADIUS = 8;
    // const PCA_TYPE: 'box' | 'moments' = 'moments';
    const interface1 = getCoordsWithin(coords1, coords2, INTERFACE_RADIUS);
    const interface2 = getCoordsWithin(coords2, coords1, INTERFACE_RADIUS);
    const interfaceMerged = Coords.concat(interface1, interface2);

    const midpointsContact = getTrueContactMidpoints(interface1, interface2, INTERFACE_RADIUS);
    const openingPca = PrincipalAxes.calculateNormalizedAxes(PrincipalAxes.calculateMomentsAxes(Coords.flatten(midpointsContact.midpoints)));
    const center1 = Coords.getCenter(interface1);
    const center2 = Coords.getCenter(interface2);
    const centerInterface = Vec3.center(Vec3(), center1, center2);
    const centerProteins = Vec3.center(Vec3(), Coords.getCenter(coords1), Coords.getCenter(coords2));
    if (Vec3.dot(openingPca.dirC, Vec3.sub(_vec, center2, center1)) < 0) {
        Vec3.negate(openingPca.dirC, openingPca.dirC); // right on screen (direction of movement of the second partner)
    }
    if (Vec3.dot(openingPca.dirB, Vec3.sub(_vec, centerInterface, centerProteins)) < 0) {
        Vec3.negate(openingPca.dirB, openingPca.dirB); // out of screen (out of the opening interface)
    }
    Vec3.cross(openingPca.dirA, openingPca.dirB, openingPca.dirC); // up on screen (hinge axis)

    const box = PrincipalAxes.calculateBoxAxes(Coords.flatten(interfaceMerged), openingPca);
    const OPENING_RADIUS_FACTOR = 1.05;
    const OPENING_RADIUS_EXTRA = 1;
    const boxWholeA = PrincipalAxes.calculateBoxAxes(Coords.flatten(coords1), openingPca);
    const openingRadiusA = Vec3.magnitude(Vec3.projectOnVector(_vec, Vec3.sub(_vec, Vec3.sub(_vec, boxWholeA.origin, boxWholeA.dirB), box.origin), box.dirB));
    const boxWholeB = PrincipalAxes.calculateBoxAxes(Coords.flatten(coords2), openingPca);
    const openingRadiusB = Vec3.magnitude(Vec3.projectOnVector(_vec, Vec3.sub(_vec, Vec3.sub(_vec, boxWholeB.origin, boxWholeB.dirB), box.origin), box.dirB));
    const openingRadius = (openingRadiusA + openingRadiusB) / 2 * OPENING_RADIUS_FACTOR + OPENING_RADIUS_EXTRA;

    const BOX_SIZE_FACTOR = 1.05;
    const BOX_SIZE_EXTRA = 5;
    Vec3.setMagnitude(box.dirA, box.dirA, Vec3.magnitude(box.dirA) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);
    Vec3.setMagnitude(box.dirB, box.dirB, Vec3.magnitude(box.dirB) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);
    Vec3.setMagnitude(box.dirC, box.dirC, Vec3.magnitude(box.dirB) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);

    const inertiaA = Coords.getInertia(coords1);
    const inertiaB = Coords.getInertia(coords2);
    const forces = {
        ...getForceAndTorque({ ...midpointsContact, surfaceA: interface1, surfaceB: interface2 }, inertiaA.center, inertiaB.center),
        inertiaA,
        inertiaB,
    };

    const descriptionClosed = `### Interface view\n**Close** &mdash; [Open](#opening)`;
    const descriptionOpen = `### Interface view\n[Close](#closing) &mdash; **Open**`;

    const mvs1 = MVSData.createMultistate([
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotDescription: descriptionClosed,
            cameraPca: box,
            openingRadius,
        }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotKey: 'opening',
            snapshotDescription: descriptionOpen,
            cameraPca: box,
            openingRadius,
            forces,
            anim: 'forward',
        }),
        mvsInterface(pdbId, assemblyId, partner1, partner2, {
            snapshotKey: 'closing',
            snapshotDescription: descriptionClosed,
            cameraPca: box,
            openingRadius,
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
