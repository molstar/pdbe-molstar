import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import Builder from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import { ColorT, ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Color } from 'molstar/lib/mol-util/color';
import { normalizeColor } from '../../helpers';
import { PisaAssembliesData, PisaAssemblyRecord, PisaInterfaceData, PisaTransform } from './types';


const ManyDistinctColors: ColorT[] = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d',
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf',
    '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494',
];
const DEFAULT_COMPONENT_COLOR: ColorT = '#999999';

async function getAssembliesData(pdbId: string): Promise<PisaAssembliesData> {
    return await (await fetch(`/tmp/pisa/${pdbId}/assembly.json`)).json();
}
async function getInterfaceData(pdbId: string, interfaceId: string): Promise<PisaInterfaceData> {
    return await (await fetch(`/tmp/pisa/${pdbId}/interfaces/interface_${interfaceId}.json`)).json();
}
function loadStructureData(builder: Builder.Root, pdbId: string) {
    // return builder.download({ url: 'https://www.ebi.ac.uk/pdbe/entry-files/download/3gcb_updated.cif' }).parse({ format: 'mmcif' });
    return builder.download({ url: 'https://www.ebi.ac.uk/pdbe/entry-files/download/pdb3gcb.ent' }).parse({ format: 'pdb' });
}

/** Positive values for lighter interfaces, negative values for darker interfaces. */
const INTERFACE_COLOR_CHANGE_STRENGTH = -1.25;
function bulkColorFn(baseColor: ColorT) {
    return Color.toHexStyle(Color.darken(normalizeColor(baseColor), INTERFACE_COLOR_CHANGE_STRENGTH)) as ColorT;
}
function interfaceColorFn(baseColor: ColorT) {
    return Color.toHexStyle(Color.lighten(normalizeColor(baseColor), INTERFACE_COLOR_CHANGE_STRENGTH)) as ColorT;
}

export async function pisaDemo(plugin: PluginContext) {
    const pdbId = '3gcb';
    const assemblyId = '1';
    const interfaceId = '3';
    // const mvs = await pisaAsseblyView(pdbId, assemblyId, { ghostRepr: false });
    const mvs = await pisaInterfaceView(pdbId, interfaceId, { ghostMolecules: [] });
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
}

export async function pisaAsseblyView(pdbId: string, assemblyId: string, options: { ghostRepr?: boolean } = {}) {
    const assembliesData = await getAssembliesData(pdbId);

    const allAssemblies = [
        ...assembliesData.pisa_results.asm_set.map(ass => ass.assembly),
        assembliesData.pisa_results.asu_complex.assembly,
    ];
    console.log(allAssemblies)
    // Assembly 1: 6x8 molecules
    // Assembly 2: 2x8 molecules (big interface)
    // Assembly 3: 2x8 molecules (tiny interface)
    // Assembly 4=ASU: 8 molecules

    const assembly = allAssemblies.find(ass => ass.id === assemblyId);
    if (!assembly) throw new Error(`Could not find assembly "${assemblyId}"`);

    const builder = MVSData.createBuilder();
    const data = loadStructureData(builder, pdbId);

    const componentColors = assignComponentColors(allAssemblies);

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
        const repr = struct
            .component({ selector: componentSelector })
            .representation({
                type: 'spacefill',
                size_factor: component.isLigand ? 1.05 : 1, // distinguish ligands/waters from the main chain, in case of PDB format
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
        if (options.ghostRepr) {
            const reprGhost = struct
                .component({ selector: componentSelector })
                .representation({
                    type: 'surface',
                    surface_type: 'gaussian',
                    size_factor: 1.25,
                    custom: {
                        molstar_representation_params: {
                            visuals: ["structure-gaussian-surface-mesh"],
                            xrayShaded: true,
                        }
                    },
                })
                .color({ color: color })
                .opacity({ opacity: .49 });
        }
        const componentId = `${molecule.chain_id} (${molecule.symId})`;
        (componentIdsByPisaChainId[molecule.chain_id] ??= []).push(componentId);
        components[componentId] = { struct, repr, color };
    }
    console.log('visualsIdsByPisaChainId', componentIdsByPisaChainId)
    console.log('visuals', components)

    const interfaceIds = assembly.interfaces.interface.map(int => int.id);
    console.log('interfaceIds:', interfaceIds)
    const interfaces = await Promise.all(interfaceIds.map(id => getInterfaceData(pdbId, id)));
    console.log('interfaces:', interfaces)

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
                markInterface(comps, resSelector, interfaceTooltip);
            }
            bothSurfaces.push(...resSelector);
        }
        if (isSelfInterface) {
            const comps = componentIdsByPisaChainId[int.interface.molecule[0].chain_id].map(componentId => components[componentId])
            markInterface(comps, bothSurfaces, interfaceTooltip);
        }
    }
    return builder.getState();
}

