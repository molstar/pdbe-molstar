import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { TraceAtoms } from 'molstar/lib/mol-model/structure/model/types';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { getStructureUrl } from '../../helpers';
import { transform } from '../../superposition';
import type { PDBeMolstarPlugin } from '../../viewer';
import type { BindingSitesApiResponseData, BindingSitesData, BoundMoleculesApiResponseData, ChemCompClusterApiResponseData, ChemCompClusterData } from './api-types';


const PDB_BOUND_MOLECULES_API_TEMPLATE = `https://www.ebi.ac.uk/pdbe/api/v2/pdb/bound_molecules/{pdb}`;
const PDB_STRUCTURE_URL_TEMPLATE = 'https://www.ebi.ac.uk/pdbe/entry-files/{pdb}.bcif';
const BINDING_SITE_RADIUS = 5; // TODO: fine-tune this radius (5 does not cover some residues, e.g. 5jvy UNP Q05769 186 F)
const DEBUG_LIGAND_COUNT_LIMIT = undefined;//6;


/** Internal reference to structure of representative entry */
const REPRESENTATIVE_STRUCT_ID = 'representative';
function ligandStructId(pdbId: string, labelAsymId: string) {
    return `ligand-${pdbId}-${labelAsymId}`;
}


export async function demo(viewer: PDBeMolstarPlugin) {
    console.log('Hello superposition')

    const uniprotId = 'Q05769';
    const bindingSiteId = '1';

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

async function doMagic(viewer: PDBeMolstarPlugin, bsData: BindingSitesData, clusterData: ChemCompClusterData, bindingSiteId: string, unprotId: string) {
    console.log('bindingSiteId:', bindingSiteId)
    console.log('bsData:', bsData)
    console.log('clusterData:', clusterData)
    const ligands = bsData[bindingSiteId].ligands
    const residues = Array.from(bsData[bindingSiteId].uniprot_residues).sort((a, b) => a - b);
    const bindingResidueSet = new Set(residues);
    console.log('ligands:', ligands)
    console.log('residues:', residues)

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

    console.time('load&superpose')
    const bmStructIds: string[] = [];
    for (const bm of bsData[bindingSiteId].ligands.slice(0, DEBUG_LIGAND_COUNT_LIMIT)) {
        // TODO: parallelize ligand loading and superposition
        const pdbId = bm.entry_id;
        const labelAsymId = bm.chem_comps[0].label_asym_id; // TODO: confirm this is correct
        const bmStructId = ligandStructId(pdbId, labelAsymId)
        bmStructIds.push(bmStructId);

        const structUrl = getStructureUrl(viewer.initParams, {
            pdbId: pdbId,
            queryType: 'residueInteraction',
            queryParams: {
                label_asym_id: labelAsymId,
                radius: BINDING_SITE_RADIUS,
                encoding: 'bcif',
                assembly_name: undefined,
            },
        });

        await viewer.load({
            id: bmStructId,
            url: structUrl,
            format: 'mmcif',
            isBinary: true,
            assemblyId: undefined,
        }, false);
        // TODO: implement download retry logic, ModelServer tends to crash, according to Mihai
        // TODO: load via ModelServer query-many
        await viewer.visual.structureVisibility(bmStructId, false); // Hide structure until superposed
        await viewer.visual.select({ data: [{ label_asym_id: labelAsymId, color: 'magenta' }], nonSelectedColor: 'gray', structureId: bmStructId });

        const bmStruct = viewer.getStructure(bmStructId)?.cell.obj?.data;
        if (!bmStruct) throw new Error(`Failed to load ligand structure ${bmStructId}`);

        const srcData = bmStruct.model.sourceData
        if (!MmcifFormat.is(srcData)) throw new Error(`Structure data in unsupported format "${srcData.kind}", must be mmCIF/BCIF.`);
        const a = srcData.data.db.atom_site;
        const bsCoords: { [uniprotResNum: number]: [number, number, number] } = {};
        for (let i = 0; i < a._rowCount; i++) {
            if (!TraceAtoms.has(a.label_atom_id.value(i))) continue;
            if (a.group_PDB.value(i) !== 'ATOM') continue;
            // Assuming a.pdbx_sifts_xref_db_name is 'UNP' (should we check this?)
            if (a.pdbx_sifts_xref_db_acc.value(i) !== unprotId) continue;
            const uniprotNum = parseInt(a.pdbx_sifts_xref_db_num.value(i));
            if (!bindingResidueSet.has(uniprotNum)) continue;
            // console.log('trace atom', a.group_PDB.value(i), a.label_atom_id.value(i), a.label_asym_id.value(i), a.label_seq_id.value(i), '|', a.pdbx_sifts_xref_db_name.value(i), a.pdbx_sifts_xref_db_acc.value(i), uniprotNum, a.pdbx_sifts_xref_db_res.value(i))
            bsCoords[uniprotNum] = [a.Cartn_x.value(i), a.Cartn_y.value(i), a.Cartn_z.value(i)];
            // TODO: this assumes there is only one matching residue, we should select the nearest residue if there are multiple
        }

        if (!reprBsCoords) {
            // This is first structure (representative)
            reprBsCoords = bsCoords;
        } else {
            // This is not representative structure
            const a = { x: [] as number[], y: [] as number[], z: [] as number[] };
            const b = { x: [] as number[], y: [] as number[], z: [] as number[] };
            for (const uniprotResId in bsCoords) {
                if (!reprBsCoords[uniprotResId]) continue;
                a.x.push(reprBsCoords[uniprotResId][0]);
                a.y.push(reprBsCoords[uniprotResId][1]);
                a.z.push(reprBsCoords[uniprotResId][2]);
                b.x.push(bsCoords[uniprotResId][0]);
                b.y.push(bsCoords[uniprotResId][1]);
                b.z.push(bsCoords[uniprotResId][2]);
            }

            const superposition = MinimizeRmsd.compute({ a, b });
            // console.log('superposed', bmStructId, superposition.nAlignedElements, 'RMSD:', superposition.rmsd)
            await transform(viewer.plugin, viewer.getStructure(bmStructId)!.cell, superposition.bTransform);
        }
        await viewer.visual.structureVisibility(bmStructId, true); // Reveal superposed structure
    }
    console.timeEnd('load&superpose')
    // 16 s (81 ligands, individual ModelServer queries)

    // TODO: solve duplicities in bmStructIds!!!!! (binding site 2)
    console.log('bm:', bsData[bindingSiteId].ligands.slice(0, DEBUG_LIGAND_COUNT_LIMIT).length, bsData[bindingSiteId].ligands.slice(0, DEBUG_LIGAND_COUNT_LIMIT))
    console.log('bmStructIds:', bmStructIds.length, bmStructIds)
    // await animate(viewer, bmStructIds, { frameMs: 100, repeat: 10 });
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
