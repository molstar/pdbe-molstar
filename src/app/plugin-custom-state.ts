import { Mat4 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateSelection, StateTransform } from 'molstar/lib/mol-state';
import { JSXElementConstructor } from 'react';
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
        },
    },
    superpositionError?: string,
    /** Space for extensions to save their plugin-bound custom state. Only access via `ExtensionCustomState`! */
    extensions?: {
        [extensionId: string]: {} | undefined,
    },
    /** Registry for custom UI components. Only access via `PluginCustomControls`! */
    customControls?: { [region in PluginCustomControlRegion]?: PluginCustomControlRegistry },
}

export interface ClusterMember { pdb_id: string, auth_asym_id: string, struct_asym_id: string, entity_id: number, is_representative: boolean };
export interface Segment { segment_start: number, segment_end: number, clusters: ClusterMember[][], isHetView?: boolean, isBinary?: boolean };


/** Access `plugin.customState` only through this function to get proper typing.
 * Supports getting and setting properties. */
export function PluginCustomState(plugin: PluginContext): PluginCustomState {
    return (plugin.customState as any) ??= {};
}


/** Functions for accessing plugin-bound custom state for extensions. */
export const ExtensionCustomState = {
    /** Get plugin-bound custom state for a specific extension. If not present, initialize with empty object. */
    get<T extends {}>(plugin: PluginContext, extensionId: string): Partial<T> {
        const extensionStates = PluginCustomState(plugin).extensions ??= {};
        const extensionState: Partial<T> = extensionStates[extensionId] ??= {};
        return extensionState;
    },
    /** Remove plugin-bound custom state for a specific extension (if present). */
    clear(plugin: PluginContext, extensionId: string): void {
        const extensionStates = PluginCustomState(plugin).extensions ??= {};
        delete extensionStates[extensionId];
    },
    /** Return function which gets plugin-bound custom state for a specific extension. */
    getter<StateType extends {}>(extensionId: string) {
        return (plugin: PluginContext) => this.get<StateType>(plugin, extensionId);
    },
};


/** UI region where custom controls can be registered */
export type PluginCustomControlRegion = 'structure-tools' | 'viewport-top-center' | 'viewport-top-left';

/** Collection of registered custom controls in a UI region */
export type PluginCustomControlRegistry = Map<string, JSXElementConstructor<{}>>;

/** Functions for registering/unregistering custom UI controls */
export const PluginCustomControls = {
    /** Get custom controls in the specified UI `region`. */
    get(plugin: PluginContext, region: PluginCustomControlRegion): PluginCustomControlRegistry {
        const customControls = PluginCustomState(plugin).customControls ??= {};
        return customControls[region] ??= initialPluginCustomControls(plugin, region);
    },
    /** Register a custom control in the specified UI `region`. */
    add(plugin: PluginContext, region: PluginCustomControlRegion, name: string, control: JSXElementConstructor<{}>) {
        const registry = PluginCustomControls.get(plugin, region);
        if (!registry.has(name)) {
            registry.set(name, control);
        }
        return {
            delete: () => PluginCustomControls.delete(plugin, region, name),
        };
    },
    /** Unregister a custom control in the specified UI `region`. */
    delete(plugin: PluginContext, region: PluginCustomControlRegion, name: string) {
        const registry = PluginCustomControls.get(plugin, region);
        registry.delete(name);
    },
    /** Register/unregister a custom control in the specified UI `region`. */
    toggle(plugin: PluginContext, region: PluginCustomControlRegion, name: string, control: JSXElementConstructor<{}>, show: boolean) {
        if (show) {
            PluginCustomControls.add(plugin, region, name, control);
        } else {
            PluginCustomControls.delete(plugin, region, name);
        }
    },
};

function initialPluginCustomControls(plugin: PluginContext, region: PluginCustomControlRegion): PluginCustomControlRegistry {
    if (region === 'structure-tools') return plugin.customStructureControls;
    return new Map<string, JSXElementConstructor<{}>>();
}
