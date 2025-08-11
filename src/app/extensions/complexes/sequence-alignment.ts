import { OrderedSet } from 'molstar/lib/mol-data/int';
import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { align, AlignmentOptions } from 'molstar/lib/mol-model/sequence/alignment/alignment';
import { StructureElement, StructureProperties } from 'molstar/lib/mol-model/structure';
import { UnitIndex } from 'molstar/lib/mol-model/structure/structure/element/util';
import { getPositionTable } from 'molstar/lib/mol-model/structure/structure/util/superposition';


const reProtein = /(polypeptide|cyclic-pseudo-peptide)/i;

export function alignAndSuperpose(lociA: StructureElement.Loci, lociB: StructureElement.Loci): MinimizeRmsd.Result & { nAlignedElements: number } {
    const location = StructureElement.Loci.getFirstLocation(lociA)!;
    const subtype = StructureProperties.entity.subtype(location);
    const substMatrix = subtype.match(reProtein) ? 'blosum62' : 'default';

    const { matchedA, matchedB } = computeAlignment(lociA.elements[0], lociB.elements[0], { substMatrix });

    const n = OrderedSet.size(matchedA.indices);
    const coordsA = getPositionTable(StructureElement.Loci(lociA.structure, [matchedA]), n);
    const coordsB = getPositionTable(StructureElement.Loci(lociB.structure, [matchedB]), n);
    const superposition = MinimizeRmsd.compute({ a: coordsA, b: coordsB });
    return { ...superposition, nAlignedElements: n };
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
    const { aliA, aliB, score } = align(seqA.sequence, seqB.sequence, options);

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
