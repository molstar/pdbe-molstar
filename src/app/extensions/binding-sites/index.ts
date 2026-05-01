import { Sphere3D } from 'molstar/lib/mol-math/geometry';
import { EPSILON, Mat3, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure, StructureQuery, StructureSelection } from 'molstar/lib/mol-model/structure';
import { TraceAtoms } from 'molstar/lib/mol-model/structure/model/types';
import { changeCameraRotation } from 'molstar/lib/mol-plugin-state/manager/focus-camera/orient-axes';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { Download, ParseCif, RawData } from 'molstar/lib/mol-plugin-state/transforms/data';
import { CreateGroup } from 'molstar/lib/mol-plugin-state/transforms/misc';
import { ModelFromTrajectory, StructureFromModel, TrajectoryFromMmCif } from 'molstar/lib/mol-plugin-state/transforms/model';
import { OverpaintStructureRepresentation3DFromScript, StructureRepresentation3D } from 'molstar/lib/mol-plugin-state/transforms/representation';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { QueryHelper, QueryParam } from '../../helpers';
import { transformMany } from '../../superposition';
import type { PDBeMolstarPlugin } from '../../viewer';
import type { BindingSitesApiResponseData, BindingSitesData } from './api-types';


const PDB_STRUCTURE_URL_TEMPLATE = 'https://www.ebi.ac.uk/pdbe/entry-files/{pdb}.bcif';
// const PDB_STRUCTURE_URL_TEMPLATE = 'http://127.0.0.1:1339/tmp/binding-site-superposition/{pdb}_updated.cif';
// const PDB_STRUCTURE_URL_TEMPLATE = 'http://127.0.0.1:1339/tmp/binding-site-superposition/{pdb}_updated-shuffled-atoms.cif';
const MODEL_SERVER_URL = 'https://www.ebi.ac.uk/pdbe/model-server/v1/';
const BINDING_SITE_RADIUS = 5; // TODO: fine-tune this radius (5 does not cover some residues, e.g. 5jvy UNP Q05769 186 F)
const DEBUG_LIGAND_COUNT_LIMIT: number | undefined = undefined;
/** Size of batch for downloading and superposing ligands (selected so that ModelServer request URL length does not exceed limit 2000) */
const LIGAND_BATCH_SIZE: number | undefined = 12;
const URL_LENGTH_LIMIT = 2000;


type Ligand = BindingSitesData[string]['ligands'][number];

/** Internal reference to structure of representative entry */
const REPRESENTATIVE_STRUCT_ID = 'representative';
function ligandStructTag(ligand: Ligand) {
    const pdbId = ligand.entry_id;
    const labelAsymId = ligand.chem_comps[0].label_asym_id; // TODO: confirm this is correct
    const symOp = ligand.chem_comps[0].sym_op ?? '';
    return `ligand-struct-${pdbId}-${labelAsymId}${symOp}`;
}

export async function demo(viewer: PDBeMolstarPlugin) {
    const uniprotId = 'Q05769';
    const bindingSiteId = '1';

    const bsUrl = `tmp/binding-site-superposition/${uniprotId}_bs.json`;
    const bsApiData: BindingSitesApiResponseData = await (await fetch(bsUrl)).json();
    // const clusterUrl = `tmp/binding-site-superposition/${uniprotId}_chem_comp_cluster.json`;
    // const clusterApiData: ChemCompClusterApiResponseData = await (await fetch(clusterUrl)).json();
    return await viewer.plugin.runTask(doMagic(viewer, bsApiData[uniprotId], bindingSiteId, uniprotId));
}

