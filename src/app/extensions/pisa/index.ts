import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData, type Snapshot } from 'molstar/lib/extensions/mvs/mvs-data';
import type Builder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import type { MVSNodeParams } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-tree';
import type { ComponentExpressionT, HexColorT, ParseFormatT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { PisaBondRecord, PisaComplexesData, PisaComplexMoleculeRecord, PisaComplexRecord, PisaInterfaceData, PisaInterfaceMoleculeRecord, PisaTransform } from './api-typing';


const COMPONENT_COLORS: HexColorT[] = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', // Dark-2 without gray 
    '#1f77b4', '#2ca02c', '#d62728', '#927ba7', '#8c564b', '#e377c2', '#bcbd22', '#17becf', // More non-conflicting colors from other palettes
    '#fc8d62', '#9eb9f3', '#ff9da7', '#ffff33', '#8be0a4', '#e15759', '#c69fbb', '#76b7b2', // More non-conflicting colors from other palettes
];
const DEFAULT_COMPONENT_COLOR: HexColorT = '#999999';
const BULK_COLOR_LIGHTNESS_ADJUSTMENT = 0.4;
const INTERFACE_COLOR_LIGHTNESS_ADJUSTMENT = -0.1; // Roughly corresponds to -0.3 without outline effect
const INTERACTION_RADIUS = 0.1;
const INTERACTION_DASH_LENGTH = 0.1;
type BondType = keyof typeof INTERACTION_TYPE_COLORS;
const INTERACTION_TYPE_COLORS = {
    'h_bonds': '#4277B6',
    'salt_bridges': '#702C8C',
    'ss_bonds': '#ffff00',
    'cov_bonds': '#1D1D1D',
    'other_bonds': '#808080',
} as const;
const INTERACTION_TYPE_NAMES = {
    'h_bonds': 'Hydrogen bond',
    'salt_bridges': 'Salt bridge',
    'ss_bonds': 'Disulfide bond',
    'cov_bonds': 'Covalent bond',
    'other_bonds': 'Other bond',
} as const;

function bulkColorFn(baseColor: HexColorT): HexColorT {
    return adjustLightnessRelative(baseColor, BULK_COLOR_LIGHTNESS_ADJUSTMENT);
}
function interfaceColorFn(baseColor: HexColorT): HexColorT {
    return adjustLightnessRelative(baseColor, INTERFACE_COLOR_LIGHTNESS_ADJUSTMENT);
}

async function getComplexesData(pdbId: string, format: 'mmcif' | 'pdb'): Promise<PisaComplexesData> {
    const response = await fetch(`/tmp/pisa/${pdbId}_results_${format}/assemblies.json`);
    return await response.json();
}
async function getInterfaceData(pdbId: string, format: 'mmcif' | 'pdb', interfaceId: number): Promise<PisaInterfaceData> {
    const response = await fetch(`/tmp/pisa/${pdbId}_results_${format}/interfaces/interface_${interfaceId}.json`);
    return await response.json();
}

export async function pisaDemo(plugin: PluginContext) {
    const pdbId = '3gcb'; // TODO test on '3hax';
    const structureFormat = 'mmcif', structureUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}_updated.cif`;
    // const structureFormat = 'pdb', structureUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/pdb${pdbId}.ent`;

    const complexesData = await getComplexesData(pdbId, structureFormat);
    const allComplexes = complexesData.pqs_sets.flatMap(set => set.complexes);
    const allInterfaces = await Promise.all(new Array(complexesData.n_interfaces).fill(0).map((_, i) => getInterfaceData(pdbId, structureFormat, i + 1)));

    const snapshots: Snapshot[] = [];
    for (const complex of allComplexes) {
        snapshots.push(pisaComplexView({ structureUrl, structureFormat, complexesData: allComplexes, complexKey: complex.complex_key, interfacesData: allInterfaces }));
    }
    for (const interfaceData of allInterfaces) {
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, ghostMolecules: [] }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, detailMolecules: [0], showInteractions: true }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, detailMolecules: [1], showInteractions: true }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, detailMolecules: [0, 1], showInteractions: true }));
        // snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, ghostMolecules: [0] }));
        // snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, ghostMolecules: [1] }));
    }
    const mvs = MVSData.createMultistate(snapshots);
    // console.log(MVSData.toMVSJ(mvs))
    await loadMVS(plugin, mvs);
}


