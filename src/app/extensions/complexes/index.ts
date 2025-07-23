/** Helper functions to allow superposition of complexes */

import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { alignAndSuperposeWithSIFTSMapping, AlignmentResult } from 'molstar/lib/mol-model/structure/structure/util/superposition-sifts-mapping';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PDBeMolstarPlugin } from '../..';
import { getStructureUrl } from '../../helpers';
import { transform } from '../../superposition';


/** Load a structure and superpose onto the main structure, based on Uniprot residue numbers. */
export async function loadComplexSuperposition(viewer: PDBeMolstarPlugin, params: { pdbId: string, assemblyId: string, id?: string, animationDuration?: number }) {
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

    return {
        id: mobileStructId,
        superposition,
        delete: () => viewer.deleteStructure(mobileStructId),
    };
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

// function foo(structure: Structure) {
//     console.log('foo', structure)
//     console.log('foo seq', structure.model.sequence.sequences)
//     console.log('foo src', structure.model.sourceData)
//     const src = structure.model.sourceData;
//     if (MmcifFormat.is(src)) {
//         const atom_site = src.data.db.atom_site;
//         const dbName = atom_site.pdbx_sifts_xref_db_name.value(0);
//         const dbAcc = atom_site.pdbx_sifts_xref_db_acc.value(0);
//         const dbRes = atom_site.pdbx_sifts_xref_db_res.value(0);
//         const dbNum = atom_site.pdbx_sifts_xref_db_num.value(0);
//         console.log('DB', dbName, dbAcc, dbRes, dbNum)
//     } else {
//         throw new Error('Source data must be mmCIF/BCIF');
//     }
// }
