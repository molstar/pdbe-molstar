import { Structure, Unit, ResidueIndex, Model, Link } from 'Molstar/mol-model/structure';
import { BuiltInStructureRepresentationsName } from 'Molstar/mol-repr/structure/registry';
import { BuiltInColorThemeName } from 'Molstar/mol-theme/color';
import { AminoAcidNames } from 'Molstar/mol-model/structure/model/types';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import Expression from 'Molstar/mol-script/language/expression';
import { compile } from 'Molstar/mol-script/runtime/query/compiler';
import { StructureElement, StructureSelection, QueryContext, StructureProperties as Props } from 'Molstar/mol-model/structure';

export interface ModelInfo {
    hetResidues: { name: string, indices: ResidueIndex[] }[],
    assemblies: { id: string, details: string, isPreferred: boolean }[],
    modelCount: number,
    preferredAssemblyId: string | undefined,
    validationApi: boolean | undefined,
    domainMappings: any | undefined
}

export namespace ModelInfo {

    export function getStreamingMethod(s?: Structure, defaultKind: string = 'x-ray'): string {
        if (!s) return defaultKind;
    
        const model = s.models[0];
        if (model.sourceData.kind !== 'mmCIF') return defaultKind;
    
        const data = model.sourceData.data.exptl.method;
       
        for (let i = 0; i < data.rowCount; i++) {
            const v = data.value(i).toUpperCase();
            if (v.indexOf('MICROSCOPY') >= 0) return 'em';
            if (v.indexOf("SOLUTION NMR") >= 0) return 'nmr';
        }
        return 'x-ray';
    }

    async function getValidation(ctx: PluginContext, pdbId: string) {
        if(!pdbId) return void 0;
        try {
            const src = await ctx.runTask(ctx.fetch({ url: `https://www.ebi.ac.uk/pdbe/api/validation/residuewise_outlier_summary/entry/${pdbId}` })) as string;
            if(src){
                return true;
            }
            return void 0;
        } catch (e) {
            return void 0;
        }
    }

    async function getDomainMapping(ctx: PluginContext, pdbId: string) {
        if(!pdbId) return void 0;
        try {
            const src = await ctx.runTask(ctx.fetch({ url: `https://www.ebi.ac.uk/pdbe/api/mappings/${pdbId}` })) as string;
            const json = JSON.parse(src);
            const data = json && json[pdbId];
            const defaultDomains = ['Pfam', 'InterPro', 'CATH', 'SCOP'];
            let availableDomains: [string, string][] = [];
            let domainsMappingsSelect: [string, any][][] = [];
            let domainsMappings: any[] = [];
            Object.keys(data).forEach(domainName => {
                if(defaultDomains.indexOf(domainName) > -1 && Object.keys(data[domainName]).length > 0){
                    availableDomains.push([domainName, domainName]);
                    const dmIndex = availableDomains.length - 1;
                    Object.keys(data[domainName]).forEach(acc => {
                        if(!domainsMappingsSelect[dmIndex]){
                            domainsMappingsSelect[dmIndex] = [];
                            domainsMappings[dmIndex] = [];
                        }
                        const mappingStr = dmIndex+'_'+domainsMappingsSelect[dmIndex].length;
                        // const domainLabel = (domainsMappings[dmIndex].length + 1)+': '+data[domainName][acc].identifier
                        // domainsMappings[dmIndex].push([data[domainName][acc].mappings, data[domainName][acc].identifier]);
                        domainsMappingsSelect[dmIndex].push([mappingStr, data[domainName][acc].identifier]);
                        domainsMappings[dmIndex].push(data[domainName][acc].mappings);
                    });

                }

            });

            if(availableDomains.length > 0){
                const mappings = {
                    types: availableDomains,
                    mappingsSelect: domainsMappingsSelect,
                    mappings: domainsMappings
                }
            
                return mappings;
            }else {
                return void 0;
            }
        } catch (e) {
            return void 0;
        }
    }

