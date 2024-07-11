import { SymmetryOperator } from 'Molstar/mol-math/geometry';
import { Mat4 } from 'Molstar/mol-math/linear-algebra';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { StateSelection, StateTransform } from 'Molstar/mol-state';
import { Subject } from 'rxjs';
import { InitParams } from './spec';
import { LigandClusteringData } from './superposition';


export interface PluginCustomState {
    initParams?: InitParams,
    events?: {
        segmentUpdate: Subject<boolean>,
        superpositionInit: Subject<boolean>,
        isBusy: Subject<boolean>,
    },
    superpositionState?: {
        models: { [molId: string]: string },
        entries: { [pdbId: string]: StateSelection.Selector },
        refMaps: { [ref: string]: string },
        segmentData: Segment[] | undefined,
        matrixData: { [key: string]: { matrix: number[][] } },
        ligandClusterData?: LigandClusteringData,
        activeSegment: number,
        loadedStructs: string[][],
        visibleRefs: StateTransform.Ref[][],
        invalidStruct: string[],
        noMatrixStruct: string[],
        hets: { [key: string]: unknown[] },
        /** Counts how many colors have been assigned, per segment */
        colorCounters: number[],
        alphafold: {
            apiData: {
                cif: string,
                pae: string,
                length: number,
            },
            length: number,
            ref: string,
            traceOnly: boolean,
            visibility: boolean[],
            transforms: Mat4[],
            rmsds: string[][],
            coordinateSystems: (SymmetryOperator | undefined)[]
        }

    },
    superpositionError?: string,
}

export interface ClusterMember { pdb_id: string, auth_asym_id: string, struct_asym_id: string, entity_id: number, is_representative: boolean };
export interface Segment { segment_start: number, segment_end: number, clusters: ClusterMember[][], isHetView?: boolean, isBinary?: boolean };


/** Access `plugin.customState` only through this function to get proper typing.
 * Supports getting and setting properties. */
export function PluginCustomState(plugin: PluginContext): PluginCustomState {
    return (plugin.customState as any) ??= {};
}
