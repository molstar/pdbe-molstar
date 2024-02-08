import { Canvas3DProps } from 'Molstar/mol-canvas3d/canvas3d';
import { BuiltInTrajectoryFormat } from 'Molstar/mol-plugin-state/formats/trajectory';
import { createPluginUI } from 'Molstar/mol-plugin-ui/react18';
import { PluginUISpec } from 'Molstar/mol-plugin-ui/spec';
import { InitVolumeStreaming } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { PluginConfig } from 'Molstar/mol-plugin/config';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginLayoutStateParams } from 'Molstar/mol-plugin/layout';
import { ElementSymbolColorThemeParams } from 'Molstar/mol-theme/color/element-symbol';
import { Asset } from 'Molstar/mol-util/assets';
import { RxEventHelper } from 'Molstar/mol-util/rx-event-helper';
import { LoadParams, ModelServerRequest, PDBeVolumes, addDefaults, getStructureUrl, runWithProgressMessage } from './helpers';
import { DefaultParams, DefaultPluginUISpec, InitParams } from './spec';
import { initParamsFromHtmlAttributes } from './spec-from-html';

import 'Molstar/mol-plugin-ui/skin/dark.scss';
import './overlay.scss';
import {ViewportControls} from 'Molstar/mol-plugin-ui/viewport';

export class EMDBMolstarPlugin {
    private _ev = RxEventHelper.create();

    readonly events = {
        loadComplete: this._ev<boolean>()
    };

    plugin: PluginContext;
    initParams: InitParams;
    targetElement: HTMLElement;
    assemblyRef = '';
    selectedParams: any;
    defaultRendererProps: Canvas3DProps['renderer'];
    defaultMarkingProps: Canvas3DProps['marking'];
    isHighlightColorUpdated = false;
    isSelectedColorUpdated = false;

    /** Extract InitParams from attributes of an HTML element */
    static initParamsFromHtmlAttributes(element: HTMLElement): Partial<InitParams> {
        return initParamsFromHtmlAttributes(element);
    }

