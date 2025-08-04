/** Helper functions to allow superposition of complexes */

import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { alignAndSuperposeWithSIFTSMapping, AlignmentResult } from 'molstar/lib/mol-model/structure/structure/util/superposition-sifts-mapping';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Color } from 'molstar/lib/mol-util/color';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { PDBeMolstarPlugin } from '../..';
import { getStructureUrl, normalizeColor, QueryParam } from '../../helpers';
import { transform } from '../../superposition';


const DEFAULT_CORE_COLOR = '#d8d8d8';
const DEFAULT_UNMAPPED_COLOR = '#222222';
const DEFAULT_COMPONENT_COLORS = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', // Dark-2
    '#7f3c8d', '#11a579', '#3969ac', '#f2b701', '#e73f74', '#80ba5a', '#e68310', '#008695', '#cf1c90', '#f97b72', // Bold
    '#66c5cc', '#f6cf71', '#f89c74', '#dcb0f2', '#87c55f', '#9eb9f3', '#fe88b1', '#c9db74', '#8be0a4', '#b497e7', // Pastel
    '#e5c494', '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', // Set-2
];
// TODO compare color variants:
// http://127.0.0.1:1339/complexes-demo.html?complexId=PDB-CPX-159519&unmappedColor=%23222222
// http://127.0.0.1:1339/complexes-demo.html?complexId=PDB-CPX-159519&unmappedColor=%23ff0000

/** How much lighter/darker colors should be for the base/other complex */
const COLOR_ADJUSTMENT_STRENGTH = 0.75;

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
}

