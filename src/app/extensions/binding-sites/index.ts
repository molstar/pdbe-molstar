import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import { TraceAtoms } from 'molstar/lib/mol-model/structure/model/types';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { getStructureUrl } from '../../helpers';
import { transform } from '../../superposition';
import type { PDBeMolstarPlugin } from '../../viewer';
import type { BindingSitesApiResponseData, BindingSitesData, BoundMoleculesApiResponseData, ChemCompClusterApiResponseData, ChemCompClusterData } from './api-types';
import { Download, ParseCif, RawData } from 'molstar/lib/mol-plugin-state/transforms/data';
import { ModelFromTrajectory, StructureFromModel, StructureFromTrajectory, TrajectoryFromMmCif } from 'molstar/lib/mol-plugin-state/transforms/model';
import { Representation } from 'molstar/lib/mol-repr/representation';
import { OverpaintStructureRepresentation3DFromBundle, OverpaintStructureRepresentation3DFromScript, StructureRepresentation3D } from 'molstar/lib/mol-plugin-state/transforms/representation';
import { StateSelection } from 'molstar/lib/mol-state';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { CreateGroup } from 'molstar/lib/mol-plugin-state/transforms/misc';
import { Overpaint } from 'molstar/lib/mol-theme/overpaint';
import { ColorNames } from 'molstar/lib/mol-util/color/names';


const PDB_BOUND_MOLECULES_API_TEMPLATE = `https://www.ebi.ac.uk/pdbe/api/v2/pdb/bound_molecules/{pdb}`;
const PDB_STRUCTURE_URL_TEMPLATE = 'https://www.ebi.ac.uk/pdbe/entry-files/{pdb}.bcif';
const MODEL_SERVER_URL = 'https://www.ebi.ac.uk/pdbe/model-server/v1/';
const BINDING_SITE_RADIUS = 5; // TODO: fine-tune this radius (5 does not cover some residues, e.g. 5jvy UNP Q05769 186 F)
const DEBUG_LIGAND_COUNT_LIMIT: number | undefined = undefined;


/** Internal reference to structure of representative entry */
const REPRESENTATIVE_STRUCT_ID = 'representative';
// function ligandStructId_(pdbId: string, labelAsymId: string) {
//     return `ligand-${pdbId}-${labelAsymId}`;
// }
function ligandStructTag(ligand: BindingSitesData[string]['ligands'][number]) {
    const pdbId = ligand.entry_id;
    const labelAsymId = ligand.chem_comps[0].label_asym_id; // TODO: confirm this is correct
    const symOp = ligand.chem_comps[0].sym_op ?? '';
    return `ligand-struct-${pdbId}-${labelAsymId}${symOp}`;
}

export async function demo(viewer: PDBeMolstarPlugin) {
    console.log('Hello superposition')

    const uniprotId = 'Q05769';
    const bindingSiteId = '2';

    const bsUrl = `tmp/binding-site-superposition/${uniprotId}_bs.json`;
    const clusterUrl = `tmp/binding-site-superposition/${uniprotId}_chem_comp_cluster.json`;
    const bsApiData: BindingSitesApiResponseData = await (await fetch(bsUrl)).json();
    const clusterApiData: ChemCompClusterApiResponseData = await (await fetch(clusterUrl)).json();
    await doMagic(viewer, bsApiData[uniprotId], clusterApiData[uniprotId], bindingSiteId, uniprotId);
}

async function getBmInfo(pdbId: string): Promise<BoundMoleculesApiResponseData> {
    const bmUrl = PDB_BOUND_MOLECULES_API_TEMPLATE.replace('{pdb}', pdbId);
    return await (await fetch(bmUrl)).json();
}

async function getBmInfos(pdbIds: string[]): Promise<BoundMoleculesApiResponseData> {
    const out: BoundMoleculesApiResponseData = {};
    await Promise.all(pdbIds.map(async (pdbId) => {
        const bmInfo = await getBmInfo(pdbId);
        if (!bmInfo[pdbId]) throw new Error(`Bad response for ${pdbId}: ${bmInfo}`);
        out[pdbId] = bmInfo[pdbId];
    }));
    return out;
}

function selectBmsByClusterAndAddPdbId(clusterData: ChemCompClusterData, bindingSiteId: string) {
    const out: (ChemCompClusterData[string][number] & { pdbId: string })[] = [];
    for (const pdbId in clusterData) {
        for (const bm of clusterData[pdbId]) {
            if (bm.cluster_id !== parseInt(bindingSiteId)) continue; // TODO: is this correct
            out.push({ ...bm, pdbId });
        }
    }
    if (out.length === 0) throw new Error(`No ligands for cluster binding site ${bindingSiteId}`);
    return out;
}

