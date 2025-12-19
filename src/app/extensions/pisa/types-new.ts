/** Format of assemblies.json */
export interface NewPisaAssembliesData {
    /** e.g. "pdb3hax" */
    session_name: string,
    /** e.g. "Ok" */
    status: string,
    status_description: any,
    status_note: any,
    n_pqs_sets: number,
    n_interfaces: number,
    /** e.g. "Stable" */
    assessment: string,
    /** e.g. 5 */
    multimeric_state: number,
    all_chains_at_identity: boolean,
    /** e.g. 2.11 */
    resolution: number,
    pqs_sets: {
        /** e.g. 1 */
        pqs_set_id: number,
        all_chains_at_identity: boolean,
        stability: any,
        complexes: NewPisaComplexRecord[],
    }[],
    asu_complex: {
        complex: NewPisaComplexRecord,
    },
}

export interface NewPisaComplexRecord {
    /** Unique identifier for this complex within the whole assemblies.json file, e.g. 1 */
    complex_key: number,
    /** Groups together complexes with identical composition, e.g. 1 */
    complex_type: number,
    /** Number of components, e.g. 17 */
    size: number,
    /** Number of macromolecular components, e.g. 5 */
    mmsize: number,
    /** e.g. 5 */
    freesize: number,
    /** e.g. "This assembly appears to be stable in solution." */
    stability_description: string,
    /** e.g. 27.836 */
    diss_energy: number,
    /** e.g. 89.28 */
    diss_energy_0: number,
    stable: boolean,
    /** Accessible Surface Area in Å², e.g. 30770.9 */
    asa: number,
    /** Buried Surface Area in Å², e.g. 14507.2 */
    bsa: number,
    /** e.g. 11.8 */
    entropy: number,
    /** e.g. 48.2 */
    entropy_0: number,
    /** e.g. 2404.5 */
    diss_area: number,
    /** e.g. -94.4 */
    int_energy: number,
    /** e.g. 5 */
    n_uc: number,
    /** e.g. 2 */
    n_diss: number,
    /** e.g. 1 */
    symmetry_number: number,
    /** e.g. "ABCDEa(2)b(2)cde(5)f" */
    formula: string,
    /** e.g. "ACDEF[PGE](2)[EDO](2)[ZN][PG4][MG](5)[FHU]" */
    composition: string,
    interfaces: {
        n_interfaces: number,
        interfaces: {
            interface_id: number,
            dissociates: boolean,
        }[],
    },
    molecules: NewPisaComplexMoleculeRecord[],
}

export interface NewPisaComplexMoleculeRecord {
    /** e.g. "A" */
    auth_asym_id: string,
    /** e.g. "A" */
    label_asym_id: string | null,
    /** e.g. "A" */
    visual_id: string,
    auth_seq_id_start: number,
    auth_seq_id_end: number,
    label_seq_id_start: number | null,
    label_seq_id_end: number | null,
    /** CCD compound code, in case this molecule is a ligand, e.g. "ZN", "EDO" */
    ccd_id: string | null,
    rxx: number,
    rxy: number,
    rxz: number,
    tx: number,
    ryx: number,
    ryy: number,
    ryz: number,
    ty: number,
    rzx: number,
    rzy: number,
    rzz: number,
    tz: number,
    rxx_f: number,
    rxy_f: number,
    rxz_f: number,
    tx_f: number,
    ryx_f: number,
    ryy_f: number,
    ryz_f: number,
    ty_f: number,
    rzx_f: number,
    rzy_f: number,
    rzz_f: number,
    tz_f: number,
    /** e.g. "1_555" */
    symmetry_id: string,
}


