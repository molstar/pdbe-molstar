type StringShouldBeNumber = string
type StringShouldBeBoolean = 'Yes' | 'No'

export interface PisaAssemblyRecord {
    "serial_no": StringShouldBeNumber,
    "id": string,
    "size": StringShouldBeNumber,
    "mmsize": StringShouldBeNumber,
    "freesize": StringShouldBeNumber,
    "score": "This assembly appears to be stable in solution.",
    "diss_energy": StringShouldBeNumber,
    "diss_energy_0": StringShouldBeNumber,
    "asa": StringShouldBeNumber,
    "bsa": StringShouldBeNumber,
    "entropy": StringShouldBeNumber,
    "entropy_0": StringShouldBeNumber,
    "diss_area": StringShouldBeNumber,
    "int_energy": StringShouldBeNumber,
    "n_uc": StringShouldBeNumber,
    "n_diss": StringShouldBeNumber,
    "symNumber": StringShouldBeNumber,
    /** e.g. "A(6)a(30)b(12)" */
    "formula": string,
    /** e.g. "A(6)[SO4](30)[GOL](12)" */
    "composition": string,
    "interfaces": {
        "n_interfaces": StringShouldBeNumber,
        "interface": {
            "id": string,
            "dissociates": StringShouldBeBoolean,
        }[],
    },
    "molecule": {
        /** e.g. "A", "[SO4]A:1101" */
        "chain_id": string,
        /** e.g. "A" */
        "visual_id": string,
        "rxx": StringShouldBeNumber,
        "rxy": StringShouldBeNumber,
        "rxz": StringShouldBeNumber,
        "tx": StringShouldBeNumber,
        "ryx": StringShouldBeNumber,
        "ryy": StringShouldBeNumber,
        "ryz": StringShouldBeNumber,
        "ty": StringShouldBeNumber,
        "rzx": StringShouldBeNumber,
        "rzy": StringShouldBeNumber,
        "rzz": StringShouldBeNumber,
        "tz": StringShouldBeNumber,
        "rxx-f": StringShouldBeNumber,
        "rxy-f": StringShouldBeNumber,
        "rxz-f": StringShouldBeNumber,
        "tx-f": StringShouldBeNumber,
        "ryx-f": StringShouldBeNumber,
        "ryy-f": StringShouldBeNumber,
        "ryz-f": StringShouldBeNumber,
        "ty-f": StringShouldBeNumber,
        "rzx-f": StringShouldBeNumber,
        "rzy-f": StringShouldBeNumber,
        "rzz-f": StringShouldBeNumber,
        "tz-f": StringShouldBeNumber,
        /** e.g. "1_555" */
        "symId": string,
    }[],
}

export interface PisaBondRecord {
    "chain-1": string,
    "label_asym_id-1": string,
    "orig_label_asym_id-1": any | null,
    "pdbx_sifts_xref_db_num-1": any | null,
    "pdbx_sifts_xref_db_name-1": any | null,
    "pdbx_sifts_xref_db_acc-1": any | null,
    "res-1": string,
    "seqnum-1": StringShouldBeNumber,
    "label_seqnum-1": StringShouldBeNumber,
    "inscode-1": string | null,
    "atname-1": string,
    "chain-2": string,
    "label_asym_id-2": string,
    "orig_label_asym_id-2": any | null,
    "pdbx_sifts_xref_db_acc-2": any | null,
    "pdbx_sifts_xref_db_num-2": any | null,
    "pdbx_sifts_xref_db_name-2": any | null,
    "res-2": string,
    "seqnum-2": StringShouldBeNumber,
    "label_seqnum-2": StringShouldBeNumber,
    "inscode-2": string | null,
    "atname-2": string,
    "dist": StringShouldBeNumber,
}

export interface PisaResidueRecord {
    /** e.g. "1" */
    "ser_no": string,
    /** e.g. "ALA" */
    "name": string,
    /** e.g. "-4" */
    "seq_num": StringShouldBeNumber,
    /** e.g. "13" */
    "label_seq_num": StringShouldBeNumber,
    "ins_code": string | null,
    "bonds": any | null,
    "asa": StringShouldBeNumber,
    "bsa": StringShouldBeNumber,
    "solv_en": StringShouldBeNumber,
}