function doMagic(viewer: PDBeMolstarPlugin, bsData: BindingSitesData, bindingSiteId: string, uniprotId: string) {
    return Task.create('Load binding site superposition', async (runtime) => {
        console.log(uniprotId, 'bindingSiteId:', bindingSiteId)
        const bsResidues = new Set(bsData[bindingSiteId].uniprot_residues);
        const representativePdb = bsData[bindingSiteId].ligands[0].entry_id; // TODO: how to select representative structure
        const representativePdbAuthAsymId = bsData[bindingSiteId].ligands[0].chem_comps[0].auth_asym_id;
        const representativePdbSymOp = bsData[bindingSiteId].ligands[0].chem_comps[0].sym_op; // TODO: show correct assembly and use sym_op

        console.time('load representative structure')
        await runtime.update('Loading representative protein structure');
        await viewer.load({
            id: REPRESENTATIVE_STRUCT_ID,
            url: PDB_STRUCTURE_URL_TEMPLATE.replace('{pdb}', representativePdb),
            format: 'mmcif',
            isBinary: PDB_STRUCTURE_URL_TEMPLATE.endsWith('.bcif'),
            assemblyId: undefined,
        }, false);
        const reprStruct = viewer.getStructure(REPRESENTATIVE_STRUCT_ID)?.cell.obj?.data;
        if (!reprStruct) throw new Error(`Failed to load representative structure ${representativePdb}`);
        const reprBsSelector: QueryParam[] = Array.from(bsResidues).map(res => ({
            auth_asym_id: representativePdbAuthAsymId,
            uniprot_accession: uniprotId,
            uniprot_residue_number: res,
        }));
        const reprBsStruct = StructureSelection.unionStructure(StructureQuery.run(QueryHelper.getQueryObject(reprBsSelector, reprStruct), reprStruct));
        const bsSphere = reprBsStruct.boundary.sphere;
        const globalSphere = reprStruct.boundary.sphere;
        await turnFocusSphereForward(viewer.plugin, bsSphere, globalSphere, { focus: true, durationMs: 0 });
        const reprBsCoords = extractTraceCoordsByUniprot(reprBsStruct, uniprotId, bsResidues);
        console.timeEnd('load representative structure')

        console.time('load&superpose all')
        const ligandsToSuperpose = bsData[bindingSiteId].ligands.slice(0, DEBUG_LIGAND_COUNT_LIMIT);
        for (const ligandBatch of divideToBatches(ligandsToSuperpose, LIGAND_BATCH_SIZE)) {
            await runtime.update(`Loading ligands... ${ligandBatch.progress.percentDone.toFixed(0)}%`);
            await superposeLigands(viewer.plugin, ligandBatch.jobs, uniprotId, bsResidues, reprBsCoords);
        }
        console.timeEnd('load&superpose all')
    });
}

async function superposeLigands(plugin: PluginContext, ligands: Ligand[], uniprotId: string, uniprotBindingSiteResidues: Set<number>, reprBsCoords: UniprotCoords) {
    console.time('load&superpose')
    console.time('load')

    const url = queryManyRequestUrl(ligands, { encoding: 'bcif', radius: BINDING_SITE_RADIUS });
    const structTags: string[] = [];

    const update = plugin.build();
    const traj = update
        .toRoot()
        .apply(Download, { url: url, isBinary: true })
        .apply(ParseCif, {})
        .apply(TrajectoryFromMmCif, { loadAllBlocks: true });
    for (let i = 0; i < ligands.length; i++) {
        const ligand = ligands[i];
        const tag = ligandStructTag(ligand);
        structTags.push(tag);
        traj
            .apply(CreateGroup, { label: `${ligand.entry_id} ${ligand.chem_comps[0].label_asym_id}${ligand.chem_comps[0].sym_op ?? ''}`, description: ligand.ligand_id }, { state: { isCollapsed: true } })
            .apply(ModelFromTrajectory, { modelIndex: i }, { state: { isGhost: false } })
            .apply(StructureFromModel, {}, { tags: [tag] })
            .apply(StructureRepresentation3D, { type: { name: 'ball-and-stick', params: {} } }, { state: { isHidden: true } }) // load as hidden, will reveal after superposition
            .apply(OverpaintStructureRepresentation3DFromScript, { // TODO: think if structures can be colored more smartly
                layers: [
                    { script: { language: 'pymol', expression: 'all' }, color: ColorNames.gray, clear: false },
                    { script: { language: 'pymol', expression: 'het' }, color: ColorNames.magenta, clear: false },
                    { script: { language: 'pymol', expression: 'resn HOH' }, color: ColorNames.red, clear: false },
                ],
            });
    }
    await update.commit();
    console.timeEnd('load')

    console.time('superpose')
    const structRefs = getStructureRefsByTag(plugin);
    const transforms: { [structTag: string]: MinimizeRmsd.Result } = {};
    for (const ligand of ligands) {
        // TODO: parallelize ligand loading and superposition
        const tag = ligandStructTag(ligand);

        const bmStruct = structRefs[tag].cell.obj?.data;
        if (!bmStruct) throw new Error(`Failed to load ligand structure ${tag}`);

        const bsCoords = extractTraceCoordsByUniprot(bmStruct, uniprotId, uniprotBindingSiteResidues);
        const superposition = superposeUniprotCoords(reprBsCoords, bsCoords);
        // console.log('superposed', superposition.nAlignedElements, 'RMSD:', superposition.rmsd)
        transforms[tag] = superposition;
    }
    await transformMany(plugin, structTags.map(tag => [structRefs[tag].cell, transforms[tag].bTransform]));
    for (const tag of structTags) {
        setSubtreeVisibility(plugin.state.data, structRefs[tag].cell.transform.ref, false);
    }
    console.timeEnd('superpose')
    console.timeEnd('load&superpose')
    // load&superpose: 16 s (81 ligands, individual ModelServer queries)
    // load:           10 s (81 ligands, individual ModelServer queries)
    // load:           2.5 s (81 ligands, ModelServer query-many, POST bcif, pass via RawData)
    // load&superpose: 2.776 s (81 ligands, ModelServer query-many, POST bcif, pass via RawData; transform in one go)
}

