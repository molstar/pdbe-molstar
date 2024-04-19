/**
 * Copyright (c) 2018-2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */
import { ANVILMembraneOrientation } from 'Molstar/extensions/anvil/behavior';
import { CellPack } from 'Molstar/extensions/cellpack';
import { DnatcoNtCs } from 'Molstar/extensions/dnatco';
import { G3DFormat, G3dProvider } from 'Molstar/extensions/g3d/format';
import { GeometryExport } from 'Molstar/extensions/geo-export';
import { MAQualityAssessment, QualityAssessmentPLDDTPreset, QualityAssessmentQmeanPreset } from 'Molstar/extensions/model-archive/quality-assessment/behavior';
import { QualityAssessment } from 'Molstar/extensions/model-archive/quality-assessment/prop';
import { ModelExport } from 'Molstar/extensions/model-export';
import { Mp4Export } from 'Molstar/extensions/mp4-export';
import { MolViewSpec } from 'Molstar/extensions/mvs/behavior';
import { loadMVS } from 'Molstar/extensions/mvs/load';
import { MVSData } from 'Molstar/extensions/mvs/mvs-data';
import { PDBeStructureQualityReport } from 'Molstar/extensions/pdbe';
import { RCSBAssemblySymmetry, RCSBValidationReport } from 'Molstar/extensions/rcsb';
import { RCSBAssemblySymmetryConfig } from 'Molstar/extensions/rcsb/assembly-symmetry/behavior';
import { SbNcbrPartialCharges, SbNcbrPartialChargesPreset, SbNcbrPartialChargesPropertyProvider } from 'Molstar/extensions/sb-ncbr';
import { Volseg, VolsegVolumeServerConfig } from 'Molstar/extensions/volumes-and-segmentations';
import { wwPDBChemicalComponentDictionary } from 'Molstar/extensions/wwpdb/ccd/behavior';
import { wwPDBStructConnExtensionFunctions } from 'Molstar/extensions/wwpdb/struct-conn';
import { ZenodoImport } from 'Molstar/extensions/zenodo';
import { SaccharideCompIdMapType } from 'Molstar/mol-model/structure/structure/carbohydrates/constants';
import { Volume } from 'Molstar/mol-model/volume';
import { DownloadStructure, PdbDownloadProvider } from 'Molstar/mol-plugin-state/actions/structure';
import { PresetStructureRepresentations, StructureRepresentationPresetProvider } from 'Molstar/mol-plugin-state/builder/structure/representation-preset';
import { DataFormatProvider } from 'Molstar/mol-plugin-state/formats/provider';
import { createVolumeRepresentationParams } from 'Molstar/mol-plugin-state/helpers/volume-representation-params';
import { PluginStateObject } from 'Molstar/mol-plugin-state/objects';
import { StateTransforms } from 'Molstar/mol-plugin-state/transforms';
import { PluginUIContext } from 'Molstar/mol-plugin-ui/context';
import { createPluginUI } from 'Molstar/mol-plugin-ui/react18';
import { DefaultPluginUISpec, PluginUISpec } from 'Molstar/mol-plugin-ui/spec';
import { PluginConfig } from 'Molstar/mol-plugin/config';
import { PluginLayoutControlsDisplay } from 'Molstar/mol-plugin/layout';
import { PluginSpec } from 'Molstar/mol-plugin/spec';
import { StateObjectRef, StateObjectSelector } from 'Molstar/mol-state';
import 'Molstar/mol-util/polyfill';
import { ObjectKeys } from 'Molstar/mol-util/type-helpers';
import { Colours } from './colours';

import 'Molstar/mol-plugin-ui/skin/light.scss';

export { PLUGIN_VERSION as version } from 'Molstar/mol-plugin/version';
export { consoleStats, setDebugMode, setProductionMode, setTimingMode } from 'Molstar/mol-util/debug';

const CustomFormats = [
    ['g3d', G3dProvider] as const
];

