import { QualityAssessment } from 'Molstar/extensions/model-archive/quality-assessment/prop';
import { Model, Queries, QueryContext, ResidueIndex, StructureProperties, StructureSelection } from 'Molstar/mol-model/structure';
import { StructureQuery } from 'Molstar/mol-model/structure/query/query';
import { BuiltInTrajectoryFormat } from 'Molstar/mol-plugin-state/formats/trajectory';
import { CreateVolumeStreamingInfo } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import Expression from 'Molstar/mol-script/language/expression';
import { compile } from 'Molstar/mol-script/runtime/query/compiler';
import { StateSelection } from 'Molstar/mol-state';
import { Task } from 'Molstar/mol-task';
import { Subject } from 'rxjs';
import { SIFTSMapping } from './sifts-mapping';
import { DefaultParams, InitParams } from './spec';

export type SupportedFormats = 'mmcif' | 'bcif' | 'cif' | 'pdb' | 'sdf'
export type LoadParams = { url: string, format?: BuiltInTrajectoryFormat, assemblyId?: string, isHetView?: boolean, isBinary?: boolean, progressMessage?: string }

export namespace PDBeVolumes {

    export function mapParams(defaultParams: any, mapParams: any, ref?: string | number) {
        const pdbeParams = { ...defaultParams };
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

        if (streamingState) {
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
        ]);

