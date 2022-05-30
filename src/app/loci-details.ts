import { Unit, StructureElement, StructureProperties as Props, Bond } from 'Molstar/mol-model/structure';
import { Loci } from 'Molstar/mol-model/loci';
import { OrderedSet } from 'Molstar/mol-data/int';
import { SIFTSMapping as BestDatabaseSequenceMappingProp } from 'Molstar/mol-model-props/sequence/sifts-mapping';

export type EventDetail = {
    models?: string[],
    entity_id?: string,
    label_asym_id?: string,
    asym_id?: string,
    auth_asym_id?: string,
    unp_accession?: string,
    unp_seq_id?: number,
    seq_id?: number,
    auth_seq_id?: number,
    ins_code?: string,
    comp_id?: string,
    atom_id?: string[],
    alt_id?: string,
    micro_het_comp_ids?: string[],
    seq_id_begin?: number,
    seq_id_end?: number,
    button?: number,
    modifiers?: any
}

type LabelGranularity = 'element' | 'conformation' | 'residue' | 'chain' | 'structure'

export function lociDetails(loci: Loci): EventDetail | undefined {
    switch (loci.kind) {
        case 'structure-loci':
            return { models: loci.structure.models.map(m => m.entry).filter(l => !!l) };
        case 'element-loci':
            return structureElementStatsDetail(StructureElement.Stats.ofLoci(loci));
        case 'bond-loci':
            const bond = loci.bonds[0];
            return bond ? bondLabel(bond, 'element') : '';
        default :
            return void 0;
    }
}

function structureElementStatsDetail(stats: StructureElement.Stats): EventDetail | undefined {
    const { chainCount, residueCount, elementCount } = stats;

    if (elementCount === 1 && residueCount === 0 && chainCount === 0) {
        return getElementDetails(stats.firstElementLoc, 'element');
    } else if (elementCount === 0 && residueCount === 1 && chainCount === 0) {
        return getElementDetails(stats.firstResidueLoc, 'residue');
    } else {
        return void 0;
    }
}

function getElementDetails(location: StructureElement.Location, granularity: LabelGranularity = 'element'): EventDetail {
    const basicDetails: any = {};

    let entry = location.unit.model.entry;
    if (entry.length > 30) entry = entry.substr(0, 27) + '\u2026'; // ellipsis
    basicDetails['entry_id'] = entry; // entry
    if (granularity !== 'structure') {
        basicDetails['model'] = location.unit.model.modelNum; // model
        basicDetails['instance'] = location.unit.conformation.operator.name; // instance
    }

    let elementDetails: any;
    if (Unit.isAtomic(location.unit)) {
        elementDetails = atomicElementDetails(location as StructureElement.Location<Unit.Atomic>, granularity);
    } else if (Unit.isCoarse(location.unit)) {
        elementDetails = coarseElementDetails(location as StructureElement.Location<Unit.Spheres | Unit.Gaussians>, granularity);
    }

    return {...basicDetails, ...elementDetails};
}

function atomicElementDetails(location: StructureElement.Location<Unit.Atomic>, granularity: LabelGranularity): EventDetail {
    const elementDetails: EventDetail = {
        entity_id: Props.chain.label_entity_id(location),
        label_asym_id: Props.chain.label_asym_id(location),
        auth_asym_id: Props.chain.auth_asym_id(location),
        unp_accession: undefined,
        unp_seq_id: undefined,
        seq_id: Props.residue.label_seq_id(location),
        auth_seq_id: Props.residue.auth_seq_id(location),
        ins_code: Props.residue.pdbx_PDB_ins_code(location),
        comp_id: Props.atom.label_comp_id(location),
        atom_id: [Props.atom.label_atom_id(location)],
        alt_id: Props.atom.label_alt_id(location)
    };
    
    const unpLabel = BestDatabaseSequenceMappingProp.getLabel(location);

    if(unpLabel) {
        const unpLabelDetails = unpLabel.split(' ');
        if(unpLabelDetails[0] === 'UNP') {
            elementDetails.unp_accession = unpLabelDetails[1];
            elementDetails.unp_seq_id = +unpLabelDetails[2]
        }
    }

    const microHetCompIds = Props.residue.microheterogeneityCompIds(location);
    elementDetails['micro_het_comp_ids'] = granularity === 'residue' && microHetCompIds.length > 1 ?
        microHetCompIds : [elementDetails['comp_id']] as any;

    return elementDetails;
}

function coarseElementDetails(location: StructureElement.Location<Unit.Spheres | Unit.Gaussians>, granularity: LabelGranularity): EventDetail {
    const elementDetails: EventDetail = {
        asym_id: Props.coarse.asym_id(location),
        seq_id_begin: Props.coarse.seq_id_begin(location),
        seq_id_end: Props.coarse.seq_id_end(location)
    };

    if (granularity === 'residue') {
        if (elementDetails.seq_id_begin === elementDetails.seq_id_end) {
            const entityIndex = Props.coarse.entityKey(location);
            const seq = location.unit.model.sequence.byEntityKey[entityIndex];
            elementDetails['comp_id'] = seq.sequence.compId.value(elementDetails.seq_id_begin! - 1); // 1-indexed
        }
    }

    return elementDetails;
}

export function bondLabel(bond: Bond.Location, granularity: LabelGranularity): any {
    return _bundleLabel({ loci: [
        StructureElement.Loci(bond.aStructure, [{ unit: bond.aUnit, indices: OrderedSet.ofSingleton(bond.aIndex) }]),
        StructureElement.Loci(bond.bStructure, [{ unit: bond.bUnit, indices: OrderedSet.ofSingleton(bond.bIndex) }])
    ]}, granularity);
}

export function _bundleLabel(bundle: Loci.Bundle<any>, granularity: LabelGranularity) {
    let isSingleElements = true;
    for (const l of bundle.loci) {
        if (!StructureElement.Loci.is(l) || StructureElement.Loci.size(l) !== 1) {
            isSingleElements = false;
            break;
        }
    }
    if (isSingleElements) {
        const locations = (bundle.loci as StructureElement.Loci[]).map(l => {
            const { unit, indices } = l.elements[0];
            return StructureElement.Location.create(l.structure, unit, unit.elements[OrderedSet.start(indices)]);
        });
        const elementDetailsArr: EventDetail[] = locations.map(l => getElementDetails(l, granularity));
        const atomIds: any = [elementDetailsArr[0].atom_id![0], elementDetailsArr[1].atom_id![0]];
        const elementDetails: EventDetail = elementDetailsArr[0];
        elementDetails['atom_id'] = atomIds;
        return elementDetails;
    } else {
        const elementDetails = bundle.loci.map(l => lociDetails(l));
        return elementDetails;
    }
}