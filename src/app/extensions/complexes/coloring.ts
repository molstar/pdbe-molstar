import { Color } from 'molstar/lib/mol-util/color';
import { PDBeMolstarPlugin } from '../..';
import { normalizeColor, QueryParam } from '../../helpers';


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


export async function colorComponents(viewer: PDBeMolstarPlugin, params: { structId: string, components: string[], mappings?: { [accession: string]: QueryParam[] }, coreColor?: string, componentColors?: string[] }) {
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
}

export async function colorSubcomplex(viewer: PDBeMolstarPlugin, params: { baseStructId?: string, otherStructId?: string, baseComponents: string[], otherComponents: string[], baseMappings?: { [accession: string]: QueryParam[] }, otherMappings?: { [accession: string]: QueryParam[] }, coreColor?: string, componentColors?: string[] }) {
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
}

export async function colorSupercomplex(viewer: PDBeMolstarPlugin, params: { baseStructId?: string, otherStructId?: string, baseComponents: string[], otherComponents: string[], baseMappings?: { [accession: string]: QueryParam[] }, otherMappings?: { [accession: string]: QueryParam[] }, coreColor?: string, unmappedColor?: string, componentColors?: string[] }) {
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
}

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
