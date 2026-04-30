export interface BindingSitesApiResponseData {
    [uniprotId: string]: BindingSitesData,
}

export interface BindingSitesData {
    [bindingSiteId: string]: {
        /** Uniprot residue numbers of the binding site */
        "uniprot_residues": Array<number>,
        "ligands": Array<{
            /** PDB ID, e.g. '3ln0' */
            "entry_id": string,
            /** Bound molecule ID, e.g. 'bm3' */
            "bm_id": string,
            /** @TBC Ligand identifier (can be chem comp ID, but not necessarily (e.g. CLCs), e.g. 'HEM' */
            "ligand_id": string,
            "chem_comps": Array<{
                "entity_id": number,
                "auth_asym_id": string,
                "auth_seq_id": number,
                "pdb_ins_code": string | null,
                "label_asym_id": string,
                "label_comp_id": string,
                "sym_op": string | null,
            }>,
            // SUGGESTED FIELDS:
            // "ligand_label_asym_id": "H",
            // "ligand_auth_asym_id": "A",
            // "ligand_instance_id": "2"
        }>,
    },
}

export type ChemCompClusterApiResponseData = {
    "cluster_type": "HIERARCHY",
} & {
    [uniprotId: string]: ChemCompClusterData,
};

export interface ChemCompClusterData {
    [pdbId: string]: Array<{
        "entity_id": number,
        "auth_asym_id": string,
        "auth_seq_id": number,
        /** Insertion code, e.g. ' ' */
        "pdb_ins_code": string,
        "label_asym_id": string,
        "label_comp_id": string,
        /** Symmetry-renamed chain suffix, e.g. '', '_2' */
        "sym_op": string | null,
        /** @TBC Binding site ID, e.g. 1 */
        "cluster_id": number,
    }>,
}


export interface BoundMoleculesApiResponseData {
    [pdbId: string]: Array<{
        /** Bound molecule ID, e.g. 'bm1' */
        "bm_id": string,
        "composition": {
            "ligands": Array<{
                /** auth_asym_id */
                "chain_id": string,
                "author_residue_number": number,
                "chem_comp_id": string,
                /** Insertion code, e.g. ' ' */
                "author_insertion_code": string,
                "entity": number,
                /** E.g. "Carbohydrate-polymer" | "Bound" */
                "molecule_type": string,
            }>,
            /** E.g. Connections between residues, in case of branched sugars and CLCs, e.g. [["E1", "E2"], ["E2", "E3"]] */
            "connections": [string, string][],
        },
    }>,
}
