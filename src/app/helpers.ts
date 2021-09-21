import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { StateSelection } from 'Molstar/mol-state';
import Expression from 'Molstar/mol-script/language/expression';
import { StructureSelection, QueryContext } from 'Molstar/mol-model/structure';
import { BuiltInTrajectoryFormat } from 'Molstar/mol-plugin-state/formats/trajectory';
import { CreateVolumeStreamingInfo } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
// import { VolumeStreaming } from '../../mol-plugin/behavior/dynamic/volume-streaming/behavior';
import { compile } from 'Molstar/mol-script/runtime/query/compiler';
import { Model, ResidueIndex } from 'Molstar/mol-model/structure';

export type SupportedFormats = 'mmcif' | 'bcif' | 'cif' | 'pdb' | 'sdf'
export type LoadParams = { url: string, format?: BuiltInTrajectoryFormat, assemblyId?: string, isHetView?: boolean, isBinary?: boolean }

export namespace PDBeVolumes {

    export function mapParams(defaultParams: any, mapParams: any, ref?: string|number) {
        const pdbeParams = {...defaultParams};
        pdbeParams.options.behaviorRef = 'volume-streaming' + '' + Math.floor(Math.random() * Math.floor(100));
        pdbeParams.options.emContourProvider = 'pdbe';
        pdbeParams.options.serverUrl = 'https://www.ebi.ac.uk/pdbe/densities';
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

export type LigandQueryParam = {
    label_comp_id_list?: any,
    auth_asym_id?: string,
    struct_asym_id?: string,
    label_comp_id?: string,
    auth_seq_id?: number,
    show_all?: boolean
};

export namespace LigandView {
    export function query(ligandViewParams: LigandQueryParam): {core: Expression, surroundings: Expression} {
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

    export function branchedQuery(params: any): {core: Expression, surroundings: Expression} {
        let entityObjArray: any = [];

        params.atom_site.forEach((param: any) => {
                let qEntities: any = {
                    'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()]),
                    'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.auth_seq_id])
                };
                entityObjArray.push(qEntities);
        });

        const atmGroupsQueries: Expression[] = [];

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
    atom_id?: number[]
};

export namespace QueryHelper {
    export function getQueryObject(params: QueryParam[]): Expression {

        let selections: any = [];

        params.forEach(param => {
            let selection: any = {};
            
            // entity
            if(param.entity_id) selection['entity-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_entity_id(), param.entity_id]);

            // chain
            if(param.struct_asym_id){
                selection['chain-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), param.struct_asym_id]);
            }else if(param.auth_asym_id){
                selection['chain-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), param.auth_asym_id]);
            }

            // residues
            if(param.label_comp_id) {
                selection['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_comp_id(), param.label_comp_id]);
            } else if(param.residue_number){
                selection['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_seq_id(), param.residue_number]);
            }else if((param.start_residue_number && param.end_residue_number) && (param.end_residue_number > param.start_residue_number)){
                selection['residue-test'] = MS.core.rel.inRange([MS.struct.atomProperty.macromolecular.label_seq_id(), param.start_residue_number, param.end_residue_number]);
            }else if((param.start_residue_number && param.end_residue_number) && (param.end_residue_number === param.start_residue_number)){
                selection['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_seq_id(), param.start_residue_number]);
            }else if(param.auth_seq_id){
                selection['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(),param.auth_seq_id]);
            }else if(param.auth_residue_number && !param.auth_ins_code_id){
                selection['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.auth_residue_number]);
            }else if(param.auth_residue_number && param.auth_ins_code_id){
                selection['residue-test'] = MS.core.rel.eq([
                    MS.struct.atomProperty.macromolecular.authResidueId(),
                    MS.struct.type.authResidueId([undefined, param.auth_residue_number, param.auth_ins_code_id])
                ]);
            }else if((param.start_auth_residue_number && param.end_auth_residue_number) && (param.end_auth_residue_number > param.start_auth_residue_number)){
                if(param.start_auth_ins_code_id && param.end_auth_ins_code_id){
                    selection['residue-test'] = MS.core.rel.inRange([
                        MS.struct.atomProperty.macromolecular.authResidueId(),
                        MS.struct.type.authResidueId([undefined, param.start_auth_residue_number, param.start_auth_ins_code_id]),
                        MS.struct.type.authResidueId([undefined, param.start_auth_residue_number, param.start_auth_ins_code_id])
                    ]);
                }else{
                    selection['residue-test'] = MS.core.rel.inRange([
                        MS.struct.atomProperty.macromolecular.auth_seq_id(), param.start_auth_residue_number, param.end_auth_residue_number]);
                }
            }else if((param.start_auth_residue_number && param.end_auth_residue_number) && (param.end_auth_residue_number === param.start_auth_residue_number)){
                if(param.start_auth_ins_code_id){
                    selection['residue-test'] = MS.core.rel.eq([
                        MS.struct.atomProperty.macromolecular.authResidueId(),
                        MS.struct.type.authResidueId([undefined, param.start_auth_residue_number, param.start_auth_ins_code_id])
                    ]);
                }else{
                    selection['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.start_auth_residue_number]);
                }
            }

            // atoms
            if(param.atoms){
                let atomsArr: any = [];
                param.atoms.forEach(atom => {
                    atomsArr.push(MS.core.rel.eq([MS.ammp('label_atom_id'), atom]));
                });
                selection['atom-test'] = MS.core.logic.or(atomsArr);
            }

            if(param.atom_id){
                let atomsIdArr: any = [];
                param.atom_id.forEach(atomId => {
                    atomsIdArr.push(MS.core.rel.eq([MS.ammp('id'), atomId]));
                });
                selection['atom-test'] = MS.core.logic.or(atomsIdArr);
            }

            selections.push(selection);
        });

        const atmGroupsQueries: Expression[] = [];

        selections.forEach((selection: any) => {
            atmGroupsQueries.push(MS.struct.generator.atomGroups(selection));
        });

        return MS.struct.modifier.union([
            atmGroupsQueries.length === 1
                ? atmGroupsQueries[0]
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