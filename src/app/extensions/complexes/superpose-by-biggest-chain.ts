import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { MmcifFormat } from 'molstar/lib/mol-model-formats/structure/mmcif';
import { Structure } from 'molstar/lib/mol-model/structure';
import { SuperpositionResult } from './index';


/** Superpose structures based on the largest common component (measured the by number of residues) with a UniProt mapping (taken from atom_site mmCIF category).
 * Residue-residue correspondence is determined by UniProt residue numbers.
 * This differs from UniProt-based superposition in core Molstar (`alignAndSuperposeWithSIFTSMapping`) which takes all components (regardless of their spacial arrangement). */
export function superposeByBiggestCommonChain(structA: Structure, structB: Structure, allowedComponentsA: string[] | undefined, allowedComponentsB: string[] | undefined): SuperpositionResult | undefined {
    const indexA = extractUniprotIndex(structA, allowedComponentsA);
    const indexB = extractUniprotIndex(structB, allowedComponentsB);
    const bestMatch = bestUniprotMatch(indexA, indexB);
    if (!bestMatch) {
        return undefined;
    }
    const unitA = structA.unitMap.get(Number(bestMatch.unitA));
    const unitB = structB.unitMap.get(Number(bestMatch.unitB));
    const unitIndexA = indexA[bestMatch.accession][bestMatch.unitA];
    const unitIndexB = indexB[bestMatch.accession][bestMatch.unitB];
    const positionsA = MinimizeRmsd.Positions.empty(bestMatch.nMatchedElements);
    const positionsB = MinimizeRmsd.Positions.empty(bestMatch.nMatchedElements);

    let i = 0;
    for (const unpNum in unitIndexA.atomMap) {
        const iAtomB = unitIndexB.atomMap[unpNum];
        if (iAtomB === undefined) continue;
        const iAtomA = unitIndexA.atomMap[unpNum];
        positionsA.x[i] = unitA.conformation.coordinates.x[iAtomA];
        positionsA.y[i] = unitA.conformation.coordinates.y[iAtomA];
        positionsA.z[i] = unitA.conformation.coordinates.z[iAtomA];
        positionsB.x[i] = unitB.conformation.coordinates.x[iAtomB];
        positionsB.y[i] = unitB.conformation.coordinates.y[iAtomB];
        positionsB.z[i] = unitB.conformation.coordinates.z[iAtomB];
        i++;
    }
    const superposition = MinimizeRmsd.compute({ a: positionsA, b: positionsB });

    if (!isNaN(superposition.rmsd)) {
        return { ...superposition, nAlignedElements: bestMatch.nMatchedElements, method: 'uniprot-numbering', accession: bestMatch.accession };
        // TODO remove explicit nAlignedElements, once in core Molstar
    } else {
        return undefined;
    }
}


/** Uniprot index for specific accession in a structure */
interface SingleAccessionUniprotIndex {
    [unitId: string]: {
        label_asym_id: string,
        auth_asym_id: string,
        /** Maps Uniprot number to ElementIndex of the trace atom */
        atomMap: { [unpSeqId: string]: number },
    },
}

/** Index for all accessions in a structure */
interface UniprotIndex {
    [accession: string]: SingleAccessionUniprotIndex,
}

function extractUniprotIndex(structure: Structure, allowedAccessions: string[] | undefined): UniprotIndex {
    const allowedAccessionsSet = allowedAccessions ? new Set(allowedAccessions) : undefined;
    const seenUnitInvariantIds = new Set<number>();
    const out: UniprotIndex = {};
    for (const unit of structure.units) {
        if (seenUnitInvariantIds.has(unit.invariantId)) continue;
        else seenUnitInvariantIds.add(unit.invariantId);

        const src = structure.model.sourceData;
        if (!MmcifFormat.is(src)) throw new Error('Source data must be mmCIF/BCIF');

        const h = unit.model.atomicHierarchy;
        const { pdbx_sifts_xref_db_acc, pdbx_sifts_xref_db_name, pdbx_sifts_xref_db_num } = src.data.db.atom_site;
        const atoms = unit.polymerElements;
        const nAtoms = atoms.length;
        for (let i = 0; i < nAtoms; i++) {
            const iAtom = atoms[i];
            const srcIAtom = h.atomSourceIndex.value(iAtom);
            const dbName = pdbx_sifts_xref_db_name.value(srcIAtom);
            if (dbName !== 'UNP') continue;
            const dbAcc = pdbx_sifts_xref_db_acc.value(srcIAtom);
            if (allowedAccessionsSet && !allowedAccessionsSet.has(dbAcc)) continue;
            const dbNum = pdbx_sifts_xref_db_num.value(srcIAtom);
            const structMapping = out[dbAcc] ??= {};
            const chainMapping = structMapping[unit.id] ??= {
                label_asym_id: h.chains.label_asym_id.value(h.chainAtomSegments.index[atoms[0]]),
                auth_asym_id: h.chains.auth_asym_id.value(h.chainAtomSegments.index[atoms[0]]),
                atomMap: {},
            };
            chainMapping.atomMap[dbNum] ??= iAtom;
        }
    }
    return out;
}

export interface SortedAccessionsAndUnits<T extends object = object> {
    accessions: string[],
    units: { [accession: string]: ({ unitId: string, size: number } & T)[] },
}

/** Sort units for each accession by decreasing size and sort accessions by decreasing biggest unit size. */
function sortAccessionsAndUnits(uniprotIndex: UniprotIndex): SortedAccessionsAndUnits {
    const unitsByAccession: { [accession: string]: { unitId: string, size: number }[] } = {};

    for (const accession in uniprotIndex) {
        const unitIds = uniprotIndex[accession];
        const units: { unitId: string, size: number }[] = [];
        for (const unitId in unitIds) {
            const size = Object.keys(unitIds[unitId].atomMap).length;
            units.push({ unitId, size });
        }
        units.sort((a, b) => b.size - a.size);
        unitsByAccession[accession] = units;
    }

    return {
        /** Accessions sorted by decreasing biggest unit size */
        accessions: Object.keys(unitsByAccession).sort((a, b) => unitsByAccession[b][0].size - unitsByAccession[a][0].size),
        /** Units per accession, sorted by decreasing unit size */
        units: unitsByAccession,
    };
}

function bestUniprotMatch(a: UniprotIndex, b: UniprotIndex) {
    const sortedA = sortAccessionsAndUnits(a);
    const sortedB = sortAccessionsAndUnits(b);
    let bestMatch: { accession: string, unitA: string, unitB: string, nMatchedElements: number } | undefined = undefined;
    let bestScore = 0;
    for (const accession of sortedA.accessions) {
        const unitsA = sortedA.units[accession]!;
        const unitsB = sortedB.units[accession];
        if (!unitsB) continue;
        for (const ua of unitsA) {
            if (ua.size <= bestScore) break;
            const unitA = a[accession][ua.unitId];
            for (const ub of unitsB) {
                if (ub.size <= bestScore || ua.size <= bestScore) break;
                const unitB = b[accession][ub.unitId];
                const score = objectKeyOverlap(unitA.atomMap, unitB.atomMap);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { accession, unitA: ua.unitId, unitB: ub.unitId, nMatchedElements: score };
                }
            }
        }
    }
    return bestMatch;
}

/** Return number of keys common to objects `a` and `b` */
function objectKeyOverlap(a: object, b: object) {
    let overlap = 0;
    for (const key in a) {
        if (key in b) {
            overlap++;
        }
    }
    return overlap;
}