async function doMagic(viewer: PDBeMolstarPlugin, bsData: BindingSitesData, clusterData: ChemCompClusterData, bindingSiteId: string, uniprotId: string) {
    console.log('bindingSiteId:', bindingSiteId)
    console.log('bsData:', bsData)
    console.log('clusterData:', clusterData)
    const ligands = bsData[bindingSiteId].ligands
    const residues = new Set(bsData[bindingSiteId].uniprot_residues);
    console.log('ligands:', ligands)
    console.log('residues:', Array.from(residues).sort((a, b) => a - b))

    const representativePdb = bsData[bindingSiteId].ligands[0].entry_id;
    const representativePdbAuthAsymId = bsData[bindingSiteId].ligands[0].chem_comps[0].auth_asym_id;

    await viewer.load({
        id: REPRESENTATIVE_STRUCT_ID,
        url: PDB_STRUCTURE_URL_TEMPLATE.replace('{pdb}', representativePdb),
        format: 'mmcif',
        isBinary: PDB_STRUCTURE_URL_TEMPLATE.endsWith('.bcif'),
        assemblyId: undefined,
    }, false);

    const reprStruct = viewer.getStructure(REPRESENTATIVE_STRUCT_ID)?.cell.obj?.data;
    if (!reprStruct) throw new Error(`Failed to load representative structure ${representativePdb}`);

    let reprBsCoords: { [uniprotResNum: number]: [number, number, number] } | undefined; // TODO: properly select representative structure binding site coords (from the whole structure), don't assume it is the first one

    const ligandsToSuperpose = bsData[bindingSiteId].ligands.slice(0, DEBUG_LIGAND_COUNT_LIMIT);

    console.time('load&superpose')
    console.time('load-multi')
    console.time('fetch')

    const response = await fetch(...queryManyRequest(ligandsToSuperpose, { method: 'POST', encoding: 'bcif', radius: BINDING_SITE_RADIUS }));
    const qBytes = await response.bytes();
    console.timeEnd('fetch')

    console.time('update state')
    const update = viewer.plugin.build();
    // const cif = update
    //     .toRoot()
    //     .apply(RawData, { data: qBytes })
    //     .apply(ParseCif, {});
    // for (let i = 0; i < ligandsToSuperpose.length; i++) {
    //     const ligand = ligandsToSuperpose[i];
    //     cif
    //         .apply(CreateGroup, { label: `${ligand.entry_id} ${ligand.chem_comps[0].label_asym_id}`, description: ligand.ligand_id }, { state: { isCollapsed: true } })
    //         .apply(TrajectoryFromMmCif, { blockHeader: '', blockIndex: i })
    //         .apply(ModelFromTrajectory, {})
    //         .apply(StructureFromModel, {}, { tags: [ligandStructTag(ligand)] })
    //         .apply(StructureRepresentation3D, { type: { name: 'ball-and-stick', params: {} } });
    // }
    const traj = update
        .toRoot()
        .apply(RawData, { data: qBytes })
        .apply(ParseCif, {})
        .apply(TrajectoryFromMmCif, { loadAllBlocks: true });
    for (let i = 0; i < ligandsToSuperpose.length; i++) {
        const ligand = ligandsToSuperpose[i];
        traj
            .apply(CreateGroup, { label: `${ligand.entry_id} ${ligand.chem_comps[0].label_asym_id}${ligand.chem_comps[0].sym_op ?? ''}`, description: ligand.ligand_id }, { state: { isCollapsed: true } })
            .apply(ModelFromTrajectory, { modelIndex: i }, { state: { isGhost: false } })
            .apply(StructureFromModel, {}, { tags: [ligandStructTag(ligand)] })
            .apply(StructureRepresentation3D, { type: { name: 'ball-and-stick', params: {} } })
            .apply(OverpaintStructureRepresentation3DFromScript, { // TODO: think if structures can be colored more smartly
                layers: [
                    { script: { language: 'pymol', expression: 'all' }, color: ColorNames.gray, clear: false },
                    { script: { language: 'pymol', expression: 'het' }, color: ColorNames.magenta, clear: false },
                ],
            });
    }
    await update.commit();
    console.timeEnd('update state')
    console.timeEnd('load-multi')

    console.time('superpose')
    const bmStructTags: string[] = [];

    const structRefs = getStructureRefsByTag(viewer.plugin);
    console.log('structRefs:', Object.keys(structRefs).length, structRefs)
    console.log('structures:', viewer.plugin.managers.structure.hierarchy.current.structures.length)
    console.log('ligandsToSuperpose:', new Set(ligandsToSuperpose.map(ligand => ligandStructTag(ligand))).size)
    console.log('ligandsToSuperpose:', ligandsToSuperpose.length, ligandsToSuperpose)
    // console.log('duplicates:', findDuplicates(ligandsToSuperpose, ligandStructTag))

    // return;

    for (const bm of ligandsToSuperpose) {
        // TODO: parallelize ligand loading and superposition
        const bmStructTag = ligandStructTag(bm)
        bmStructTags.push(bmStructTag);

        const bmStruct = structRefs[bmStructTag].cell.obj?.data;
        if (!bmStruct) throw new Error(`Failed to load ligand structure ${bmStructTag}`);

        const bsCoords = extractTraceCoordsByUniprot(bmStruct, uniprotId, residues);
        // console.log(bm.entry_id, bm.ligand_id, bm.bm_id, Object.keys(bsCoords).length,)

        if (!reprBsCoords) {
            // This is first structure (representative)
            reprBsCoords = bsCoords;
        } else {
            const superposition = superposeUniprotCoords(reprBsCoords, bsCoords);
            // console.log('superposed', bmStructId, superposition.nAlignedElements, 'RMSD:', superposition.rmsd)
            await transform(viewer.plugin, structRefs[bmStructTag].cell, superposition.bTransform);
        }
        // await viewer.visual.structureVisibility(bmStructTag, true); // Reveal superposed structure
    }
    console.timeEnd('superpose')
    console.timeEnd('load&superpose')
    // load&superpose: 16 s (81 ligands, individual ModelServer queries)
    // load:           10 s (81 ligands, individual ModelServer queries)
    // load:           2.5 s (81 ligands, ModelServer query-many, POST bcif, pass via RawData)

    // TODO: solve duplicities in bmStructIds!!!!! (binding site 2)
    console.log('bm:', ligandsToSuperpose.length, ligandsToSuperpose)
    console.log('bmStructIds:', bmStructTags.length, bmStructTags)
    // await animate(viewer, bmStructIds, { frameMs: 100, repeat: 10 });
}

