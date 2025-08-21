/** Helper functions to allow superposition of complexes */

import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { PDBeMolstarPlugin } from '../..';
import { getStructureUrl, QueryParam } from '../../helpers';
import { transform } from '../../superposition';
import * as Coloring from './coloring';
import { superposeByBiggestCommonChain } from './superpose-by-biggest-chain';
import { superposeBySequenceAlignment } from './superpose-by-sequence-alignment';


export * as Coloring from './coloring';


/** Parameters to `loadComplexSuperposition` */
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
    /** Optional specification of which parts of the base complex structure belong to individual Uniprot/Rfam accessions (will be inferred from mmCIF atom_site if not provided).
     * It is recommended to provide this for nucleic acids as they don't have mapping in atom_site. */
    baseMappings?: { [accession: string]: QueryParam[] },
    /** Optional specification of which parts of the other complex structure belong to individual Uniprot/Rfam accessions (will be inferred from mmCIF atom_site if not provided).
     * It is recommended to provide this for nucleic acids as they don't have mapping in atom_site. */
    otherMappings?: { [accession: string]: QueryParam[] },
}

/** Result type of `loadComplexSuperposition` */
export interface LoadComplexSuperpositionResult {
    /** Structure identifier of the newly loaded complex structure, to refer to this structure later */
    id: string,
    /** Superposition RMSD, number of aligned residues, and tranform; if superposition was successful */
    superposition: SuperpositionResult | undefined,
    /** Function that deletes the newly loaded complex structure */
    delete: () => Promise<void>,
}

/** Temporary type until `nAlignedElements` gets into `MinimizeRmsd.Result` in core Molstar */
export interface SuperpositionResult extends MinimizeRmsd.Result {
    nAlignedElements: number, // TODO remove explicit nAlignedElements, once in core Molstar
    method: 'uniprot-numbering' | 'sequence-alignment',
    accession: string,
}

/** Load a structure, superpose onto the main structure based on Uniprot residue numbers (or seq alignment if numbers not available),
 * and optionally apply coloring to show common/additional components.
 *
 * **Superposition method:**
 * Complexes are superposed based on the largest common component (measured the by number of residues) with a UniProt mapping (taken from atom_site mmCIF category).
 * In case there are no common components with Uniprot mapping, the largest common component with an Rfam mapping is used (taken from `baseMappings` and `otherMappings` parameters).
 * Residue-residue correspondence is determined by UniProt residue numbers (for UniProt mappings) or by sequence alignment (for Rfam mappings).
 *
 * **Coloring - subcomplexes:**
 * Common components are colored by entity; additional components are gray. Components in the subcomplex are slightly darkened.
 *
 * **Coloring - supercomplexes:**
 * Common components are gray; mapped additional components are colored by entity; unmapped additional components are magenta. Components in the supercomplex are slightly darkened.
 */
export async function loadComplexSuperposition(viewer: PDBeMolstarPlugin, params: LoadComplexSuperpositionParams): Promise<LoadComplexSuperpositionResult> {
    const { pdbId, assemblyId, animationDuration = 250, coloring, baseComponents, otherComponents, baseMappings, otherMappings, coreColor, unmappedColor, componentColors } = params;
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
    let superposition = superposeByBiggestCommonChain(baseStruct, otherStruct, baseComponents, otherComponents);
    if (!superposition) {
        console.log(`UniProt-based superposition method failed, trying sequence alignment superposition (RNAs)`);
        superposition = superposeBySequenceAlignment(baseStruct, otherStruct, baseMappings ?? {}, otherMappings ?? {});
    }
    if (superposition) {
        await transform(viewer.plugin, viewer.getStructure(otherStructId)!.cell, superposition.bTransform);
    } else {
        console.log(`Sequence alignment superposition method failed, leaving unsuperposed`);
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
        id: otherStructId,
        superposition,
        delete: () => viewer.deleteStructure(otherStructId),
    };
}
