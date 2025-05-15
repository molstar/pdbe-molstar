import { ColorT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Interaction } from './index';


/** Data type server by API https://www.ebi.ac.uk/pdbe/graph-api/pdb/bound_ligand_interactions/1tqn/A/508 */
interface InteractionsApiData {
    [pdbId: string]: {
        interactions: {
            end: {
                /** e.g. 'CZ' */
                atom_names: string[],
                author_insertion_code?: string,
                author_residue_number: number,
                /** auth_asym_id */
                chain_id: string,
                chem_comp_id: string,
            },
            distance: number,
            /** e.g. 'AMIDERING', 'CARBONPI', 'DONORPI', 'carbonyl', 'covalent', 'hbond', 'hydrophobic', 'metal_complex', 'polar', 'vdw', 'vdw_clash', 'weak_hbond', 'weak_polar'... */
            interaction_details: string[],
            /** e.g.'atom-atom' */
            interaction_type: string,
            /** e.g. 'C11' */
            ligand_atoms: string[],
        }[],
        ligand: {
            author_insertion_code?: string,
            author_residue_number: number,
            /** auth_asym_id */
            chain_id: string,
            chem_comp_id: string,
        },
    }[],
}

const InteractionTypeColors: Record<string, ColorT> = {
    'AMIDERING': 'red',
    'CARBONPI': 'magenta',
    'DONORPI': 'magenta',
    'carbonyl': '#ffffff',
    'covalent': '#ffffff',
    'hbond': '#00ffff',
    'hydrophobic': 'yellow',
    'metal_complex': '#00ff00',
    'polar': '#0000ff',
    'vdw': '#ffffff',
    'vdw_clash': 'red',
    'weak_hbond': '#00aaaa',
    'weak_polar': '#0000aa',

    '_DEFAULT_': 'gray',
    '_MIXED_': 'gray',
    // TODO collect all possible values and decide on colors, this is non-exhaustive list with random colors
} as const;


export async function getInteractionApiData(params: { pdbId: string, authAsymId: string, authSeqId: number, pdbeBaseUrl: string }): Promise<InteractionsApiData> {
    const pdbeBaseUrl = params.pdbeBaseUrl.replace(/\/$/, '');
    const url = `${pdbeBaseUrl}/graph-api/pdb/bound_ligand_interactions/${params.pdbId}/${params.authAsymId}/${params.authSeqId}`;
    const response = await fetch(url);
    if (response.status === 404) return {};
    if (!response.ok) throw new Error(`Failed to fetch atom interaction data from ${url}`);
    return await response.json();
}

export function interactionsFromApiData(data: InteractionsApiData, pdbId: string): Interaction[] {
    const out: Interaction[] = [];
    for (const { interactions, ligand } of data[pdbId] ?? []) {
        for (const int of interactions) {
            const details = int.interaction_details;
            const color = details.length === 1 ? (InteractionTypeColors[details[0]] ?? InteractionTypeColors._DEFAULT_) : InteractionTypeColors._MIXED_;
            const tooltipHeader = details.length === 1 ? `<strong>${formatInteractionType(details[0])} interaction</strong>` : `<strong>Mixed interaction</strong><br>${details.map(formatInteractionType).join(', ')}`;
            const tooltipPartner1 = `${ligand.chem_comp_id} ${ligand.author_residue_number}${ligand.author_insertion_code?.trim() ?? ''} | ${int.ligand_atoms.join(', ')}`;
            const tooltipPartner2 = `${int.end.chem_comp_id} ${int.end.author_residue_number}${int.end.author_insertion_code?.trim() ?? ''} | ${int.end.atom_names.join(', ')}`;
            const tooltip = `${tooltipHeader}<br>${tooltipPartner1} — ${tooltipPartner2}`;

            out.push({
                start: {
                    auth_asym_id: ligand.chain_id,
                    auth_seq_id: ligand.author_residue_number,
                    auth_ins_code_id: normalizeInsertionCode(ligand.author_insertion_code),
                    atoms: int.ligand_atoms,
                },
                end: {
                    auth_asym_id: int.end.chain_id,
                    auth_seq_id: int.end.author_residue_number,
                    auth_ins_code_id: normalizeInsertionCode(int.end.author_insertion_code),
                    atoms: int.end.atom_names,
                },
                color,
                tooltip,
            });
        }
    }
    return out;
}

/** Deal with special cases where ' ' or '' means undefined */
function normalizeInsertionCode(insCode: string | undefined): string | undefined {
    if (insCode?.trim()) return insCode;
    else return undefined;
}

function formatInteractionType(type: string): string {
    // TODO present interaction types in a nicer way ('DONORPI' or 'Vdw clash' looks ugly)
    return type.replace('_', ' ').replace(/^\w/g, c => c.toUpperCase());
}