    async function getPreferredAssembly(ctx: PluginContext, pdbId: string) {
        if(!pdbId) return void 0;

        try {
            const src = await ctx.runTask(ctx.fetch({ url: `https://www.ebi.ac.uk/pdbe/api/pdb/entry/summary/${pdbId}` })) as string;
            const json = JSON.parse(src);
            const data = json && json[pdbId];

            const assemblies = data[0] && data[0].assemblies;
            if (!assemblies || !assemblies.length) return void 0;

            for (const asm of assemblies) {
                if (asm.preferred) {
                    return asm.assembly_id;
                }
            }
            return void 0;
        } catch (e) {
            console.warn('getPreferredAssembly', e);
        }
    }

    export async function get(ctx: PluginContext, model: Model, checkPreferred: boolean, checkValidation: boolean, getMappings: boolean): Promise<ModelInfo> {
        const { _rowCount: residueCount } = model.atomicHierarchy.residues;
        const { offsets: residueOffsets } = model.atomicHierarchy.residueAtomSegments;
        const chainIndex = model.atomicHierarchy.chainAtomSegments.index;
        // const resn = SP.residue.label_comp_id, entType = SP.entity.type;

        let pdbId : string;
        let labelVal = model.label;
        let labelValLength = labelVal.length;
        let pdbPattern = /pdb.*\.ent/g;
        if (labelValLength > 4 && pdbPattern.test(labelVal)){
            labelVal = labelVal.substring(labelValLength - 8, labelValLength - 4);
        }
        pdbId = ((ctx.customState as any).initParams.moleculeId) ? (ctx.customState as any).initParams.moleculeId : labelVal.toLowerCase();

        const pref = checkPreferred
            ? getPreferredAssembly(ctx, pdbId)
            : void 0;

        const validation = checkValidation
            ? getValidation(ctx, pdbId)
            : void 0;

        const mappings = getMappings
        ? getDomainMapping(ctx, pdbId)
        : void 0;

        const hetResidues: ModelInfo['hetResidues'] = [];
        const hetMap = new Map<string, ModelInfo['hetResidues'][0]>();

        for (let rI = 0 as ResidueIndex; rI < residueCount; rI++) {
            const comp_id = model.atomicHierarchy.residues.label_comp_id.value(rI);
            if (AminoAcidNames.has(comp_id)) continue;
            const mod_parent = model.properties.modifiedResidues.parentId.get(comp_id);
            if (mod_parent && AminoAcidNames.has(mod_parent)) continue;

            const cI = chainIndex[residueOffsets[rI]];
            const eI = model.atomicHierarchy.index.getEntityFromChain(cI);
            if (model.entities.data.type.value(eI) === 'water') continue;

            let lig = hetMap.get(comp_id);
            if (!lig) {
                lig = { name: comp_id, indices: [] };
                hetResidues.push(lig);
                hetMap.set(comp_id, lig);
            }
            lig.indices.push(rI);
        }

        //models
        const molecule = ctx.state.behavior.currentObject.value.state.cells.get("molecule");
        let modelCount = 1;
        if(molecule && molecule.obj){
            if(molecule.obj.data && molecule.obj.data.length > 1) modelCount = molecule.obj.data.length;
        }

        const preferredAssemblyId = await pref;

        const validationApi = await validation;

        const domainMappings = await mappings;

        return {
            hetResidues: hetResidues,
            assemblies: model.symmetry.assemblies.map(a => ({ id: a.id, details: a.details, isPreferred: a.id === preferredAssemblyId })),
            modelCount,
            preferredAssemblyId,
            validationApi,
            domainMappings
        };
    }
}

export type SupportedFormats = 'bcif' | 'cif' | 'pdb' | 'sdf'
export interface LoadParams {
    url: string,
    format?: SupportedFormats,
    assemblyId?: string,
    representationStyle?: RepresentationStyle,
    isHetView?: boolean
}

export interface RepresentationStyle {
    sequence?: RepresentationStyle.Entry,
    hetGroups?: RepresentationStyle.Entry,
    snfg3d?: { hide?: boolean },
    water?: RepresentationStyle.Entry
}

export namespace RepresentationStyle {
    export type Entry = { hide?: boolean, kind?: BuiltInStructureRepresentationsName, coloring?: BuiltInColorThemeName }
}

export namespace InteractivityHelper {

