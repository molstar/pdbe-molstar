import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PrincipalAxes } from 'molstar/lib/mol-math/linear-algebra/matrix/principal-axes';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { QueryHelper } from '../../helpers';
import { Coords, getCoordsWithin, getForceAndTorque, getImpulse, getStructureCoords, getTrueContacts } from './computations';
import { mvsDummy, mvsInterface } from './mvs';


// Examples:
// - 1hlu A-B: nice PyMOL example from https://dgoppenheimer.github.io/oppenheimer-blog/2016/12/30/profilin-actin-movie/
// - 1hda A-B, A-C, A-D: kinda nice
// - 2p9u D-F: ugly twisted interface
// - 8eiu TA-DA: uglissimo (small protein inserted within ribosomal unit)


export async function runInterfaceOpening(plugin: PluginContext, pdbId: string, assemblyId: string | undefined, partnerA: ComponentExpressionT[], partnerB: ComponentExpressionT[]) {
    console.log('runInterfaceOpening', plugin, pdbId, assemblyId, partnerA, partnerB)

    const mvs0 = mvsDummy(pdbId, assemblyId);
    await loadMVS(plugin, mvs0);

    const structures = plugin.managers.structure.hierarchy.current.structures;
    if (structures.length !== 1) throw new Error('Failed to retrieve structure properly');
    const structure = structures[0].cell.obj?.data;
    if (!structure) throw new Error('Failed to retrieve structure data');

    const coordsA = getStructureCoords(getSubstructure(structure, partnerA));
    const coordsB = getStructureCoords(getSubstructure(structure, partnerB));
    const INTERFACE_RADIUS = 8;
    const interfaceA = getCoordsWithin(coordsA, coordsB, INTERFACE_RADIUS);
    const interfaceB = getCoordsWithin(coordsB, coordsA, INTERFACE_RADIUS);
    const interfaceMerged = Coords.concat(interfaceA, interfaceB);

    const contacts = getTrueContacts(interfaceA, interfaceB, INTERFACE_RADIUS);
    const openingPca = PrincipalAxes.calculateNormalizedAxes(PrincipalAxes.calculateMomentsAxes(Coords.flatten(contacts.midpoints)));
    const centerA = Coords.getCenter(interfaceA);
    const centerB = Coords.getCenter(interfaceB);
    const centerInterface = Vec3.center(Vec3(), centerA, centerB);
    const centerProteins = Vec3.center(Vec3(), Coords.getCenter(coordsA), Coords.getCenter(coordsB));
    if (Vec3.dot(openingPca.dirC, Vec3.sub(_vec, centerB, centerA)) < 0) {
        Vec3.negate(openingPca.dirC, openingPca.dirC); // right on screen (direction of movement of the second partner)
    }
    if (Vec3.dot(openingPca.dirB, Vec3.sub(_vec, centerInterface, centerProteins)) < 0) {
        Vec3.negate(openingPca.dirB, openingPca.dirB); // out of screen (out of the opening interface)
    }
    Vec3.cross(openingPca.dirA, openingPca.dirB, openingPca.dirC); // up on screen (hinge axis)

    const box = PrincipalAxes.calculateBoxAxes(Coords.flatten(interfaceMerged), openingPca);
    const OPENING_RADIUS_FACTOR = 1.05;
    const OPENING_RADIUS_EXTRA = 1;
    const boxWholeA = PrincipalAxes.calculateBoxAxes(Coords.flatten(coordsA), openingPca);
    const openingRadiusA = Vec3.magnitude(Vec3.projectOnVector(_vec, Vec3.sub(_vec, Vec3.sub(_vec, boxWholeA.origin, boxWholeA.dirB), box.origin), box.dirB));
    const boxWholeB = PrincipalAxes.calculateBoxAxes(Coords.flatten(coordsB), openingPca);
    const openingRadiusB = Vec3.magnitude(Vec3.projectOnVector(_vec, Vec3.sub(_vec, Vec3.sub(_vec, boxWholeB.origin, boxWholeB.dirB), box.origin), box.dirB));
    const openingRadius = (openingRadiusA + openingRadiusB) / 2 * OPENING_RADIUS_FACTOR + OPENING_RADIUS_EXTRA;

    const BOX_SIZE_FACTOR = 1.05;
    const BOX_SIZE_EXTRA = 5;
    Vec3.setMagnitude(box.dirA, box.dirA, Vec3.magnitude(box.dirA) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);
    Vec3.setMagnitude(box.dirB, box.dirB, Vec3.magnitude(box.dirB) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);
    Vec3.setMagnitude(box.dirC, box.dirC, Vec3.magnitude(box.dirB) * BOX_SIZE_FACTOR + BOX_SIZE_EXTRA);

    const inertiaA = Coords.getInertia(coordsA);
    const inertiaB = Coords.getInertia(coordsB);
    const forces = getForceAndTorque(contacts, inertiaA.center, inertiaB.center);
    const impulses = {
        a: getImpulse(inertiaA, forces.forceA, forces.torqueA, 1),
        b: getImpulse(inertiaB, forces.forceB, forces.torqueB, 1),
    };

    const descriptionClosed = `### Interface view\n**Close** &mdash; [Open](#opening)`;
    const descriptionOpen = `### Interface view\n[Close](#closing) &mdash; **Open**`;

    const mvs = MVSData.createMultistate([
        mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            snapshotDescription: descriptionClosed,
            cameraAxes: box,
            openingRadius,
        }),
        mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            snapshotKey: 'opening',
            snapshotDescription: descriptionOpen,
            cameraAxes: box,
            openingRadius,
            impulses,
            animation: 'opening',
        }),
        mvsInterface({
            pdbId, assemblyId, partnerA, partnerB,
            snapshotKey: 'closing',
            snapshotDescription: descriptionClosed,
            cameraAxes: box,
            openingRadius,
            impulses,
            animation: 'closing',
        }),
    ], {});
    await loadMVS(plugin, mvs);
}


function getSubstructure(structure: Structure, selector: ComponentExpressionT[]): Structure {
    const expr = QueryHelper.getQueryObject(selector, structure);
    const selection = StructureQuery.run(expr as StructureQuery, structure);
    return StructureSelection.unionStructure(selection);
}

const _vec = Vec3();