export async function pisaInterfaceView(pdbId: string, interfaceId: string, options: { ghostMolecules?: (0 | 1)[] } = {}) {
    const assembliesData = await getAssembliesData(pdbId);
    const interfaceData = await getInterfaceData(pdbId, interfaceId);

    const allAssemblies = [
        ...assembliesData.pisa_results.asm_set.map(ass => ass.assembly),
        assembliesData.pisa_results.asu_complex.assembly,
    ];
    const componentColors = assignComponentColors(allAssemblies);
    const interfaceTooltip = `<br>Interface <b>${interfaceData.interface.molecule[0].chain_id}</b> &ndash; <b>${interfaceData.interface.molecule[1].chain_id}</b> (interface area ${Number(interfaceData.interface.int_area).toFixed(1)})`;

    const builder = MVSData.createBuilder();
    const data = loadStructureData(builder, pdbId);

    interfaceData.interface.molecule.forEach((molecule, i) => {
        const component = decodeChainId(molecule.chain_id);
        const color = componentColors[componentKey(molecule)] ?? DEFAULT_COMPONENT_COLOR;
        const struct = data
            .modelStructure()
            .transform(transformFromPisaStyle(molecule));
        struct.component().tooltip({ text: `<hr>Component <b>${molecule.chain_id} (${molecule.symop})</b>` });
        const componentSelector: ComponentExpressionT = { label_asym_id: component.chainId, label_seq_id: component.seqId }; // chain_id appears to be label_asym_id (if mmcif format)
        if (options.ghostMolecules?.includes(i as 0 | 1)) {
            const reprGhost = struct
                .component({ selector: componentSelector })
                .representation({
                    type: 'surface',
                    surface_type: 'gaussian',
                    size_factor: 1.25,
                    custom: {
                        molstar_representation_params: {
                            visuals: ["structure-gaussian-surface-mesh"],
                            xrayShaded: true,
                        }
                    },
                })
                .color({ color: color })
                .opacity({ opacity: .49 });
        } else {
            const repr = struct
                .component({ selector: componentSelector })
                .representation({
                    type: 'spacefill',
                    size_factor: component.isLigand ? 1.05 : 1, // distinguish ligands/waters from the main chain, in case of PDB format
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
            const residues = Array.isArray(molecule.residues.residue) ? molecule.residues.residue : [molecule.residues.residue];
            const interfaceResidues = residues.filter(r => Number(r.bsa) !== 0); // Secret undocumented knowledge
            const resSelector: ComponentExpressionT[] = interfaceResidues.map(r => ({ auth_seq_id: Number(r.seq_num), pdbx_PDB_ins_code: r.ins_code ?? undefined }));
            markInterface([{ struct, repr, color }], resSelector, interfaceTooltip);
        }
    });

    return builder.getState();
}


interface ComponentState { struct: Builder.Structure, repr: Builder.Representation, color: ColorT };

function markInterface(theComponents: ComponentState[], interfaceSelector: ComponentExpressionT[], tooltip: string) {
    for (const component of theComponents) {
        const interfaceColor = interfaceColorFn(component.color);
        component.repr.color({ selector: interfaceSelector, color: interfaceColor });
        component.struct.component({ selector: interfaceSelector }).tooltip({ text: tooltip });
    }
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
    const colors = {} as Record<string, ColorT>;
    let iColor = 0;
    for (const assembly of assemblies) {
        for (const molecule of assembly.molecule) {
            colors[componentKey(molecule)] ??= ManyDistinctColors[iColor++ % ManyDistinctColors.length];
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