interface UniprotCoords {
    [uniprotResNum: number]: [number, number, number],
}

function extractTraceCoordsByUniprot(struct: Structure, uniprotId: string, uniprotResidues: Set<number>): UniprotCoords {
    const coords: UniprotCoords = {};
    for (const unit of struct.units) {
        const srcData = unit.model.sourceData;
        if (!MmcifFormat.is(srcData)) throw new Error(`Structure data in unsupported format "${srcData.kind}", must be mmCIF/BCIF.`);

        const atomSourceIndex = unit.model.atomicHierarchy.atomSourceIndex;
        const srcAtomSite = srcData.data.db.atom_site;
        for (let i = 0, n = unit.elements.length; i < n; i++) {
            /** Index of atom in model (might be reordered) */
            const iElem = unit.elements[i];
            /** Index of atom in the original CIF (before reordering) */
            const iSrc = atomSourceIndex.value(iElem);

            const label_atom_id = srcAtomSite.label_atom_id.value(iSrc);
            if (!TraceAtoms.has(label_atom_id)) continue; // Select only trace atoms (CA etc.)
            const pdbx_sifts_xref_db_acc = srcAtomSite.pdbx_sifts_xref_db_acc.value(iSrc);
            if (pdbx_sifts_xref_db_acc !== uniprotId) continue;
            const pdbx_sifts_xref_db_num = parseInt(srcAtomSite.pdbx_sifts_xref_db_num.value(iSrc));
            if (!uniprotResidues.has(pdbx_sifts_xref_db_num)) continue;
            // Assuming pdbx_sifts_xref_db_name is 'UNP' (should we check this?)
            coords[pdbx_sifts_xref_db_num] = [srcAtomSite.Cartn_x.value(iSrc), srcAtomSite.Cartn_y.value(iSrc), srcAtomSite.Cartn_z.value(iSrc)];
            // TODO: this assumes there is only one matching residue, we should select the nearest residue if there are multiple
        }
    }
    return coords;
}

function superposeUniprotCoords(aCoords: UniprotCoords, bCoords: UniprotCoords): MinimizeRmsd.Result {
    const a = { x: [] as number[], y: [] as number[], z: [] as number[] };
    const b = { x: [] as number[], y: [] as number[], z: [] as number[] };
    for (const uniprotResId in bCoords) {
        if (!aCoords[uniprotResId]) continue;
        a.x.push(aCoords[uniprotResId][0]);
        a.y.push(aCoords[uniprotResId][1]);
        a.z.push(aCoords[uniprotResId][2]);
        b.x.push(bCoords[uniprotResId][0]);
        b.y.push(bCoords[uniprotResId][1]);
        b.z.push(bCoords[uniprotResId][2]);
    }
    return MinimizeRmsd.compute({ a, b });
}