    // for `labelFirst`, don't create right away to avoid problems with circular dependencies/imports
    let elementLocA: StructureElement.Location
    let elementLocB: StructureElement.Location

    function setElementLocation(loc: StructureElement.Location, unit: Unit, index: StructureElement.UnitIndex) {
        loc.unit = unit
        loc.element = unit.elements[index]
    }

    function getDataByLoction(location: any){
        if (Unit.isAtomic(location.unit)) {
            return getAtomicElementData(location);
        } else if (Unit.isCoarse(location.unit)) {
            return getCoarseElementData(location);
        }
    }

    function getAtomicElementData(location: any){
        return {
            entity_id: Props.chain.label_entity_id(location),
            entry_id: location.unit.model.entry,
            label_asym_id: Props.chain.label_asym_id(location),
            auth_asym_id: Props.chain.auth_asym_id(location),
            //seq_id: location.unit.model.atomicHierarchy.residues.auth_seq_id.isDefined ? Props.residue.auth_seq_id(location) : Props.residue.label_seq_id(location),
            seq_id: Props.residue.label_seq_id(location),
            auth_seq_id: location.unit.model.atomicHierarchy.residues.auth_seq_id.isDefined ? Props.residue.auth_seq_id(location) : undefined,
            ins_code: Props.residue.pdbx_PDB_ins_code(location),
            comp_id: Props.residue.label_comp_id(location),
            atom_id: Props.atom.label_atom_id(location),
            alt_id: Props.atom.label_alt_id(location),
        }
    }

    function getCoarseElementData(location: any){
        let dataObj: any = {
            asym_id: Props.coarse.asym_id(location),
            seq_id_begin: Props.coarse.seq_id_begin(location),
            seq_id_end: Props.coarse.seq_id_end(location),
        }
        if (dataObj.seq_id_begin === dataObj.seq_id_end) {
            const entityIndex = Props.coarse.entityKey(location)
            const seq = location.unit.model.sequence.byEntityKey[entityIndex]
            const comp_id = seq.sequence.compId.value(dataObj.seq_id_begin - 1) // 1-indexed
            dataObj['comp_id'] = comp_id;
        }
        return dataObj;
    }

    function getElementLociData(stats: any): any{
        // const stats: StructureElement.Stats = StructureElement.Stats.ofLoci(loci);
        const { unitCount, residueCount, elementCount } = stats;
        let location:any;
        if (elementCount === 1 && residueCount === 0 && unitCount === 0) {
            location = stats.firstElementLoc;
        } else if (elementCount === 0 && residueCount === 1 && unitCount === 0) {
            location = stats.firstResidueLoc;
        } else if (elementCount === 0 && residueCount === 0 && unitCount === 1) {
            location = stats.firstUnitLoc;
        }

        if(location) return getDataByLoction(location)
    }

    function getLinkLociData(link: Link.Location): any{
        if (!elementLocA) elementLocA = StructureElement.Location.create()
        if (!elementLocB) elementLocB = StructureElement.Location.create()
        setElementLocation(elementLocA, link.aUnit, link.aIndex)
        setElementLocation(elementLocB, link.bUnit, link.bIndex)
        const eleLoc = getDataByLoction(elementLocA);
        const endAtm = getDataByLoction(elementLocB).atom_id;
        let linkDataObj = Object.assign({},eleLoc);
        linkDataObj['start_atom_id'] = eleLoc.atom_id;
        linkDataObj['end_atom_id'] = endAtm;
        delete linkDataObj.atom_id

        return linkDataObj;
    }

    export function getDataFromLoci(loci: any): any{

        switch (loci.kind) {
            case 'element-loci':
            return getElementLociData(StructureElement.Stats.ofLoci(loci));
        case 'link-loci':
            const link = loci.links[0]
            return  link ? getLinkLociData(link) : 'Unknown'
        }

        
      
    }
}