        const query = compile<StructureSelection>(queryExp);
        const sel = query(new QueryContext(contextData));
        return StructureSelection.toLociWithSourceUnits(sel);

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
    export function query(ligandViewParams: LigandQueryParam): { core: Expression.Expression, surroundings: Expression.Expression } {
        const atomGroupsParams: any = {
            'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()])
        };

        // Residue Param
        let residueParam: any;
        if (ligandViewParams.auth_seq_id !== undefined) {
            residueParam = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), ligandViewParams.auth_seq_id]);
        } else if (ligandViewParams.label_comp_id) {
            residueParam = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_comp_id(), ligandViewParams.label_comp_id]);
        }
        if (residueParam) atomGroupsParams['residue-test'] = residueParam;

        // Chain Param
        if (ligandViewParams.auth_asym_id) {
            atomGroupsParams['chain-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), ligandViewParams.auth_asym_id]);
        } else if (ligandViewParams.struct_asym_id) {
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

    export function branchedQuery(params: any): { core: Expression.Expression, surroundings: Expression.Expression } {
        const entityObjArray: any[] = [];

        params.atom_site.forEach((param: any) => {
            const qEntities = {
                'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()]),
                'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.auth_seq_id])
            };
            entityObjArray.push(qEntities);
        });

        const atmGroupsQueries: Expression.Expression[] = [];

        entityObjArray.forEach((entityObj: any) => {
            atmGroupsQueries.push(MS.struct.generator.atomGroups(entityObj));
        });

        const core = MS.struct.modifier.union([
            atmGroupsQueries.length === 1
                ? atmGroupsQueries[0]
                // Need to union before merge for fast performance
                : MS.struct.combinator.merge(atmGroupsQueries.map(q => MS.struct.modifier.union([q])))
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

        const selections: any[] = [];
        let siftMappings: any;
        let currentAccession: string;

        params.forEach(param => {
            const selection: any = {};

            // entity
            if (param.entity_id) selection['entityTest'] = (l: any) => StructureProperties.entity.id(l.element) === param.entity_id;

            // chain
            if (param.struct_asym_id) {
                selection['chainTest'] = (l: any) => StructureProperties.chain.label_asym_id(l.element) === param.struct_asym_id;
            } else if (param.auth_asym_id) {
                selection['chainTest'] = (l: any) => StructureProperties.chain.auth_asym_id(l.element) === param.auth_asym_id;
            }

            // residues
            if (param.label_comp_id) {
                selection['residueTest'] = (l: any) => StructureProperties.atom.label_comp_id(l.element) === param.label_comp_id;
            } else if (param.uniprot_accession && param.uniprot_residue_number !== undefined) {
                selection['residueTest'] = (l: any) => {
                    if (!siftMappings || currentAccession !== param.uniprot_accession) {
                        siftMappings = SIFTSMapping.Provider.get(contextData.models[0]).value;
                        currentAccession = param.uniprot_accession!;
                    }
                    const rI = StructureProperties.residue.key(l.element);
                    return param.uniprot_accession === siftMappings.accession[rI] && param.uniprot_residue_number === +siftMappings.num[rI];
                };
            } else if (param.uniprot_accession && param.start_uniprot_residue_number !== undefined && param.end_uniprot_residue_number !== undefined) {
                selection['residueTest'] = (l: any) => {
                    if (!siftMappings || currentAccession !== param.uniprot_accession) {
                        siftMappings = SIFTSMapping.Provider.get(contextData.models[0]).value;
                        currentAccession = param.uniprot_accession!;
                    }
                    const rI = StructureProperties.residue.key(l.element);
                    return param.uniprot_accession === siftMappings.accession[rI] && (param.start_uniprot_residue_number! <= +siftMappings.num[rI] && param.end_uniprot_residue_number! >= +siftMappings.num[rI]);
                };
            } else if (param.residue_number !== undefined) {
                selection['residueTest'] = (l: any) => StructureProperties.residue.label_seq_id(l.element) === param.residue_number;
            } else if (param.start_residue_number !== undefined && param.end_residue_number !== undefined && param.end_residue_number > param.start_residue_number) {
                selection['residueTest'] = (l: any) => {
                    const labelSeqId = StructureProperties.residue.label_seq_id(l.element);
                    return labelSeqId >= param.start_residue_number! && labelSeqId <= param.end_residue_number!;
                };

            } else if (param.start_residue_number !== undefined && param.end_residue_number !== undefined && param.end_residue_number === param.start_residue_number) {
                selection['residueTest'] = (l: any) => StructureProperties.residue.label_seq_id(l.element) === param.start_residue_number;
            } else if (param.auth_seq_id !== undefined) {
                selection['residueTest'] = (l: any) => StructureProperties.residue.auth_seq_id(l.element) === param.auth_seq_id;
            } else if (param.auth_residue_number !== undefined && !param.auth_ins_code_id) {
                selection['residueTest'] = (l: any) => StructureProperties.residue.auth_seq_id(l.element) === param.auth_residue_number;
            } else if (param.auth_residue_number !== undefined && param.auth_ins_code_id) {
                selection['residueTest'] = (l: any) => StructureProperties.residue.auth_seq_id(l.element) === param.auth_residue_number;
            } else if (param.start_auth_residue_number !== undefined && param.end_auth_residue_number !== undefined && param.end_auth_residue_number > param.start_auth_residue_number) {
                selection['residueTest'] = (l: any) => {
                    const authSeqId = StructureProperties.residue.auth_seq_id(l.element);
                    return authSeqId >= param.start_auth_residue_number! && authSeqId <= param.end_auth_residue_number!;
                };
            } else if (param.start_auth_residue_number !== undefined && param.end_auth_residue_number !== undefined && param.end_auth_residue_number === param.start_auth_residue_number) {
                selection['residueTest'] = (l: any) => StructureProperties.residue.auth_seq_id(l.element) === param.start_auth_residue_number;
            }

            // atoms
            if (param.atoms) {
                selection['atomTest'] = (l: any) => param.atoms!.includes(StructureProperties.atom.label_atom_id(l.element));
            }

            if (param.atom_id) {
                selection['atomTest'] = (l: any) => param.atom_id!.includes(StructureProperties.atom.id(l.element));
            }

            selections.push(selection);
        });

        const atmGroupsQueries: any[] = [];
        selections.forEach((selection: any) => {
            atmGroupsQueries.push(Queries.generators.atoms(selection));
        });

        return Queries.combinators.merge(atmGroupsQueries);
    }

    export function getInteractivityLoci(params: any, contextData: any) {
        const sel = StructureQuery.run(QueryHelper.getQueryObject(params, contextData) as any, contextData);
        return StructureSelection.toLociWithSourceUnits(sel);
    }

    export function getHetLoci(queryExp: Expression.Expression, contextData: any) {
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
            if (entityType === 'branched') {
                carbEntityCount++;
            } else {
                if (hetNames.indexOf(comp_id) === -1) hetNames.push(comp_id);
            }

        }

        return {
            hetNames,
            carbEntityCount
        };
    }
}

/** Run `action` with showing a message in the bottom-left corner of the plugin UI */
export async function runWithProgressMessage(plugin: PluginContext, progressMessage: string | undefined, action: () => any) {
    const task = Task.create(progressMessage ?? 'Task', async ctx => {
        let done = false;
        try {
            if (progressMessage) {
                setTimeout(() => { if (!done) ctx.update(progressMessage); }, 1000); // Delay the first update to force showing message in UI
            }
            await action();
        } finally {
            done = true;
        }
    });
    await plugin.runTask(task);
}

/** Parameters for a request to ModelServer */
export interface ModelServerRequest {
    pdbId: string,
    queryType: 'full' | 'residueSurroundings' | 'atoms', // add more when needed
    queryParams?: Record<string, any>,
}

/** Return URL for a ModelServer request.
 * If `queryType` is 'full' and `lowPrecisionCoords` is false, return URL of the static file instead (updated mmCIF or bCIF). */
export function getStructureUrl(initParams: InitParams, request: ModelServerRequest) {
    const pdbeUrl = (initParams.pdbeUrl ?? DefaultParams.pdbeUrl!).replace(/\/$/, ''); // without trailing slash
    const useStaticFile = request.queryType === 'full' && !initParams.lowPrecisionCoords;
    if (useStaticFile) {
        const suffix = initParams.encoding === 'bcif' ? '.bcif' : '_updated.cif';
        return `${pdbeUrl}/entry-files/download/${request.pdbId}${suffix}`;
    } else {
        const queryParams = {
            ...request.queryParams,
            encoding: initParams.encoding,
            lowPrecisionCoords: initParams.lowPrecisionCoords ? 1 : undefined,
        };
        const queryString = Object.entries(queryParams).filter(([key, value]) => value !== undefined).map(([key, value]) => `${key}=${value}`).join('&');
        const url = `${pdbeUrl}/model-server/v1/${request.pdbId}/${request.queryType}`;
        return (queryString !== '') ? `${url}?${queryString}` : url;
    }
}


export interface PluginCustomState {
    initParams?: InitParams,
    events?: {
        segmentUpdate: Subject<boolean>,
        superpositionInit: Subject<boolean>,
        isBusy: Subject<boolean>,
    },
    superpositionState?: any, // TODO try to find type
    superpositionError?: string,
}
/** Access `plugin.customState` only through this function to get proper typing.
 * Supports getting and setting properties. */
export function PluginCustomState(plugin: PluginContext): PluginCustomState {
    return (plugin.customState as any) ??= {};
}

/** Create a copy of object `object`, fill in missing/undefined keys using `defaults` */
export function addDefaults<T extends {}>(object: Partial<T> | undefined, defaults: T): T {
    const result: Partial<T> = { ...object };
    for (const key in defaults) {
        result[key] ??= defaults[key];
    }
    return result as T;
}