/** Load a structure, superpose onto the main structure based on Uniprot residue numbers, and optionally apply coloring to show common/additional components. */
export async function loadComplexSuperposition(viewer: PDBeMolstarPlugin, params: LoadComplexSuperpositionParams) {
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
    const mobileUrl = getStructureUrl(viewer.initParams, { pdbId, queryType: 'full' });
    await viewer.load({ url: mobileUrl, isBinary: viewer.initParams.encoding === 'bcif', assemblyId, id: otherStructId }, false);
    await viewer.visual.structureVisibility(otherStructId, false); // hide structure until superposition complete, to avoid flickering

    // Superpose other structure on base structure
    const superposition = await superposeComplexes(viewer, baseStructId, otherStructId);

    // Apply coloring to other structure
    if (coloring === 'subcomplex') {
        await Coloring.colorSubcomplex(viewer, { otherStructId, baseComponents: baseComponents!, otherComponents: otherComponents!, baseMappings, otherMappings, coreColor, componentColors });
    }
    if (coloring === 'supercomplex') {
        await Coloring.colorSupercomplex(viewer, { otherStructId, baseComponents: baseComponents!, otherComponents: otherComponents!, baseMappings, otherMappings, coreColor, unmappedColor, componentColors });
    }

    // Adjust camera
    const staticStructRef = viewer.getStructure(baseStructId);
    const mobileStructRef = viewer.getStructure(otherStructId);
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

export const Coloring = {
    async colorComponents(viewer: PDBeMolstarPlugin, params: { structId: string, components: string[], mappings?: { [accession: string]: QueryParam[] }, coreColor?: string, componentColors?: string[] }) {
        const { coreColor = DEFAULT_CORE_COLOR, componentColors = DEFAULT_COMPONENT_COLORS, components, mappings = {} } = params;

        const colorData: QueryParam[] = [];
        const tooltipData: QueryParam[] = [{ tooltip: '<b>Base complex</b>' }];
        for (let i = 0; i < components.length; i++) {
            const accession = components[i];
            const color = componentColors[i % componentColors.length];
            colorData.push(...selectorItems(accession, mappings[accession], { color: adjustForBase(color) }));
            tooltipData.push(...selectorItems(accession, mappings[accession], { tooltip: `<b>component ${accession}</b>` }));
        }
        await viewer.visual.select({ data: colorData, nonSelectedColor: adjustForBase(coreColor), structureId: params.structId });
        await viewer.visual.tooltips({ data: tooltipData, structureId: params.structId });
    },
    
    async colorSubcomplex(viewer: PDBeMolstarPlugin, params: { baseStructId?: string, otherStructId?: string, baseComponents: string[], otherComponents: string[], baseMappings?: { [accession: string]: QueryParam[] }, otherMappings?: { [accession: string]: QueryParam[] }, coreColor?: string, componentColors?: string[] }) {
        const { coreColor = DEFAULT_CORE_COLOR, componentColors = DEFAULT_COMPONENT_COLORS, baseComponents, baseMappings = {}, otherMappings = {} } = params;
        const subComponentsSet = new Set(params.otherComponents);

        const baseColorData: QueryParam[] = [];
        const baseTooltipData: QueryParam[] = [{ tooltip: '<b>Base complex</b>' }];
        const subColorData: QueryParam[] = [];
        const subTooltipData: QueryParam[] = [{ tooltip: '<b>Subcomplex</b>' }];
        for (let i = 0; i < baseComponents.length; i++) {
            const accession = baseComponents[i];
            if (subComponentsSet.has(accession)) {
                const color = componentColors[i % componentColors.length];
                baseColorData.push(...selectorItems(accession, baseMappings[accession], { color: adjustForBase(color) }));
                baseTooltipData.push(...selectorItems(accession, baseMappings[accession], { tooltip: `<b>common component ${accession}</b>` }));
                subColorData.push(...selectorItems(accession, otherMappings[accession], { color: adjustForOther(color) }));
                subTooltipData.push(...selectorItems(accession, otherMappings[accession], { tooltip: `<b>common component ${accession}</b>` }));
            } else {
                baseTooltipData.push(...selectorItems(accession, baseMappings[accession], { tooltip: `<b>additional component ${accession}</b>` }));
            }
        }
        if (params.baseStructId) {
            await viewer.visual.select({ data: baseColorData, nonSelectedColor: adjustForBase(coreColor), structureId: params.baseStructId });
            await viewer.visual.tooltips({ data: baseTooltipData, structureId: params.baseStructId });
        }
        if (params.otherStructId) {
            await viewer.visual.select({ data: subColorData, nonSelectedColor: adjustForOther(coreColor), structureId: params.otherStructId });
            await viewer.visual.tooltips({ data: subTooltipData, structureId: params.otherStructId });
        }
    },

    async colorSupercomplex(viewer: PDBeMolstarPlugin, params: { baseStructId?: string, otherStructId?: string, baseComponents: string[], otherComponents: string[], baseMappings?: { [accession: string]: QueryParam[] }, otherMappings?: { [accession: string]: QueryParam[] }, coreColor?: string, unmappedColor?: string, componentColors?: string[] }) {
        const { coreColor = DEFAULT_CORE_COLOR, unmappedColor = DEFAULT_UNMAPPED_COLOR, componentColors = DEFAULT_COMPONENT_COLORS, baseMappings = {}, otherMappings = {} } = params;
        const baseComponentsSet = new Set(params.baseComponents);
        const superComponents = params.baseComponents.concat(params.otherComponents.filter(acc => !baseComponentsSet.has(acc))); // reorder supercomplex accessions so that colors are consistent with the base

        const baseColorData: QueryParam[] = [];
        const baseTooltipData: QueryParam[] = [{ tooltip: '<b>Base complex</b>' }];
        const superColorData: QueryParam[] = [];
        const superTooltipData: QueryParam[] = [{ tooltip: '<b>Supercomplex</b>' }];
        for (let i = 0; i < superComponents.length; i++) {
            const accession = superComponents[i];
            if (baseComponentsSet.has(accession)) {
                baseColorData.push(...selectorItems(accession, baseMappings[accession], { color: adjustForBase(coreColor) }));
                baseTooltipData.push(...selectorItems(accession, baseMappings[accession], { tooltip: `<b>common component ${accession}</b>` }));
                superColorData.push(...selectorItems(accession, otherMappings[accession], { color: adjustForOther(coreColor) }));
                superTooltipData.push(...selectorItems(accession, otherMappings[accession], { tooltip: `<b>common component ${accession}</b>` }));
            } else {
                const color = componentColors[i % componentColors.length];
                superColorData.push(...selectorItems(accession, otherMappings[accession], { color: adjustForOther(color) }));
                superTooltipData.push(...selectorItems(accession, otherMappings[accession], { tooltip: `<b>additional component ${accession}</b>` }));
            }
        }
        if (params.baseStructId) {
            await viewer.visual.select({ data: baseColorData, nonSelectedColor: adjustForBase(unmappedColor), structureId: params.baseStructId });
            await viewer.visual.tooltips({ data: baseTooltipData, structureId: params.baseStructId });
        }
        if (params.otherStructId) {
            await viewer.visual.select({ data: superColorData, nonSelectedColor: adjustForOther(unmappedColor), structureId: params.otherStructId });
            await viewer.visual.tooltips({ data: superTooltipData, structureId: params.otherStructId });
        }
    },
};

/** Adjust color for use on the base structure (slightly lighten) */
function adjustForBase(color: string) {
    return Color.toHexStyle(Color.lighten(normalizeColor(color), COLOR_ADJUSTMENT_STRENGTH));
}
/** Adjust color for use on the subcomplex/supercomplex structure (slightly darken) */
function adjustForOther(color: string) {
    return Color.toHexStyle(Color.darken(normalizeColor(color), COLOR_ADJUSTMENT_STRENGTH));
}

/** Create items for `.visual.select` or `.visual.tooltip`, preferrably based on `mappings`, or based on `uniprot_accession` if `mappings` not provided. */
function selectorItems<T extends object>(uniprot_accession: string, mappings: QueryParam[] | undefined, extras: T): (QueryParam & T)[] {
    if (mappings) {
        return mappings.map(m => ({ ...m, ...extras }));
    } else {
        return [{ uniprot_accession, ...extras }];
    }
};

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
