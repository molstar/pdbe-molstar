import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData, type Snapshot } from 'molstar/lib/extensions/mvs/mvs-data';
import type Builder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import type { MVSNodeParams } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-tree';
import type { ComponentExpressionT, HexColorT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { PisaAssembliesData, PisaAssemblyRecord, PisaInterfaceData, PisaTransform } from './types';


const COMPONENT_COLORS: HexColorT[] = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', // Dark-2 without gray 
    '#1f77b4', '#2ca02c', '#d62728', '#927ba7', '#8c564b', '#e377c2', '#bcbd22', '#17becf', // More non-conflicting colors from other palettes
    '#fc8d62', '#9eb9f3', '#ff9da7', '#ffff33', '#8be0a4', '#e15759', '#c69fbb', '#76b7b2', // More non-conflicting colors from other palettes
];
const DEFAULT_COMPONENT_COLOR: HexColorT = '#999999';
const BULK_COLOR_LIGHTNESS_ADJUSTMENT = 0.4;
const INTERFACE_COLOR_LIGHTNESS_ADJUSTMENT = -0.3;
function bulkColorFn(baseColor: HexColorT): HexColorT {
    return adjustLightnessRelative(baseColor, BULK_COLOR_LIGHTNESS_ADJUSTMENT);
}
function interfaceColorFn(baseColor: HexColorT): HexColorT {
    return adjustLightnessRelative(baseColor, INTERFACE_COLOR_LIGHTNESS_ADJUSTMENT);
}

async function getAssembliesData(pdbId: string): Promise<PisaAssembliesData> {
    return await (await fetch(`/tmp/pisa/${pdbId}/assembly.json`)).json();
}
function getAllAssemblies(assembliesData: PisaAssembliesData) {
    return assembliesData.pisa_results.asm_set.map(ass => ass.assembly);
    // return [...assembliesData.pisa_results.asm_set.map(ass => ass.assembly), assembliesData.pisa_results.asu_complex.assembly];
}
async function getInterfaceData(pdbId: string, interfaceId: string): Promise<PisaInterfaceData> {
    return await (await fetch(`/tmp/pisa/${pdbId}/interfaces/interface_${interfaceId}.json`)).json();
}
function loadStructureData(builder: Builder.Root, pdbId: string) {
    // return builder.download({ url: `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}_updated.cif` }).parse({ format: 'mmcif' });
    return builder.download({ url: `https://www.ebi.ac.uk/pdbe/entry-files/download/pdb${pdbId}.ent` }).parse({ format: 'pdb' });
}


export async function pisaDemo(plugin: PluginContext) {
    const pdbId = '3gcb';

    const assembliesData = await getAssembliesData(pdbId);
    const allAssemblies = getAllAssemblies(assembliesData);
    const interfaceIds = Array.from(new Set(
        allAssemblies.flatMap(ass => ass.interfaces.interface.map(int => int.id))
    )).sort((a, b) => Number(a) - Number(b));
    const interfacesData = await Promise.all(interfaceIds.map(intId => getInterfaceData(pdbId, intId)));

    const snapshots: Snapshot[] = [];
    for (const assembly of allAssemblies) {
        snapshots.push(await pisaAsseblyView({ pdbId, assemblyId: assembly.id }));
        // snapshots.push(await pisaAsseblyView({ pdbId, assemblyId: assembly.id, reprParams: { type: 'surface' } }));
        // snapshots.push(await pisaAsseblyView({ pdbId, assemblyId: assembly.id, reprParams: { type: 'surface', surface_type: 'gaussian' } }));
        // snapshots.push(await pisaAsseblyView({ pdbId, assemblyId: assembly.id, reprParams: { type: 'cartoon' } }));
    }
    for (const interfaceId of interfaceIds) {
        snapshots.push(await pisaInterfaceView({ pdbId, interfaceId, ghostMolecules: [] }));
        // snapshots.push(await pisaInterfaceView({ pdbId, interfaceId, ghostMolecules: [0] }));
        // snapshots.push(await pisaInterfaceView({ pdbId, interfaceId, ghostMolecules: [1] }));
        snapshots.push(await pisaInterfaceView({ pdbId, interfaceId, detailMolecules: [0] }));
        snapshots.push(await pisaInterfaceView({ pdbId, interfaceId, detailMolecules: [1] }));
        snapshots.push(await pisaInterfaceView({ pdbId, interfaceId, detailMolecules: [0, 1] }));
    }
    const mvs = MVSData.createMultistate(snapshots);
    // console.log(MVSData.toMVSJ(mvs))
    await loadMVS(plugin, mvs);

    // Comments:
    // - chain_id - is this label_asym_id or auth_asym_id or wtf?
    // - rxx, etc. - why are these strings and not numbers?
    // - visual_id - this is completely useless, it starts repeating after reaching Z
    // - what's the differentce between asm_set and asu_complex
    // - TODO add clear component descriptors to input data or find a way to decode cryptic chain_ids
    //     e.g. 1gkt:
    //     [BOC]B:400 = ligand BOC in chain B resi 400
    //     B          = protein chain B resi 401-407 (excluding the [BOC]B:400 and waters)
    //     (this is not an issue when using CIF files)
    // - symId vs symop_no, symop
    // - TODO have URL for input file
}


