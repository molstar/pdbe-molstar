/** Helper functions to allow superposition of complexes */

import { Structure } from 'molstar/lib/mol-model/structure';
import { alignAndSuperposeWithSIFTSMapping } from 'molstar/lib/mol-model/structure/structure/util/superposition-sifts-mapping';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { PDBeMolstarPlugin } from '../..';
import { getStructureUrl, QueryParam } from '../../helpers';
import { transform } from '../../superposition';
import * as Coloring from './coloring';
import { superposeByBiggestCommonChain, SuperpositionResult } from './superpose-by-biggest-chain';
import { superposeBySequenceAlignment } from './superpose-by-sequence-alignment';


export * as Coloring from './coloring';


export interface LoadComplexSuperpositionParams {
    /** PDB identifier of complex structure */
    pdbId: string,
    /** Assembly identifier */
    assemblyId: string,
    /** Arbitrary string identifier to refer to the newly loaded structure later */
    id?: string,
    /** Duration of camera transition, in milliseconds. Default: 250. Do not use 0 (won't work because of bugs in Molstar), but you can use 1. */
    animationDuration?: number,
    /** Apply coloring to the base structure and newly loaded structure.
     * 'subcomplex' = color the common components by unique entities (UniProt/Rfam accession); color remaining components by base color (gray).
     * 'supercomplex' = color the common components by base color (gray); color additional components in the new structure (supercomplex) by unique entities. */
    coloring?: 'subcomplex' | 'supercomplex' | undefined,
    /** List of Uniprot/Rfam accessions in the base complex. Mandatory when `coloring` is not `undefined`. */
    baseComponents?: string[],
    /** List of Uniprot/Rfam accessions in the newly loaded complex. Mandatory when `coloring` is not `undefined`. */
    otherComponents?: string[],
    /** Base color for coloring "uninteresting" parts of structures (i.e. subcomplexes: additional components, supercomplexes: common components). Default: gray. */
    coreColor?: string,
    /** Color for coloring unmapped additional components for supercomplexes. */
    unmappedColor?: string,
    /** List of colors for coloring unique entities. */
    componentColors?: string[],
    /** Optional specification of which parts of the base complex structure belong to individual Uniprot/Rfam accessions (will be inferred from mmCIF atom_site if not provided) */
    baseMappings?: { [accession: string]: QueryParam[] },
    /** Optional specification of which parts of the other complex structure belong to individual Uniprot/Rfam accessions (will be inferred from mmCIF atom_site if not provided) */
    otherMappings?: { [accession: string]: QueryParam[] },
    /** Superposition method */
    method?: 'biggest-matched-chain' | 'molstar-builtin',
}