type UniprotCoords = { [uniprotResNum: number]: [number, number, number] }

function extractTraceCoordsByUniprot(struct: Structure, uniprotId: string, uniprotResidues: Set<number>): UniprotCoords {
    const srcData = struct.model.sourceData;
    if (!MmcifFormat.is(srcData)) throw new Error(`Structure data in unsupported format "${srcData.kind}", must be mmCIF/BCIF.`);

    const a = srcData.data.db.atom_site;
    const coords: UniprotCoords = {};
    for (let i = 0; i < a._rowCount; i++) {
        if (!TraceAtoms.has(a.label_atom_id.value(i))) continue; // Select only trace atoms (CA etc.)
        // Assuming a.pdbx_sifts_xref_db_name is 'UNP' (should we check this?)
        if (a.pdbx_sifts_xref_db_acc.value(i) !== uniprotId) continue;
        const uniprotNum = parseInt(a.pdbx_sifts_xref_db_num.value(i));
        if (!uniprotResidues.has(uniprotNum)) continue;
        coords[uniprotNum] = [a.Cartn_x.value(i), a.Cartn_y.value(i), a.Cartn_z.value(i)];
        // console.log('trace atom', a.group_PDB.value(i), a.label_atom_id.value(i), a.label_asym_id.value(i), a.label_seq_id.value(i), '|', a.pdbx_sifts_xref_db_name.value(i), a.pdbx_sifts_xref_db_acc.value(i), uniprotNum, a.pdbx_sifts_xref_db_res.value(i))
        // TODO: this assumes there is only one matching residue, we should select the nearest residue if there are multiple
        // TODO: possible optimization: put coords into 1 array instead of 3-tuples per residue
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

function queryManyRequest(ligandsToSuperpose: BindingSitesData[string]['ligands'], options: { method: 'GET' | 'POST', encoding: 'cif' | 'bcif', radius: number }): [url: string, requestInit: RequestInit | undefined] {
    const query = {
        queries: ligandsToSuperpose.map(bm => ({
            entryId: bm.entry_id,
            query: "residueInteraction",
            params: { atom_site: [{ label_asym_id: bm.chem_comps[0].label_asym_id /* TODO: confirm this is correct */ }], radius: options.radius },
        })),
        encoding: options.encoding,
        asTarGz: false,
    };
    switch (options.method) {
        case 'GET':
            return [`${MODEL_SERVER_URL.replace(/\/$/, '')}/query-many?query=${JSON.stringify(query)}`, undefined];
        case 'POST':
            return [`${MODEL_SERVER_URL.replace(/\/$/, '')}/query-many`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }];
    }
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