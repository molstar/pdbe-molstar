/** Helper functions to allow visualizing Foldseek results and superposing them on the query structure */

import { Mat4 } from 'Molstar/mol-math/linear-algebra';
import { MinimizeRmsd } from 'Molstar/mol-math/linear-algebra/3d/minimize-rmsd';
import { ElementIndex, ResidueIndex, Structure } from 'Molstar/mol-model/structure';
import { PDBeMolstarPlugin } from '..';
import { transform } from '../superposition';


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

/** Load target structure as defined by `apiData`
 * and superpose it on the already loaded query structure. */
export async function loadFoldseekSuperposition(viewer: PDBeMolstarPlugin, targetStructId: string, apiData: FoldseekApiData, targetColor: string = '#00ff00'): Promise<{ rmsd: number, nAligned: number, bTransform: Mat4 }> {
    const Q_STRUCT_ID = 'main';

    // Load target structure
    let tEntryId: string;
    let tAuthAsymId: string;
    if (apiData.database === 'pdb') {
        [tEntryId, tAuthAsymId] = apiData.target.split('_');
        const pdbeUrl = viewer.initParams.pdbeUrl.replace(/\/$/, '');
        // const url = `${pdbeUrl}/entry-files/download/${tEntryId}_updated.cif`;
        const url = `${pdbeUrl}/model-server/v1/${tEntryId}/atoms?auth_asym_id=${tAuthAsymId}`;
        await viewer.load({ url, format: 'mmcif', isBinary: false, id: targetStructId }, false);
    } else if (apiData.database === 'afdb') {
        // TODO assign tEntryId, tAuthAsymId and download structure from AFDB
        throw new Error('NotImplementedError');
    } else {
        throw new Error(`Unknown database: ${apiData.database}`);
    }

    // Retrieve structure data
    const qStructure = viewer.getStructure(Q_STRUCT_ID)?.cell.obj?.data;
    const tStructure = viewer.getStructure(targetStructId)?.cell.obj?.data;
    if (!qStructure) throw new Error('Query structure not loaded');
    if (!tStructure) throw new Error('Target structure not loaded');

    // Decipher Foldseek alignment and produce transformation matrix
    const [qMatchedIndicesInChain, tMatchedIndicesInChain] = getMatchedResidues(apiData.qstart - 1, apiData.qaln, apiData.tstart - 1, apiData.taln); // subtracting 1 to get 0-based indices
    const qLabelAsymId = 'A'; // TODO is this a valid assumption?
    const tLabelAsymId = auth_asym_id_to_label_asym_id(tStructure, tAuthAsymId);
    const qCoords = getCoordsForResiduesInChain(qStructure, qMatchedIndicesInChain, qLabelAsymId);
    const tCoords = getCoordsForResiduesInChain(tStructure, tMatchedIndicesInChain, tLabelAsymId);
    const superposition = MinimizeRmsd.compute({ a: qCoords, b: tCoords });

    // Transform, color, focus
    await transform(viewer.plugin, viewer.getStructure(targetStructId)!.cell, superposition.bTransform);
    await viewer.visual.select({ data: [{ color: targetColor }], structureId: targetStructId }); // color target
    await viewer.visual.reset({ camera: true });
    return { ...superposition, nAligned: qMatchedIndicesInChain.length };
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

function auth_asym_id_to_label_asym_id(struct: Structure, auth_asym_id: string): string {
    const entities = struct.model.entities.data;
    const nEntities = entities._rowCount;
    const chains = struct.model.atomicHierarchy.chains;
    const nChains = chains._rowCount;
    const polymerEntityIds = new Set<string>();
    for (let i = 0; i < nEntities; i++) {
        if (entities.type.value(i) === 'polymer') {
            polymerEntityIds.add(entities.id.value(i));
        }
    }
    for (let i = 0; i < nChains; i++) {
        if (chains.auth_asym_id.value(i) === auth_asym_id && polymerEntityIds.has(chains.label_entity_id.value(i))) {
            return chains.label_asym_id.value(i);
        }
    }
    throw new Error(`There is no polymer chain with auth_asym_id ${auth_asym_id}.`);
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
            const label_seq_id = hier.residues.label_seq_id.value(iRes);
            throw new Error(`C alpha not found for residue ${label_seq_id}.`);
        }
        coords.x[i] = conf.x[theAtom];
        coords.y[i] = conf.y[theAtom];
        coords.z[i] = conf.z[theAtom];
    }
    return coords;
}