/** Load a structure, superpose onto the main structure based on Uniprot residue numbers, and optionally apply coloring to show common/additional components. */
export async function loadComplexSuperposition(viewer: PDBeMolstarPlugin, params: LoadComplexSuperpositionParams) {
    const { pdbId, assemblyId, animationDuration = 250, coloring, baseComponents, otherComponents, baseMappings, otherMappings, coreColor, unmappedColor, componentColors, method = 'biggest-matched-chain' } = params;
    const baseStructId = PDBeMolstarPlugin.MAIN_STRUCTURE_ID;
    const otherStructId = params.id ?? `${pdbId}_${assemblyId}`;

    // Apply coloring to base structure
    if (coloring) {
        if (!baseComponents) throw new Error('`baseComponents` is required when `coloring` is not `undefined`');
        if (!otherComponents) throw new Error('`otherComponents` is required when `coloring` is not `undefined`');
    }
    if (coloring === 'subcomplex') {
        await Coloring.colorSubcomplex(viewer, { baseStructId, baseComponents: baseComponents!, otherComponents: otherComponents!, baseMappings, otherMappings, coreColor, componentColors });
    }
    if (coloring === 'supercomplex') {
        await Coloring.colorSupercomplex(viewer, { baseStructId, baseComponents: baseComponents!, otherComponents: otherComponents!, baseMappings, otherMappings, coreColor, unmappedColor, componentColors });
    }

    // Load other structure
    const otherStructUrl = getStructureUrl(viewer.initParams, { pdbId, queryType: 'full' });
    await viewer.load({ url: otherStructUrl, isBinary: viewer.initParams.encoding === 'bcif', assemblyId, id: otherStructId }, false);
    await viewer.visual.structureVisibility(otherStructId, false); // hide structure until superposition complete, to avoid flickering

    const baseStruct = viewer.getStructure(baseStructId)?.cell.obj?.data;
    if (!baseStruct) throw new Error('Static structure not loaded');
    const otherStruct = viewer.getStructure(otherStructId)?.cell.obj?.data;
    if (!otherStruct) throw new Error('Mobile structure not loaded');

    // Superpose other structure on base structure
    let superposition = (method === 'biggest-matched-chain') ?
        superposeByBiggestCommonChain(baseStruct, otherStruct, baseComponents, otherComponents)
        : superposeByMolstarDefault(baseStruct, otherStruct);
    if (superposition.status !== 'success') {
        console.log(`Superposition with ${method} method failed, trying sequence alignment superposition (RNAs)`);
        const seqSup = superposeBySequenceAlignment(baseStruct, otherStruct, baseMappings ?? {}, otherMappings ?? {});
        if (seqSup.status === 'success') superposition = seqSup;
    }
    if (superposition.status === 'success') {
        await transform(viewer.plugin, viewer.getStructure(otherStructId)!.cell, superposition.superposition.bTransform);
    }

    // Apply coloring to other structure
    if (coloring === 'subcomplex') {
        await Coloring.colorSubcomplex(viewer, { otherStructId, baseComponents: baseComponents!, otherComponents: otherComponents!, baseMappings, otherMappings, coreColor, componentColors });
    }
    if (coloring === 'supercomplex') {
        await Coloring.colorSupercomplex(viewer, { otherStructId, baseComponents: baseComponents!, otherComponents: otherComponents!, baseMappings, otherMappings, coreColor, unmappedColor, componentColors });
    }

    // Adjust camera
    const staticStructRef = viewer.getStructure(baseStructId);
    const mobileStructRef = viewer.getStructure(otherStructId); // it is important to run this after superposition, to get correct coordinates for camera adjustment
    // Wanted to use PluginCommands.Camera.Focus with viewer.plugin.canvas3d?.boundingSphere, but seems to not work properly, so using the following workaround:
    await PluginCommands.Camera.FocusObject(viewer.plugin, {
        targets: [
            { targetRef: staticStructRef?.cell.transform.ref, extraRadius: 0.3 },
            { targetRef: (mobileStructRef?.transform ?? mobileStructRef)?.cell.transform.ref, extraRadius: 0.3 },
            // 0.3 is amount by which bounding sphere algorithm usually underestimates actual visible bounding sphere
        ],
        durationMs: animationDuration,
    });
    await sleep(animationDuration); // wait until camera adjustment completed

    // Reveal new structure
    await viewer.visual.structureVisibility(otherStructId, true);

    return {
        /** Structure identifier of the newly loaded complex structure, to refer to this structure later */
        id: otherStructId,
        /** Status of pairwise superposition ('success' / 'zero-overlap' / 'failed') */
        status: superposition.status,
        /** Superposition RMSD and tranform (if status is 'success') */
        superposition: superposition.superposition,
        /** Function that deletes the newly loaded complex structure */
        delete: () => viewer.deleteStructure(otherStructId),
    };
}


/** Superpose mobile structure onto static structure, based on Uniprot residue numbers. */
export function superposeByMolstarDefault(staticStruct: Structure, mobileStruct: Structure): SuperpositionResult {
    const aln = alignAndSuperposeWithSIFTSMapping([staticStruct, mobileStruct], { traceOnly: true });
    const superposition = aln.entries.find(e => e.pivot === 0 && e.other === 1)?.transform;
    if (superposition) {
        return { status: 'success', superposition: { ...superposition, nAlignedElements: Number.NaN } };
    } else if (aln.zeroOverlapPairs.find(e => e[0] === 0 && e[1] === 1)) {
        return { status: 'zero-overlap', superposition: undefined };
    } else {
        return { status: 'failed', superposition: undefined };
    }
}
