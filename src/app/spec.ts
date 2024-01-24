import { Loci } from 'Molstar/mol-model/loci';
import { StateActions } from 'Molstar/mol-plugin-state/actions';
import { VolumeStreamingCustomControls } from 'Molstar/mol-plugin-ui/custom/volume';
import { PluginUISpec } from 'Molstar/mol-plugin-ui/spec';
import { PluginBehaviors } from 'Molstar/mol-plugin/behavior';
import { DefaultFocusLociBindings } from 'Molstar/mol-plugin/behavior/dynamic/camera';
import { DefaultSelectLociBindings } from 'Molstar/mol-plugin/behavior/dynamic/representation';
import { CreateVolumeStreamingBehavior } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { PluginConfig } from 'Molstar/mol-plugin/config';
import { PluginSpec } from 'Molstar/mol-plugin/spec';
import { LigandQueryParam, MapParams, QueryParam } from './helpers';
import { PDBeLociLabelProvider } from './labels';
import { PDBeSIFTSMapping } from './sifts-mappings-behaviour';


export const DefaultPluginSpec = (): PluginSpec => ({
    actions: [
        PluginSpec.Action(StateActions.Structure.EnableStructureCustomProps)
    ],
    behaviors: [
        PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
        PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
        PluginSpec.Behavior(PDBeLociLabelProvider),
        PluginSpec.Behavior(PluginBehaviors.Representation.FocusLoci),
        PluginSpec.Behavior(PluginBehaviors.Camera.FocusLoci),
        PluginSpec.Behavior(PluginBehaviors.Camera.CameraAxisHelper),

        PluginSpec.Behavior(PluginBehaviors.CustomProps.StructureInfo),
        PluginSpec.Behavior(PluginBehaviors.CustomProps.AccessibleSurfaceArea),
        PluginSpec.Behavior(PDBeSIFTSMapping, { autoAttach: true, showTooltip: true }),
        PluginSpec.Behavior(PluginBehaviors.CustomProps.Interactions),
        PluginSpec.Behavior(PluginBehaviors.CustomProps.SecondaryStructure),
        PluginSpec.Behavior(PluginBehaviors.CustomProps.ValenceModel),
        PluginSpec.Behavior(PluginBehaviors.CustomProps.CrossLinkRestraint),
    ],
    // animations: [],
    config: [
        [PluginConfig.VolumeStreaming.DefaultServer, 'https://www.ebi.ac.uk/pdbe/volume-server'],
        [PluginConfig.VolumeStreaming.EmdbHeaderServer, 'https://files.wwpdb.org/pub/emdb/structures'],
    ]
});

export const DefaultPluginUISpec = (): PluginUISpec => ({
    ...DefaultPluginSpec(),
    customParamEditors: [
        [CreateVolumeStreamingBehavior, VolumeStreamingCustomControls]
    ],
});


/** RGB color (r, g, b values 0-255) */
export interface ColorParams { r: number, g: number, b: number }

export const Preset = ['default', 'unitcell', 'all-models', 'supercell'] as const;
export type Preset = (typeof Preset)[number]

export const Lighting = ['flat', 'matte', 'glossy', 'metallic', 'plastic'] as const;
export type Lighting = (typeof Lighting)[number]

export const VisualStyle = ['cartoon', 'ball-and-stick', 'carbohydrate', 'ellipsoid', 'gaussian-surface', 'molecular-surface', 'point', 'putty', 'spacefill'] as const;
export type VisualStyle = (typeof VisualStyle)[number]

export const Encoding = ['cif', 'bcif'] as const;
export type Encoding = (typeof Encoding)[number]