export async function pisaAsseblyView(params: { pdbId: string, assemblyId: string, reprParams?: Partial<MVSNodeParams<'representation'>> }) {
    const assembliesData = await getAssembliesData(params.pdbId);
    const allAssemblies = getAllAssemblies(assembliesData);

    const assembly = allAssemblies.find(ass => ass.id === params.assemblyId);
    if (!assembly) throw new Error(`Could not find assembly "${params.assemblyId}"`);

    const builder = MVSData.createBuilder();
    const data = loadStructureData(builder, params.pdbId);

    const componentColors = assignComponentColors(allAssemblies);

    const componentIdsByPisaChainId: { [pisaChainId: string]: string[] } = {};
    const components: { [visualId: string]: ComponentState } = {};

    for (const molecule of assembly.molecule) {
        const component = decodeChainId(molecule.chain_id);
        // console.log('molecule', molecule.chain_id, molecule.symId, molecule.visual_id)
        const color = componentColors[componentKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const struct = data
            .modelStructure()
            .transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${molecule.chain_id} (${molecule.symId})</b>` });
        const componentSelector: ComponentExpressionT = { label_asym_id: component.chainId, label_seq_id: component.seqId }; // chain_id appears to be label_asym_id (if mmcif format)
        const repr = struct
            .component({ selector: componentSelector })
            .representation({
                type: 'spacefill',
                size_factor: component.isLigand ? 1.05 : 1, // distinguish ligands/waters from the main chain, in case of PDB format
                ...params.reprParams,
            })
            .color({ color: bulkColorFn(color) });
        if (!component.isLigand) {
            // distinguish ligands/waters from the main chain, in case of PDB format
            repr
                .color({ selector: 'water', color: 'white' })
                .color({ selector: 'ligand', color: 'white' })
                .color({ selector: 'branched', color: 'white' })
                .color({ selector: 'ion', color: 'white' });
        };
        const componentId = `${molecule.chain_id} (${molecule.symId})`;
        (componentIdsByPisaChainId[molecule.chain_id] ??= []).push(componentId);
        components[componentId] = { struct, repr, color };
    }

    const interfaceIds = assembly.interfaces.interface.map(int => int.id);
    const interfaces = await Promise.all(interfaceIds.map(id => getInterfaceData(params.pdbId, id)));

    for (const int of interfaces) {
        const interfaceTooltip = `<br>Interface <b>${int.interface.molecule[0].chain_id}</b> &ndash; <b>${int.interface.molecule[1].chain_id}</b> (interface area ${Number(int.interface.int_area).toFixed(1)})`;
        // Handling self-interfaces differently to avoid duplicate tooltips on residues in symmetric interfaces
        const isSelfInterface = int.interface.molecule[0].chain_id === int.interface.molecule[1].chain_id;
        const bothSurfaces: ComponentExpressionT[] = [];
        for (const molecule of int.interface.molecule) {
            const residues = Array.isArray(molecule.residues.residue) ? molecule.residues.residue : [molecule.residues.residue];
            const interfaceResidues = residues.filter(r => Number(r.bsa) !== 0); // Secret undocumented knowledge
            const resSelector: ComponentExpressionT[] = interfaceResidues.map(r => ({ auth_seq_id: Number(r.seq_num), pdbx_PDB_ins_code: r.ins_code ?? undefined }));
            if (!isSelfInterface) {
                const comps = componentIdsByPisaChainId[molecule.chain_id].map(componentId => components[componentId])
                markInterface(comps, resSelector, { tooltip: interfaceTooltip, color: true });
            }
            bothSurfaces.push(...resSelector);
        }
        if (isSelfInterface) {
            const comps = componentIdsByPisaChainId[int.interface.molecule[0].chain_id].map(componentId => components[componentId])
            markInterface(comps, bothSurfaces, { tooltip: interfaceTooltip, color: true });
        }
    }
    const name = assembly.serial_no === '0' ? 'ASU complex' : `Assembly ${assembly.id}`;
    return builder.getSnapshot({
        key: `assembly_${assembly.id}`,
        title: `${name}: ${assembly.composition}`,
        linger_duration_ms: 5000,
        transition_duration_ms: 250,
    });
}

export async function pisaInterfaceView(params: { pdbId: string, interfaceId: string, ghostMolecules?: (0 | 1)[], detailMolecules?: (0 | 1)[] }) {
    const assembliesData = await getAssembliesData(params.pdbId);
    const interfaceData = await getInterfaceData(params.pdbId, params.interfaceId);
    const allAssemblies = getAllAssemblies(assembliesData);
    const componentColors = assignComponentColors(allAssemblies);
    const interfaceTooltip = `<br>Interface <b>${interfaceData.interface.molecule[0].chain_id}</b> &ndash; <b>${interfaceData.interface.molecule[1].chain_id}</b> (interface area ${Number(interfaceData.interface.int_area).toFixed(1)})`;

    const builder = MVSData.createBuilder();
    const data = loadStructureData(builder, params.pdbId);

    interfaceData.interface.molecule.forEach((molecule, i) => {
        const component = decodeChainId(molecule.chain_id);
        const color = componentColors[componentKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const struct = data
            .modelStructure()
            .transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${molecule.chain_id} (${molecule.symop})</b>` });
        const componentSelector: ComponentExpressionT = { label_asym_id: component.chainId, label_seq_id: component.seqId }; // chain_id appears to be label_asym_id (if mmcif format)
        struct.component({ selector: componentSelector }).focus();
        const showGhost = params.ghostMolecules?.includes(i as 0 | 1);
        const showDetails = params.detailMolecules?.includes(i as 0 | 1);
        if (showGhost) {
            const reprGhost = struct
                .component({ selector: componentSelector })
                .representation({
                    type: 'surface',
                    surface_type: 'gaussian',
                    size_factor: 1.25,
                    custom: {
                        molstar_representation_params: {
                            visuals: ['structure-gaussian-surface-mesh'],
                            xrayShaded: true,
                        },
                    },
                })
                .color({ color: color })
                .opacity({ opacity: .49 });
        }
        if (!showGhost || showDetails) {
            const repr = struct
                .component({ selector: componentSelector })
                .representation({
                    type: showDetails ? 'cartoon' : 'spacefill',
                    size_factor: (showDetails ? 0.5 : 1)
                        * (component.isLigand ? 1.05 : 1), // distinguish ligands/waters from the main chain, in case of PDB format
                })
                .color({ color: bulkColorFn(color) });
            const residues = Array.isArray(molecule.residues.residue) ? molecule.residues.residue : [molecule.residues.residue];
            const interfaceResidues = residues.filter(r => Number(r.bsa) !== 0); // Secret undocumented knowledge
            const resSelector: ComponentExpressionT[] = interfaceResidues.map(r => ({ auth_seq_id: Number(r.seq_num), pdbx_PDB_ins_code: r.ins_code ?? undefined }));
            markInterface([{ struct, repr, color }], resSelector, { tooltip: interfaceTooltip, color: !showDetails, ball_and_stick: showDetails });
            if (params.detailMolecules?.length) applyElementColors(repr);
            if (!component.isLigand) {
                // distinguish ligands/waters from the main chain, in case of PDB format
                repr
                    .color({ selector: 'water', color: 'white' })
                    .color({ selector: 'ligand', color: 'white' })
                    .color({ selector: 'branched', color: 'white' })
                    .color({ selector: 'ion', color: 'white' });
            };
        }
    });

    return builder.getSnapshot({
        key: `interface_${interfaceData.interface_id}`,
        title: `Interface ${interfaceData.interface_id}: ${interfaceData.interface.molecule[0].chain_id} - ${interfaceData.interface.molecule[1].chain_id} (interface area ${Number(interfaceData.interface.int_area).toFixed(1)})`,
        linger_duration_ms: 5000,
        transition_duration_ms: 250,
    });
}