export function pisaComplexView(params: {
    structureUrl: string, structureFormat: ParseFormatT,
    complexesData: PisaComplexRecord[], complexKey: number, interfacesData: PisaInterfaceData[],
}) {
    const { structureUrl, structureFormat, complexesData, complexKey, interfacesData } = params;
    const complex = complexesData.find(ass => ass.complex_key === complexKey);
    if (!complex) throw new Error(`Could not find complex "${complexKey}"`);

    const builder = MVSData.createBuilder();
    const data = builder.download({ url: structureUrl }).parse({ format: structureFormat });
    const interfacesInComplex = new Set(complex.interfaces.interfaces.map(int => int.interface_id));
    const componentColors = assignComponentColors(complexesData);

    // Prepare interface selectors for each component
    const componentInterfaceSelectors: {
        [componentKey: string]: {
            [interfaceId: string]: ComponentExpressionT[],
        } | undefined,
    } = {};
    const interfaceTooltips: { [interfaceId: string]: string } = {};
    for (const int of interfacesData) {
        if (!interfacesInComplex.has(int.interface_id)) continue;
        interfaceTooltips[int.interface_id] = `<br>Interface ${int.interface_id}: <b>${moleculeTitle(int.interface.molecules[0], true)}</b> &ndash; <b>${moleculeTitle(int.interface.molecules[1], true)}</b> (interface area ${int.interface.int_area.toFixed(1)})`;
        for (const molecule of int.interface.molecules) {
            const interfaceSelectors = componentInterfaceSelectors[componentKey(molecule)] ??= {};
            (interfaceSelectors[int.interface_id] ??= []).push(...getInterfaceSelector(molecule));
        }
    }

    for (const molecule of complex.molecules) {
        const interfaceSelectors = componentInterfaceSelectors[componentKey(molecule)];
        const color = componentColors[componentInstanceKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const struct = data.modelStructure().transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${moleculeTitle(molecule, true)} (${molecule.symmetry_id})</b>` });
        const componentSelector: ComponentExpressionT = {
            label_asym_id: molecule.label_asym_id ?? undefined,
            auth_asym_id: molecule.auth_asym_id,
            beg_auth_seq_id: molecule.auth_seq_id_start,
            end_auth_seq_id: molecule.auth_seq_id_end,
        };
        struct.component({ selector: componentSelector }).focus();
        const repr = struct
            .component({ selector: componentSelector })
            .representation({ type: 'spacefill' })
            .color({ color: bulkColorFn(color) });
        for (const interfaceId in interfaceSelectors) {
            const interfaceSelector = interfaceSelectors[interfaceId];
            const interfaceTooltip = interfaceTooltips[interfaceId];
            markInterface({ struct, repr, color }, interfaceSelector, { color: true, tooltip: interfaceTooltip });
        }
    }
    const name = `Complex ${complex.complex_key}`;
    return builder.getSnapshot({
        key: `complex_${complex.complex_key}`,
        title: `${name}: ${complex.composition}`,
        linger_duration_ms: 5000,
        transition_duration_ms: 250,
    });
}

export function pisaInterfaceView(params: {
    structureUrl: string, structureFormat: ParseFormatT,
    complexesData: PisaComplexRecord[], interfaceData: PisaInterfaceData,
    ghostMolecules?: (0 | 1)[], detailMolecules?: (0 | 1)[], showInteractions?: boolean,
}) {
    const { structureUrl, structureFormat, complexesData, interfaceData, ghostMolecules, detailMolecules, showInteractions } = params;
    const componentColors = assignComponentColors(complexesData);
    const interfaceTooltip = `<br>Interface <b>${moleculeTitle(interfaceData.interface.molecules[0], true)}</b> &ndash; <b>${moleculeTitle(interfaceData.interface.molecules[1], true)}</b> (interface area ${interfaceData.interface.int_area.toFixed(1)} &angst;<sup>2</sup>)`;

    const builder = MVSData.createBuilder();
    const data = builder.download({ url: structureUrl }).parse({ format: structureFormat });

    interfaceData.interface.molecules.forEach((molecule, i) => {
        const color = componentColors[componentInstanceKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const interfaceSelector = getInterfaceSelector(molecule);
        const struct = data.modelStructure({ ref: `struct-${i}` }).transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${moleculeTitle(molecule, true)} (${molecule.symmetry_id})</b>` });
        const componentSelector: ComponentExpressionT = {
            label_asym_id: molecule.label_asym_id ?? undefined,
            auth_asym_id: molecule.auth_asym_id,
            beg_auth_seq_id: molecule.auth_seq_id_start,
            end_auth_seq_id: molecule.auth_seq_id_end,
        };
        struct.component({ selector: interfaceSelector }).focus();
        const showGhost = ghostMolecules?.includes(i as 0 | 1);
        const showDetails = detailMolecules?.includes(i as 0 | 1);
        if (showGhost) {
            struct
                .component({ selector: componentSelector })
                .representation({
                    type: 'surface',
                    surface_type: 'gaussian',
                    size_factor: 1.25,
                    custom: { molstar_representation_params: { visuals: ['structure-gaussian-surface-mesh'], xrayShaded: true } },
                })
                .color({ color: color })
                .opacity({ opacity: .49 });
        }
        if (!showGhost || showDetails) {
            const repr = struct
                .component({ selector: componentSelector })
                .representation(showDetails ? { type: 'cartoon', size_factor: 0.5 } : { type: 'spacefill' })
                .color({ color: bulkColorFn(color) });
            markInterface({ struct, repr, color }, interfaceSelector, { tooltip: interfaceTooltip, color: !showDetails, ball_and_stick: showDetails });
            if (detailMolecules?.length) applyElementColors(repr);
        }
        const tooltipAnnotation = [
            'data:text/plain,',
            'data_tooltips',
            'loop_',
            '_tooltip.auth_asym_id _tooltip.auth_seq_id _tooltip.pdbx_PDB_ins_code _tooltip.tooltip',
        ];
        for (const r of molecule.residues.residues) {
            const tooltipText = [
                `<small><b>Residue details:</b>`,
                `Accessible Surface Area: <span style="display: inline-block; min-width: 4em;">${r.asa.toFixed(1)} &angst;<sup>2</sup></span>`,
                `Buried Surface Area: <span style="display: inline-block; min-width: 4em;">${r.bsa.toFixed(1)} &angst;<sup>2</sup></span>`,
                `Solvation Energy: <span style="display: inline-block; min-width: 7.3em;">${r.solv_energy.toFixed(3)} kcal/mol</span></small>`,
            ].join('<br>');
            // const tooltipText = `<small><b>Residue details:</b><br>ASA = ${r.asa.toFixed(1)} &angst;<sup>2</sup>, BSA = ${r.bsa.toFixed(1)} &angst;<sup>2</sup>, Solvation Energy = ${r.solv_energy.toFixed(3)} kcal/mol</small>`;
            tooltipAnnotation.push(`${molecule.auth_asym_id} ${r.auth_seq_id} ${r.ins_code ?? '.'} '${tooltipText}'`);
        }
        struct.tooltipFromUri({ uri: tooltipAnnotation.join(' '), format: 'cif', schema: 'all_atomic' });
    });
    if (showInteractions) {
        const primitives = builder.primitives();
        let bondType: BondType;
        for (bondType in INTERACTION_TYPE_COLORS) {
            if (bondType === 'other_bonds') continue; // ignoring 'other_bonds' as they overwhelm the view
            for (const bond of interfaceData.interface[bondType].bonds) {
                primitives.tube({
                    start: {
                        structure_ref: 'struct-0',
                        expressions: [{ auth_asym_id: bond.auth_asym_id_1, auth_seq_id: bond.auth_seq_id_1, pdbx_PDB_ins_code: bond.inscode_1 ?? undefined, auth_atom_id: bond.auth_atom_id_1 }],
                    },
                    end: {
                        structure_ref: 'struct-1',
                        expressions: [{ auth_asym_id: bond.auth_asym_id_2, auth_seq_id: bond.auth_seq_id_2, pdbx_PDB_ins_code: bond.inscode_2 ?? undefined, auth_atom_id: bond.auth_atom_id_2 }],
                    },
                    color: INTERACTION_TYPE_COLORS[bondType],
                    radius: INTERACTION_RADIUS,
                    dash_length: INTERACTION_DASH_LENGTH,
                    tooltip: tooltipForBond(bond, bondType),
                });
            }
        }
        // TODO disable Molstar's default show-interaction behavior (collides with this and only works within structure)
    }

    return builder.getSnapshot({
        key: `interface_${interfaceData.interface_id}`,
        title: `Interface ${interfaceData.interface_id}: ${moleculeTitle(interfaceData.interface.molecules[0])} - ${moleculeTitle(interfaceData.interface.molecules[1])} (interface area ${interfaceData.interface.int_area.toFixed(1)})`,
        linger_duration_ms: 5000,
        transition_duration_ms: 250,
    });
}