/** Return ModelServer request URL for querying residue surroundings of multiple ligands */
function queryManyRequestUrl(ligands: Ligand[], options: { encoding: 'cif' | 'bcif', radius: number }): string {
    const query = {
        queries: ligands.map(bm => ({
            entryId: bm.entry_id,
            query: 'residueInteraction',
            params: { atom_site: [{ label_asym_id: bm.chem_comps[0].label_asym_id /* TODO: confirm this is correct */ }], radius: options.radius },
        })),
        encoding: options.encoding,
        asTarGz: false,
    };
    const url = `${MODEL_SERVER_URL.replace(/\/$/, '')}/query-many?query=${JSON.stringify(query)}`;
    const escapedUrl = new URL(url).toString();
    const urlLength = escapedUrl.toString().length;
    if (urlLength > URL_LENGTH_LIMIT) {
        console.warn(`ModelServer request URL (${urlLength} characters) exceeded recommended URL length limit (${URL_LENGTH_LIMIT} characters). Request might fail depending on the browser.`);
    }
    return escapedUrl;
}

function getStructureRefsByTag(plugin: PluginContext) {
    const out: { [tag: string]: StructureRef } = {};
    for (const structRef of plugin.managers.structure.hierarchy.current.structures) {
        for (const tag of structRef.cell.transform.tags ?? []) {
            out[tag] = structRef;
        }
    }
    return out;
}

async function animate(viewer: PDBeMolstarPlugin, structIds: string[], options: { frameMs: number, repeat: number | undefined }) {
    let rep = 0;
    for (const structId of structIds) await viewer.visual.structureVisibility(structId, false);
    while (true) {
        if (options.repeat !== undefined && rep++ >= options.repeat) break;
        for (const structId of structIds) {
            await viewer.visual.structureVisibility(structId, true);
            await sleep(options.frameMs);
            await viewer.visual.structureVisibility(structId, false);
        }
    }
    for (const structId of structIds) await viewer.visual.structureVisibility(structId, true);
}

function findDuplicates<T>(items: T[], key: (item: T) => string) {
    const out: { [key: string]: T[] } = {};
    for (const item of items) {
        (out[key(item)] ??= []).push(item);
    }
    for (const keyValue of Object.keys(out)) {
        if (out[keyValue].length < 2) {
            delete out[keyValue];
        }
    }
    return out;
}

async function turnFocusSphereForward(plugin: PluginContext, focusSphere: Sphere3D, globalSphere: Sphere3D, options?: { focus?: boolean, durationMs?: number }) {
    plugin.canvas3d?.commit();
    const currentSnapshot = plugin.canvas3d!.camera.getSnapshot();
    const dirZ = Vec3.sub(Vec3(), focusSphere.center, globalSphere.center);
    Vec3.normalize(dirZ, dirZ);
    const dirX = safeCross(Vec3(), currentSnapshot.up, dirZ);
    Vec3.normalize(dirX, dirX);
    const dirY = Vec3.cross(Vec3(), dirZ, dirX);
    Vec3.normalize(dirY, dirY);
    const rotation = Mat3.fromColumns(Mat3(), dirX, dirY, dirZ);
    Mat3.transpose(rotation, rotation);
    const focus = options?.focus ? plugin.canvas3d!.camera.getFocus(focusSphere.center, focusSphere.radius) : undefined;
    const newSnapshot = changeCameraRotation({ ...currentSnapshot, ...focus }, rotation);
    await PluginCommands.Camera.SetSnapshot(plugin, { snapshot: newSnapshot, durationMs: options?.durationMs ?? 0 });
}

function safeCross(out: Vec3, a: Vec3, b: Vec3) {
    const sqSizeA = Vec3.squaredMagnitude(a);
    const sqSizeB = Vec3.squaredMagnitude(b);
    Vec3.cross(out, a, b);
    if (Vec3.squaredMagnitude(out) > EPSILON * EPSILON * sqSizeA * sqSizeB) return out;
    // Were almost parallel, try cross(Y, b)
    Vec3.cross(out, Vec3.create(0, 1, 0), b);
    if (Vec3.squaredMagnitude(out) > EPSILON * EPSILON * sqSizeB) return out;
    // Were almost parallel, try cross(X, b)
    Vec3.cross(out, Vec3.create(1, 0, 0), b);
    return out;
}

function divideToBatches<T>(jobs: T[], batchSize: number = Infinity) {
    const out = [];
    const total = jobs.length;
    for (let done = 0; done < jobs.length; done += batchSize) {
        out.push({
            jobs: jobs.slice(done, done + batchSize),
            progress: { done, total, percentDone: done / total * 100 },
        });
    }
    return out;
}
