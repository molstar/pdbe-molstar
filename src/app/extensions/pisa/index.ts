import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData, type Snapshot } from 'molstar/lib/extensions/mvs/mvs-data';
import type Builder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import type { MVSNodeParams } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-tree';
import type { ComponentExpressionT, HexColorT, ParseFormatT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { PisaAssembliesData, PisaAssemblyRecord, PisaBondRecord, PisaInterfaceData, PisaResidueRecord, PisaTransform } from './types';


const COMPONENT_COLORS: HexColorT[] = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', // Dark-2 without gray 
    '#1f77b4', '#2ca02c', '#d62728', '#927ba7', '#8c564b', '#e377c2', '#bcbd22', '#17becf', // More non-conflicting colors from other palettes
    '#fc8d62', '#9eb9f3', '#ff9da7', '#ffff33', '#8be0a4', '#e15759', '#c69fbb', '#76b7b2', // More non-conflicting colors from other palettes
];
const DEFAULT_COMPONENT_COLOR: HexColorT = '#999999';
const BULK_COLOR_LIGHTNESS_ADJUSTMENT = 0.4;
const INTERFACE_COLOR_LIGHTNESS_ADJUSTMENT = -0.3;
const INTERACTION_RADIUS = 0.1;
const INTERACTION_DASH_LENGTH = 0.1;
const INTERACTION_TYPE_COLORS = {
    'h-bonds': '#4277B6',
    'salt-bridges': '#702C8C',
    'ss-bonds': '#ffff00',
    'cov-bonds': '#1D1D1D',
    'other-bonds': '#808080',
} as const;
const INTERACTION_TYPE_NAMES = {
    'h-bonds': 'Hydrogen bond',
    'salt-bridges': 'Salt bridge',
    'ss-bonds': 'Disulfide bond',
    'cov-bonds': 'Covalent bond',
    'other-bonds': 'Other bond',
} as const;

function bulkColorFn(baseColor: HexColorT): HexColorT {
    return adjustLightnessRelative(baseColor, BULK_COLOR_LIGHTNESS_ADJUSTMENT);
}
function interfaceColorFn(baseColor: HexColorT): HexColorT {
    return adjustLightnessRelative(baseColor, INTERFACE_COLOR_LIGHTNESS_ADJUSTMENT);
}

async function getAssembliesData(pdbId: string): Promise<PisaAssembliesData> {
    const response = await fetch(`/tmp/pisa/${pdbId}/assembly.json`);
    return await response.json();
}
async function getAllAssemblies(pdbId: string) {
    const assembliesData = await getAssembliesData(pdbId);
    return assembliesData.pisa_results.asm_set.map(ass => ass.assembly);
    // return [...assembliesData.pisa_results.asm_set.map(ass => ass.assembly), assembliesData.pisa_results.asu_complex.assembly];
}
async function getInterfaceData(pdbId: string, interfaceId: string): Promise<PisaInterfaceData | undefined> {
    const response = await fetch(`/tmp/pisa/${pdbId}/interfaces/interface_${interfaceId}.json`);
    if (response.status === 404) return undefined;
    return await response.json();
}
/** This is stupid, assembly.json should provide n_interfaces, but it doesn't. */
async function getAllInterfaces(pdbId: string): Promise<PisaInterfaceData[]> {
    const firstInterface = await getInterfaceData(pdbId, '1');
    if (firstInterface === undefined) return [];
    const nInterfaces = Number(firstInterface.n_interfaces);
    const otherPromises: Promise<PisaInterfaceData | undefined>[] = [];
    for (let i = 2; i <= nInterfaces; i++) {
        otherPromises.push(getInterfaceData(pdbId, String(i)));
    }
    const otherInterfaces = await Promise.all(otherPromises); // await parallel fetches
    return [firstInterface, ...otherInterfaces.filter(int => int !== undefined)];
}

