import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { ElementIndex, ResidueIndex, Structure } from 'molstar/lib/mol-model/structure';
import { PDBeMolstarPlugin } from '.';
// import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
// import { superpose } from 'molstar/lib/mol-model/structure/structure/util/superposition';
// import { QueryParam } from './helpers';


export interface FoldseekApiData {
    query: string,
    target: string,
    qstart: number,
    qend: number,
    tstart: number,
    tend: number,
    qaln: string,
    taln: string,
    database: 'pdb' | 'afdb',
}

export async function loadFoldseekSuperposition(viewer: PDBeMolstarPlugin, apiData: FoldseekApiData): Promise<MinimizeRmsd.Result> {
    const Q_STRUCT_INDEX = 0;
    const T_STRUCT_INDEX = 1;

    if (viewer.plugin.managers.structure.hierarchy.current.structures.length > 1) {
        await viewer.deleteStructure(T_STRUCT_INDEX + 1); // remove previous target structure
    }
    const qChainId = 'A'; // TODO is this sufficient to get chain ID? probably not
    let tEntryId: string;
    let tChainId: string;
    if (apiData.database === 'pdb') {
        [tEntryId, tChainId] = apiData.target.split('_');
        // TODO is this sufficient to get chain ID?
        // TODO check if this chain ID is label_asym_id or auth_asym_id!!!!
        const pdbeUrl = viewer.initParams.pdbeUrl.replace(/\/$/, '');
        // const url = `${pdbeUrl}/entry-files/download/${tEntryId}_updated.cif`;
        const url = `${pdbeUrl}/model-server/v1/${tEntryId}/atoms?label_asym_id=${tChainId}`; // assuming chain ID is label_asym_id
        await viewer.load({ url, format: 'mmcif', isBinary: false }, false);
    } else if (apiData.database === 'afdb') {
        // TODO assign tEntryId, T_CHAIN_ID download structure from AFDB
        throw new Error('NotImplementedError');
    } else {
        throw new Error(`Unknown database: ${apiData.database}`);
    }

    const [qMatchedIndicesInChain, tMatchedIndicesInChain] = getMatchedResidues(apiData.qstart - 1, apiData.qaln, apiData.tstart - 1, apiData.taln); // subtracting 1 to get 0-based indices

    const qStructure = viewer.plugin.managers.structure.hierarchy.current.structures[Q_STRUCT_INDEX].cell.obj?.data;
    const tStructure = viewer.plugin.managers.structure.hierarchy.current.structures[T_STRUCT_INDEX].cell.obj?.data;
    if (!qStructure) throw new Error('Query structure not loaded');
    if (!tStructure) throw new Error('Target structure not loaded');

    const qCoords = getCoordsForResiduesInChain(qStructure, qMatchedIndicesInChain, qChainId);
    const tCoords = getCoordsForResiduesInChain(tStructure, tMatchedIndicesInChain, tChainId);
    const superposition = MinimizeRmsd.compute({ a: qCoords, b: tCoords });

    await viewer.transformStructure(T_STRUCT_INDEX + 1, superposition.bTransform);
    await viewer.visual.select({ data: [{ color: '#00ff00' }], structureNumber: T_STRUCT_INDEX + 1 }); // color target
    await viewer.visual.reset({ camera: true });
    return superposition;
    // TODO check what will happen if there are alt locations (multiple CAs)
}

function getMatchedResidues(qstart: number, qaln: string, tstart: number, taln: string) {
    if (qaln.length !== taln.length) {
        throw new Error('Length of qaln and taln must be the same');
    }
    const n = qaln.length;
    let q = qstart;
    let t = tstart;
    const qResis = [];
    const tResis = [];
    for (let i = 0; i < n; i++) {
        if (qaln[i] === '-') {
            // gap in query
            t++;
        } else if (taln[i] === '-') {
            // gap in target
            q++;
        } else {
            // match
            qResis.push(q);
            tResis.push(t);
            t++;
            q++;
        }
    }
    return [qResis, tResis];
}

