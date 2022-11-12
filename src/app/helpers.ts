import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { StateSelection } from 'Molstar/mol-state';
import Expression from 'Molstar/mol-script/language/expression';
import { StructureSelection, QueryContext, StructureProperties } from 'Molstar/mol-model/structure';
import { BuiltInTrajectoryFormat } from 'Molstar/mol-plugin-state/formats/trajectory';
import { CreateVolumeStreamingInfo } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
// import { VolumeStreaming } from '../../mol-plugin/behavior/dynamic/volume-streaming/behavior';
import { compile } from 'Molstar/mol-script/runtime/query/compiler';
import { Model, ResidueIndex } from 'Molstar/mol-model/structure';
import { Queries } from 'Molstar/mol-model/structure';
import { SIFTSMapping } from 'Molstar/mol-model-props/sequence/sifts-mapping';
import { StructureQuery } from 'Molstar/mol-model/structure/query/query';
import { QualityAssessment } from 'Molstar/extensions/model-archive/quality-assessment/prop';
import { StructureRepresentationRegistry } from 'Molstar/mol-repr/structure/registry';
import { ColorTheme } from 'Molstar/mol-theme/color';
import { ModelSymmetry } from 'Molstar/mol-model-formats/structure/property/symmetry';

export type SupportedFormats = "mmcif" | "cif" | "cifCore" | "pdb" | "pdbqt" | "gro" | "xyz" | "mol" | "sdf" | "mol2"
export type LoadParams = { url: string, format?: BuiltInTrajectoryFormat, assemblyId?: string, isHetView?: boolean, isBinary?: boolean, representationStyle?: RepresentationStyle }


export namespace PDBeVolumes {

    export function mapParams(defaultParams: any, mapParams: any, ref?: string|number) {
        const pdbeParams = {...defaultParams};
        pdbeParams.options.behaviorRef = 'volume-streaming' + '' + Math.floor(Math.random() * Math.floor(100));
        pdbeParams.options.emContourProvider = 'pdbe';
        pdbeParams.options.serverUrl = 'https://www.ebi.ac.uk/pdbe/volume-server';
        pdbeParams.options.channelParams['em'] = {
            opacity: (mapParams && mapParams.em && mapParams.em.opacity) ? mapParams.em.opacity : 0.49,
            wireframe: (mapParams && mapParams.em && mapParams.em.wireframe) ? mapParams.em.wireframe : false
        };
        pdbeParams.options.channelParams['2fo-fc'] = {
            opacity: (mapParams && mapParams['2fo-fc'] && mapParams['2fo-fc'].opacity) ? mapParams['2fo-fc'].opacity : 0.49,
            wireframe: (mapParams && mapParams['2fo-fc'] && mapParams['2fo-fc'].wireframe) ? mapParams['2fo-fc'].wireframe : false
        };
        pdbeParams.options.channelParams['fo-fc(+ve)'] = {
            opacity: (mapParams && mapParams['fo-fc(+ve)'] && mapParams['fo-fc(+ve)'].opacity) ? mapParams['fo-fc(+ve)'].opacity : 0.3,
            wireframe: (mapParams && mapParams['fo-fc(+ve)'] && mapParams['fo-fc(+ve)'].wireframe) ? mapParams['fo-fc(+ve)'].wireframe : true
        };
        pdbeParams.options.channelParams['fo-fc(-ve)'] = {
            opacity: (mapParams && mapParams['fo-fc(-ve)'] && mapParams['fo-fc(-ve)'].opacity) ? mapParams['fo-fc(-ve)'].opacity : 0.3,
            wireframe: (mapParams && mapParams['fo-fc(-ve)'] && mapParams['fo-fc(-ve)'].wireframe) ? mapParams['fo-fc(-ve)'].wireframe : true
        };
        return pdbeParams;
    }
    export type SupportedFormats = 'mmcif' | 'pdb'
    export function displayUsibilityMessage(plugin: PluginContext) {
        PluginCommands.Toast.Show(plugin, {
            title: 'Volume',
            message: 'Streaming enabled, click on a residue or an atom to view the data.',
            key: 'toast-1',
            timeoutMs: 7000
        });
    }

    export function toggle(plugin: PluginContext) {
        const state = plugin.state.data;
        const streamingState = state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0];

        if(streamingState){
            PluginCommands.State.ToggleVisibility(plugin, { state: state, ref: streamingState.transform.ref });
            return;
        }
    }
}