    async render(target: string | HTMLElement, options: Partial<InitParams>) {
        console.debug('Rendering EMDBMolstarPlugin instance with options:', options);
        // Validate options
        if (!options) {
            console.error('Missing `options` argument to `EMDBMolstarPlugin.render');
            return;
        }

        this.initParams = addDefaults(options, DefaultParams);

        // Set EMDB Plugin Spec
        const emdbPluginSpec: PluginUISpec = DefaultPluginUISpec();
        emdbPluginSpec.config ??= [];

        emdbPluginSpec.layout = {
            initial: {
                isExpanded: this.initParams.expanded,
                showControls: !this.initParams.hideControls,
                regionState: {
                    left: 'full',
                    right: 'full',
                    top: this.initParams.sequencePanel ? 'full' : 'hidden',
                    bottom: 'full',
                },
                controlsDisplay: this.initParams.reactive ? 'reactive' : this.initParams.landscape ? 'landscape' : PluginLayoutStateParams.controlsDisplay.defaultValue,
            }
        };

        emdbPluginSpec.components = {
            controls: {
                bottom: 'none'
            },
            viewport: {
                controls: ViewportControls
            },
            remoteState: 'none',
        };

        emdbPluginSpec.config.push([PluginConfig.Structure.DefaultRepresentationPresetParams, {
            theme: {
                carbonColor: { name: 'element-symbol', params: {} },
                focus: {
                    name: 'element-symbol',
                    params: { carbonColor: { name: 'element-symbol', params: {} } }
                }
            }
        }]);

        ElementSymbolColorThemeParams.carbonColor.defaultValue = { name: 'element-symbol', params: {} };

        if (this.initParams.hideCanvasControls.includes('expand')) emdbPluginSpec.config.push([PluginConfig.Viewport.ShowExpand, false]);
        if (this.initParams.hideCanvasControls.includes('selection')) emdbPluginSpec.config.push([PluginConfig.Viewport.ShowSelectionMode, false]);
        if (this.initParams.hideCanvasControls.includes('animation')) emdbPluginSpec.config.push([PluginConfig.Viewport.ShowAnimation, false]);
        if (this.initParams.hideCanvasControls.includes('controlToggle')) emdbPluginSpec.config.push([PluginConfig.Viewport.ShowControls, false]);
        if (this.initParams.hideCanvasControls.includes('controlInfo')) emdbPluginSpec.config.push([PluginConfig.Viewport.ShowSettings, false]);

        this.targetElement = typeof target === 'string' ? document.getElementById(target)! : target;
        (this.targetElement as any).viewerInstance = this;

        // Create/ Initialise Plugin
        this.plugin = await createPluginUI(this.targetElement, emdbPluginSpec);

        // Set selection granularity
        if (this.initParams.granularity) {
            this.plugin.managers.interactivity.setProps({ granularity: this.initParams.granularity });
        }

        // Save renderer defaults
        this.defaultRendererProps = { ...this.plugin.canvas3d!.props.renderer };
        this.defaultMarkingProps = { ...this.plugin.canvas3d!.props.marking };

        // Collapse left panel and set left panel tab to none
        PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...this.plugin.layout.state.regionState, left: 'collapsed' } } });
        this.plugin.behaviors.layout.leftPanelTabName.next('none');

        // TODO: Replace with our own loading fdunctions
        // Load Molecule CIF or coordQuery and Parse
        const dataSource = this.getMoleculeSrcUrl();
        if (dataSource) {
            this.load({ url: dataSource.url, format: dataSource.format as BuiltInTrajectoryFormat, assemblyId: this.initParams.assemblyId, isBinary: dataSource.isBinary, progressMessage: `Loading ${this.initParams.moleculeId ?? ''} ...` });
        }
    }

    // TODO: Remove or at least change
    getMoleculeSrcUrl() {
        if (this.initParams.customData) {
            let { url, format, binary } = this.initParams.customData;
            if (!url || !format) {
                throw new Error(`Provide all custom data parameters`);
            }
            if (format === 'cif' || format === 'bcif') format = 'mmcif';
            // Validate supported format
            const supportedFormats = ['mmcif', 'pdb', 'sdf'];
            if (!supportedFormats.includes(format)) {
                throw new Error(`${format} not supported.`);
            }
            return {
                url: url,
                format: format,
                isBinary: binary,
            };
        }

        // TODO: Remove LigandView
        if (this.initParams.moleculeId) {
            const request: Required<ModelServerRequest> = { pdbId: this.initParams.moleculeId, queryType: 'full', queryParams: {} };
            if (this.initParams.ligandView) {
                request.queryType = 'residueSurroundings';
                request.queryParams['data_source'] = 'pdb-h';
                if (!this.initParams.ligandView.label_comp_id_list) {
                    request.queryParams['label_comp_id'] = this.initParams.ligandView.label_comp_id;
                    request.queryParams['auth_seq_id'] = this.initParams.ligandView.auth_seq_id;
                    request.queryParams['auth_asym_id'] = this.initParams.ligandView.auth_asym_id;
                }
            }
            return {
                url: getStructureUrl(this.initParams, request),
                format: 'mmcif',
                isBinary: this.initParams.encoding === 'bcif',
            };
        }

        throw new Error(`Mandatory parameters missing! (customData or moleculeId must be defined)`);
    }

    // TODO: Remove or at least change
    async load({ url, format = 'mmcif', isBinary = false, assemblyId = '', progressMessage }: LoadParams, fullLoad = true) {
        await runWithProgressMessage(this.plugin, progressMessage, async () => {
            let success = false;
            try {
                if (fullLoad) await this.clear();
                const isHetView = this.initParams.ligandView ? true : false;
                let downloadOptions: any = void 0;

                const data = await this.plugin.builders.data.download({ url: Asset.Url(url, downloadOptions), isBinary }, { state: { isGhost: true } });
                const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);

                if (!isHetView) {

                    await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, this.initParams.defaultPreset as any, {
                        structure: assemblyId ? (assemblyId === 'preferred') ? void 0 : { name: 'assembly', params: { id: assemblyId } } : { name: 'model', params: {} },
                        showUnitcell: false,
                        representationPreset: 'auto'
                    });

                } else {
                    const model = await this.plugin.builders.structure.createModel(trajectory);
                    await this.plugin.builders.structure.createStructure(model, { name: 'model', params: {} });
                }

                // Store assembly ref
                const pivotIndex = this.plugin.managers.structure.hierarchy.selection.structures.length - 1;
                const pivot = this.plugin.managers.structure.hierarchy.selection.structures[pivotIndex];
                if (pivot && pivot.cell.parent) this.assemblyRef = pivot.cell.transform.ref;

                // Load Volume
                if (this.initParams.loadMaps) {
                    if (this.assemblyRef === '') return;
                    const asm = this.state.select(this.assemblyRef)[0].obj!;
                    const defaultMapParams = InitVolumeStreaming.createDefaultParams(asm, this.plugin);
                    const pdbeMapParams = PDBeVolumes.mapParams(defaultMapParams, this.initParams.mapSettings, '');
                    if (pdbeMapParams) {
                        await this.plugin.runTask(this.state.applyAction(InitVolumeStreaming, pdbeMapParams, this.assemblyRef));
                        if (pdbeMapParams.method !== 'em' && !this.initParams.ligandView) PDBeVolumes.displayUsibilityMessage(this.plugin);
                    }
                }

                success = true;
            } finally {
                this.events.loadComplete.next(success);
            }
        });
    }

    get state() {
        return this.plugin.state.data;
    }

    async clear() {
        await this.plugin.clear();
        this.assemblyRef = '';
        this.selectedParams = void 0;
        this.isHighlightColorUpdated = false;
        this.isSelectedColorUpdated = false;
    }
}


(window as any).EMDBMolstarPlugin = EMDBMolstarPlugin;