interface ComponentState { struct: Builder.Structure, repr: Builder.Representation, color: HexColorT };

function markInterface(theComponents: ComponentState[], interfaceSelector: ComponentExpressionT[], options: { color?: boolean, ball_and_stick?: boolean, tooltip?: string } = {}) {
    for (const component of theComponents) {
        if (options.color) {
            component.repr.color({ selector: interfaceSelector, color: interfaceColorFn(component.color) });
        }
        if (options.ball_and_stick) {
            const bs = component.struct
                .component({ selector: interfaceSelector })
                .representation({ type: 'ball_and_stick' })
                .color({ color: bulkColorFn(component.color) });
            applyElementColors(bs);
        }
        if (options.tooltip) {
            component.struct.component({ selector: interfaceSelector }).tooltip({ text: options.tooltip });
        }
    }
}

function applyElementColors(repr: Builder.Representation) {
    repr.colorFromSource({ schema: 'all_atomic', category_name: 'atom_site', field_name: 'type_symbol', palette: { kind: 'categorical', colors: 'ElementSymbol' } });
}

function transformFromPisaStyle(pisaTransform: PisaTransform) {
    return {
        rotation: [
            Number(pisaTransform.rxx), Number(pisaTransform.ryx), Number(pisaTransform.rzx),
            Number(pisaTransform.rxy), Number(pisaTransform.ryy), Number(pisaTransform.rzy),
            Number(pisaTransform.rxz), Number(pisaTransform.ryz), Number(pisaTransform.rzz),
        ],
        translation: [Number(pisaTransform.tx), Number(pisaTransform.ty), Number(pisaTransform.tz)] as [number, number, number],
    };
}