export namespace AlphafoldView {
    export function getLociByPLDDT(score: number, contextData: any) {
        const queryExp = MS.struct.modifier.union([
            MS.struct.modifier.wholeResidues([
                MS.struct.modifier.union([
                    MS.struct.generator.atomGroups({
                        'chain-test': MS.core.rel.eq([MS.ammp('objectPrimitive'), 'atomistic']),
                        'residue-test': MS.core.rel.gr([QualityAssessment.symbols.pLDDT.symbol(), score]),
                    })
                ])
            ])
        ])

        const query = compile<StructureSelection>(queryExp);
        const sel = query(new QueryContext(contextData));
        return StructureSelection.toLociWithSourceUnits(sel);

    }
}
export interface RepresentationStyle {
    sequence?: RepresentationStyle.Entry,
    hetGroups?: RepresentationStyle.Entry,
    snfg3d?: { hide?: boolean },
    water?: RepresentationStyle.Entry
}

export namespace RepresentationStyle {
    export type Entry = { hide?: boolean, kind?: StructureRepresentationRegistry.BuiltIn, coloring?: ColorTheme.BuiltIn }
}

export type LigandQueryParam = {
    label_comp_id_list?: any,
    auth_asym_id?: string,
    struct_asym_id?: string,
    label_comp_id?: string,
    auth_seq_id?: number,
    show_all?: boolean
};
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
    HetGroupFocusGroup = 'het-group-focus-group'
}

export namespace LigandView {
    export function query(ligandViewParams: LigandQueryParam): {core: Expression.Expression, surroundings: Expression.Expression} {
        let atomGroupsParams: any = {
            'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()])
        };

        // Residue Param
        let residueParam: any;
        if(ligandViewParams.auth_seq_id) {
            residueParam = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), ligandViewParams.auth_seq_id]);
        } else if(ligandViewParams.label_comp_id) {
            residueParam = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_comp_id(), ligandViewParams.label_comp_id]);
        }
        if(residueParam) atomGroupsParams['residue-test'] = residueParam;

        // Chain Param
        if(ligandViewParams.auth_asym_id) {
            atomGroupsParams['chain-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), ligandViewParams.auth_asym_id]);
        }else if(ligandViewParams.struct_asym_id) {
            atomGroupsParams['chain-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), ligandViewParams.struct_asym_id]);
        }

        // Construct core query
        const core = ligandViewParams.show_all ? 
            MS.struct.generator.atomGroups(atomGroupsParams) : 
            MS.struct.filter.first([
                MS.struct.generator.atomGroups(atomGroupsParams)
            ]);
        
        // Construct surroundings query
        const surroundings = MS.struct.modifier.includeSurroundings({ 0: core, radius: 5, 'as-whole-residues': true });

        return {
            core,
            surroundings
        };

    }

    export function branchedQuery(params: any): {core: Expression.Expression, surroundings: Expression.Expression} {
        let entityObjArray: any = [];

        params.atom_site.forEach((param: any) => {
                let qEntities: any = {
                    'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()]),
                    'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.auth_seq_id])
                };
                entityObjArray.push(qEntities);
        });

        const atmGroupsQueries: Expression.Expression[] = [];

        entityObjArray.forEach((entityObj:any) => {
            atmGroupsQueries.push(MS.struct.generator.atomGroups(entityObj));
        });

        const core =  MS.struct.modifier.union([
            atmGroupsQueries.length === 1
                ? atmGroupsQueries[0]
                // Need to union before merge for fast performance
                : MS.struct.combinator.merge(atmGroupsQueries.map(q => MS.struct.modifier.union([ q ])))
        ]);

        // Construct surroundings query
        const surroundings = MS.struct.modifier.includeSurroundings({ 0: core, radius: 5, 'as-whole-residues': true });

        return {
            core,
            surroundings
        };

    }
}

export type QueryParam = {
    auth_seq_id?: number,
    entity_id?: string,
    auth_asym_id?: string,
    struct_asym_id?: string,
    residue_number?: number,
    start_residue_number?: number,
    end_residue_number?: number,
    auth_residue_number?: number,
    auth_ins_code_id?: string,
    start_auth_residue_number?: number,
    start_auth_ins_code_id?: string,
    end_auth_residue_number?: number,
    end_auth_ins_code_id?: string,
    atoms?: string[],
    label_comp_id?: string,
    color?: any,
    sideChain?: boolean,
    representation?: string,
    representationColor?: any,
    focus?: boolean,
    tooltip?: string,
    start?: any,
    end?: any,
    atom_id?: number[],
    uniprot_accession?: string,
    uniprot_residue_number?: number,
    start_uniprot_residue_number?: number,
    end_uniprot_residue_number?: number
};

