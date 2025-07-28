import { QualityAssessment } from 'molstar/lib/extensions/model-archive/quality-assessment/prop';
import { ComponentExpressionT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { Mat3, Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { Model, Queries, QueryContext, ResidueIndex, Structure, StructureProperties, StructureSelection } from 'molstar/lib/mol-model/structure';
import { QueryPredicate } from 'molstar/lib/mol-model/structure/query/context';
import { AtomsQueryParams } from 'molstar/lib/mol-model/structure/query/queries/generators';
import { StructureQuery } from 'molstar/lib/mol-model/structure/query/query';
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { CreateVolumeStreamingInfo } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginConfigItem } from 'molstar/lib/mol-plugin/config';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginLayoutStateParams, PluginLayoutStateProps } from 'molstar/lib/mol-plugin/layout';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { Expression } from 'molstar/lib/mol-script/language/expression';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { StateSelection } from 'molstar/lib/mol-state';
import { Task } from 'molstar/lib/mol-task';
import { Overpaint } from 'molstar/lib/mol-theme/overpaint';
import { Color } from 'molstar/lib/mol-util/color';
import { ColorName, ColorNames } from 'molstar/lib/mol-util/color/names';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { SIFTSMapping, SIFTSMappingMapping } from './sifts-mapping';
import { AnyColor, InitParams } from './spec';


export type SupportedFormats = 'mmcif' | 'bcif' | 'cif' | 'pdb' | 'sdf';
export interface LoadParams {
    url: string,
    format?: BuiltInTrajectoryFormat,
    assemblyId?: string,
    isHetView?: boolean,
    isBinary?: boolean,
    progressMessage?: string,
    /** Arbitrary string identifier to refer to this structure later */
    id?: string,
}

export interface MapParams {
    'em'?: MapStyle,
    '2fo-fc'?: MapStyle,
    'fo-fc(+ve)'?: MapStyle,
    'fo-fc(-ve)'?: MapStyle,
}
interface MapStyle {
    opacity?: number,
    wireframe?: boolean,
}


export namespace PDBeVolumes {

    export function mapParams(defaultParams: any, mapParams?: MapParams, ref?: string | number) {
        const pdbeParams = { ...defaultParams };
        pdbeParams.options.behaviorRef = 'volume-streaming' + '' + Math.floor(Math.random() * Math.floor(100));
        pdbeParams.options.emContourProvider = 'pdbe';
        pdbeParams.options.serverUrl = 'https://www.ebi.ac.uk/pdbe/volume-server';
        const MAIN_MAP_DEFAULTS: MapStyle = { opacity: 0.49, wireframe: false };
        const DIFF_MAP_DEFAULTS: MapStyle = { opacity: 0.3, wireframe: true };
        pdbeParams.options.channelParams['em'] = addDefaults(mapParams?.['em'], MAIN_MAP_DEFAULTS);
        pdbeParams.options.channelParams['2fo-fc'] = addDefaults(mapParams?.['2fo-fc'], MAIN_MAP_DEFAULTS);
        pdbeParams.options.channelParams['fo-fc(+ve)'] = addDefaults(mapParams?.['fo-fc(+ve)'], DIFF_MAP_DEFAULTS);
        pdbeParams.options.channelParams['fo-fc(-ve)'] = addDefaults(mapParams?.['fo-fc(-ve)'], DIFF_MAP_DEFAULTS);
        return pdbeParams;
    }