/** Format of interface_*.json */
export interface NewPisaInterfaceData {
    /** e.g. 1 */
    interface_id: number,
    /** e.g. 41 */
    n_interfaces: number,
    /** e.g. "Ok" */
    status: string,
    /** e.g. "3HAX" */
    pdb_id: string,
    interface: {
        /** e.g. 1 */
        int_type: number,
        /** e.g. 2 */
        n_occ: number,
        /** e.g. 1617.4 */
        int_area: number,
        /** e.g.  -23.0 */
        int_solv_energy: number,
        /** e.g. 0.66 */
        pvalue: number,
        /** e.g. -38.6 */
        stab_energy: number,
        /** e.g. 0.66 */
        css: number,
        /** e.g. "No" */
        overlap: string,
        x_rel: boolean,
        fixed: boolean,
        h_bonds: {
            n_bonds: number,
            bonds: NewPisaBondRecord[],
        },
        salt_bridges: {
            n_bonds: number,
            bonds: NewPisaBondRecord[],
        },
        ss_bonds: {
            n_bonds: number,
            bonds: NewPisaBondRecord[],
        },
        cov_bonds: {
            n_bonds: number,
            bonds: NewPisaBondRecord[],
        },
        other_bonds: {
            n_bonds: number,
            bonds: NewPisaBondRecord[],
        },
        /** Information about the two components forming the interface */
        molecules: [NewPisaInterfaceMoleculeRecord, NewPisaInterfaceMoleculeRecord],
    },
}

export interface NewPisaInterfaceMoleculeRecord {
    /** e.g. 1 */
    mol_id: number,
    /** e.g. "E" */
    auth_asym_id: string,
    /** e.g. "D" (null if input file was in PDB format) */
    label_asym_id: string | null,
    /** CCD compound code, in case this molecule is a ligand, e.g. "ZN", "EDO" */
    ccd_id: string | null,
    auth_seq_id_start: number,
    auth_seq_id_end: number,
    label_seq_id_start: number | null,
    label_seq_id_end: number | null,
    /** e.g. "RNA" */
    molecule_class: string,
    /** e.g. "1_555" */
    symmetry_id: string,
    /** e.g. 1 */
    symmetry_operation_number: number,
    /** e.g. "x,y,z" */
    symmetry_operation: string,
    cell_i: number,
    cell_j: number,
    cell_k: number,
    rxx: number,
    rxy: number,
    rxz: number,
    tx: number,
    ryx: number,
    ryy: number,
    ryz: number,
    ty: number,
    rzx: number,
    rzy: number,
    rzz: number,
    tz: number,
    /** e.g. 188 */
    int_natoms: number,
    /** e.g. 25 */
    int_nres: number,
    /** e.g. 1680.4 */
    int_area: number,
    /** e.g. -20.833 */
    int_solv_energy: number,
    /** e.g. 0.973 */
    pvalue: number,
    /** Information about all residues in the molecule (not only interface residues) */
    residues: {
        residues: NewPisaResidueRecord[],
    },
}

export interface NewPisaResidueRecord {
    /** e.g. 1 */
    residue_serial_number: number,
    /** e.g. "SER", "G" */
    auth_comp_id: string,
    auth_seq_id: number,
    label_seq_id: number | null,
    ins_code: string | null,
    bonds: any,
    /** Residue Accessible Surface Area in Å², e.g. 310.1 */
    asa: number,
    /** Residue Buries Surface Area in Å², e.g. 33.4 */
    bsa: number,
    /** Residue Solvation Energy in kcal/mol, e.g. 0.99 */
    solv_energy: number,
}

export interface NewPisaBondRecord {
    /** e.g. "E" */
    auth_asym_id_1: string,
    /** e.g. "D" (null if input file was in PDB format) */
    label_asym_id_1: string | null,
    orig_label_asym_id_1: any,
    /** e.g. "SER", "G" */
    auth_comp_id_1: string,
    auth_seq_id_1: number,
    label_seq_id_1: number | null,
    inscode_1: string | null,
    /** e.g. "N2" */
    auth_atom_id_1: string,
    /** e.g. "E" */
    auth_asym_id_2: string,
    /** e.g. "D" (null if input file was in PDB format) */
    label_asym_id_2: string | null,
    orig_label_asym_id_2: any,
    /** e.g. "SER", "G" */
    auth_comp_id_2: string,
    auth_seq_id_2: number,
    label_seq_id_2: number | null,
    inscode_2: string | null,
    /** e.g. "N2" */
    auth_atom_id_2: string,
    /** e.g. 2.844 */
    dist: number,
}

export interface NewPisaTransform {
    rxx: number,
    rxy: number,
    rxz: number,
    tx: number,
    ryx: number,
    ryy: number,
    ryz: number,
    ty: number,
    rzx: number,
    rzy: number,
    rzz: number,
    tz: number,
}
