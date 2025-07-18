/** Helper functions to allow visualizing Foldseek results and superposing them on the query structure */

import { exportHierarchy } from 'molstar/lib/extensions/model-export/export';
import { alignAndSuperposeWithSIFTSMapping, AlignmentResult } from 'molstar/lib/mol-model/structure/structure/util/superposition-sifts-mapping';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PDBeMolstarPlugin } from '../..';
import { getStructureUrl } from '../../helpers';
import { transform } from '../../superposition';


/** TODO */
export async function loadComplexSuperposition(viewer: PDBeMolstarPlugin, params: { pdbId: string, assemblyId: string }) {
    const baseStructId = PDBeMolstarPlugin.MAIN_STRUCTURE_ID;
    const mobileStructId = `${params.pdbId}_${params.assemblyId}`;

    // Load mobile structure
    const mobileUrl = getStructureUrl(viewer.initParams, { pdbId: params.pdbId, queryType: 'full' });
    await viewer.load({ url: mobileUrl, isBinary: viewer.initParams.encoding === 'bcif', assemblyId: params.assemblyId, id: mobileStructId }, false);

    const baseStructRef = viewer.getStructure(baseStructId);
    const mobileStructRef = viewer.getStructure(mobileStructId);
    if (!baseStructRef) throw new Error('Base structure not loaded');
    if (!mobileStructRef) throw new Error('Mobile structure not loaded');

    await superposeStructures(viewer, [baseStructRef, mobileStructRef]);
}

async function superposeStructures(viewer: PDBeMolstarPlugin, structRefs: StructureRef[]): Promise<AlignmentResult> {
    const structs = structRefs.map(ref => {
        const struct = ref.cell.obj?.data;
        if (struct === undefined) throw new Error('Missing structure');
        return struct;
    });

    // TODO check how alignAndSuperposeWithSIFTSMapping algorithm works!
    const aln = alignAndSuperposeWithSIFTSMapping(structs, { traceOnly: true });

    for (const entry of aln.entries) {
        await transform(viewer.plugin, structRefs[entry.other]!.cell, entry.transform.bTransform);
        // rmsd += xform.transform.rmsd;
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

/** Export currently loaded models in mmCIF (or BCIF). Pack in a ZIP if there is more then 1 model. */
export function exportModels(viewer: PDBeMolstarPlugin, format: 'cif' | 'bcif' = 'cif') {
    return exportHierarchy(viewer.plugin, { format });
}