export namespace QueryHelper {

    export function getQueryObject(params: QueryParam[], contextData: any): Expression.Expression {

        let selections: any = [];
        let siftMappings: any;
        let currentAccession: string;

        params.forEach(param => {
            let selection: any = {};
            
            // entity
            if(param.entity_id) selection['entityTest'] = (l: any) =>  StructureProperties.entity.id(l.element) === param.entity_id;

            // chain
            if(param.struct_asym_id){
                selection['chainTest'] = (l: any) =>  StructureProperties.chain.label_asym_id(l.element) === param.struct_asym_id;
            }else if(param.auth_asym_id){
                selection['chainTest'] = (l: any) =>  StructureProperties.chain.auth_asym_id(l.element) === param.auth_asym_id;
            }

            // residues
            if(param.label_comp_id) {
                selection['residueTest'] = (l: any) =>  StructureProperties.atom.label_comp_id(l.element) === param.label_comp_id;
            } else if(param.uniprot_accession && param.uniprot_residue_number) {
                selection['residueTest'] = (l: any) =>  { 
                    if(!siftMappings || currentAccession !== param.uniprot_accession) {
                        siftMappings = SIFTSMapping.Provider.get(contextData.models[0]).value;
                        currentAccession = param.uniprot_accession!;
                    }
                    const rI = StructureProperties.residue.key(l.element);
                    return param.uniprot_accession === siftMappings.accession[rI] && param.uniprot_residue_number === +siftMappings.num[rI];
                }
            } else if(param.uniprot_accession && param.start_uniprot_residue_number && param.end_uniprot_residue_number) {
                selection['residueTest'] = (l: any) =>  { 
                    if(!siftMappings || currentAccession !== param.uniprot_accession) {
                        siftMappings = SIFTSMapping.Provider.get(contextData.models[0]).value;
                        currentAccession = param.uniprot_accession!;
                    }
                    const rI = StructureProperties.residue.key(l.element);
                    return param.uniprot_accession === siftMappings.accession[rI] && (param.start_uniprot_residue_number! <= +siftMappings.num[rI] && param.end_uniprot_residue_number! >= +siftMappings.num[rI]);
                }
            } else if(param.residue_number){
                selection['residueTest'] = (l: any) =>  StructureProperties.residue.label_seq_id(l.element) === param.residue_number;
            }else if((param.start_residue_number && param.end_residue_number) && (param.end_residue_number > param.start_residue_number)){
                selection['residueTest'] = (l: any) =>  {
                    const labelSeqId = StructureProperties.residue.label_seq_id(l.element);
                    return labelSeqId >= param.start_residue_number! && labelSeqId <= param.end_residue_number!;
                };

            }else if((param.start_residue_number && param.end_residue_number) && (param.end_residue_number === param.start_residue_number)){
                selection['residueTest'] = (l: any) =>  StructureProperties.residue.label_seq_id(l.element) === param.start_residue_number;
            }else if(param.auth_seq_id){
                selection['residueTest'] = (l: any) =>  StructureProperties.residue.auth_seq_id(l.element) === param.auth_seq_id;
            }else if(param.auth_residue_number && !param.auth_ins_code_id){
                selection['residueTest'] = (l: any) =>  StructureProperties.residue.auth_seq_id(l.element) === param.auth_residue_number;
            }else if(param.auth_residue_number && param.auth_ins_code_id){
                selection['residueTest'] = (l: any) =>  StructureProperties.residue.auth_seq_id(l.element) === param.auth_residue_number;
            }else if((param.start_auth_residue_number && param.end_auth_residue_number) && (param.end_auth_residue_number > param.start_auth_residue_number)){
                selection['residueTest'] = (l: any) =>  {
                    const authSeqId = StructureProperties.residue.auth_seq_id(l.element);
                    return authSeqId >= param.start_auth_residue_number! && authSeqId <= param.end_auth_residue_number!;
                };
            }else if((param.start_auth_residue_number && param.end_auth_residue_number) && (param.end_auth_residue_number === param.start_auth_residue_number)){
                selection['residueTest'] = (l: any) =>  StructureProperties.residue.auth_seq_id(l.element) === param.start_auth_residue_number;
            }

            // atoms
            if(param.atoms){
                selection['atomTest'] = (l: any) =>  param.atoms!.includes(StructureProperties.atom.label_atom_id(l.element));
            }

            if(param.atom_id){
                selection['atomTest'] = (l: any) =>  param.atom_id!.includes(StructureProperties.atom.id(l.element));
            }

            selections.push(selection);
        });

        let atmGroupsQueries: any[] = [];
        selections.forEach((selection: any) => {
            atmGroupsQueries.push(Queries.generators.atoms(selection));
        });

        return Queries.combinators.merge(atmGroupsQueries);
    }