function getInterfaceSelector(molecule: PisaInterfaceMoleculeRecord) {
    const residues = molecule.residues.residues;
    const interfaceResidues = residues.filter(r => r.bsa !== 0); // Secret undocumented knowledge
    const interfaceSelector: ComponentExpressionT[] = interfaceResidues.map(r => ({ auth_seq_id: r.auth_seq_id, pdbx_PDB_ins_code: r.ins_code ?? undefined }));
    return interfaceSelector;
}

interface ComponentState { struct: Builder.Structure, repr: Builder.Representation, color: HexColorT };
function markInterface(component: ComponentState, interfaceSelector: ComponentExpressionT[], options: { color?: boolean, ball_and_stick?: boolean, tooltip?: string } = {}) {
    if (options.color) {
        component.repr.color({ selector: interfaceSelector, color: interfaceColorFn(component.color) });
        addOutlineEffect(component.struct.component({ selector: interfaceSelector }), { type: 'spacefill' });
    }
    if (options.ball_and_stick) {
        const bs = component.struct
            .component({ selector: interfaceSelector })
            .representation({ type: 'ball_and_stick' })
            .color({ color: bulkColorFn(component.color) });
        applyElementColors(bs);
        addOutlineEffect(component.struct.component({ selector: interfaceSelector }), { type: 'ball_and_stick' });
    }
    if (options.tooltip) {
        component.struct.component({ selector: interfaceSelector }).tooltip({ text: options.tooltip });
    }
}

