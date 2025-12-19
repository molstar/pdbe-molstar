import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData, type Snapshot } from 'molstar/lib/extensions/mvs/mvs-data';
import type Builder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import type { MVSNodeParams } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-tree';
import type { ComponentExpressionT, HexColorT, ParseFormatT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import type { NewPisaComplexesData, NewPisaComplexMoleculeRecord, NewPisaComplexRecord, NewPisaInterfaceData, NewPisaInterfaceMoleculeRecord, NewPisaTransform } from './types-new';


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

async function getComplexesData(pdbId: string, format: 'mmcif' | 'pdb'): Promise<NewPisaComplexesData> {
    const response = await fetch(`/tmp/pisa/${pdbId}_results_${format}/assemblies.json`);
    return await response.json();
}
async function getInterfaceData(pdbId: string, format: 'mmcif' | 'pdb', interfaceId: number): Promise<NewPisaInterfaceData> {
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
        // snapshots.push(pisaComplexView({ structureUrl, structureFormat, complexesData: allComplexes, complexKey: complex.complex_key, interfacesData: allInterfaces }));
        // snapshots.push(pisaComplexView({ structureUrl, structureFormat, complexesData: allComplexes, complexKey: complex.complex_key, interfacesData: allInterfaces, reprParams: { type: 'surface' } }));
        // snapshots.push(pisaComplexView({ structureUrl, structureFormat, complexesData: allComplexes, complexKey: complex.complex_key, interfacesData: allInterfaces, reprParams: { type: 'surface', surface_type: 'gaussian' } }));
        // snapshots.push(pisaComplexView({ structureUrl, structureFormat, complexesData: allComplexes, complexKey: complex.complex_key, interfacesData: allInterfaces, reprParams: { type: 'cartoon' } }));
    }
    for (const interfaceData of allInterfaces) {
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, ghostMolecules: [] }));
        // snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, ghostMolecules: [0] }));
        // snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, ghostMolecules: [1] }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, detailMolecules: [0], showInteractions: true }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, detailMolecules: [1], showInteractions: true }));
        snapshots.push(pisaInterfaceView({ structureUrl, structureFormat, complexesData: allComplexes, interfaceData, detailMolecules: [0, 1], showInteractions: true }));
    }
    const mvs = MVSData.createMultistate(snapshots);
    // console.log(MVSData.toMVSJ(mvs))
    await loadMVS(plugin, mvs);
}


