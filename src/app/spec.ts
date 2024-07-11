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

/** Color name (e.g. 'yellow') or hexcode (e.g. '#ffff00') or Molstar color encoding (e.g. 16776960) or RGB color object (e.g. { r: 255, g: 255, b: 0 }) */
export type AnyColor = ColorParams | string | number


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
    // DATA
    /** PDB ID (example: '1cbs'), or UniProt ID if `superposition` is `true`. Leave `undefined` only when setting `customData` */
    moleculeId?: string,
    /** Load data from a specific data source.
     * Example: `{ url: 'https://www.ebi.ac.uk/pdbe/model-server/v1/1cbs/atoms?label_entity_id=1&auth_asym_id=A&encoding=bcif', format: 'cif', binary: true }` */
    customData?: { url: string, format: string, binary: boolean },
    /** Leave `undefined` to load deposited model structure. Use assembly identifier to load assembly structure. or 'preferred' to load default assembly (i.e. the first assembly). */
    assemblyId?: string,
    /** Specify type of structure to be loaded */
    defaultPreset: Preset,
    /** Use to display the PDBe ligand page 3D view like here (https://www.ebi.ac.uk/pdbe/entry/pdb/1cbs/bound/REA).
     * Example: `{ label_comp_id: 'REA' }`. At least one is required of `label_comp_id` and `auth_seq_id` */
    ligandView?: LigandQueryParam,
    /** This applies AlphaFold confidence score colouring theme for AlphaFold model */
    alphafoldView: boolean,
    /** Display the superposed structures view like the one on the PDBe-KB pages. */
    superposition: boolean,
    /** Customize the superposed structures view. Example: `{ matrixAccession: 'P08684', segment: 1, ligandView: true, ligandColor: { r: 255, g: 255, b: 50} }`. */
    superpositionParams?: {
        matrixAccession?: string,
        segment?: number,
        cluster?: number[],
        superposeCompleteCluster?: boolean,
        ligandView?: boolean,
        superposeAll?: boolean,
        ligandColor?: AnyColor,
        ligandClustering?: { url: string, noiseColor?: ColorParams | 'hide', missingColor?: ColorParams | 'hide' },
    },
    /** Specify parts of the structure to highlight with different colors */
    selection?: { data: QueryParam[], nonSelectedColor?: AnyColor },

    // APPEARANCE
    /** Leave `undefined` to keep both cartoon and ball-and-sticks based on component type */
    visualStyle?: VisualStyle,
    /** Molstar renders multiple visuals (polymer, ligand, water...) visuals by default. This option is to exclude any of these default visuals */
    hideStructure: ('polymer' | 'het' | 'water' | 'carbs' | 'nonStandard' | 'coarse')[],
    /** Load electron density (or EM) maps from Volume Server if value is set to true */
    loadMaps: boolean,
    /** Customize map style (opacity and solid/wireframe) */
    mapSettings?: MapParams,
    /** Canvas background color */
    bgColor: AnyColor,
    /** Color appearing on mouse-over */
    highlightColor?: AnyColor,
    /** Color for marking the selected part of structure (when Selection Mode is active) */
    selectColor?: AnyColor,
    /** Default lighting (I don't think it really works) */
    lighting?: Lighting,

    // BEHAVIOR
    /** Load Validation Report Annotations. Adds 'Annotations' control in the menu */
    validationAnnotation: boolean,
    /** Load Domain Annotations. Adds 'Annotations' control in the menu */
    domainAnnotation: boolean,
    /** Load Assembly Symmetry Annotations. Adds 'Annotations' control in the menu */
    symmetryAnnotation: boolean,
    /** This option is to set the default base URL for the data source. Mostly used internally to test the plugin on different environments */
    pdbeUrl: string,
    /** Preferred encoding of input structural data */
    encoding: Encoding,
    /** Load low precision coordinates from Model Server */
    lowPrecisionCoords: boolean,
    /** Controls the action performed when clicking a residue. `true` (default) will zoom the residue
     * and show ball-and-stick visual for its surroundings, `false` will only zoom the residue.
     * If `ligandView` or `superposition` option is set, `selectInteraction` behaves as if `false`. */
    selectInteraction: boolean,
    /** Override mouse selection behavior */
    selectBindings?: typeof DefaultSelectLociBindings,
    /** Override mouse click focus behaviour */
    focusBindings?: typeof DefaultFocusLociBindings,
    /** Structure granularity level for interactions like highlight, focus, select.
     * (Granularity levels ending with `Instances` treat multiple copies of the same element/residue/chain in an assembly as one object). */
    granularity?: Loci.Granularity,
    /** Subscribe to other PDB Web-components custom events */
    subscribeEvents: boolean,

    // INTERFACE
    /** Hide all control panels by default (can be shown by the Toggle Controls Panel button (wrench icon)) */
    hideControls: boolean,
    /** Hide individual icon buttons in the top-right corner of the canvas */
    hideCanvasControls: ('expand' | 'selection' | 'animation' | 'controlToggle' | 'controlInfo')[],
    /** Display Sequence panel */
    sequencePanel: boolean,
    /** Display Left control panel */
    leftPanel: boolean,
    /** Display Right control panel */
    rightPanel: boolean,
    /** Display Log panel */
    logPanel: boolean,
    /** Display PDBe entry link in top right corner of the canvas */
    pdbeLink: boolean,
    /** Show overlay with PDBe logo while the initial structure is being loaded */
    loadingOverlay: boolean,
    /** Display full-screen by default on load */
    expanded: boolean,
    /** Set landscape layout (control panels on the sides instead of above and under the canvas) */
    landscape: boolean,
    /** Set reactive layout (switching between landscape and portrait based on the browser window size). Overrides `landscape`. */
    reactive: boolean,
}

/** Default values for `InitParams` */
export const DefaultParams: InitParams = {
    moleculeId: undefined,
    customData: undefined,
    assemblyId: undefined,
    defaultPreset: 'default',
    ligandView: undefined,
    alphafoldView: false,
    superposition: false,
    superpositionParams: undefined,
    selection: undefined,

    visualStyle: undefined,
    hideStructure: [],
    loadMaps: false,
    mapSettings: undefined,
    bgColor: { r: 0, g: 0, b: 0 },
    highlightColor: undefined,
    selectColor: undefined,
    lighting: undefined,

    validationAnnotation: false,
    domainAnnotation: false,
    symmetryAnnotation: false,
    pdbeUrl: 'https://www.ebi.ac.uk/pdbe/',
    encoding: 'bcif',
    lowPrecisionCoords: false,
    selectInteraction: true,
    selectBindings: undefined,
    focusBindings: undefined,
    granularity: undefined,
    subscribeEvents: false,

    hideControls: false,
    hideCanvasControls: [],
    sequencePanel: false,
    leftPanel: true,
    rightPanel: true,
    logPanel: false,
    pdbeLink: true,
    loadingOverlay: false,
    expanded: false,
    landscape: false,
    reactive: false,
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