    export function getInteractivityLoci(params: any, contextData: any){
        const sel = StructureQuery.run(QueryHelper.getQueryObject(params, contextData) as any, contextData);
        return StructureSelection.toLociWithSourceUnits(sel);
    }

    export function getHetLoci(queryExp: Expression.Expression, contextData: any){
        const query = compile<StructureSelection>(queryExp);
        const sel = query(new QueryContext(contextData));
        return StructureSelection.toLociWithSourceUnits(sel);
    }
}
export interface ModelInfo2 {
    hetResidues: { name: string, indices: ResidueIndex[] }[],
    assemblies: { id: string, details: string, isPreferred: boolean }[],
    preferredAssemblyId: string | undefined
}
export namespace ModelInfo2 {
    async function getPreferredAssembly(ctx: PluginContext, model: Model) {
        if (model.entryId.length <= 3) return void 0;
        try {
            const id = model.entryId.toLowerCase();
            const src = await ctx.runTask(ctx.fetch({ url: `https://www.ebi.ac.uk/pdbe/api/pdb/entry/summary/${id}` })) as string;
            const json = JSON.parse(src);
            const data = json && json[id];

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

    export async function get(ctx: PluginContext, model: Model, checkPreferred: boolean): Promise<ModelInfo2> {
        const { _rowCount: residueCount } = model.atomicHierarchy.residues;
        const { offsets: residueOffsets } = model.atomicHierarchy.residueAtomSegments;
        const chainIndex = model.atomicHierarchy.chainAtomSegments.index;
        // const resn = SP.residue.label_comp_id, entType = SP.entity.type;

        const pref = checkPreferred
            ? getPreferredAssembly(ctx, model)
            : void 0;

        const hetResidues: ModelInfo2['hetResidues'] = [];
        const hetMap = new Map<string, ModelInfo2['hetResidues'][0]>();

        for (let rI = 0 as ResidueIndex; rI < residueCount; rI++) {
            const cI = chainIndex[residueOffsets[rI]];
            const eI = model.atomicHierarchy.index.getEntityFromChain(cI);
            const entityType = model.entities.data.type.value(eI);
            if (entityType !== 'non-polymer' && entityType !== 'branched') continue;

            const comp_id = model.atomicHierarchy.atoms.label_comp_id.value(residueOffsets[rI]);

            let lig = hetMap.get(comp_id);
            if (!lig) {
                lig = { name: comp_id, indices: [] };
                hetResidues.push(lig);
                hetMap.set(comp_id, lig);
            }
            lig.indices.push(rI);
        }

        const preferredAssemblyId = await pref;
        const symmetry = ModelSymmetry.Provider.get(model);

        return {
            hetResidues: hetResidues,
            assemblies: symmetry ? symmetry.assemblies.map(a => ({ id: a.id, details: a.details, isPreferred: a.id === preferredAssemblyId })) : [],
            preferredAssemblyId
        };
    }
}

export interface ModelInfo {
    hetNames: string[],
    carbEntityCount: number,
}

export namespace ModelInfo {
    export async function get(model: Model, structures: any): Promise<ModelInfo> {
        const { _rowCount: residueCount } = model.atomicHierarchy.residues;
        const { offsets: residueOffsets } = model.atomicHierarchy.residueAtomSegments;
        const chainIndex = model.atomicHierarchy.chainAtomSegments.index;

        const hetNames: ModelInfo['hetNames'] = [];
        let carbEntityCount: ModelInfo['carbEntityCount'] = 0;
        for (let rI = 0 as ResidueIndex; rI < residueCount; rI++) {
            const cI = chainIndex[residueOffsets[rI]];
            const eI = model.atomicHierarchy.index.getEntityFromChain(cI);
            const entityType = model.entities.data.type.value(eI);
           
            if (entityType !== 'non-polymer' && entityType !== 'branched') continue;

            // const comp_id = model.atomicHierarchy.atoms.label_comp_id.value(rI);
            const comp_id = model.atomicHierarchy.atoms.label_comp_id.value(residueOffsets[rI]);
            if(entityType === 'branched'){ 
                carbEntityCount++; 
            } else {
                if(hetNames.indexOf(comp_id) === -1) hetNames.push(comp_id); 
            }                  

        }

        return {
            hetNames,
            carbEntityCount
        };
    }
}