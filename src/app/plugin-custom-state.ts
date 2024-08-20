import { SymmetryOperator } from 'molstar/lib/mol-math/geometry';
import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateSelection, StateTransform } from 'molstar/lib/mol-state';
import { Subject } from 'rxjs';
import { InitParams } from './spec';


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
                /** URL of BCIF file */
                bcif: string,
                /** URL of CIF file */
                cif: string,
                /** URL of PAE image */
                pae: string,
                /** Length of UniProt sequence */
                length: number,
            },
            length: number,
            ref: string,
            traceOnly: boolean,
            visibility: boolean[],
            transforms: Mat4[],
            rmsds: string[][],
            coordinateSystems: (SymmetryOperator | undefined)[],
        },

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