function getCoordsForResiduesInChain(structure: Structure, residueIndicesInChain: number[], label_asym_id: string) {
    const resRangeForChain = residueIndexRangeForChain(structure, label_asym_id);
    const residueIndices = residueIndicesInChain.map(i => resRangeForChain.start + i as ResidueIndex);
    if (residueIndices[residueIndices.length - 1] >= resRangeForChain.end) throw new Error('Residues out of range');
    const coords = getCACoordsForResidues(structure, residueIndices);
    return coords;
}

function residueIndexRangeForChain(struct: Structure, label_asym_id: string): { start: ResidueIndex, end: ResidueIndex } {
    const h = struct.model.atomicHierarchy;
    const iChain = Array.from(h.chains.label_asym_id.toArray()).indexOf(label_asym_id);
    const fromAtom = h.chainAtomSegments.offsets[iChain];
    const toAtom = h.chainAtomSegments.offsets[iChain + 1];
    const fromResidue = h.residueAtomSegments.index[fromAtom];
    const toResidue = h.residueAtomSegments.index[toAtom - 1] + 1 as ResidueIndex;
    return { start: fromResidue, end: toResidue };
}

function getCACoordsForResidues(struct: Structure, residueIndices: ResidueIndex[]) {
    const hier = struct.model.atomicHierarchy;
    const conf = struct.model.atomicConformation;
    const n = residueIndices.length;
    const coords = MinimizeRmsd.Positions.empty(n);
    for (let i = 0; i < n; i++) {
        const iRes = residueIndices[i];
        const fromAtom = hier.residueAtomSegments.offsets[iRes];
        const toAtom = hier.residueAtomSegments.offsets[iRes + 1];
        let theAtom: ElementIndex = -1 as ElementIndex;
        for (let iAtom = fromAtom; iAtom < toAtom; iAtom++) {
            const atomName = hier.atoms.label_atom_id.value(iAtom);
            if (atomName === 'CA') {
                theAtom = iAtom;
                break;
            }
        }
        if (theAtom === -1) {
            throw new Error('The world is dooomed!!! C alpha not found.')
        }
        coords.x[i] = conf.x[theAtom];
        coords.y[i] = conf.y[theAtom];
        coords.z[i] = conf.z[theAtom];
    }
    return coords;
}

// function getTransformFromAlignment(viewer: PDBeMolstarPlugin, target: { structureNumber: number, chain: string, seq_ids: number[] }, mobile: { structureNumber: number, chain: string, seq_ids: number[] }) {
//     if (target.seq_ids.length !== mobile.seq_ids.length) {
//         throw new Error('Number of target and mobile residues must be the same');
//     }
//     // const targetSelections: QueryParam[] = [{ struct_asym_id: target.chain, atoms: ['CA'] }]
//     const targetSelections: QueryParam[] = target.seq_ids.map(resi => ({ struct_asym_id: target.chain, residue_number: resi, atoms: ['CA'] }));
//     const targetLoci = viewer.getLociForParams(targetSelections, target.structureNumber);
//     if (targetLoci.kind === 'empty-loci') return { rmsd: NaN, bTransform: Mat4.identity() };

//     // const mobileSelections: QueryParam[] = [{ struct_asym_id: mobile.chain, atoms: ['CA'] }]
//     const mobileSelections: QueryParam[] = mobile.seq_ids.map(resi => ({ struct_asym_id: mobile.chain, residue_number: resi, atoms: ['CA'] }));
//     const mobileLoci = viewer.getLociForParams(mobileSelections, mobile.structureNumber);
//     if (mobileLoci.kind === 'empty-loci') return { rmsd: NaN, bTransform: Mat4.identity() };

//     const { rmsd, bTransform } = superpose([targetLoci, mobileLoci])[0];
//     console.log('loci:', targetLoci, mobileLoci);
//     console.log('transform:', rmsd, bTransform);
//     return { rmsd, bTransform };
// }
