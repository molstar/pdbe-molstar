import { OrderedSet } from 'molstar/lib/mol-data/int';
import { MinimizeRmsd } from 'molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd';
import { align, AlignmentOptions } from 'molstar/lib/mol-model/sequence/alignment/alignment';
import { getSequence } from 'molstar/lib/mol-model/sequence/alignment/sequence';
import { ElementIndex, StructureElement, StructureProperties, Unit } from 'molstar/lib/mol-model/structure';
import { UnitIndex } from 'molstar/lib/mol-model/structure/structure/element/util';
import { getPositionTable } from 'molstar/lib/mol-model/structure/structure/util/superposition';


type AlignAndSuperposeResult = MinimizeRmsd.Result & { alignmentScore: number };
const reProtein = /(polypeptide|cyclic-pseudo-peptide)/i;

export function alignAndSuperpose(xs: StructureElement.Loci[]): AlignAndSuperposeResult[] {
    const ret: AlignAndSuperposeResult[] = [];
    if (xs.length <= 0) return ret;

    const l = StructureElement.Loci.getFirstLocation(xs[0])!;
    const subtype = StructureProperties.entity.subtype(l);
    const substMatrix = subtype.match(reProtein) ? 'blosum62' : 'default';

    for (let i = 1; i < xs.length; i++) {
        console.log('alignAndSuperpose', OrderedSet.size(xs[0].elements[0].indices), xs[0], OrderedSet.size(xs[i].elements[0].indices), xs[i], subtype, substMatrix)

        const { a, b, score } = AlignSequences.compute({
            a: xs[0].elements[0],
            b: xs[i].elements[0],
        }, { substMatrix });

        const lociA = StructureElement.Loci(xs[0].structure, [a]);
        const lociB = StructureElement.Loci(xs[i].structure, [b]);
        const n = OrderedSet.size(a.indices);
        console.log('alignAndSuperpose', OrderedSet.size(a.indices), a, OrderedSet.size(b.indices), b, score)
        console.log(logLociSeq(lociA))
        console.log(logLociSeq(lociB))

        ret.push({
            ...MinimizeRmsd.compute({
                a: getPositionTable(lociA, n),
                b: getPositionTable(lociB, n)
            }),
            alignmentScore: score
        });
    }

    return ret;
}

function logLociSeq(loci: StructureElement.Loci): string {
    const out: string[] = [];
    for (const l of loci.elements) {
        OrderedSet.forEach(l.indices, ui => {
            const ei = l.unit.elements[ui];
            const compId = l.unit.model.atomicHierarchy.atoms.label_comp_id.value(ei);
            const ri = l.unit.model.atomicHierarchy.residueAtomSegments.index[ei];
            const seqId = l.unit.model.atomicHierarchy.residues.label_seq_id.value(ri);
            out.push(`${compId}${seqId}`.padEnd(4));
        });
    }
    return out.join(' ');
}


namespace AlignSequences {
    export type Input = {
        a: StructureElement.Loci.Element,
        b: StructureElement.Loci.Element
    }
    /** `a` and `b` contain matching pairs, i.e. `a.indices[0]` aligns with `b.indices[0]` */
    export type Result = {
        a: StructureElement.Loci.Element,
        b: StructureElement.Loci.Element,
        score: number
    }

    export function createSeqIdIndicesMap(element: StructureElement.Loci.Element) {
        const seqIds = new Map<number, StructureElement.UnitIndex[]>();
        if (Unit.isAtomic(element.unit)) {
            const { label_seq_id } = element.unit.model.atomicHierarchy.residues;
            const { residueIndex } = element.unit;
            for (let i = 0, il = OrderedSet.size(element.indices); i < il; ++i) {
                const uI = OrderedSet.getAt(element.indices, i);
                const eI = element.unit.elements[uI];
                const seqId = label_seq_id.value(residueIndex[eI]);
                if (seqIds.has(seqId)) seqIds.get(seqId)!.push(uI);
                else seqIds.set(seqId, [uI]);
            }
        } else if (Unit.isCoarse(element.unit)) {
            const { seq_id_begin } = Unit.isSpheres(element.unit)
                ? element.unit.model.coarseHierarchy.spheres
                : element.unit.model.coarseHierarchy.gaussians;
            for (let i = 0, il = OrderedSet.size(element.indices); i < il; ++i) {
                const uI = OrderedSet.getAt(element.indices, i);
                const eI = element.unit.elements[uI];
                const seqId = seq_id_begin.value(eI);
                seqIds.set(seqId, [uI]);
            }
        }
        return seqIds;
    }

    export function compute(input: Input, options: Partial<AlignmentOptions> = {}): Result {
        const sa = getSequenceFromLoci(input.a);
        const sb = getSequenceFromLoci(input.b);

        console.log('sa', sa)
        console.log('sb', sb)

        const indicesA: StructureElement.UnitIndex[] = [];
        const indicesB: StructureElement.UnitIndex[] = [];
        const { aliA, aliB, score } = align(sa.sequence, sb.sequence, options);
        console.log('AlignSequence.compute', sa.sequence, sb.sequence, score)
        console.log('A:', aliA)
        console.log('B:', aliB)

        let seqIdxA = 0, seqIdxB = 0;
        for (let i = 0, il = aliA.length; i < il; ++i) {
            if (aliA[i] === '-' || aliB[i] === '-') {
                if (aliA[i] !== '-') seqIdxA += 1;
                if (aliB[i] !== '-') seqIdxB += 1;
                continue;
            }
            indicesA.push(sa.unitElements[seqIdxA]);
            indicesB.push(sb.unitElements[seqIdxB]);
            seqIdxA += 1, seqIdxB += 1;
        }
        console.log('AlignSequence.compute A', seqIdxA, indicesA, input.a.indices)
        console.log('AlignSequence.compute B', seqIdxB, indicesB, input.b.indices)

        const outA = OrderedSet.intersect(OrderedSet.ofSortedArray(indicesA), input.a.indices);
        const outB = OrderedSet.intersect(OrderedSet.ofSortedArray(indicesB), input.b.indices);

        return {
            a: { unit: input.a.unit, indices: outA },
            b: { unit: input.b.unit, indices: outB },
            score
        };
    }
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
