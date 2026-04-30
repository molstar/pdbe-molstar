import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import { TraceAtoms } from 'molstar/lib/mol-model/structure/model/types';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { ParseCif, RawData } from 'molstar/lib/mol-plugin-state/transforms/data';
import { CreateGroup } from 'molstar/lib/mol-plugin-state/transforms/misc';
import { ModelFromTrajectory, StructureFromModel, TrajectoryFromMmCif } from 'molstar/lib/mol-plugin-state/transforms/model';
import { OverpaintStructureRepresentation3DFromScript, StructureRepresentation3D } from 'molstar/lib/mol-plugin-state/transforms/representation';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Task } from 'molstar/lib/mol-task';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { transformMany } from '../../superposition';
import type { PDBeMolstarPlugin } from '../../viewer';
import type { BindingSitesApiResponseData, BindingSitesData } from './api-types';


const PDB_STRUCTURE_URL_TEMPLATE = 'https://www.ebi.ac.uk/pdbe/entry-files/{pdb}.bcif';
const MODEL_SERVER_URL = 'https://www.ebi.ac.uk/pdbe/model-server/v1/';
const BINDING_SITE_RADIUS = 5; // TODO: fine-tune this radius (5 does not cover some residues, e.g. 5jvy UNP Q05769 186 F)
const DEBUG_LIGAND_COUNT_LIMIT: number | undefined = undefined;


/** Internal reference to structure of representative entry */
const REPRESENTATIVE_STRUCT_ID = 'representative';
function ligandStructTag(ligand: BindingSitesData[string]['ligands'][number]) {
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
    await doMagic(viewer, bsApiData[uniprotId], bindingSiteId, uniprotId);
}

async function doMagic(viewer: PDBeMolstarPlugin, bsData: BindingSitesData, bindingSiteId: string, uniprotId: string) {
    return await viewer.plugin.runTask(Task.create('Load binding site superposition', async (runtime) => {
        console.log(uniprotId, 'bindingSiteId:', bindingSiteId)
        const residues = new Set(bsData[bindingSiteId].uniprot_residues);
        const ligandsToSuperpose = bsData[bindingSiteId].ligands.slice(0, DEBUG_LIGAND_COUNT_LIMIT);
        const representativePdb = bsData[bindingSiteId].ligands[0].entry_id; // TODO: how to select representative structure

        await runtime.update('Loading representative protein structure');
        console.time('load representative structure')
        await viewer.load({
            id: REPRESENTATIVE_STRUCT_ID,
            url: PDB_STRUCTURE_URL_TEMPLATE.replace('{pdb}', representativePdb),
            format: 'mmcif',
            isBinary: PDB_STRUCTURE_URL_TEMPLATE.endsWith('.bcif'),
            assemblyId: undefined,
        }, false);
        const reprStruct = viewer.getStructure(REPRESENTATIVE_STRUCT_ID)?.cell.obj?.data;
        if (!reprStruct) throw new Error(`Failed to load representative structure ${representativePdb}`);
        console.timeEnd('load representative structure')

        console.time('load&superpose')

        await runtime.update(`Downloading ${ligandsToSuperpose.length} ligands`);
        console.time('load')
        const response = await fetch(...queryManyRequest(ligandsToSuperpose, { method: 'POST', encoding: 'bcif', radius: BINDING_SITE_RADIUS }));
        const qBytes = await response.bytes();

        const bmStructTags: string[] = [];
        const update = viewer.plugin.build();
        const traj = update
            .toRoot()
            .apply(RawData, { data: qBytes })
            .apply(ParseCif, {})
            .apply(TrajectoryFromMmCif, { loadAllBlocks: true });
        for (let i = 0; i < ligandsToSuperpose.length; i++) {
            const ligand = ligandsToSuperpose[i];
            const tag = ligandStructTag(ligand);
            bmStructTags.push(tag);
            traj
                .apply(CreateGroup, { label: `${ligand.entry_id} ${ligand.chem_comps[0].label_asym_id}${ligand.chem_comps[0].sym_op ?? ''}`, description: ligand.ligand_id }, { state: { isCollapsed: true } })
                .apply(ModelFromTrajectory, { modelIndex: i }, { state: { isGhost: false } })
                .apply(StructureFromModel, {}, { tags: [tag] })
                .apply(StructureRepresentation3D, { type: { name: 'ball-and-stick', params: {} } }, { state: { isHidden: true } }) // load as hidden, will reveal after superposition
                .apply(OverpaintStructureRepresentation3DFromScript, { // TODO: think if structures can be colored more smartly
                    layers: [
                        { script: { language: 'pymol', expression: 'all' }, color: ColorNames.gray, clear: false },
                        { script: { language: 'pymol', expression: 'het' }, color: ColorNames.magenta, clear: false },
                    ],
                });
        }
        await update.commit();
        console.timeEnd('load')

        await runtime.update(`Superposing ${ligandsToSuperpose.length} ligands`);
        console.time('superpose')
        console.time('superpose compute')
        const structRefs = getStructureRefsByTag(viewer.plugin);
        const transforms: { [structTag: string]: MinimizeRmsd.Result } = {};
        let reprBsCoords: { [uniprotResNum: number]: [number, number, number] } | undefined; // TODO: properly select representative structure binding site coords (from the whole structure), don't assume it is the first one
        for (const bm of ligandsToSuperpose) {
            // TODO: parallelize ligand loading and superposition
            const tag = ligandStructTag(bm);

            const bmStruct = structRefs[tag].cell.obj?.data;
            if (!bmStruct) throw new Error(`Failed to load ligand structure ${tag}`);

            const bsCoords = extractTraceCoordsByUniprot(bmStruct, uniprotId, residues);

            if (!reprBsCoords) { // This is first structure (representative)
                reprBsCoords = bsCoords;
            }

            const superposition = superposeUniprotCoords(reprBsCoords, bsCoords);
            // console.log('superposed', bmStructId, superposition.nAlignedElements, 'RMSD:', superposition.rmsd)
            transforms[tag] = superposition;
        }
        console.timeEnd('superpose compute')
        console.time('superpose transform')
        await transformMany(viewer.plugin, bmStructTags.map(tag => [structRefs[tag].cell, transforms[tag].bTransform]));
        console.timeEnd('superpose transform')
        for (const tag of bmStructTags) {
            setSubtreeVisibility(viewer.state, structRefs[tag].cell.transform.ref, false);
        }
        console.timeEnd('superpose')

        console.timeEnd('load&superpose')
        // load&superpose: 16 s (81 ligands, individual ModelServer queries)
        // load:           10 s (81 ligands, individual ModelServer queries)
        // load:           2.5 s (81 ligands, ModelServer query-many, POST bcif, pass via RawData)
        // load&superpose: 2.776 s (81 ligands, ModelServer query-many, POST bcif, pass via RawData; transform in one go)

        // await animate(viewer, bmStructIds, { frameMs: 100, repeat: 10 });
    }));
}

interface UniprotCoords {
    [uniprotResNum: number]: [number, number, number],
}

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
            query: 'residueInteraction',
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