    export function displayUsibilityMessage(plugin: PluginContext) {
        PluginCommands.Toast.Show(plugin, {
            title: 'Volume',
            message: 'Streaming enabled, click on a residue or an atom to view the data.',
            key: 'toast-1',
            timeoutMs: 7000,
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
    export function getLociByPLDDT(score: number, contextData: Structure) {
        const queryExp = MS.struct.modifier.union([
            MS.struct.modifier.wholeResidues([
                MS.struct.modifier.union([
                    MS.struct.generator.atomGroups({
                        'chain-test': MS.core.rel.eq([MS.ammp('objectPrimitive'), 'atomistic']),
                        'residue-test': MS.core.rel.gr([QualityAssessment.symbols.pLDDT.symbol(), score]),
                    }),
                ]),
            ]),
        ]);

        const query = compile<StructureSelection>(queryExp);
        const sel = query(new QueryContext(contextData));
        return StructureSelection.toLociWithSourceUnits(sel);

    }
}


export interface LigandQueryParam {
    label_comp_id_list?: any,
    auth_asym_id?: string,
    struct_asym_id?: string,
    label_comp_id?: string,
    auth_seq_id?: number,
    show_all?: boolean,
}


export namespace LigandView {
    export function query(ligandViewParams: LigandQueryParam): { core: Expression, surroundings: Expression } {
        const atomGroupsParams: any = {
            'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()]),
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
                MS.struct.generator.atomGroups(atomGroupsParams),
            ]);

        // Construct surroundings query
        const surroundings = MS.struct.modifier.includeSurroundings({ 0: core, radius: 5, 'as-whole-residues': true });

        return {
            core,
            surroundings,
        };

    }

    export function branchedQuery(params: any): { core: Expression, surroundings: Expression } {
        const entityObjArray: any[] = [];

        params.atom_site.forEach((param: any) => {
            const qEntities = {
                'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()]),
                'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.auth_seq_id]),
            };
            entityObjArray.push(qEntities);
        });

        const atmGroupsQueries: Expression[] = [];

        entityObjArray.forEach((entityObj: any) => {
            atmGroupsQueries.push(MS.struct.generator.atomGroups(entityObj));
        });

        const core = MS.struct.modifier.union([
            atmGroupsQueries.length === 1
                ? atmGroupsQueries[0]
                // Need to union before merge for fast performance
                : MS.struct.combinator.merge(atmGroupsQueries.map(q => MS.struct.modifier.union([q]))),
        ]);

        // Construct surroundings query
        const surroundings = MS.struct.modifier.includeSurroundings({ 0: core, radius: 5, 'as-whole-residues': true });

        return {
            core,
            surroundings,
        };

    }
}


export interface QueryParam {
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
    /** @deprecated I don't know what this is */
    start?: any,
    /** @deprecated I don't know what this is */
    end?: any,
    atom_id?: number[],
    uniprot_accession?: string,
    uniprot_residue_number?: number,
    start_uniprot_residue_number?: number,
    end_uniprot_residue_number?: number,
}

export function queryParamsToMvsComponentExpressions(params: QueryParam[]): ComponentExpressionT[] {
    const broadcasted = broadcast(params, ['atoms', 'atom_id']);
    return broadcasted.map(item => ({
        label_entity_id: item.entity_id,
        label_asym_id: item.struct_asym_id,
        auth_asym_id: item.auth_asym_id,
        label_seq_id: item.residue_number,
        auth_seq_id: item.auth_seq_id ?? item.auth_residue_number,
        pdbx_PDB_ins_code: item.auth_ins_code_id,
        beg_label_seq_id: item.start_residue_number,
        end_label_seq_id: item.end_residue_number,
        beg_auth_seq_id: item.start_auth_residue_number,
        end_auth_seq_id: item.end_auth_residue_number,
        label_atom_id: item.atoms,
        auth_atom_id: undefined,
        type_symbol: undefined,
        atom_id: item.atom_id,
        atom_index: undefined,
        label_comp_id: item.label_comp_id,
        auth_comp_id: undefined,
    }));
}

/** `broadcastSingleKey([{chain: 'A', residue: 5, atom: ['C', 'O']}], 'atom')`
 * -> `[{chain: 'A', residue: 5, atom: 'C'}], {chain: 'A', residue: 5, atom: 'O'}` */
function broadcastSingleKey<TKey extends keyof any, TValue, TOthers extends {}>(objs: ({ [key in TKey]?: TValue[] } & TOthers)[], key: TKey): ({ [key in TKey]?: TValue } & TOthers)[] {
    const out = [];
    for (const obj of objs) {
        if (obj[key] === undefined) {
            out.push(obj);
        } else {
            for (const value of obj[key]) {
                out.push({ ...obj, [key]: value });
            }
        }
    }
    return out;
}

/** `broadcast([{chain: 'A', residue: [5, 6], atom: ['C', 'O']}], ['residue', 'atom'])`
 * -> `[{chain: 'A', residue: 5, atom: 'C'}], {chain: 'A', residue: 5, atom: 'O', {chain: 'A', residue: 6, atom: 'C'}], {chain: 'A', residue: 6, atom: 'O'}` */
function broadcast<T extends object, TKey extends ArrayKeys<T>>(objs: T[], keys: TKey[]): ({ [key in TKey]?: Extract<T[key], unknown[]>[number] } & Omit<T, TKey>)[] {
    return keys.reduce((list, key) => broadcastSingleKey(list, key), objs);
}

/** Extract keys of `T` which have (optional) array type value */
type ArrayKeys<T> = Exclude<{ [key in keyof T]: never[] extends T[key] ? key : never }[keyof T], undefined>;


export namespace QueryHelper {

    export function getQueryObject(params: QueryParam[], contextData: Structure): Expression {
        const selections: Partial<AtomsQueryParams>[] = [];

        /** `undefined` means SIFTSMappingMapping has not been retrieved yet. `null` means SIFTSMappingMapping has been retrieved unsuccessfully.  */
        let _siftMappings: SIFTSMappingMapping | null | undefined;
        function getSiftsMappings(): SIFTSMappingMapping | null {
            if (_siftMappings === undefined) _siftMappings = SIFTSMapping.Provider.get(contextData.models[0]).value ?? null;
            return _siftMappings;
        }

        for (const param of params) {
            const predicates = {
                entity: [] as QueryPredicate[],
                chain: [] as QueryPredicate[],
                residue: [] as QueryPredicate[],
                atom: [] as QueryPredicate[],
            };

            // entity
            if (param.entity_id !== undefined) {
                predicates.entity.push(l => StructureProperties.entity.id(l.element) === param.entity_id);
            }

            // chain
            if (param.struct_asym_id !== undefined) {
                predicates.chain.push(l => StructureProperties.chain.label_asym_id(l.element) === param.struct_asym_id);
            }
            if (param.auth_asym_id !== undefined) {
                predicates.chain.push(l => StructureProperties.chain.auth_asym_id(l.element) === param.auth_asym_id);
            }

            // residue
            if (param.label_comp_id !== undefined) {
                predicates.residue.push(l => StructureProperties.atom.label_comp_id(l.element) === param.label_comp_id);
            }

            if (param.residue_number !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.label_seq_id(l.element) === param.residue_number);
            }
            if (param.start_residue_number !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.label_seq_id(l.element) >= param.start_residue_number!);
            }
            if (param.end_residue_number !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.label_seq_id(l.element) <= param.end_residue_number!);
            }
            if (param.auth_seq_id !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.auth_seq_id(l.element) === param.auth_seq_id);
            }
            if (param.auth_residue_number !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.auth_seq_id(l.element) === param.auth_residue_number);
            }
            if (param.auth_ins_code_id !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.pdbx_PDB_ins_code(l.element) === param.auth_ins_code_id);
            }
            if (param.start_auth_residue_number !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.auth_seq_id(l.element) >= param.start_auth_residue_number!);
                if (param.start_auth_ins_code_id !== undefined) {
                    // This assumes insertion code come in alphabetical order, which is not always true (e.g. 1ucy chain A [auth L]). However, authors of such monstrosities do not deserve their structures to be displayed correctly.
                    predicates.residue.push(l => StructureProperties.residue.auth_seq_id(l.element) > param.start_auth_residue_number! || StructureProperties.residue.pdbx_PDB_ins_code(l.element) >= param.start_auth_ins_code_id!);
                }
            }
            if (param.end_auth_residue_number !== undefined) {
                predicates.residue.push(l => StructureProperties.residue.auth_seq_id(l.element) <= param.end_auth_residue_number!);
                if (param.end_auth_ins_code_id !== undefined) {
                    // This assumes insertion code come in alphabetical order, which is not always true (e.g. 1ucy chain A [auth L]). However, authors of such monstrosities do not deserve their structures to be displayed correctly.
                    predicates.residue.push(l => StructureProperties.residue.auth_seq_id(l.element) < param.end_auth_residue_number! || StructureProperties.residue.pdbx_PDB_ins_code(l.element) <= param.end_auth_ins_code_id!);
                }
            }

            if (param.uniprot_accession !== undefined) {
                predicates.residue.push(l => getSiftsMappings()?.accession[StructureProperties.residue.key(l.element)] === param.uniprot_accession);
            }
            if (param.uniprot_residue_number !== undefined) {
                predicates.residue.push(l => Number(getSiftsMappings()?.num[StructureProperties.residue.key(l.element)]) === param.uniprot_residue_number);
            }
            if (param.start_uniprot_residue_number !== undefined) {
                predicates.residue.push(l => Number(getSiftsMappings()?.num[StructureProperties.residue.key(l.element)]) >= param.start_uniprot_residue_number!);
            }
            if (param.end_uniprot_residue_number !== undefined) {
                predicates.residue.push(l => Number(getSiftsMappings()?.num[StructureProperties.residue.key(l.element)]) <= param.end_uniprot_residue_number!);
            }

            // atom
            if (param.atoms) {
                predicates.atom.push(l => param.atoms!.includes(StructureProperties.atom.label_atom_id(l.element)));
            }
            if (param.atom_id) {
                predicates.atom.push(l => param.atom_id!.includes(StructureProperties.atom.id(l.element)));
            }

            selections.push({
                entityTest: predicateConjunction(predicates.entity),
                chainTest: predicateConjunction(predicates.chain),
                residueTest: predicateConjunction(predicates.residue),
                atomTest: predicateConjunction(predicates.atom),
            });
        }

        const atmGroupsQueries = selections.map(selection => Queries.generators.atoms(selection));
        return Queries.combinators.merge(atmGroupsQueries);
    }

    function predicateConjunction<X>(predicates: ((x: X) => boolean)[]): ((x: X) => boolean) | undefined {
        if (predicates.length === 0) return undefined;
        if (predicates.length === 1) return predicates[0];
        return (x => predicates.every(pred => pred(x)));
    }

    export function getInteractivityLoci(params: QueryParam[], contextData: Structure) {
        const sel = StructureQuery.run(QueryHelper.getQueryObject(params, contextData) as any, contextData);
        return StructureSelection.toLociWithSourceUnits(sel);
    }

    export function getHetLoci(queryExp: Expression, contextData: Structure) {
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
            carbEntityCount,
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
    const pdbeUrl = initParams.pdbeUrl.replace(/\/$/, ''); // without trailing slash
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

/** Combine URL parts into one URL while avoiding double slashes. Examples:
 * combineUrl('https://example.org', '1tqn') -> 'https://example.org/1tqn';
 * combineUrl('https://example.org/', '1tqn') -> 'https://example.org/1tqn'; */
export function combineUrl(firstPart: string, ...moreParts: string[]): string {
    let result = firstPart;
    for (const part of moreParts) {
        result = result.replace(/\/$/, '') + '/' + part; // removing extra trailing slash
    }
    return result;
}

/** Create a copy of object `object`, fill in missing/undefined keys using `defaults`.
 * This is similar to {...defaults,...object} but `undefined` in `object` will not override a value from `defaults`. */
export function addDefaults<T extends {}>(object: Partial<T> | undefined, defaults: T): T {
    const result: Partial<T> = { ...object };
    for (const key in defaults) {
        result[key] ??= defaults[key];
    }
    return result as T;
}

/** Convert `colorVal` from any of supported color formats (e.g. 'yellow', '#ffff00', {r:255,g:255,b:0}) to `Color`.
 * Return default color (gray) if `colorVal` is undefined or null.
*/
export function normalizeColor(colorVal: AnyColor | null | undefined, defaultColor: Color = Color.fromRgb(170, 170, 170)): Color {
    try {
        if (colorVal === undefined || colorVal === null) return defaultColor;
        if (typeof colorVal === 'number') return Color(colorVal);
        if (typeof colorVal === 'string' && colorVal[0] === '#') return Color(Number(`0x${colorVal.substring(1)}`));
        if (typeof colorVal === 'string' && colorVal in ColorNames) return ColorNames[colorVal as ColorName];
        if (typeof colorVal === 'object') return Color.fromRgb(colorVal.r ?? 0, colorVal.g ?? 0, colorVal.b ?? 0);
    } catch {
        // do nothing
    }
    return defaultColor;
}

/** Apply overpaint to every representation of every component in a structure.
 * Excludes representations created as "added representations" by `PDBeMolstarPlugin.visual.select`. */
export async function applyOverpaint(plugin: PluginContext, structRef: StructureRef, overpaintLayers: Overpaint.BundleLayer[]) {
    if (overpaintLayers.length === 0) return;
    const update = plugin.build();
    for (const component of structRef.components) {
        if (component.cell.transform.tags?.includes(Tags.AddedComponent)) continue;
        for (const repr of component.representations) {
            const currentOverpaint = plugin.state.data.select(StateSelection.Generators
                .ofTransformer(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle, repr.cell.transform.ref)
                .withTag(Tags.Overpaint));
            if (currentOverpaint.length === 0) {
                // Create a new overpaint
                update.to(repr.cell.transform.ref).apply(
                    StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                    { layers: overpaintLayers },
                    { tags: Tags.Overpaint },
                );
            } else {
                // Add layers to existing overpaint
                update.to(currentOverpaint[0]).update(old => ({ layers: old.layers.concat(overpaintLayers) }));
            }
        }
    }
    await update.commit();
}

export const Tags = {
    /** Tag needed for `clearStructureOverpaint`; defined in src/mol-plugin-state/helpers/structure-overpaint.ts but private */
    Overpaint: 'overpaint-controls',
    /** Marks structure components added by `select` */
    AddedComponent: 'pdbe-molstar.added-component',
} as const;

export const StructureComponentTags = {
    polymer: ['structure-component-static-polymer'],
    het: ['structure-component-static-ligand', 'structure-component-static-ion'],
    water: ['structure-component-static-water'],
    carbs: ['structure-component-static-branched'],
    nonStandard: ['structure-component-static-non-standard'],
    coarse: ['structure-component-static-coarse'],
    maps: ['volume-streaming-info'],
};

/** Return component type based on the component's PluginStateObject tags */
export function getComponentTypeFromTags(tags: string[] | undefined): keyof typeof StructureComponentTags | undefined {
    let type: keyof typeof StructureComponentTags;
    for (type in StructureComponentTags) {
        const typeTags = StructureComponentTags[type];
        if (typeTags.some(tag => tags?.includes(tag))) {
            return type;
        }
    }
    return undefined;
}

/** Return a new array containing `values` without duplicates (only first occurrence will be kept).
 * Values v1, v2 are considered duplicates when `key(v1)===key(v2)`. */
export function distinct<T>(values: T[], key: ((value: T) => unknown) = (value => value)): T[] {
    const out: T[] = [];
    const seenKeys = new Set<unknown>();
    for (const value of values) {
        const theKey = key(value);
        if (!seenKeys.has(theKey)) {
            out.push(value);
            seenKeys.add(theKey);
        }
    }
    return out;
}

/** Group elements by result of `groupFunction` applied to them */
export function groupElements<T, G>(elements: T[], groupFunction: (elem: T) => G) {
    const groups: G[] = [];
    const members = new Map<G, T[]>();
    for (const elem of elements) {
        const g = groupFunction(elem);
        if (members.has(g)) {
            members.get(g)!.push(elem);
        } else {
            groups.push(g);
            members.set(g, [elem]);
        }
    }
    return {
        /** Groups (results of `groupFunction`) in order as they first appeared in `elements` */
        groups,
        /** Mapping of groups to lists of they members */
        members,
    };
}

/** Return a mapping of elements to their index in the `elements` array */
export function createIndex<T>(elements: T[]) {
    const index = new Map<T, number>();
    elements.forEach((elem, i) => index.set(elem, i));
    return index;
}

/** Return modulo of two numbers (a % b) within range [0, b) */
export function nonnegativeModulo(a: number, b: number) {
    const modulo = a % b;
    return (modulo < 0) ? modulo + b : modulo;
}


/** `{ status: 'completed', result: result }` means the job completed and returned/resolved to `result`.
* `{ status: 'cancelled' }` means the job started but another jobs got enqueued before its completion.
* `{ status: 'skipped' }` means the job did not start because another jobs got enqueued. */
export type PreemptiveQueueResult<Y> = { status: 'completed', result: Awaited<Y> } | { status: 'cancelled' } | { status: 'skipped' };

interface PreemptiveQueueJob<X, Y> {
    args: X,
    callbacks: {
        resolve: (result: PreemptiveQueueResult<Y>) => void,
        reject: (reason: any) => void,
    },
    cancelled?: boolean,
}

/** Queue for running jobs where enqueued jobs get discarded when a new job is enqueued.
 * (Discarded jobs may or may not actually be executed, but their result is not accessible anyway.) */
export class PreemptiveQueue<X, Y> {
    private running?: PreemptiveQueueJob<X, Y>;
    private queuing?: PreemptiveQueueJob<X, Y>;

    constructor(private readonly run: (args: X) => Y | Promise<Y>) { }

    /** Enqueue a job which will execute `run(args)`.
     * Return a promise that either resolves to `{ status: 'completed', result }` where `result` is `await run(args)`,
     * or resolves to `{ status: 'cancelled' }` if the job starts being executed but another jobs gets enqueued before its completion,
     * or resolves to `{ status: 'skipped' }` if the job does not even start before another jobs gets enqueued,
     * or rejects if the job is completed but throws an error.  */
    public requestRun(args: X): Promise<PreemptiveQueueResult<Y>> {
        if (this.running) {
            this.running.cancelled = true;
            this.running.callbacks.resolve({ status: 'cancelled' });
        }
        if (this.queuing) {
            this.queuing.callbacks.resolve({ status: 'skipped' });
        }
        const promise = new Promise<PreemptiveQueueResult<Y>>((resolve, reject) => {
            this.queuing = { args, callbacks: { resolve, reject } };
        });
        if (!this.running) {
            this.handleRequests(); // do not await
        }
        return promise;
    }
    /** Request handling loop. Resolves when there are no more requests. Not to be awaited, should run in the background.  */
    private async handleRequests(): Promise<void> {
        while (this.queuing) {
            this.running = this.queuing;
            this.queuing = undefined;
            await sleep(0); // let other things happen (this pushes the rest of the function to the end of the queue)
            try {
                const result = await this.run(this.running.args);
                if (!this.running.cancelled) {
                    this.running.callbacks.resolve({ status: 'completed', result });
                }
            } catch (error) {
                if (!this.running.cancelled) {
                    this.running.callbacks.reject(error);
                }
            }
            this.running = undefined;
        }
    }
}


/** Functions for working with plugin config items */
export namespace PluginConfigUtils {
    /** Type of config definition for given type of config values T */
    export type ConfigFor<T extends object> = { [key in keyof T]: PluginConfigItem<T[key]> };

    /** Retrieve config values for items in `configItems` from the current plugin config */
    export function getConfigValues<T extends object>(plugin: PluginContext | undefined, configItems: ConfigFor<T>, defaults: T): T {
        const values = {} as T;
        for (const name in configItems) {
            values[name] = plugin?.config.get(configItems[name]) ?? defaults[name];
        }
        return values;
    }
}

export function pluginLayoutStateFromInitParams(initParams: InitParams): PluginLayoutStateProps {
    return {
        isExpanded: initParams.expanded,
        showControls: !initParams.hideControls,
        regionState: {
            left: initParams.leftPanel ? 'full' : 'hidden',
            right: initParams.rightPanel ? 'full' : 'hidden',
            top: initParams.sequencePanel ? 'full' : 'hidden',
            bottom: initParams.logPanel ? 'full' : 'hidden',
        },
        controlsDisplay: initParams.reactive ? 'reactive' : initParams.landscape ? 'landscape' : PluginLayoutStateParams.controlsDisplay.defaultValue,
    };
}

export function getRotationMat4(view: 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom' | Mat3): Mat4 {
    switch (view) {
        case 'front': return Mat4.identity();
        case 'back': return [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1] as any;
        case 'right': return [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1] as any;
        case 'left': return [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1] as any;
        case 'top': return [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as any;
        case 'bottom': return [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1] as any;
        default: {
            const out = Mat4.fromMat3(Mat4(), view);
            out[15] = 1;
            return out;
        }
    }
}
