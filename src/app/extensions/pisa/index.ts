import { loadMVS } from 'molstar/lib/extensions/mvs/load';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { ColorT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { chainIndex } from 'molstar/lib/mol-model/structure/structure/element/util';
import { PluginContext } from 'molstar/lib/mol-plugin/context';


const ManyDistinctColors: ColorT[] = [
    '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666',
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999',
    '#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'
];

export async function pisaDemo(plugin: PluginContext) {
    const dataAssembly1 = await (await fetch('/tmp/pisa/3gcb/assembly_1.json')).json()
    const dataInterface1 = await (await fetch('/tmp/pisa/3gcb/interfaces/interface_1.json')).json()
    // console.log(dataAssembly1)
    // console.log(dataInterface1)

    // Assembly 1: 6x8 molecules
    // Assembly 2: 2x8 molecules (big interface)
    // Assembly 3: 2x8 molecules (tiny interface)

    const builder = MVSData.createBuilder();
    const data = builder
        .download({ url: 'https://www.ebi.ac.uk/pdbe/entry-files/download/3gcb_updated.cif' })
        .parse({ format: 'mmcif' });
    const struct = data.modelStructure();

    // struct
    //   .component()
    //   .representation({ type: 'cartoon' });
    // struct
    //   .component({ selector: 'ligand' })
    //   .representation({ type: 'ball_and_stick' })
    //   .color({ color: 'blue' });
    // struct
    //   .component({ selector: 'ion' })
    //   .representation({ type: 'ball_and_stick' })
    //   .color({ color: 'red' });

    const iAssembly = 0;
    const assembly = dataAssembly1.pisa_results.asm_set[iAssembly].assembly;

    // console.log(assembly)

    let iColor = 0;

    // TODO add clear component descriptors to input data or find a way to decode cryptic chain_ids
    // e.g. 1gkt:
    // [BOC]B:400 = ligand BOC in chain B resi 400
    // B          = protein chain B resi 401-407 (excluding the [BOC]B:400 and waters)

    for (const m of assembly.molecule) {
        console.log('decodeChainId', m.chain_id, decodeChainId(m.chain_id))
        if (m.chain_id.startsWith('[')) {
            // e.g. '[SO4]A:1101' -> ligand, i cannot map this to label_asym_id, for now
            continue;
        }
        console.log('molecule', m)
        const labelAsymId = m.chain_id; // assuming this is auth_asym_id, TODO check (1bvy)
        // chain_id appears to be label_asym_id (if mmcif format)
        const color = ManyDistinctColors[(iColor++) % ManyDistinctColors.length];
        console.log(m.chain_id, color)
        data
            .modelStructure()
            .transform({
                rotation: [
                    Number(m.rxx), Number(m.ryx), Number(m.rzx),
                    Number(m.rxy), Number(m.ryy), Number(m.rzy),
                    Number(m.rxz), Number(m.ryz), Number(m.rzz),
                ],
                translation: [Number(m.tx), Number(m.ty), Number(m.tz)],
            })
            .component({ selector: { label_asym_id: labelAsymId } })
            .representation({ type: 'spacefill', size_factor: 1.0 })
            .color({ color: color })
            // .color({ color: 'red', selector: { label_seq_id: 10 } })
            .color({ selector: 'water', color: 'white' })
            .color({ selector: 'ligand', color: 'blue' })
            .color({ selector: 'ion', color: 'blue' });
    }
    const mvs = builder.getState();
    await loadMVS(plugin, mvs);

    // Comments:
    // - chain_id - is this label_asym_id or auth_asym_id or wtf?
    // - rxx, etc. - why are these strings and not numbers?
}

const RE_CHAIN_ID = /\[(\w+)\](\w+):(-?\d+)/;

/** Decode PISA-style "chainId", e.g. 'A', '[SO4]A:1101' */
function decodeChainId(pisaChainId: string): { chainId: string, compId: string | undefined, seqId: number | undefined } {
    const match = pisaChainId.match(RE_CHAIN_ID);
    if (match) {
        const compId = match[1];
        const chainId = match[2];
        const seqId = Number(match[3]) >= 0 ? Number(match[3]) : undefined; // label_seq_id=. for ligands in mmCIF gets formatted as -2147483648 :(
        return { chainId, compId, seqId };
    } else {
        return { chainId: pisaChainId, compId: undefined, seqId: undefined };
    }
}