import { OrderedSet, SortedArray } from 'molstar/lib/mol-data/int';
import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { align, AlignmentOptions } from 'molstar/lib/mol-model/sequence/alignment/alignment';
import { ElementIndex, Structure, StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import { UnitIndex } from 'molstar/lib/mol-model/structure/structure/element/util';
import { getPositionTable } from 'molstar/lib/mol-model/structure/structure/util/superposition';
import { QueryHelper, QueryParam } from '../../helpers';
import { _MinimizeRmsdResult } from './index';
import { SortedAccessionsAndUnits } from './superpose-by-biggest-chain';


export function superposeBySequenceAlignment(structA: Structure, structB: Structure, mappingsA: { [accession: string]: QueryParam[] }, mappingsB: { [accession: string]: QueryParam[] }): _MinimizeRmsdResult | undefined {
    const sortedA = sortAccessionsAndUnits(structA, mappingsA);
    const sortedB = sortAccessionsAndUnits(structB, mappingsB);
    const bestMatch = bestMappingMatch(sortedA, sortedB);
    if (!bestMatch) {
        return undefined;
    }
    const accession = bestMatch.accession;
    const lociA = QueryHelper.getInteractivityLoci(mappingsA[accession], structA);
    const lociB = QueryHelper.getInteractivityLoci(mappingsB[accession], structB);
    const superposition = alignAndSuperpose(lociA, lociB);
    if (!isNaN(superposition.rmsd)) {
        return superposition;
    } else {
        return undefined;
    }
}

/** Sort units for each accession by decreasing size and sort accessions by decreasing biggest unit size. */
function sortAccessionsAndUnits(struct: Structure, mappings: { [accession: string]: QueryParam[] }): SortedAccessionsAndUnits<{ elements: SortedArray<ElementIndex> }> {
    const unitsByAccession: { [accession: string]: { unitId: string, size: number, elements: SortedArray<ElementIndex> }[] } = {};

    for (const accession in mappings) {
        const loci = QueryHelper.getInteractivityLoci(mappings[accession], struct);
        const units: (typeof unitsByAccession)[string] = [];
        for (const u of loci.elements) {
            const unitId = u.unit.id.toString();
            const elements: ElementIndex[] = [];
            OrderedSet.forEach(u.indices, elementUnitIndex => {
                const elementIndex = u.unit.elements[elementUnitIndex];
                if (SortedArray.has(u.unit.polymerElements, elementIndex)) elements.push(elementIndex);
            });
            units.push({ unitId, size: elements.length, elements: SortedArray.ofSortedArray(elements) });
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

function bestMappingMatch(sortedA: SortedAccessionsAndUnits<{ elements: SortedArray<ElementIndex> }>, sortedB: SortedAccessionsAndUnits<{ elements: SortedArray<ElementIndex> }>) {
    let bestMatch: { accession: string, unitA: string, unitB: string, elementsA: SortedArray<ElementIndex>, elementsB: SortedArray<ElementIndex>, nMatchedElements: number } | undefined = undefined;
    let bestScore = 0;
    for (const accession of sortedA.accessions) {
        const unitsA = sortedA.units[accession]!;
        const unitsB = sortedB.units[accession];
        if (!unitsB) continue;
        for (const ua of unitsA) {
            if (ua.size <= bestScore) break;
            for (const ub of unitsB) {
                if (ub.size <= bestScore || ua.size <= bestScore) break;
                const score = Math.min(ua.size, ub.size);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { accession, unitA: ua.unitId, unitB: ub.unitId, elementsA: ua.elements, elementsB: ub.elements, nMatchedElements: score };
                }
            }
        }
    }
    return bestMatch;
}


const reProtein = /(polypeptide|cyclic-pseudo-peptide)/i;

function alignAndSuperpose(lociA: StructureElement.Loci, lociB: StructureElement.Loci): _MinimizeRmsdResult {
    const location = StructureElement.Loci.getFirstLocation(lociA)!;
    const subtype = StructureProperties.entity.subtype(location);
    const substMatrix = subtype.match(reProtein) ? 'blosum62' : 'default';

    const { matchedA, matchedB } = computeAlignment(lociA.elements[0], lociB.elements[0], { substMatrix });

    const n = OrderedSet.size(matchedA.indices);
    const coordsA = getPositionTable(StructureElement.Loci(lociA.structure, [matchedA]), n);
    const coordsB = getPositionTable(StructureElement.Loci(lociB.structure, [matchedB]), n);
    const superposition = MinimizeRmsd.compute({ a: coordsA, b: coordsB });
    return { ...superposition, nAlignedElements: n };
    // TODO remove explicit nAlignedElements, once in core Molstar
}

/** `a` and `b` contain matching pairs, i.e. `a.indices[0]` aligns with `b.indices[0]` */
interface AlignmentResult {
    matchedA: StructureElement.Loci.Element,
    matchedB: StructureElement.Loci.Element,
    score: number,
}

function computeAlignment(a: StructureElement.Loci.Element, b: StructureElement.Loci.Element, options: Partial<AlignmentOptions> = {}): AlignmentResult {
    const seqA = getSequenceFromLoci(a);
    const seqB = getSequenceFromLoci(b);
    const { aliA, aliB, score } = align(seqA.sequence.map(getOneLetterCode), seqB.sequence.map(getOneLetterCode), options);

    const indicesA: StructureElement.UnitIndex[] = [];
    const indicesB: StructureElement.UnitIndex[] = [];
    let seqIdxA = 0, seqIdxB = 0;
    for (let i = 0, n = aliA.length; i < n; ++i) {
        if (aliA[i] !== '-' && aliB[i] !== '-') {
            indicesA.push(seqA.unitElements[seqIdxA]);
            indicesB.push(seqB.unitElements[seqIdxB]);
        }
        if (aliA[i] !== '-') seqIdxA += 1;
        if (aliB[i] !== '-') seqIdxB += 1;
    }

    return {
        matchedA: { unit: a.unit, indices: OrderedSet.ofSortedArray(indicesA) },
        matchedB: { unit: b.unit, indices: OrderedSet.ofSortedArray(indicesB) },
        score,
    };
}

/** Extract sequence and array of corresponding trace atoms. */
function getSequenceFromLoci(loci: StructureElement.Loci.Element) {
    const { unit, indices } = loci;
    const unitElements: UnitIndex[] = [];
    const sequence: string[] = [];
    OrderedSet.forEach(indices, elementUnitIndex => {
        const elementIndex = unit.elements[elementUnitIndex];
        if (OrderedSet.has(unit.polymerElements, elementIndex)) {
            unitElements.push(elementUnitIndex);
            const compId = unit.model.atomicHierarchy.atoms.label_comp_id.value(elementIndex);
            sequence.push(compId);
        }
    });
    return { sequence, unitElements };
}


function getOneLetterCode(compId: string) {
    return OneLetterCodes[compId] ?? 'X';
}

// Copied from Molstar
const OneLetterCodes: Record<string, string> = {
    'HIS': 'H',
    'ARG': 'R',
    'LYS': 'K',
    'ILE': 'I',
    'PHE': 'F',
    'LEU': 'L',
    'TRP': 'W',
    'ALA': 'A',
    'MET': 'M',
    'PRO': 'P',
    'CYS': 'C',
    'ASN': 'N',
    'VAL': 'V',
    'GLY': 'G',
    'SER': 'S',
    'GLN': 'Q',
    'TYR': 'Y',
    'ASP': 'D',
    'GLU': 'E',
    'THR': 'T',

    'SEC': 'U', // as per IUPAC definition
    'PYL': 'O', // as per IUPAC definition

    // charmm ff
    'HSD': 'H', 'HSE': 'H', 'HSP': 'H',
    'LSN': 'K',
    'ASPP': 'D',
    'GLUP': 'E',

    // amber ff
    'HID': 'H', 'HIE': 'H', 'HIP': 'H',
    'LYN': 'K',
    'ASH': 'D',
    'GLH': 'E',

    // DNA
    'DA': 'A',
    'DC': 'C',
    'DG': 'G',
    'DT': 'T',
    'DU': 'U',

    // RNA
    'A': 'A',
    'C': 'C',
    'G': 'G',
    'T': 'T',
    'U': 'U',
};