export const ExtensionMap = {
    'volseg': PluginSpec.Behavior(Volseg),
    // 'backgrounds': PluginSpec.Behavior(Backgrounds),
    'cellpack': PluginSpec.Behavior(CellPack),
    'dnatco-ntcs': PluginSpec.Behavior(DnatcoNtCs),
    'pdbe-structure-quality-report': PluginSpec.Behavior(PDBeStructureQualityReport),
    'rcsb-assembly-symmetry': PluginSpec.Behavior(RCSBAssemblySymmetry),
    'rcsb-validation-report': PluginSpec.Behavior(RCSBValidationReport),
    'anvil-membrane-orientation': PluginSpec.Behavior(ANVILMembraneOrientation),
    'g3d': PluginSpec.Behavior(G3DFormat),
    'model-export': PluginSpec.Behavior(ModelExport),
    'mp4-export': PluginSpec.Behavior(Mp4Export),
    'geo-export': PluginSpec.Behavior(GeometryExport),
    'ma-quality-assessment': PluginSpec.Behavior(MAQualityAssessment),
    'zenodo-import': PluginSpec.Behavior(ZenodoImport),
    'sb-ncbr-partial-charges': PluginSpec.Behavior(SbNcbrPartialCharges),
    'wwpdb-chemical-component-dictionary': PluginSpec.Behavior(wwPDBChemicalComponentDictionary),
    'mvs': PluginSpec.Behavior(MolViewSpec),
};

const DefaultViewerOptions = {
    customFormats: CustomFormats as [string, DataFormatProvider][],
    extensions: ObjectKeys(ExtensionMap),
    disabledExtensions: [] as string[],
    layoutIsExpanded: false,
    layoutShowControls: true,
    layoutShowRemoteState: true,
    layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
    layoutShowSequence: true,
    layoutShowLog: false,
    layoutShowLeftPanel: true,
    collapseLeftPanel: true,
    collapseRightPanel: false,
    disableAntialiasing: PluginConfig.General.DisableAntialiasing.defaultValue,
    pixelScale: PluginConfig.General.PixelScale.defaultValue,
    pickScale: PluginConfig.General.PickScale.defaultValue,
    pickPadding: PluginConfig.General.PickPadding.defaultValue,
    enableWboit: PluginConfig.General.EnableWboit.defaultValue,
    enableDpoit: PluginConfig.General.EnableDpoit.defaultValue,
    preferWebgl1: PluginConfig.General.PreferWebGl1.defaultValue,
    allowMajorPerformanceCaveat: PluginConfig.General.AllowMajorPerformanceCaveat.defaultValue,
    powerPreference: PluginConfig.General.PowerPreference.defaultValue,

    viewportShowExpand: PluginConfig.Viewport.ShowExpand.defaultValue,
    viewportShowControls: PluginConfig.Viewport.ShowControls.defaultValue,
    viewportShowSettings: PluginConfig.Viewport.ShowSettings.defaultValue,
    viewportShowSelectionMode: PluginConfig.Viewport.ShowSelectionMode.defaultValue,
    viewportShowAnimation: PluginConfig.Viewport.ShowAnimation.defaultValue,
    viewportShowTrajectoryControls: PluginConfig.Viewport.ShowTrajectoryControls.defaultValue,
    pluginStateServer: PluginConfig.State.DefaultServer.defaultValue,
    volumeStreamingServer: PluginConfig.VolumeStreaming.DefaultServer.defaultValue,
    volumeStreamingDisabled: !PluginConfig.VolumeStreaming.Enabled.defaultValue,
    pdbProvider: PluginConfig.Download.DefaultPdbProvider.defaultValue,
    emdbProvider: PluginConfig.Download.DefaultEmdbProvider.defaultValue,
    saccharideCompIdMapType: 'default' as SaccharideCompIdMapType,
    volumesAndSegmentationsDefaultServer: VolsegVolumeServerConfig.DefaultServer.defaultValue,
    rcsbAssemblySymmetryDefaultServerType: RCSBAssemblySymmetryConfig.DefaultServerType.defaultValue,
    rcsbAssemblySymmetryDefaultServerUrl: RCSBAssemblySymmetryConfig.DefaultServerUrl.defaultValue,
    rcsbAssemblySymmetryApplyColors: RCSBAssemblySymmetryConfig.ApplyColors.defaultValue,
};
type ViewerOptions = typeof DefaultViewerOptions;