function addOutlineEffect(component: Builder.Component, params: MVSNodeParams<'representation'>) {
    component
        .representation({
            ...params,
            size_factor: (params.size_factor ?? 1) * 1.01,
            custom: { molstar_representation_params: { xrayShaded: true } },
        })
        .color({ color: 'black' });
}

function applyElementColors(repr: Builder.Representation) {
    repr.colorFromSource({ schema: 'all_atomic', category_name: 'atom_site', field_name: 'type_symbol', palette: { kind: 'categorical', colors: 'ElementSymbol' } });
}

function transformFromPisaStyle(pisaTransform: PisaTransform) {
    return {
        rotation: [
            pisaTransform.rxx, pisaTransform.ryx, pisaTransform.rzx,
            pisaTransform.rxy, pisaTransform.ryy, pisaTransform.rzy,
            pisaTransform.rxz, pisaTransform.ryz, pisaTransform.rzz,
        ],
        translation: [pisaTransform.tx, pisaTransform.ty, pisaTransform.tz] as [number, number, number],
    };
}

function moleculeTitle(molecule: PisaComplexMoleculeRecord | PisaInterfaceMoleculeRecord, htmlFormatting?: boolean) {
    const asymIdText = formatLabelAuth(molecule.label_asym_id, molecule.auth_asym_id, undefined, htmlFormatting);
    if (molecule.ccd_id) {
        // ligand
        return `${molecule.ccd_id} ${asymIdText} ${molecule.auth_seq_id_start}`;
    } else {
        // polymer
        return asymIdText;
    }
}

