import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { Representation, Structure } from 'molstar/lib/extensions/mvs/tree/mvs/mvs-builder';
import { ColorT, ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { Color } from 'molstar/lib/mol-util/color';
import { normalizeColor } from '../../helpers';
import { PisaAssembliesData, PisaInterfaceData } from './types';


const ManyDistinctColors: ColorT[] = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d',
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf',
    '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494',
];

async function getAssembliesData(pdbId: string): Promise<PisaAssembliesData> {
    return await (await fetch(`/tmp/pisa/${pdbId}/assembly.json`)).json();
}
async function getInterfaceData(pdbId: string, interfaceId: string): Promise<PisaInterfaceData> {
    return await (await fetch(`/tmp/pisa/${pdbId}/interfaces/interface_${interfaceId}.json`)).json();
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
    // const data = builder.download({ url: 'https://www.ebi.ac.uk/pdbe/entry-files/download/3gcb_updated.cif' }).parse({ format: 'mmcif' });
    const data = builder.download({ url: 'https://www.ebi.ac.uk/pdbe/entry-files/download/pdb3gcb.ent' }).parse({ format: 'pdb' });

    let iColor = 0;

    const componentIdsByPisaChainId: { [pisaChainId: string]: string[] } = {};
    const components: { [visualId: string]: { struct: Structure, repr: Representation, color: ColorT } } = {};

    for (const m of assembly.molecule) {
        const component = decodeChainId(m.chain_id);
        // console.log('component', m.chain_id, component)
        const color = ManyDistinctColors[iColor++ % ManyDistinctColors.length];
        const struct = data
            .modelStructure()
            .transform({
                rotation: [
                    Number(m.rxx), Number(m.ryx), Number(m.rzx),
                    Number(m.rxy), Number(m.ryy), Number(m.rzy),
                    Number(m.rxz), Number(m.ryz), Number(m.rzz),
                ],
                translation: [Number(m.tx), Number(m.ty), Number(m.tz)],
            });
        struct.component().tooltip({ text: `<hr>Component <b>${m.chain_id} (${m.symId})</b>` });
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
        const componentId = `${m.chain_id} (${m.symId})`;
        (componentIdsByPisaChainId[m.chain_id] ??= []).push(componentId);
        components[componentId] = { struct, repr, color };
    }
    console.log('visualsIdsByPisaChainId', componentIdsByPisaChainId)
    console.log('visuals', components)

    const interfaceIds = assembly.interfaces.interface.map(int => int.id);
    console.log('interfaceIds:', interfaceIds)
    const interfaces = await Promise.all(interfaceIds.map(id => getInterfaceData(pdbId, id)));
    console.log('interfaces:', interfaces)

    for (const int of interfaces) {
        console.log(`Interface ${int.interface_id}:`, int.interface.molecule[0].chain_id.padEnd(11, ' '), int.interface.molecule[1].chain_id.padEnd(11, ' '), int.interface.int_area, int.interface.molecule[0].residues.residue)
        const isSelfInterface = int.interface.molecule[0].chain_id === int.interface.molecule[1].chain_id;
        const distinctMolecules = isSelfInterface ? [int.interface.molecule[0]] : int.interface.molecule; // Is this correct approach???
        for (const molecule of distinctMolecules) {
            const residues = Array.isArray(molecule.residues.residue) ? molecule.residues.residue : [molecule.residues.residue];

            const interfaceResidues = residues.filter(r => Number(r.bsa) !== 0); // Secret undocumented knowledge

            const resSelector: ComponentExpressionT[] = interfaceResidues.map(r => ({ auth_seq_id: Number(r.seq_num), pdbx_PDB_ins_code: r.ins_code ?? undefined }));
            const componentIds = componentIdsByPisaChainId[molecule.chain_id];
            console.log(`  Molecule ${molecule.chain_id}`, componentIds, residues, resSelector)
            for (const res of interfaceResidues) {
                console.log(`    Residue`, res.seq_num, res.bonds, res.solv_en)
            }
            for (const componentId of componentIds) {
                const component = components[componentId];
                const interfaceColor = interfaceColorFn(component.color);
                component.repr.color({ selector: resSelector, color: interfaceColor });
                component.struct.component({ selector: resSelector }).tooltip({ text: `<br>Interface <b>${int.interface.molecule[0].chain_id}</b> &ndash; <b>${int.interface.molecule[1].chain_id}</b> (interface area ${Number(int.interface.int_area).toFixed(1)})` });
            }
        }
    }

    const mvs = builder.getState();
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

/** Convert T|T[] into T[] */
function array<T>(maybeArray: T[]): T[];
// function array<T>(maybeArray: T): T[];
function array<T extends Exclude<unknown, any[]>>(maybeArray: T): T[];
function array(maybeArray: any) {
    if (Array.isArray(maybeArray)) return maybeArray;
    else return [maybeArray];
}
const x = array([1])

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