export namespace QueryHelper {
    export function getQueryObject(params: {entity_id?: string, struct_asym_id?: string, start_residue_number?: number, end_residue_number?: number, color?: any, showSideChain?: boolean}[]) : Expression {

        let entityObjArray: any = [];

        params.forEach(param => {
                let qEntities: any = {};
                if(param.entity_id) qEntities['entity-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_entity_id(), param.entity_id]);
                if(param.struct_asym_id) qEntities['chain-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), param.struct_asym_id]);

                if(!param.start_residue_number && !param.end_residue_number){
                    //entityObjArray.push(qEntities);
                }else if(param.start_residue_number && param.end_residue_number && param.end_residue_number > param.start_residue_number){
                    qEntities['residue-test'] = MS.core.rel.inRange([MS.struct.atomProperty.macromolecular.label_seq_id(), param.start_residue_number, param.end_residue_number])
                }else{
                    qEntities['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_seq_id(), param.start_residue_number]);
                }
                entityObjArray.push(qEntities);
        });

        const atmGroupsQueries: Expression[] = [];

        entityObjArray.forEach((entityObj:any) => {
            atmGroupsQueries.push(MS.struct.generator.atomGroups(entityObj));
        });

        // return MS.struct.modifier.union(atmGroupsQueryArr);

        return MS.struct.modifier.union([
            atmGroupsQueries.length === 1
                ? atmGroupsQueries[0]
                // Need to union before merge for fast performance
                : MS.struct.combinator.merge(atmGroupsQueries.map(q => MS.struct.modifier.union([ q ])))
        ]);
    }

    export function getInteractivityLoci(params: any, contextData: any){
        const query = compile<StructureSelection>(QueryHelper.getQueryObject(params));
        const sel = query(new QueryContext(contextData));
        return StructureSelection.toLociWithSourceUnits(sel);
    }

    export function getHetLoci(queryExp: Expression, contextData: any){
        const query = compile<StructureSelection>(queryExp);
        const sel = query(new QueryContext(contextData));
        return StructureSelection.toLociWithSourceUnits(sel);
    }

    function getInteractionsQueryObject(params: {pdb_res_id: string, auth_asym_id: string, auth_ins_code_id: string, auth_seq_id: number, atoms?: string[]}[]) : Expression {

        let entityObjArray: any = [];

        params.forEach(param => {
                let qEntities: any = {
                    'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), param.auth_asym_id]),
                    'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.auth_seq_id])
                };
                if(param.atoms){
                    let atomsArr:any = [];
                    param.atoms.forEach(atom => {
                        atomsArr.push(MS.core.rel.eq([MS.ammp('label_atom_id'), atom]))
                    });
                    qEntities['atom-test'] = MS.core.logic.or(atomsArr);
                    // qEntities['atom-test'] = MS.core.set.has([MS.set(param.atoms[0]), MS.ammp('label_atom_id')])
                }
                entityObjArray.push(qEntities);
        });

        const atmGroupsQueries: Expression[] = [];

        entityObjArray.forEach((entityObj:any) => {
            atmGroupsQueries.push(MS.struct.generator.atomGroups(entityObj));
        });

        // return MS.struct.modifier.union(atmGroupsQueryArr);

        return MS.struct.modifier.union([
            atmGroupsQueries.length === 1
                ? atmGroupsQueries[0]
                // Need to union before merge for fast performance
                : MS.struct.combinator.merge(atmGroupsQueries.map(q => MS.struct.modifier.union([ q ])))
        ]);
    }

    export function interactionsNodeLoci(params: any[], contextData: any){
        const query = compile<StructureSelection>(getInteractionsQueryObject(params));
        const sel = query(new QueryContext(contextData));
        return StructureSelection.toLociWithSourceUnits(sel);
    }
}

export enum StateElements {
    Model = 'model',
    ModelProps = 'model-props',
    Assembly = 'assembly',

    VolumeStreaming = 'volume-streaming',

    Sequence = 'sequence',
    SequenceVisual = 'sequence-visual',
    Het = 'het',
    HetVisual = 'het-visual',
    Het3DSNFG = 'het-3dsnfg',
    Water = 'water',
    WaterVisual = 'water-visual',

    HetGroupFocus = 'het-group-focus',
    HetGroupFocusGroup = 'het-group-focus-group',
    LigandVisual = 'ligand-visual',
    HetSurroundingVisual = 'het-surrounding-visual',
    Carbs3DVisual = 'carb-3d-visual',
    CarbsVisual = 'carb-visual'
}