function componentKey(component: PisaComplexMoleculeRecord | PisaInterfaceMoleculeRecord) {
    return `${component.auth_asym_id}/${component.ccd_id ?? ''}/${component.ccd_id ? component.auth_seq_id_start : ''}`;
}
/** Return deterministic identifier of a complex component (type + transform) for synchronizing color assignment */
function componentInstanceKey(component: PisaComplexMoleculeRecord | PisaInterfaceMoleculeRecord) {
    return `${componentKey(component)}/${component.symmetry_id}`;
}

function assignComponentColors(complexes: PisaComplexRecord[]) {
    const colors = {} as { [componentInstanceKey: string]: HexColorT };
    let iColor = 0;
    function isPolymer(component: PisaComplexMoleculeRecord) {
        return !component.ccd_id;
    }
    // First assign colors to polymers, then ligands
    for (const complex of complexes) {
        for (const molecule of complex.molecules) {
            if (isPolymer(molecule)) {
                colors[componentInstanceKey(molecule)] ??= COMPONENT_COLORS[iColor++ % COMPONENT_COLORS.length];
            }
        }
    }
    for (const complex of complexes) {
        for (const molecule of complex.molecules) {
            if (!isPolymer(molecule)) {
                colors[componentInstanceKey(molecule)] ??= COMPONENT_COLORS[iColor++ % COMPONENT_COLORS.length];
            }
        }
    }
    return colors;
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

function tooltipForBond(bond: PisaBondRecord, bondType: BondType): string {
    const tooltipHeader = `<b>${INTERACTION_TYPE_NAMES[bondType] ?? bondType} (${bond.dist.toFixed(2)} &angst;)</b>`;
    const asymId1 = formatLabelAuth(bond.label_asym_id_1, bond.auth_asym_id_1, undefined, true);
    const asymId2 = formatLabelAuth(bond.label_asym_id_2, bond.auth_asym_id_2, undefined, true);
    const seqId1 = formatLabelAuth(bond.label_seq_id_1, bond.auth_seq_id_1, bond.inscode_1, true);
    const seqId2 = formatLabelAuth(bond.label_seq_id_2, bond.auth_seq_id_2, bond.inscode_2, true);
    const tooltip1 = `${asymId1} | ${bond.auth_comp_id_1} ${seqId1} | ${bond.auth_atom_id_1}`;
    const tooltip2 = `${asymId2} | ${bond.auth_comp_id_2} ${seqId2} | ${bond.auth_atom_id_2}`;
    return `${tooltipHeader}<br>${tooltip1}<br>${tooltip2}`;
}

/** Unified formatting for label_* and auth_* values (e.g. label_asym_id + auth_asym_id, label_seq_id + auth_seq_id + ins_code) */
function formatLabelAuth(label: string | number | null, auth: string | number, insCode?: string | null, htmlFormatting?: boolean): string {
    if (!label || (label === auth && !insCode)) {
        return `${auth}${insCode ?? ''}`;
    } else {
        if (htmlFormatting)
            return `${label} [<small>auth </small>${auth}${insCode ?? ''}]`;
        else
            return `${label} [auth ${auth}${insCode ?? ''}]`;
    }
}