function componentKey(component: { chain_id: string } & PisaTransform) {
    const transformKey = JSON.stringify(transformFromPisaStyle(component)); // Using this as transform identifier as `assembly` and `interface` have different transform identifiers :(
    return `${component.chain_id} ${transformKey}`;
}

function assignComponentColors(assemblies: PisaAssemblyRecord[]) {
    const colors = {} as Record<string, HexColorT>;
    let iColor = 0;
    function isPolymer(component: { chain_id: string }) {
        return !component.chain_id.startsWith('[');
    }
    // First assign colors to polymers, then ligands
    for (const assembly of assemblies) {
        for (const molecule of assembly.molecule) {
            if (isPolymer(molecule)) {
                colors[componentKey(molecule)] ??= COMPONENT_COLORS[iColor++ % COMPONENT_COLORS.length];
            }
        }
    }
    for (const assembly of assemblies) {
        for (const molecule of assembly.molecule) {
            if (!isPolymer(molecule)) {
                colors[componentKey(molecule)] ??= COMPONENT_COLORS[iColor++ % COMPONENT_COLORS.length];
            }
        }
    }
    return colors;
}


const RE_CHAIN_ID = /\[(\w+)\](\w+):(-?\d+)/;

/** Decode PISA-style "chainId", e.g. 'A', '[SO4]A:1101' */
function decodeChainId(pisaChainId: string): { chainId: string, compId: string | undefined, seqId: number | undefined, isLigand: boolean } {
    const match = pisaChainId.match(RE_CHAIN_ID);
    if (match) {
        const compId = match[1];
        const chainId = match[2];
        const seqId = Number(match[3]) >= 0 ? Number(match[3]) : undefined; // label_seq_id=. for ligands in mmCIF gets formatted as -2147483648 :(
        return { chainId, compId, seqId, isLigand: true };
    } else {
        return { chainId: pisaChainId, compId: undefined, seqId: undefined, isLigand: false };
    }
}

/** Increase/decrease "lightness" of a color (where lightness -1 = black, lightness 1 = white) */
function adjustLightnessRelative(color: HexColorT, lightnessDiff: number): HexColorT {
    let [r, g, b] = hexColorToNormRgb(color);
    const x = Math.min(r, g, b);
    const z = Math.max(r, g, b);
    const w = x + z - 1;
    // Compute corresponding color with lightness 0:
    const c0 = (Math.abs(w) === 1) ? () => 0.5 : (c: number) => (c - Math.max(w, 0)) / (1 - Math.abs(w));
    const r0 = c0(r), g0 = c0(g), b0 = c0(b);
    // Compute output color:
    const wNew = Math.max(-1, Math.min(1, w + lightnessDiff));
    const cNew = (c: number) => c * (1 - Math.abs(wNew)) + Math.max(wNew, 0);
    const rNew = cNew(r0), gNew = cNew(g0), bNew = cNew(b0);
    return normRgbToHexColor(rNew, gNew, bNew);
}
/** Convert hex color string to normalized RGB ([0-1, 0-1, 0-1]), e.g. '#0080ff' -> [0, 0.5, 1] */
function hexColorToNormRgb(hex: HexColorT): [number, number, number] {
    const hexNum = parseInt(hex.replace('#', '0x'));
    return [(hexNum >> 16 & 255) / 255, (hexNum >> 8 & 255) / 255, (hexNum & 255) / 255];
}
/** Convert normalized RGB ([0-1, 0-1, 0-1]) to hex color string, e.g. [0, 0.5, 1] -> '#0080ff'  */
function normRgbToHexColor(r: number, g: number, b: number): HexColorT {
    const hexNum = (Math.round(255 * r) << 16) | (Math.round(255 * g) << 8) | Math.round(255 * b);
    return '#' + ('000000' + hexNum.toString(16)).slice(-6) as HexColorT;
}