export async function pisaDemo(plugin: PluginContext) {
    const pdbId = '3gcb';
    // const structureFormat = 'mmcif', structureUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}_updated.cif`;
    const structureFormat = 'pdb', structureUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/pdb${pdbId}.ent`;
    const allAssemblies = await getAllAssemblies(pdbId);
    const allInterfaces = await getAllInterfaces(pdbId);

    const snapshots: Snapshot[] = [];
    for (const assembly of allAssemblies) {
        snapshots.push(pisaAsseblyView({ structureUrl, structureFormat, assembliesData: allAssemblies, assemblyId: assembly.id, interfacesData: allInterfaces }));
        // snapshots.push(pisaAsseblyView({ structureUrl, structureFormat, assembliesData: allAssemblies, assemblyId: assembly.id, interfacesData: allInterfaces, reprParams: { type: 'surface' } }));
        // snapshots.push(pisaAsseblyView({ structureUrl, structureFormat, assembliesData: allAssemblies, assemblyId: assembly.id, interfacesData: allInterfaces, reprParams: { type: 'surface', surface_type: 'gaussian' } }));
        // snapshots.push(pisaAsseblyView({ structureUrl, structureFormat, assembliesData: allAssemblies, assemblyId: assembly.id, interfacesData: allInterfaces, reprParams: { type: 'cartoon' } }));
    }
    for (const interfaceData of allInterfaces) {
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, assembliesData: allAssemblies, interfaceData, ghostMolecules: [] }));
        // snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, assembliesData: allAssemblies, interfaceData, ghostMolecules: [0] }));
        // snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, assembliesData: allAssemblies, interfaceData, ghostMolecules: [1] }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, assembliesData: allAssemblies, interfaceData, detailMolecules: [0], showInteractions: true }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, assembliesData: allAssemblies, interfaceData, detailMolecules: [1], showInteractions: true }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, assembliesData: allAssemblies, interfaceData, detailMolecules: [0, 1], showInteractions: true }));
    }
    const mvs = MVSData.createMultistate(snapshots);
    // console.log(MVSData.toMVSJ(mvs))
    await loadMVS(plugin, mvs);
}


export function pisaAsseblyView(params: {
    structureUrl: string, structureFormat: ParseFormatT,
    assembliesData: PisaAssemblyRecord[], assemblyId: string, interfacesData: PisaInterfaceData[],
    reprParams?: Partial<MVSNodeParams<'representation'>>,
}) {
    const { structureUrl, structureFormat, assembliesData, assemblyId, interfacesData, reprParams } = params;
    const assembly = assembliesData.find(ass => ass.id === assemblyId);
    if (!assembly) throw new Error(`Could not find assembly "${assemblyId}"`);

    const builder = MVSData.createBuilder();
    const data = builder.download({ url: structureUrl }).parse({ format: structureFormat });

    const componentColors = assignComponentColors(assembliesData);

    const componentIdsByPisaChainId: { [pisaChainId: string]: string[] } = {};
    const components: { [visualId: string]: ComponentState } = {};

    for (const molecule of assembly.molecule) {
        const component = decodeChainId(molecule.chain_id);
        const color = componentColors[componentKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const struct = data
            .modelStructure()
            .transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${molecule.chain_id} (${molecule.symId})</b>` });
        const componentSelector: ComponentExpressionT = { label_asym_id: component.chainId, label_seq_id: component.seqId }; // chain_id appears to be label_asym_id (if mmcif format)
        // TODO Select 20 std AAs + DNA/RNA bases here to remove waters and ligands (not optimal but good enough solution for now)
        const repr = struct
            .component({ selector: componentSelector })
            .representation({
                type: 'spacefill',
                size_factor: component.isLigand ? 1.05 : 1, // distinguish ligands/waters from the main chain, in case of PDB format
                ...reprParams,
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

    const interfacesInAssembly = new Set(assembly.interfaces.interface.map(int => int.id));

    for (const int of interfacesData) {
        if (!interfacesInAssembly.has(int.interface_id)) continue;
        const interfaceTooltip = `<br>Interface <b>${int.interface.molecule[0].chain_id}</b> &ndash; <b>${int.interface.molecule[1].chain_id}</b> (interface area ${Number(int.interface.int_area).toFixed(1)})`;
        // Handling self-interfaces differently to avoid duplicate tooltips on residues in symmetric interfaces
        const isSelfInterface = int.interface.molecule[0].chain_id === int.interface.molecule[1].chain_id;
        const bothSurfaces: ComponentExpressionT[] = [];
        for (const molecule of int.interface.molecule) {
            const residues = ensureArray<PisaResidueRecord>(molecule.residues.residue);
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

export function pisaInterfaceView(params: {
    structureUrl: string, structureFormat: ParseFormatT,
    assembliesData: PisaAssemblyRecord[], interfaceData: PisaInterfaceData,
    ghostMolecules?: (0 | 1)[], detailMolecules?: (0 | 1)[], showInteractions?: boolean,
}) {
    const { structureUrl, structureFormat, assembliesData, interfaceData, ghostMolecules, detailMolecules, showInteractions } = params;
    const componentColors = assignComponentColors(assembliesData);
    const interfaceTooltip = `<br>Interface <b>${interfaceData.interface.molecule[0].chain_id}</b> &ndash; <b>${interfaceData.interface.molecule[1].chain_id}</b> (interface area ${Number(interfaceData.interface.int_area).toFixed(1)})`;

    const builder = MVSData.createBuilder();
    const data = builder.download({ url: structureUrl }).parse({ format: structureFormat });

    const structs = [undefined, undefined] as [Builder.Structure | undefined, Builder.Structure | undefined];

    interfaceData.interface.molecule.forEach((molecule, i) => {
        const component = decodeChainId(molecule.chain_id);
        const color = componentColors[componentKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const struct = data
            .modelStructure({ ref: `struct-${i}` })
            .transform(transformFromPisaStyle(molecule));
        structs[i] = struct;
        const symId = `${molecule.symop_no}_${Number(molecule.cell_i) + 5}${Number(molecule.cell_j) + 5}${Number(molecule.cell_k) + 5}`; // This should come from the API directly
        struct.component().tooltip({ text: `<hr>Component <b>${molecule.chain_id} (${symId})</b>` });
        const componentSelector: ComponentExpressionT = { label_asym_id: component.chainId, label_seq_id: component.seqId }; // chain_id appears to be label_asym_id (if mmcif format)
        struct.component({ selector: componentSelector }).focus();
        const showGhost = ghostMolecules?.includes(i as 0 | 1);
        const showDetails = detailMolecules?.includes(i as 0 | 1);
        if (showGhost) {
            struct
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
            const residues = ensureArray(molecule.residues.residue);
            const interfaceResidues = residues.filter(r => Number(r.bsa) !== 0); // Secret undocumented knowledge
            const resSelector: ComponentExpressionT[] = interfaceResidues.map(r => ({ auth_seq_id: Number(r.seq_num), pdbx_PDB_ins_code: r.ins_code ?? undefined }));
            markInterface([{ struct, repr, color }], resSelector, { tooltip: interfaceTooltip, color: !showDetails, ball_and_stick: showDetails });
            if (detailMolecules?.length) applyElementColors(repr);
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
    if (showInteractions) {
        const primitives = builder.primitives();
        let bondType: keyof typeof INTERACTION_TYPE_COLORS;
        for (bondType in INTERACTION_TYPE_COLORS) {
            if (bondType === 'other-bonds') continue; // ignoring 'other-bonds' for now as they overwhelm the view
            const bonds = ensureArray<PisaBondRecord>(interfaceData.interface[bondType].bond);
            for (const bond of bonds) {
                const tooltipHeader = `<b>${INTERACTION_TYPE_NAMES[bondType] ?? bondType} (${Number(bond.dist).toFixed(2)} &angst;)</b>`;
                const tooltip1 = `<b>${bond['res-1']} ${bond['seqnum-1']}${bond['inscode-1'] ?? ''}</b> | ${bond['atname-1']}`;
                const tooltip2 = `<b>${bond['res-2']} ${bond['seqnum-2']}${bond['inscode-2'] ?? ''}</b> | ${bond['atname-2']}`;
                const tooltip = `${tooltipHeader}<br>${tooltip1} &ndash; ${tooltip2}`;
                primitives.tube({
                    start: {
                        structure_ref: 'struct-0',
                        expressions: [{ auth_asym_id: bond['chain-1'], auth_seq_id: Number(bond['seqnum-1']), pdbx_PDB_ins_code: bond['inscode-1'] ?? undefined, auth_atom_id: bond['atname-1'] }],
                        // using auth_ fields for now, current input data messy
                    },
                    end: {
                        structure_ref: 'struct-1',
                        expressions: [{ auth_asym_id: bond['chain-2'], auth_seq_id: Number(bond['seqnum-2']), pdbx_PDB_ins_code: bond['inscode-2'] ?? undefined, auth_atom_id: bond['atname-2'] }],
                        // using auth_ fields for now, current input data messy
                    },
                    color: INTERACTION_TYPE_COLORS[bondType],
                    radius: INTERACTION_RADIUS,
                    dash_length: INTERACTION_DASH_LENGTH,
                    tooltip: tooltip,
                });
            }
        }
        // TODO disable Molstar's default show-interaction behavior (collides with this and only works within structure)
    }

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

/** Convert `T | T[]` into `T[]`. `undefined` converts to empty array */
function ensureArray<T>(maybeArray: T | T[] | undefined): T[] {
    if (maybeArray === undefined) return [];
    if (Array.isArray(maybeArray)) return maybeArray;
    else return [maybeArray];
}