interface PisaMoleculeRecord {
    /** e.g. "1" */
    "id": string,
    /** e.g. "A" */
    "chain_id": string,
    /** e.g. "Protein" */
    "class": string,
    /** e.g. "1" */
    "symop_no": StringShouldBeNumber,
    /** e.g. "x,y,z" */
    "symop": string,
    /** e.g. "0" */
    "cell_i": StringShouldBeNumber,
    "cell_j": StringShouldBeNumber,
    "cell_k": StringShouldBeNumber,
    "rxx": StringShouldBeNumber,
    "rxy": StringShouldBeNumber,
    "rxz": StringShouldBeNumber,
    "tx": StringShouldBeNumber,
    "ryx": StringShouldBeNumber,
    "ryy": StringShouldBeNumber,
    "ryz": StringShouldBeNumber,
    "ty": StringShouldBeNumber,
    "rzx": StringShouldBeNumber,
    "rzy": StringShouldBeNumber,
    "rzz": StringShouldBeNumber,
    "tz": StringShouldBeNumber,
    "int_natoms": StringShouldBeNumber,
    "int_nres": StringShouldBeNumber,
    "int_area": StringShouldBeNumber,
    "int_solv_en": StringShouldBeNumber,
    "pvalue": StringShouldBeNumber,
    "residues": {
        "residue": PisaResidueRecord | PisaResidueRecord[],
    },
}


export interface PisaAssembliesData {
    "pisa_results": {
        "name": string,
        "status": string,
        "total_asm": StringShouldBeNumber,
        "assessment": string,
        "multimeric_state": StringShouldBeNumber,
        "all_chains_at_identity": StringShouldBeBoolean,
        "asm_set": {
            "ser_no": string,
            "all_chains_at_identity": StringShouldBeBoolean,
            "assembly": PisaAssemblyRecord,
        }[],
        "asu_complex": {
            "assembly": PisaAssemblyRecord,
        },
    },
}


export interface PisaInterfaceData {
    /** e.g. "1" */
    "interface_id": string,
    "n_interfaces": StringShouldBeNumber,
    /** e.g. "Ok" */
    "status": string,
    /** e.g. "3GCB" */
    "pdb_id": string,
    "interface": {
        "type": StringShouldBeNumber,
        "n_occ": StringShouldBeNumber,
        "int_area": StringShouldBeNumber,
        "int_solv_en": StringShouldBeNumber,
        "pvalue": StringShouldBeNumber,
        "stab_en": StringShouldBeNumber,
        "css": StringShouldBeNumber,
        "overlap": StringShouldBeBoolean,
        "x-rel": StringShouldBeBoolean,
        "fixed": StringShouldBeBoolean,
        "h-bonds": {
            "n_bonds": StringShouldBeNumber,
            "bond"?: PisaBondRecord[],
        },
        "salt-bridges": {
            "n_bonds": StringShouldBeNumber,
            "bond"?: PisaBondRecord[],
        },
        "ss-bonds": {
            "n_bonds": StringShouldBeNumber,
            "bond"?: PisaBondRecord[],
        },
        "cov-bonds": {
            "n_bonds": StringShouldBeNumber,
            "bond"?: PisaBondRecord[],
        },
        "other-bonds": {
            "n_bonds": StringShouldBeNumber,
            "bond"?: PisaBondRecord[],
        },
        "molecule": [PisaMoleculeRecord, PisaMoleculeRecord],
    },
}

export interface PisaTransform {
    "rxx": StringShouldBeNumber,
    "rxy": StringShouldBeNumber,
    "rxz": StringShouldBeNumber,
    "tx": StringShouldBeNumber,
    "ryx": StringShouldBeNumber,
    "ryy": StringShouldBeNumber,
    "ryz": StringShouldBeNumber,
    "ty": StringShouldBeNumber,
    "rzx": StringShouldBeNumber,
    "rzy": StringShouldBeNumber,
    "rzz": StringShouldBeNumber,
    "tz": StringShouldBeNumber,
}