export class Viewer {
    private mapColours: Colours;
    private mvsStates = {} as { [key: string]: MVSData };

    constructor(public plugin: PluginUIContext) {
        this.mapColours = new Colours();
    }

    static async create(elementOrId: string | HTMLElement, options: Partial<ViewerOptions> = {}) {
        const definedOptions = {} as any;

        // filter for defined properies only so the default values
        // are property applied
        for (const p of Object.keys(options) as (keyof ViewerOptions)[]) {
            if (options[p] !== void 0) definedOptions[p] = options[p];
        }

        const o: ViewerOptions = { ...DefaultViewerOptions, ...definedOptions };
        const defaultSpec = DefaultPluginUISpec();

        const disabledExtension = new Set(o.disabledExtensions ?? []);

        const spec: PluginUISpec = {
            actions: defaultSpec.actions,
            behaviors: [
                ...defaultSpec.behaviors,
                ...o.extensions.filter(e => !disabledExtension.has(e)).map(e => ExtensionMap[e]),
            ],
            animations: [...defaultSpec.animations || []],
            customParamEditors: defaultSpec.customParamEditors,
            customFormats: o?.customFormats,
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: false,
                    controlsDisplay: o.layoutControlsDisplay,
                    regionState: {
                        bottom: 'hidden',
                        left: o.collapseLeftPanel ? 'collapsed' : 'full',
                        right: o.collapseRightPanel ? 'hidden' : 'full',
                        top: 'full',
                    }
                },
            },
            components: {
                ...defaultSpec.components,
                controls: {
                    ...defaultSpec.components?.controls,
                    top: o.layoutShowSequence ? undefined : 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    left: o.layoutShowLeftPanel ? undefined : 'none',
                },
                remoteState: o.layoutShowRemoteState ? 'default' : 'none',
            },
            config: [
                [PluginConfig.General.DisableAntialiasing, o.disableAntialiasing],
                [PluginConfig.General.PixelScale, o.pixelScale],
                [PluginConfig.General.PickScale, o.pickScale],
                [PluginConfig.General.PickPadding, o.pickPadding],
                [PluginConfig.General.EnableWboit, o.enableWboit],
                [PluginConfig.General.EnableDpoit, o.enableDpoit],
                [PluginConfig.General.PreferWebGl1, o.preferWebgl1],
                [PluginConfig.General.AllowMajorPerformanceCaveat, o.allowMajorPerformanceCaveat],
                [PluginConfig.General.PowerPreference, o.powerPreference],
                [PluginConfig.Viewport.ShowExpand, o.viewportShowExpand],
                [PluginConfig.Viewport.ShowControls, o.viewportShowControls],
                [PluginConfig.Viewport.ShowSettings, o.viewportShowSettings],
                [PluginConfig.Viewport.ShowSelectionMode, o.viewportShowSelectionMode],
                [PluginConfig.Viewport.ShowAnimation, o.viewportShowAnimation],
                [PluginConfig.Viewport.ShowTrajectoryControls, o.viewportShowTrajectoryControls],
                [PluginConfig.State.DefaultServer, o.pluginStateServer],
                [PluginConfig.State.CurrentServer, o.pluginStateServer],
                [PluginConfig.VolumeStreaming.DefaultServer, o.volumeStreamingServer],
                [PluginConfig.VolumeStreaming.Enabled, !o.volumeStreamingDisabled],
                [PluginConfig.Download.DefaultPdbProvider, o.pdbProvider],
                [PluginConfig.Download.DefaultEmdbProvider, o.emdbProvider],
                [PluginConfig.Structure.DefaultRepresentationPreset, ViewerAutoPreset.id],
                [PluginConfig.Structure.SaccharideCompIdMapType, o.saccharideCompIdMapType],
                [VolsegVolumeServerConfig.DefaultServer, o.volumesAndSegmentationsDefaultServer],
                [RCSBAssemblySymmetryConfig.DefaultServerType, o.rcsbAssemblySymmetryDefaultServerType],
                [RCSBAssemblySymmetryConfig.DefaultServerUrl, o.rcsbAssemblySymmetryDefaultServerUrl],
                [RCSBAssemblySymmetryConfig.ApplyColors, o.rcsbAssemblySymmetryApplyColors],
            ]
        };

        const element = typeof elementOrId === 'string'
            ? document.getElementById(elementOrId)
            : elementOrId;
        if (!element) throw new Error(`Could not get element with id '${elementOrId}'`);
        const plugin = await createPluginUI(element, spec, {
            onBeforeUIRender: plugin => {
                // the preset needs to be added before the UI renders otherwise
                // "Download Structure" wont be able to pick it up
                plugin.builders.structure.representation.registerPreset(ViewerAutoPreset);
            }
        });
        return new Viewer(plugin);
    }

    loadPdb(pdb: string, options?: LoadStructureOptions) {
        const params = DownloadStructure.createDefaultParams(this.plugin.state.data.root.obj!, this.plugin);
        const provider = this.plugin.config.get(PluginConfig.Download.DefaultPdbProvider)!;
        return this.plugin.runTask(this.plugin.state.data.applyAction(DownloadStructure, {
            source: {
                name: 'pdb' as const,
                params: {
                    provider: {
                        id: pdb,
                        server: {
                            name: provider,
                            params: PdbDownloadProvider[provider].defaultValue as any
                        }
                    },
                    options: { ...params.source.params.options, representationParams: options?.representationParams as any },
                }
            }
        }));
    }

    async loadEmdb(emdb: string, contourLevel: number, alpha: number, kind: 'relative' | 'absolute' = 'absolute') {
        const plugin = this.plugin;
        const provider = this.plugin.config.get(PluginConfig.VolumeStreaming.DefaultServer)!;
        const numId = emdb.substring(4);
        const url = `${provider}/em/${numId}/cell?detail=6`;
        console.log(url);
        const format = 'dscif';
        const isBinary = true;

        if (!plugin.dataFormats.get(format)) {
            throw new Error(`Unknown density format: ${format}`);
        }

        return plugin.dataTransaction(async () => {
            const data = await plugin.builders.data.download({ url, isBinary }, { state: { isGhost: true } });

            const parsed = await plugin.dataFormats.get(format)!.parse(plugin, data, { entryId: emdb });
            const firstVolume = (parsed.volume || parsed.volumes[0]) as StateObjectSelector<PluginStateObject.Volume.Data>;
            if (!firstVolume?.isOk) throw new Error('Failed to parse any volume.');

            const repr = plugin.build();
            const volume: StateObjectSelector<PluginStateObject.Volume.Data> = parsed.volumes?.[0] ?? parsed.volume;
            const volumeData = volume.cell!.obj!.data;
            repr
                .to(volume)
                .apply(StateTransforms.Representation.VolumeRepresentation3D, createVolumeRepresentationParams(this.plugin, firstVolume.data!, {
                    type: 'isosurface',
                    typeParams: { alpha: alpha ?? 1, isoValue: Volume.adjustedIsoValue(volumeData, contourLevel, kind) },
                    color: 'uniform',
                    colorParams: { value: this.mapColours.getNextColor() }
                }));


            await repr.commit();
        });
    }

    loadAlphaFoldDb(afdb: string) {
        const params = DownloadStructure.createDefaultParams(this.plugin.state.data.root.obj!, this.plugin);
        return this.plugin.runTask(this.plugin.state.data.applyAction(DownloadStructure, {
            source: {
                name: 'alphafolddb' as const,
                params: {
                    id: afdb,
                    options: {
                        ...params.source.params.options,
                        representation: 'preset-structure-representation-ma-quality-assessment-plddt'
                    },
                }
            }
        }));
    }

    async loadMvsFromUrl(url: string, format: 'mvsj') {
        if (format === 'mvsj') {
            const data = await this.plugin.runTask(this.plugin.fetch({ url, type: 'string' }));
            const mvsData = MVSData.fromMVSJ(data);
            await loadMVS(this.plugin, mvsData, { sanityChecks: true, sourceUrl: url });
        } else {
            throw new Error(`Unknown MolViewSpec format: ${format}`);
        }
        // We might add more formats in the future
    }

    async loadMvsData(data: string, format: 'mvsj') {
        // FIXME for multiple models
        if (format === 'mvsj') {
            const mvsData = MVSData.fromMVSJ(data);
            await loadMVS(this.plugin, mvsData, { sanityChecks: true, sourceUrl: undefined });
        } else {
            throw new Error(`Unknown MolViewSpec format: ${format}`);
        }
        // We might add more formats in the future
    }

    createMvsStates(modelStates: ModelStates[]) {
        const chainColors = new Colours();
        const modelColors = new Colours();
        const builder = MVSData.createBuilder();

        for (const modelState of modelStates) {
            const modelAnnotations = modelState.modelAnnotations;
            const pdbId = modelState.pdbId;
            const modelUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/${pdbId}_updated.cif`;
            const structure = builder.download({ url: modelUrl }).parse({ format: 'mmcif' }).modelStructure();
            structure.component({ selector: 'ligand' }).representation({ type: 'ball_and_stick' }).color({ color: '#aa55ff' });

            // @ts-ignore
            for (const modelAnnotation of modelAnnotations) {
                const annotations = modelAnnotation.residues;
                const cartoon = structure.component({ selector: 'polymer' }).representation({ type: 'cartoon' });
                const stateName = modelAnnotation.metric;
                console.log(stateName);

                if (stateName === 'Chains') {
                    // @ts-ignore
                    for (const chain of modelAnnotation.chains) {
                        cartoon.color({
                            selector: { auth_asym_id: chain },
                            color: chainColors.getNextColorHex(1)
                        });
                    }
                } else if (stateName === 'Models') {
                    const color = modelColors.getNextColorHex(1);
                    console.log(color);
                    cartoon.color({
                        color: color
                    });
                } else {
                    // @ts-ignore
                    if (annotations.length === 0) {
                        console.log('No annotations found for', pdbId);
                    } else {
                        // @ts-ignore
                        for (const residue of annotations) {
                            cartoon.color({
                                selector: [{auth_asym_id: residue.chain, auth_seq_id: residue.number}],
                                color: residue.color
                            });
                            structure.component({
                                selector: {
                                    auth_asym_id: residue.chain,
                                    auth_seq_id: residue.number
                                }
                            }).tooltip({text: `${stateName}: ${residue.score}`});
                        }
                    }
                }
            }
            const mvsState = builder.getState();
            loadMVS(this.plugin, mvsState, { replaceExisting: true });
        }
    }

    showModelByComponentId(componentId: number) {
        const hierarchy = this.plugin.managers.structure.hierarchy;
        const structures = hierarchy.current.refs;
        let i = 0;
        for (const structure of structures.values()) {
            if (structure.kind === 'structure-component') {
                if (i !== 0) { // Zero is ligand components
                    if (componentId === i) {
                        hierarchy.toggleVisibility([structure], 'show');
                    } else {
                        hierarchy.toggleVisibility([structure], 'hide');
                    }
                }
                i++;
            }
        }
    }

    renderMvsState(stateName: string) {
        const mvsState = this.mvsStates[stateName];
        loadMVS(this.plugin, mvsState, { replaceExisting: true });
    }

    async clear() {
        await this.plugin.clear();
    }

    setColorMode(mode: string) {
        console.log(this.plugin.managers.structure);
    }

    toogleStructureVisibility(pdb_id: string, action: 'show' | 'hide') {
        pdb_id = pdb_id.toUpperCase();
        const hierarchy = this.plugin.managers.structure.hierarchy;
        const structures = hierarchy.current.refs;

        for (const structure of structures.values()) {
            if (structure.cell.obj?.label === pdb_id) {
                hierarchy.toggleVisibility([structure], action);
            }
        }
    }

    toggleVolumeVisibility(emdb_id: string, action: 'show' | 'hide') {
        const hierarchy = this.plugin.managers.volume.hierarchy;
        const volumes = hierarchy.current.refs;

        for (const volume of volumes.values()) {
            if (volume.cell.obj?.label === emdb_id) {
                hierarchy.toggleVisibility([volume], action);
            }
        }
    }

    handleResize() {
        this.plugin.layout.events.updated.next(void 0);
    }

    dispose() {
        this.plugin.dispose();
    }

    test() {
        const hierarchy = this.plugin.managers.structure.hierarchy;
        const structures = hierarchy.current.refs;

        console.log(structures);

    }
}

export interface LoadStructureOptions {
    representationParams?: StructureRepresentationPresetProvider.CommonParams
}

export interface ModelStates {
    pdbId: string,
    modelAnnotations: ModelAnnotations[]
}

export interface ModelAnnotations {
    metric: string
    residues?: ResidueAnnotation[]
    chains?: string[]
}

export interface ResidueAnnotation {
    chain: string
    number: number
    aminoAcid: string
    color: `#${string}`
    score: number
}


// export interface ModelStates {
//     name: string,
//     modelAnnotations: ModelAnnotations[]
// }
//
// export interface ModelAnnotations {
//     pdbId: string
//     metric?: string
//     residues?: ResidueAnnotation[]
//     chains?: string[]
// }
//
// export interface ResidueAnnotation {
//     chain: string
//     number: number
//     aminoAcid: string
//     color: `#${string}`
//     score: number
// }


// export interface ResidueAnnotation {
//     chain: string
//     number: number
//     color: `#${string}`
//     score: number
// }

export const ViewerAutoPreset = StructureRepresentationPresetProvider({
    id: 'preset-structure-representation-viewer-auto',
    display: {
        name: 'Automatic (w/ Annotation)', group: 'Annotation',
        description: 'Show standard automatic representation but colored by quality assessment (if available in the model).'
    },
    isApplicable(a) {
        return (
            !!a.data.models.some(m => QualityAssessment.isApplicable(m, 'pLDDT')) ||
            !!a.data.models.some(m => QualityAssessment.isApplicable(m, 'qmean'))
        );
    },
    params: () => StructureRepresentationPresetProvider.CommonParams,
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        const structure = structureCell?.obj?.data;
        if (!structureCell || !structure) return {};

        if (!!structure.models.some(m => QualityAssessment.isApplicable(m, 'pLDDT'))) {
            return await QualityAssessmentPLDDTPreset.apply(ref, params, plugin);
        } else if (!!structure.models.some(m => QualityAssessment.isApplicable(m, 'qmean'))) {
            return await QualityAssessmentQmeanPreset.apply(ref, params, plugin);
        } else if (!!structure.models.some(m => SbNcbrPartialChargesPropertyProvider.isApplicable(m))) {
            return await SbNcbrPartialChargesPreset.apply(ref, params, plugin);
        } else {
            return PresetStructureRepresentations.auto.apply(ref, params, plugin);
        }
    }
});

export const PluginExtensions = {
    wwPDBStructConn: wwPDBStructConnExtensionFunctions,
    mvs: { MVSData, loadMVS },
};

(window as any).Viewer = Viewer;