export function pisaComplexView(params: {
    structureUrl: string, structureFormat: ParseFormatT,
    complexesData: NewPisaComplexRecord[], complexKey: number, interfacesData: NewPisaInterfaceData[],
    reprParams?: MVSNodeParams<'representation'>,
}) {
    const { structureUrl, structureFormat, complexesData, complexKey, interfacesData, reprParams } = params;
    const complex = complexesData.find(ass => ass.complex_key === complexKey);
    if (!complex) throw new Error(`Could not find complex "${complexKey}"`);

    const builder = MVSData.createBuilder();
    const data = builder.download({ url: structureUrl }).parse({ format: structureFormat });
    const interfacesInComplex = new Set(complex.interfaces.interfaces.map(int => int.interface_id));
    const componentColors = assignComponentColors(complexesData);
    // console.log('componentColors:', componentColors)

    // Prepare info on components and interfaces
    const componentsInfo: {
        [pisaChainId: string]: {
            minAuthSeqId: number,
            maxAuthSeqId: number,
            interfaceSelectors: { [interfaceId: string]: ComponentExpressionT[] },
        } | undefined,
    } = {};
    // TODO remove the above once obsolete
    const interfaceTooltips: { [interfaceId: string]: string } = {};
    for (const int of interfacesData) {
        if (!interfacesInComplex.has(int.interface_id)) continue;
        interfaceTooltips[int.interface_id] = `<br>Interface ${int.interface_id}: <b>${moleculeTitle(int.interface.molecules[0])}</b> &ndash; <b>${moleculeTitle(int.interface.molecules[1])}</b> (interface area ${int.interface.int_area.toFixed(1)})`;
        for (const molecule of int.interface.molecules) {
            const sel = getInterfaceMoleculeSelectors(molecule);
            const compInfo = componentsInfo[moleculeTitle(molecule)] ??= { minAuthSeqId: sel.minAuthSeqId, maxAuthSeqId: sel.maxAuthSeqId, interfaceSelectors: {} };
            // TODO review use of moleculeTitle here
            compInfo.minAuthSeqId = Math.min(compInfo.minAuthSeqId, sel.minAuthSeqId);
            compInfo.maxAuthSeqId = Math.max(compInfo.maxAuthSeqId, sel.maxAuthSeqId);
            (compInfo.interfaceSelectors[int.interface_id] ??= []).push(...sel.interfaceSelectors);
        }
    }

    for (const molecule of complex.molecules) {
        const compInfo = componentsInfo[moleculeTitle(molecule)];
        const color = componentColors[componentColorKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const struct = data.modelStructure().transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${moleculeTitle(molecule)} (${molecule.symmetry_id})</b>` });
        const componentSelector: ComponentExpressionT = {
            label_asym_id: molecule.label_asym_id ?? undefined,
            auth_asym_id: molecule.auth_asym_id,
            beg_auth_seq_id: molecule.auth_seq_id_start,
            end_auth_seq_id: molecule.auth_seq_id_end,
            // label_asym_id: component.chainId, // chain_id appears to be label_asym_id (if mmcif format)
            // label_seq_id: component.seqId, // for ligand with chain_id of kind '[GOL]A:1001'
            // beg_auth_seq_id: compInfo?.minAuthSeqId, // excludes waters and ligand when chain is identified by auth_asym_id only
            // end_auth_seq_id: compInfo?.maxAuthSeqId, // excludes waters and ligand when chain is identified by auth_asym_id only
        };
        struct.component({ selector: componentSelector }).focus();
        const repr = struct
            .component({ selector: componentSelector })
            .representation({ type: 'spacefill', ...reprParams })
            .color({ color: bulkColorFn(color) });
        for (const interfaceId in compInfo?.interfaceSelectors) {
            const selector = compInfo.interfaceSelectors[interfaceId];
            const interfaceTooltip = interfaceTooltips[interfaceId];
            markInterface({ struct, repr, color }, selector, { color: true, tooltip: interfaceTooltip });
            // TODO fix marking interface on ligand when data from CIF
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
    complexesData: NewPisaComplexRecord[], interfaceData: NewPisaInterfaceData,
    ghostMolecules?: (0 | 1)[], detailMolecules?: (0 | 1)[], showInteractions?: boolean,
}) {
    const { structureUrl, structureFormat, complexesData, interfaceData, ghostMolecules, detailMolecules, showInteractions } = params;
    const componentColors = assignComponentColors(complexesData);
    const interfaceTooltip = `<br>Interface <b>${moleculeTitle(interfaceData.interface.molecules[0])}</b> &ndash; <b>${moleculeTitle(interfaceData.interface.molecules[1])}</b> (interface area ${interfaceData.interface.int_area.toFixed(1)} &angst;<sup>2</sup>)`;

    const builder = MVSData.createBuilder();
    const data = builder.download({ url: structureUrl }).parse({ format: structureFormat });

    interfaceData.interface.molecules.forEach((molecule, i) => {
        const color = componentColors[componentColorKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const sel = getInterfaceMoleculeSelectors(molecule);
        const struct = data.modelStructure({ ref: `struct-${i}` }).transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${moleculeTitle(molecule)} (${molecule.symmetry_id})</b>` });
        const componentSelector: ComponentExpressionT = {
            label_asym_id: molecule.label_asym_id ?? undefined,
            auth_asym_id: molecule.auth_asym_id,
            beg_auth_seq_id: molecule.auth_seq_id_start,
            end_auth_seq_id: molecule.auth_seq_id_end,
            // label_asym_id: component.chainId, // chain_id appears to be label_asym_id (if mmcif format)
            // label_seq_id: component.seqId, // for ligand with chain_id of kind '[GOL]A:1001'
            // beg_auth_seq_id: sel.minAuthSeqId, // excludes waters and ligand when chain is identified by auth_asym_id only
            // end_auth_seq_id: sel.maxAuthSeqId, // excludes waters and ligand when chain is identified by auth_asym_id only
        };
        struct.component({ selector: sel.interfaceSelectors }).focus();
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
            markInterface({ struct, repr, color }, sel.interfaceSelectors, { tooltip: interfaceTooltip, color: !showDetails, ball_and_stick: showDetails });
            if (detailMolecules?.length) applyElementColors(repr);
        }
        for (const r of molecule.residues.residues) {
            // TODO implement by tooltip_from_uri and include chain ID selector for efficiency
            struct
                .component({ selector: { auth_seq_id: r.auth_seq_id, pdbx_PDB_ins_code: r.ins_code ?? undefined } })
                .tooltip({
                    text: [
                        '',
                        `<small><b>Residue details:</b>`,
                        `Accessible Surface Area: <span style="display: inline-block; min-width: 4em;">${r.asa.toFixed(1)} &angst;<sup>2</sup></span>`,
                        `Buried Surface Area: <span style="display: inline-block; min-width: 4em;">${r.bsa.toFixed(1)} &angst;<sup>2</sup></span>`,
                        `Solvation Energy: <span style="display: inline-block; min-width: 7.3em;">${r.solv_energy.toFixed(3)} kcal/mol</span></small>`,
                    ].join('<br>'),
                });
            // .tooltip({ text: `<br><small><b>Residue details:</b> ASA = ${r.asa.toFixed(1)} &angst;<sup>2</sup>, BSA = ${r.bsa.toFixed(1)} &angst;<sup>2</sup>, Solvation Energy = ${r.solv_energy.toFixed(3)} kcal/mol</small>` });
        }
    });
    if (showInteractions) {
        const primitives = builder.primitives();
        let bondType: keyof typeof INTERACTION_TYPE_COLORS;
        for (bondType in INTERACTION_TYPE_COLORS) {
            if (bondType === 'other_bonds') continue; // ignoring 'other_bonds' as they overwhelm the view
            for (const bond of interfaceData.interface[bondType].bonds) {
                const tooltipHeader = `<b>${INTERACTION_TYPE_NAMES[bondType] ?? bondType} (${bond.dist.toFixed(2)} &angst;)</b>`;
                const tooltip1 = `<b>${bond.auth_comp_id_1} ${bond.auth_seq_id_1}${bond.inscode_1 ?? ''}</b> | ${bond.auth_atom_id_1}`; // TODO Properly format, incl. label fields
                const tooltip2 = `<b>${bond.auth_comp_id_2} ${bond.auth_seq_id_2}${bond.inscode_2 ?? ''}</b> | ${bond.auth_atom_id_2}`; // TODO Properly format, incl. label fields
                const tooltip = `${tooltipHeader}<br>${tooltip1} &ndash; ${tooltip2}`;
                primitives.tube({
                    start: {
                        structure_ref: 'struct-0',
                        expressions: [{ auth_asym_id: bond.auth_asym_id_1, auth_seq_id: bond.auth_seq_id_1, pdbx_PDB_ins_code: bond.inscode_1 ?? undefined, auth_atom_id: bond.auth_atom_id_1 }],
                        // using auth_ fields for now, current input data messy
                    },
                    end: {
                        structure_ref: 'struct-1',
                        expressions: [{ auth_asym_id: bond.auth_asym_id_2, auth_seq_id: bond.auth_seq_id_2, pdbx_PDB_ins_code: bond.inscode_2 ?? undefined, auth_atom_id: bond.auth_atom_id_2 }],
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
        title: `Interface ${interfaceData.interface_id}: ${moleculeTitle(interfaceData.interface.molecules[0])} - ${moleculeTitle(interfaceData.interface.molecules[1])} (interface area ${interfaceData.interface.int_area.toFixed(1)})`,
        linger_duration_ms: 5000,
        transition_duration_ms: 250,
    });
}


function getInterfaceMoleculeSelectors(molecule: NewPisaInterfaceMoleculeRecord) {
    const residues = molecule.residues.residues;
    const interfaceResidues = residues.filter(r => r.bsa !== 0); // Secret undocumented knowledge
    const interfaceSelectors: ComponentExpressionT[] = interfaceResidues.map(r => ({ auth_seq_id: r.auth_seq_id, pdbx_PDB_ins_code: r.ins_code ?? undefined }));
    return {
        minAuthSeqId: Math.min(...residues.map(r => r.auth_seq_id)), // TODO remove (obsolete)
        maxAuthSeqId: Math.max(...residues.map(r => r.auth_seq_id)), // TODO remove (obsolete)
        interfaceSelectors,
    };
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

function transformFromPisaStyle(pisaTransform: NewPisaTransform) {
    return {
        rotation: [
            pisaTransform.rxx, pisaTransform.ryx, pisaTransform.rzx,
            pisaTransform.rxy, pisaTransform.ryy, pisaTransform.rzy,
            pisaTransform.rxz, pisaTransform.ryz, pisaTransform.rzz,
        ],
        translation: [pisaTransform.tx, pisaTransform.ty, pisaTransform.tz] as [number, number, number],
    };
}

function moleculeTitle(molecule: NewPisaComplexMoleculeRecord | NewPisaInterfaceMoleculeRecord) {
    const asymIdText = (!molecule.label_asym_id || molecule.label_asym_id === molecule.auth_asym_id) ?
        molecule.auth_asym_id
        : `${molecule.label_asym_id} [auth ${molecule.auth_asym_id}]`;
    if (molecule.ccd_id) {
        // ligand
        return `${molecule.ccd_id} ${asymIdText} ${molecule.auth_seq_id_start}`;
    } else {
        // polymer
        return asymIdText;
    }
}

/** Return deterministic identifier of a complex component (type + transform) for color, synchronizing assignment */
function componentColorKey(component: NewPisaComplexMoleculeRecord | NewPisaInterfaceMoleculeRecord) {
    return `${component.auth_asym_id}/${component.ccd_id ?? ''}/${component.ccd_id ? component.auth_seq_id_start : ''}/${component.symmetry_id}`;
}

function assignComponentColors(complexes: NewPisaComplexRecord[]) {
    const colors = {} as Record<string, HexColorT>;
    let iColor = 0;
    function isPolymer(component: NewPisaComplexMoleculeRecord) {
        return !component.ccd_id;
        // return !component.chain_id.startsWith('[');
    }
    // First assign colors to polymers, then ligands
    for (const complex of complexes) {
        for (const molecule of complex.molecules) {
            if (isPolymer(molecule)) {
                colors[componentColorKey(molecule)] ??= COMPONENT_COLORS[iColor++ % COMPONENT_COLORS.length];
            }
        }
    }
    for (const complex of complexes) {
        for (const molecule of complex.molecules) {
            if (!isPolymer(molecule)) {
                colors[componentColorKey(molecule)] ??= COMPONENT_COLORS[iColor++ % COMPONENT_COLORS.length];
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
