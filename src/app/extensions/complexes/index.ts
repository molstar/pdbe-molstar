/** Helper functions to allow superposition of complexes */

import { CifFrame } from 'molstar/lib/mol-io/reader/cif';
import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import { alignAndSuperposeWithSIFTSMapping, AlignmentResult } from 'molstar/lib/mol-model/structure/structure/util/superposition-sifts-mapping';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PDBeMolstarPlugin } from '../..';
import { getStructureUrl, QueryParam } from '../../helpers';
import { transform } from '../../superposition';


const DEFAULT_BASE_COLOR = '#cccccc';
const DEFAULT_COMPONENT_COLORS = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', // Dark-2
    '#7f3c8d', '#11a579', '#3969ac', '#f2b701', '#e73f74', '#80ba5a', '#e68310', '#008695', '#cf1c90', '#f97b72', // Bold
    '#66c5cc', '#f6cf71', '#f89c74', '#dcb0f2', '#87c55f', '#9eb9f3', '#fe88b1', '#c9db74', '#8be0a4', '#b497e7', // Pastel
    '#e5c494', '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', // Set-2
];

/** Load a structure and superpose onto the main structure, based on Uniprot residue numbers. */
export async function loadComplexSuperposition(viewer: PDBeMolstarPlugin, params: { pdbId: string, assemblyId: string, id?: string, animationDuration?: number, coloring?: 'subcomplex' | 'supercomplex' | 'default', baseColor?: string, componentColors?: string[] }) {
    const staticStructId = PDBeMolstarPlugin.MAIN_STRUCTURE_ID;
    const mobileStructId = params.id ?? `${params.pdbId}_${params.assemblyId}`;

    // Load mobile structure
    const mobileUrl = getStructureUrl(viewer.initParams, { pdbId: params.pdbId, queryType: 'full' });
    await viewer.load({ url: mobileUrl, isBinary: viewer.initParams.encoding === 'bcif', assemblyId: params.assemblyId, id: mobileStructId }, false);
    await viewer.visual.structureVisibility(mobileStructId, false); // hide structure until superposition complete, to avoid flickering

    // Superpose mobile structure on static structure
    const superposition = await superposeComplexes(viewer, staticStructId, mobileStructId);
    await viewer.visual.structureVisibility(mobileStructId, true); // unhide structure

    await PluginCommands.Camera.Reset(viewer.plugin, { durationMs: params.animationDuration });

    Coloring.colorComponents(viewer, staticStructId, params.baseColor, params.componentColors);
    await viewer.visual.select({ data: [], nonSelectedColor: 'white', structureId: mobileStructId });

    return {
        id: mobileStructId,
        superposition,
        delete: () => viewer.deleteStructure(mobileStructId),
    };
}

export const Coloring = {
    async colorComponents(viewer: PDBeMolstarPlugin, structId: string, baseColor?: string, componentColors?: string[]) {
        const staticStruct = viewer.getStructure(structId)?.cell.obj?.data;
        if (!staticStruct) throw new Error('Static structure not loaded');
        const { accessions } = extractUniprotMappings(staticStruct); // TODO call directly extractUniprotAccessionLengthsFromMmcifStructRef, drop extraction of segments
        const colors = componentColors ?? DEFAULT_COMPONENT_COLORS;
        const selectData: QueryParam[] = [];
        for (let i = 0; i < accessions.length; i++) {
            const acc = accessions[i];
            const color = colors[i % colors.length];
            selectData.push({ uniprot_accession: acc, start_uniprot_residue_number: -Infinity, end_uniprot_residue_number: Infinity, color });
        }
        await viewer.visual.select({
            data: selectData,
            nonSelectedColor: baseColor ?? DEFAULT_BASE_COLOR,
            structureId: structId,
        });
    },
}

/** Superpose mobile structure onto static structure, based on Uniprot residue numbers. */
export async function superposeComplexes(viewer: PDBeMolstarPlugin, staticStructId: string, mobileStructId: string): Promise<MinimizeRmsd.Result | undefined> {
    const staticStructRef = viewer.getStructure(staticStructId);
    if (!staticStructRef) throw new Error('Static structure not loaded');
    const mobileStructRef = viewer.getStructure(mobileStructId);
    if (!mobileStructRef) throw new Error('Mobile structure not loaded');

    const aln = await superposeStructures(viewer, [staticStructRef, mobileStructRef]);
    const superposition = aln.entries.find(e => e.pivot === 0 && e.other === 1)?.transform;
    if (!superposition) {
        const reason = aln.zeroOverlapPairs.find(e => e[0] === 0 && e[1] === 1) ? 'due to insufficient overlap' : '';
        console.warn(`Failed to superpose ${mobileStructId} onto ${staticStructId} ${reason}`);
    }
    return superposition;
}