/** Options for initializing `PDBeMolstarPlugin` */
export interface InitParams {
    /** PDB ID (example: '1cbs'), or UniProt ID if `superposition` is `true`. Leave `undefined` only when setting `customData` */
    moleculeId?: string,
    /** Load data from a specific data source.
     * Example: `{ url: 'https://www.ebi.ac.uk/pdbe/model-server/v1/1cbs/atoms?label_entity_id=1&auth_asym_id=A&encoding=bcif', format: 'cif', binary: true }` */
    customData?: { url: string, format: string, binary: boolean },
    /** Use to display the PDBe ligand page 3D view like here (https://www.ebi.ac.uk/pdbe/entry/pdb/1cbs/bound/REA).
     * Example: `{ label_comp_id: 'REA' }`. At least one is required of `label_comp_id` and `auth_seq_id` */
    ligandView?: LigandQueryParam,
    /** This applies AlphaFold confidence score colouring theme for AlphaFold model */
    alphafoldView: boolean,
    /** Leave `undefined` to load deposited model structure. Use assembly identifier to load assembly structure. or 'preferred' to load default assembly (i.e. the first assembly). */
    assemblyId?: string,
    /** Leave `undefined` to keep both cartoon and ball-and-sticks based on component type */
    visualStyle?: VisualStyle,
    /** Canvas background color */
    bgColor: ColorParams,
    /** Color appearing on mouse-over */
    highlightColor?: ColorParams,
    /** Color for marking the selected part of structure (when Selection Mode is active) */
    selectColor?: ColorParams,
    /** Molstar renders multiple visuals (polymer, ligand, water...) visuals by default. This option is to exclude any of these default visuals */
    hideStructure: ('polymer' | 'het' | 'water' | 'carbs' | 'nonStandard' | 'coarse')[],
    /** Hide all control panels by default (can be shown by the Toggle Controls Panel button (wrench icon)) */
    hideControls: boolean,
    /** Hide individual icon buttons in the top-right corner of the canvas */
    hideCanvasControls: ('expand' | 'selection' | 'animation' | 'controlToggle' | 'controlInfo')[],
    /** This option is to set the default base URL for the data source. Mostly used internally to test the plugin on different environments */
    pdbeUrl: string,
    /** Load electron density (or EM) maps from Volume Server if value is set to true */
    loadMaps: boolean,
    /** Load Validation Report Annotations. Adds 'Annotations' control in the menu */
    validationAnnotation: boolean,
    /** Load Domain Annotations. Adds 'Annotations' control in the menu */
    domainAnnotation: boolean,
    /** Load Assembly Symmetry Annotations. Adds 'Annotations' control in the menu */
    symmetryAnnotation: boolean,
    /** Load low precision coordinates from Model Server */
    lowPrecisionCoords: boolean,
    /** Display full-screen by default on load */
    expanded: boolean,
    /** Set landscape layout (control panels on the sides instead of above and under the canvas) */
    landscape: boolean,
    /** Controls the action performed when clicking a residue. `true` (default) will zoom the residue
     * and show ball-and-stick visual for its surroundings, `false` will only zoom the residue.
     * If `ligandView` or `superposition` option is set, `selectInteraction` behaves as if `false`. */
    selectInteraction: boolean,
    /** Display Sequence panel */
    sequencePanel: boolean,
    /** Default lighting (I don't think it really works) */
    lighting?: Lighting,
    /** Default Preset view */
    defaultPreset: Preset,
    /** Override mouse selection behavior */
    selectBindings?: typeof DefaultSelectLociBindings,
    /** Override mouse click focus behaviour */
    focusBindings?: typeof DefaultFocusLociBindings,
    /** Display PDBe entry link in top right corner of the canvas */
    pdbeLink: boolean,
    /** Subscribe to other PDB Web-components custom events */
    subscribeEvents: boolean,
    /** Display the superposed structures view like the one on the PDBe-KB pages. */
    superposition: boolean,
    /** Customize the superposed structures view. Example: `{ matrixAccession: 'P08684', segment: 1, ligandView: true, ligandColor: { r: 255, g: 255, b: 50} }`. */
    superpositionParams?: { matrixAccession?: string, segment?: number, cluster?: number[], superposeCompleteCluster?: boolean, ligandView?: boolean, superposeAll?: boolean, ligandColor?: ColorParams },
    /** Specify parts of the structure to highlight with different colors */
    selection?: { data: QueryParam[], nonSelectedColor?: ColorParams, clearPrevious?: boolean },
    /** Preferred encoding of input structural data */
    encoding: Encoding,
    /** Structure granularity level for interactions like highlight, focus, select.
     * (Granularity levels ending with `Instances` treat multiple copies of the same element/residue/chain in an assembly as one object). */
    granularity?: Loci.Granularity,
    /** Set reactive layout (switching between landscape and portrait based on the browser window size). Overrides `landscape`. */
    reactive: boolean,
    /** Customize map style (opacity and solid/wireframe) */
    mapSettings?: MapParams,
    /** Show overlay with PDBe logo while the initial structure is being loaded */
    loadingOverlay: boolean,
}

/** Default values for `InitParams` */
export const DefaultParams: InitParams = {
    moleculeId: undefined,
    customData: undefined,
    ligandView: undefined,
    alphafoldView: false,
    assemblyId: undefined,
    visualStyle: undefined,
    bgColor: { r: 0, g: 0, b: 0 },
    highlightColor: undefined,
    selectColor: undefined,
    hideStructure: [],
    hideControls: false,
    hideCanvasControls: [],
    pdbeUrl: 'https://www.ebi.ac.uk/pdbe/',
    loadMaps: false,
    validationAnnotation: false,
    domainAnnotation: false,
    symmetryAnnotation: false,
    lowPrecisionCoords: false,
    expanded: false,
    landscape: false,
    selectInteraction: true,
    sequencePanel: false,
    lighting: undefined,
    defaultPreset: 'default',
    selectBindings: undefined,
    focusBindings: undefined,
    pdbeLink: true,
    subscribeEvents: false,
    superposition: false,
    superpositionParams: undefined,
    selection: undefined,
    encoding: 'bcif',
    granularity: undefined,
    reactive: false,
    mapSettings: undefined,
    loadingOverlay: false,
};

/** Return `undefined` if `params` are valid, an error message otherwise. */
export function validateInitParams(params: Partial<InitParams>): string | undefined {
    if (!params.moleculeId && !params.customData?.url) return 'Option `moleculeId` or `customData` must be defined';
    if (params.customData) {
        if (!params.customData.url) return 'Option `customData.url` must be a non-empty string';
        if (!params.customData.format) return 'Option `customData.format` must be a non-empty string';
    }
    return undefined;
}