async function superposeStructures(viewer: PDBeMolstarPlugin, structRefs: StructureRef[]): Promise<AlignmentResult> {
    const structs = structRefs.map(ref => {
        const struct = ref.cell.obj?.data;
        if (struct === undefined) throw new Error('Missing structure');
        return struct;
    });
    const aln = alignAndSuperposeWithSIFTSMapping(structs, { traceOnly: true });
    for (const entry of aln.entries) {
        await transform(viewer.plugin, structRefs[entry.other]!.cell, entry.transform.bTransform);
    }
    return aln;
}

/*
Coloring - subcomplexes:
- base common -> by entity, lighter
- base additional -> gray, lighter
- sub common -> by entity, darker
- sub additional -> gray, darker (includes antibodies and ligands)

-> Colors can be assigned based on base complex and applied to subcomplex

Coloring - supercomplexes:
- base common -> gray, lighter
- base additional -> gray, lighter or a special color (white?) (includes antibodies and ligands)
- super common -> gray, darker
- super additional -> by entity, darker

-> Colors can be assigned based on supercomplex complex, consistency between supercomplexes is probably not necessary

-> For both subcomplexes and supercomplexes, colors could be assigned based on UniprotID hash -> database-wide consistency but complexes with similar-color components will occur

*/

function extractUniprotMappings(structure: Structure) {
    const accessionLengths = extractUniprotAccessionLengthsFromMmcifStructRef(structure); // this is to a) filter out records in pdbx_sifts_unp_segments, b) sort accessions by decreasing length
    const accessions = Object.keys(accessionLengths).sort((a, b) => accessionLengths[b] - accessionLengths[a]); // sort by decreasing length
    const segments = extractUniprotSegmentsFromMmcifPdbxSiftsUnpSegments(structure, new Set(accessions));
    return { accessions, segments };
}

function extractUniprotSegmentsFromMmcifPdbxSiftsUnpSegments(structure: Structure, allowedAccessions?: Set<string>) {
    const src = structure.model.sourceData;
    if (!MmcifFormat.is(src)) throw new Error('Source data must be mmCIF/BCIF');

    const pdbx_sifts_unp_segments = src.data.frame.categories['pdbx_sifts_unp_segments'];
    if (!pdbx_sifts_unp_segments) throw new Error('pdbx_sifts_unp_segments category not found');

    const unp_acc = pdbx_sifts_unp_segments.getField('unp_acc');
    const asym_id = pdbx_sifts_unp_segments.getField('asym_id');
    const seq_id_start = pdbx_sifts_unp_segments.getField('seq_id_start');
    const seq_id_end = pdbx_sifts_unp_segments.getField('seq_id_end');
    if (!unp_acc || !asym_id || !seq_id_start || !seq_id_end) throw new Error('Missing fields in pdbx_sifts_unp_segments category');

    const segmentMap: { [accession: string]: { asymId: string, seqIdStart: number, seqIdEnd: number }[] } = {};
    for (let i = 0; i < pdbx_sifts_unp_segments.rowCount; i++) {
        const accession = unp_acc.str(i);
        if (allowedAccessions && !allowedAccessions.has(accession)) continue;
        const asymId = asym_id.str(i);
        const seqIdStart = seq_id_start.int(i);
        const seqIdEnd = seq_id_end.int(i);
        (segmentMap[accession] ??= []).push({ asymId, seqIdStart, seqIdEnd });
    };
    return segmentMap;
}

function extractUniprotAccessionLengthsFromMmcifStructRef(structure: Structure) {
    const src = structure.model.sourceData;
    if (!MmcifFormat.is(src)) throw new Error('Source data must be mmCIF/BCIF');

    const struct_ref = src.data.frame.categories['struct_ref'];
    if (!struct_ref) throw new Error('struct_ref category not found');

    const db_name = struct_ref.getField('db_name');
    const db_accession = struct_ref.getField('pdbx_db_accession');
    const pdbx_seq_one_letter_code = struct_ref.getField('pdbx_seq_one_letter_code');
    if (!db_name || !db_accession || !pdbx_seq_one_letter_code) throw new Error('Missing fields in struct_ref category');

    const accessions: { [accession: string]: number } = {};
    for (let i = 0; i < struct_ref.rowCount; i++) {
        const name = db_name.str(i);
        if (name !== 'UNP') continue;
        const accession = db_accession.str(i);
        const length = pdbx_seq_one_letter_code.str(i).length; // this is length of the matched sequence chunk (listed in _struct_ref), not of the full Uniprot sequence
        accessions[accession] = length;
    };
    return accessions;
}
