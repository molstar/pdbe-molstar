import { GeometryExport } from 'Molstar/extensions/geo-export';
import { MAQualityAssessment } from 'Molstar/extensions/model-archive/quality-assessment/behavior';
import { Mp4Export } from 'Molstar/extensions/mp4-export';
import { PDBeStructureQualityReport } from 'Molstar/extensions/pdbe';
import { RCSBAssemblySymmetry, RCSBAssemblySymmetryConfig } from 'Molstar/extensions/rcsb/assembly-symmetry/behavior';
import { Canvas3DProps } from 'Molstar/mol-canvas3d/canvas3d';
import { EmptyLoci, Loci } from 'Molstar/mol-model/loci';
import { AnimateAssemblyUnwind } from 'Molstar/mol-plugin-state/animation/built-in/assembly-unwind';
import { AnimateCameraRock } from 'Molstar/mol-plugin-state/animation/built-in/camera-rock';
import { AnimateCameraSpin } from 'Molstar/mol-plugin-state/animation/built-in/camera-spin';
import { AnimateModelIndex } from 'Molstar/mol-plugin-state/animation/built-in/model-index';
import { AnimateStructureSpin } from 'Molstar/mol-plugin-state/animation/built-in/spin-structure';
import { AnimateStateInterpolation } from 'Molstar/mol-plugin-state/animation/built-in/state-interpolation';
import { AnimateStateSnapshots } from 'Molstar/mol-plugin-state/animation/built-in/state-snapshots';
import { BuiltInTrajectoryFormat } from 'Molstar/mol-plugin-state/formats/trajectory';
import { clearStructureOverpaint } from 'Molstar/mol-plugin-state/helpers/structure-overpaint';
import { createStructureRepresentationParams } from 'Molstar/mol-plugin-state/helpers/structure-representation-params';
import { PluginStateObject } from 'Molstar/mol-plugin-state/objects';
import { StructureComponent } from 'Molstar/mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from 'Molstar/mol-plugin-state/transforms/representation';
import { createPluginUI } from 'Molstar/mol-plugin-ui/react18';
import { PluginUISpec } from 'Molstar/mol-plugin-ui/spec';
import { FocusLoci } from 'Molstar/mol-plugin/behavior/dynamic/camera';
import { SelectLoci } from 'Molstar/mol-plugin/behavior/dynamic/representation';
import { StructureFocusRepresentation } from 'Molstar/mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { InitVolumeStreaming } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { PluginConfig } from 'Molstar/mol-plugin/config';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginLayoutStateParams } from 'Molstar/mol-plugin/layout';
import { PluginSpec } from 'Molstar/mol-plugin/spec';
import { Representation } from 'Molstar/mol-repr/representation';
import { StateSelection, StateTransform } from 'Molstar/mol-state';
import { ElementSymbolColorThemeParams } from 'Molstar/mol-theme/color/element-symbol';
import { Asset } from 'Molstar/mol-util/assets';
import { Color } from 'Molstar/mol-util/color/color';
import { RxEventHelper } from 'Molstar/mol-util/rx-event-helper';
import { StructureElement } from 'Molstar/mol-model/structure';
import { StateTransforms } from 'Molstar/mol-plugin-state/transforms';
import { Overpaint } from 'Molstar/mol-theme/overpaint';
import { CustomEvents } from './custom-events';
import { PDBeDomainAnnotations } from './domain-annotations/behavior';
import { AlphafoldView, LigandView, LoadParams, ModelServerRequest, PDBeVolumes, QueryHelper, QueryParam, addDefaults, getStructureUrl, runWithProgressMessage } from './helpers';
import { LoadingOverlay } from './overlay';
import { PluginCustomState } from './plugin-custom-state';
import { ColorParams, DefaultParams, DefaultPluginUISpec, InitParams, validateInitParams } from './spec';
import { initParamsFromHtmlAttributes } from './spec-from-html';
import { subscribeToComponentEvents } from './subscribe-events';
import { initSuperposition } from './superposition';
import { SuperpositionFocusRepresentation } from './superposition-focus-representation';
import { LeftPanelControls } from './ui/pdbe-left-panel';
import { PDBeLigandViewStructureTools, PDBeStructureTools, PDBeSuperpositionStructureTools } from './ui/pdbe-structure-controls';
import { PDBeViewportControls } from './ui/pdbe-viewport-controls';
import { SuperpostionViewport } from './ui/superposition-viewport';

import 'Molstar/mol-plugin-ui/skin/dark.scss';
import './overlay.scss';


export class PDBeMolstarPlugin {

    private _ev = RxEventHelper.create();

    readonly events = {
        loadComplete: this._ev<boolean>()
    };

    plugin: PluginContext;
    initParams: InitParams;
    targetElement: HTMLElement;
    assemblyRef = '';
    defaultRendererProps: Canvas3DProps['renderer'];
    defaultMarkingProps: Canvas3DProps['marking'];
    isHighlightColorUpdated = false;
    isSelectedColorUpdated = false;
    private selectionParams: { [structureNumber: number]: { data: QueryParam[], nonSelectedColor?: any, addedRepr?: boolean } } = {};

    /** Extract InitParams from attributes of an HTML element */
    static initParamsFromHtmlAttributes(element: HTMLElement): Partial<InitParams> {
        return initParamsFromHtmlAttributes(element);
    }

    async render(target: string | HTMLElement, options: Partial<InitParams>) {
        console.debug('Rendering PDBeMolstarPlugin instance with options:', options);
        // Validate options
        if (!options) {
            console.error('Missing `options` argument to `PDBeMolstarPlugin.render');
            return;
        }
        const validationIssues = validateInitParams(options);
        if (validationIssues) {
            console.error('Invalid PDBeMolstarPlugin options:', options);
            return;
        }
        this.initParams = addDefaults(options, DefaultParams);

        // Set PDBe Plugin Spec
        const pdbePluginSpec: PluginUISpec = DefaultPluginUISpec();
        pdbePluginSpec.config ??= [];

        if (!this.initParams.ligandView && !this.initParams.superposition && this.initParams.selectInteraction) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(StructureFocusRepresentation));
        }

        if (this.initParams.superposition) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(SuperpositionFocusRepresentation), PluginSpec.Behavior(MAQualityAssessment, { autoAttach: true, showTooltip: true }));
        }

        // Add custom properties
        if (this.initParams.domainAnnotation) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(PDBeDomainAnnotations, { autoAttach: true, showTooltip: false }));
        }
        if (this.initParams.validationAnnotation) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(PDBeStructureQualityReport, { autoAttach: true, showTooltip: false }));
        }
        if (this.initParams.symmetryAnnotation) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(RCSBAssemblySymmetry));
            pdbePluginSpec.config.push(
                [RCSBAssemblySymmetryConfig.DefaultServerType, 'pdbe'],
                [RCSBAssemblySymmetryConfig.DefaultServerUrl, 'https://www.ebi.ac.uk/pdbe/aggregated-api/pdb/symmetry'],
                [RCSBAssemblySymmetryConfig.ApplyColors, false],
            );
        }

        pdbePluginSpec.layout = {
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

        pdbePluginSpec.components = {
            controls: {
                left: LeftPanelControls,
                // right: DefaultStructureTools,
                // top: 'none',
                bottom: 'none'
            },
            viewport: {
                controls: PDBeViewportControls,
                view: this.initParams.superposition ? SuperpostionViewport : void 0
            },
            remoteState: 'none',
            structureTools: this.initParams.superposition ? PDBeSuperpositionStructureTools : this.initParams.ligandView ? PDBeLigandViewStructureTools : PDBeStructureTools
        };

        if (this.initParams.alphafoldView) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(MAQualityAssessment, { autoAttach: true, showTooltip: true }));
        }

        pdbePluginSpec.config.push([PluginConfig.Structure.DefaultRepresentationPresetParams, {
            theme: {
                globalName: (this.initParams.alphafoldView) ? 'plddt-confidence' : undefined,
                carbonColor: { name: 'element-symbol', params: {} },
                focus: {
                    name: 'element-symbol',
                    params: { carbonColor: { name: 'element-symbol', params: {} } }
                }
            }
        }]);

        ElementSymbolColorThemeParams.carbonColor.defaultValue = { name: 'element-symbol', params: {} };

        // Add animation props
        if (!this.initParams.ligandView && !this.initParams.superposition) {
            pdbePluginSpec.animations = [AnimateModelIndex, AnimateCameraSpin, AnimateCameraRock, AnimateStateSnapshots, AnimateAssemblyUnwind, AnimateStructureSpin, AnimateStateInterpolation];
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(Mp4Export));
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(GeometryExport));
        }

        if (this.initParams.hideCanvasControls.includes('expand')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowExpand, false]);
        if (this.initParams.hideCanvasControls.includes('selection')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowSelectionMode, false]);
        if (this.initParams.hideCanvasControls.includes('animation')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowAnimation, false]);
        if (this.initParams.hideCanvasControls.includes('controlToggle')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowControls, false]);
        if (this.initParams.hideCanvasControls.includes('controlInfo')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowSettings, false]);

        // override default event bindings
        if (this.initParams.selectBindings) {
            pdbePluginSpec.behaviors.push(
                PluginSpec.Behavior(SelectLoci, { bindings: this.initParams.selectBindings })
            );
        }

        if (this.initParams.focusBindings) {
            pdbePluginSpec.behaviors.push(
                PluginSpec.Behavior(FocusLoci, { bindings: this.initParams.focusBindings })
            );
        }

        this.targetElement = typeof target === 'string' ? document.getElementById(target)! : target;
        (this.targetElement as any).viewerInstance = this;

        // Create/ Initialise Plugin
        this.plugin = await createPluginUI(this.targetElement, pdbePluginSpec);
        PluginCustomState(this.plugin).initParams = { ...this.initParams };
        PluginCustomState(this.plugin).events = {
            segmentUpdate: this._ev<boolean>(),
            superpositionInit: this._ev<boolean>(),
            isBusy: this._ev<boolean>()
        };

        // Set background colour
        if (this.initParams.bgColor || this.initParams.lighting) {
            this.canvas.applySettings({ color: this.initParams.bgColor, lighting: this.initParams.lighting });
        }

        // Set selection granularity
        if (this.initParams.granularity) {
            this.plugin.managers.interactivity.setProps({ granularity: this.initParams.granularity });
        }

        // Set default highlight and selection colors
        if (this.initParams.highlightColor || this.initParams.selectColor) {
            this.visual.setColor({ highlight: this.initParams.highlightColor, select: this.initParams.selectColor });
        }

        // Save renderer defaults
        this.defaultRendererProps = { ...this.plugin.canvas3d!.props.renderer };
        this.defaultMarkingProps = { ...this.plugin.canvas3d!.props.marking };

        if (this.initParams.superposition) {
            // Set left panel tab
            this.plugin.behaviors.layout.leftPanelTabName.next('segments' as any);

            // Initialise superposition
            if (this.initParams.loadingOverlay) {
                new LoadingOverlay(this.targetElement, { resize: this.plugin?.canvas3d?.resized, hide: this.events.loadComplete }).show();
            }
            initSuperposition(this.plugin, this.events.loadComplete);

        } else {

            // Collapse left panel and set left panel tab to none
            PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...this.plugin.layout.state.regionState, left: 'collapsed' } } });
            this.plugin.behaviors.layout.leftPanelTabName.next('none');

            // Load Molecule CIF or coordQuery and Parse
            const dataSource = this.getMoleculeSrcUrl();
            if (dataSource) {
                if (this.initParams.loadingOverlay) {
                    new LoadingOverlay(this.targetElement, { resize: this.plugin?.canvas3d?.resized, hide: this.events.loadComplete }).show();
                }
                this.load({ url: dataSource.url, format: dataSource.format as BuiltInTrajectoryFormat, assemblyId: this.initParams.assemblyId, isBinary: dataSource.isBinary, progressMessage: `Loading ${this.initParams.moleculeId ?? ''} ...` });
            }

            // Binding to other PDB Component events
            if (this.initParams.subscribeEvents) {
                subscribeToComponentEvents(this);
            }

            // Event handling
            CustomEvents.add(this.plugin, this.targetElement);

        }

    }

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

    get state() {
        return this.plugin.state.data;
    }

    async createLigandStructure(isBranched: boolean) {
        if (this.assemblyRef === '') return;
        for await (const comp of this.plugin.managers.structure.hierarchy.currentComponentGroups) {
            await PluginCommands.State.RemoveObject(this.plugin, { state: comp[0].cell.parent!, ref: comp[0].cell.transform.ref, removeParentGhosts: true });
        }

        const structure = this.state.select(this.assemblyRef)[0];

        let ligandQuery;
        if (isBranched) {
            ligandQuery = LigandView.branchedQuery(this.initParams.ligandView?.label_comp_id_list!);
        } else {
            ligandQuery = LigandView.query(this.initParams.ligandView!);
        }

        const ligandVis = await this.plugin.builders.structure.tryCreateComponentFromExpression(structure, ligandQuery.core, 'pivot', { label: 'Ligand' });
        if (ligandVis) await this.plugin.builders.structure.representation.addRepresentation(ligandVis, { type: 'ball-and-stick', color: 'element-symbol', colorParams: { carbonColor: { name: 'element-symbol', params: {} } }, size: 'uniform', sizeParams: { value: 2.5 } }, { tag: 'ligand-vis' });

        const ligandSurr = await this.plugin.builders.structure.tryCreateComponentFromExpression(structure, ligandQuery.surroundings, 'rest', { label: 'Surroundings' });
        if (ligandSurr) await this.plugin.builders.structure.representation.addRepresentation(ligandSurr, { type: 'ball-and-stick', color: 'element-symbol', colorParams: { carbonColor: { name: 'element-symbol', params: {} } }, size: 'uniform', sizeParams: { value: 0.8 } });

        // Focus ligand
        const ligRef = StateSelection.findTagInSubtree(this.plugin.state.data.tree, StateTransform.RootRef, 'ligand-vis');
        if (!ligRef) return;
        const cell = this.plugin.state.data.cells.get(ligRef)!;
        if (cell?.obj) {
            const repr = cell.obj.data.repr as Representation<unknown>;
            const ligLoci = repr.getAllLoci()[0]; // getAllLoci returns multiple copies of the same loci (one per representation visual)
            this.plugin.managers.structure.focus.setFromLoci(ligLoci);
            // focus-add is not handled in camera behavior, doing it here
            const current = this.plugin.managers.structure.focus.current?.loci;
            if (current) this.plugin.managers.camera.focusLoci(current);
        }
    }

    async load({ url, format = 'mmcif', isBinary = false, assemblyId = '', progressMessage }: LoadParams, fullLoad = true) {
        await runWithProgressMessage(this.plugin, progressMessage, async () => {
            let success = false;
            try {
                if (fullLoad) await this.clear();
                const isHetView = this.initParams.ligandView ? true : false;
                let downloadOptions: any = void 0;
                let isBranchedView = false;
                if (this.initParams.ligandView && this.initParams.ligandView.label_comp_id_list) {
                    isBranchedView = true;
                    downloadOptions = { body: JSON.stringify(this.initParams.ligandView.label_comp_id_list), headers: [['Content-type', 'application/json']] };
                }

                const data = await this.plugin.builders.data.download({ url: Asset.Url(url, downloadOptions), isBinary }, { state: { isGhost: true } });
                const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);

                if (!isHetView) {

                    await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, this.initParams.defaultPreset as any, {
                        structure: assemblyId ? (assemblyId === 'preferred') ? void 0 : { name: 'assembly', params: { id: assemblyId } } : { name: 'model', params: {} },
                        showUnitcell: false,
                        representationPreset: 'auto'
                    });

                    if (this.initParams.hideStructure.length > 0 || this.initParams.visualStyle) {
                        this.applyVisualParams();
                    }

                } else {
                    const model = await this.plugin.builders.structure.createModel(trajectory);
                    await this.plugin.builders.structure.createStructure(model, { name: 'model', params: {} });
                }

                // show selection if param is set
                if (this.initParams.selection) {
                    this.visual.select(this.initParams.selection);
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

                // Create Ligand Representation
                if (isHetView) {
                    await this.createLigandStructure(isBranchedView);
                }
                success = true;
            } finally {
                this.events.loadComplete.next(success);
            }
        });
    }

    applyVisualParams = () => {
        const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
        for (const compGroup of componentGroups) {
            const compRef = compGroup[compGroup.length - 1];
            const tag = compRef.key ?? '';
            const remove = this.initParams.hideStructure.some(type => StructureComponentTags[type]?.includes(tag));
            if (remove) {
                this.plugin.managers.structure.hierarchy.remove([compRef]);
            }
            if (!remove && this.initParams.visualStyle) {
                if (compRef && compRef.representations) {
                    compRef.representations.forEach(rep => {
                        const currentParams = createStructureRepresentationParams(this.plugin, void 0, { type: this.initParams.visualStyle });
                        this.plugin.managers.structure.component.updateRepresentations([compRef], rep, currentParams);
                    });
                }
            }
        }
    };

    canvas = {
        toggleControls: (isVisible?: boolean) => {
            if (typeof isVisible === 'undefined') isVisible = !this.plugin.layout.state.showControls;
            PluginCommands.Layout.Update(this.plugin, { state: { showControls: isVisible } });
        },

        toggleExpanded: (isExpanded?: boolean) => {
            if (typeof isExpanded === 'undefined') isExpanded = !this.plugin.layout.state.isExpanded;
            PluginCommands.Layout.Update(this.plugin, { state: { isExpanded: isExpanded } });
        },

        setBgColor: async (color?: { r: number, g: number, b: number }) => {
            if (!color) return;
            await this.canvas.applySettings({ color });
        },

        applySettings: async (settings?: { color?: { r: number, g: number, b: number }, lighting?: string }) => {
            if (!settings) return;
            if (!this.plugin.canvas3d) return;
            const renderer = { ...this.plugin.canvas3d.props.renderer };
            if (settings.color) {
                renderer.backgroundColor = Color.fromRgb(settings.color.r, settings.color.g, settings.color.b);
            }
            if (settings.lighting) {
                (renderer as any).style = { name: settings.lighting }; // I don't think this does anything and I don't see how it could ever have worked
            }
            await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer } });
        },

    };

    getLociForParams(params: QueryParam[], structureNumber?: number) {
        let assemblyRef = this.assemblyRef;
        if (structureNumber) {
            assemblyRef = this.plugin.managers.structure.hierarchy.current.structures[structureNumber - 1].cell.transform.ref;
        }
        if (assemblyRef === '') return EmptyLoci;
        const data = (this.plugin.state.data.select(assemblyRef)[0].obj as PluginStateObject.Molecule.Structure).data;
        if (!data) return EmptyLoci;
        return QueryHelper.getInteractivityLoci(params, data);
    }

    getLociByPLDDT(score: number, structureNumber?: number) {
        let assemblyRef = this.assemblyRef;
        if (structureNumber) {
            assemblyRef = this.plugin.managers.structure.hierarchy.current.structures[structureNumber - 1].cell.transform.ref;
        }

        if (assemblyRef === '') return EmptyLoci;
        const data = (this.plugin.state.data.select(assemblyRef)[0].obj as PluginStateObject.Molecule.Structure).data;
        if (!data) return EmptyLoci;
        return AlphafoldView.getLociByPLDDT(score, data);
    }

    /** For each item in params, get loci and bundle */
    private getSelections(params: QueryParam[], structNumber: number) {
        const result: { param: QueryParam, loci: StructureElement.Loci, bundle: StructureElement.Bundle }[] = [];
        for (const param of params) {
            const loci = this.getLociForParams([param], structNumber);
            if (Loci.isEmpty(loci) || !StructureElement.Loci.is(loci)) continue;
            const bundle = StructureElement.Bundle.fromLoci(loci);
            result.push({ param, loci, bundle });
        }
        return result;
    }
    private getBundle(params: QueryParam[], structNumber: number): StructureElement.Bundle | undefined {
        const loci = this.getLociForParams(params, structNumber);
        if (Loci.isEmpty(loci) || !StructureElement.Loci.is(loci)) return undefined;
        return StructureElement.Bundle.fromLoci(loci);
    }

    normalizeColor(colorVal: any, defaultColor?: Color) {
        defaultColor ??= Color.fromRgb(170, 170, 170);
        try {
            if (colorVal === undefined || colorVal === null) return defaultColor;
            if (typeof colorVal === 'number') return Color(colorVal);
            if (typeof colorVal === 'string' && colorVal[0] === '#') return Color(Number(`0x${colorVal.substring(1)}`));
            if (typeof colorVal === 'object') return Color.fromRgb(colorVal.r ?? 0, colorVal.g ?? 0, colorVal.b ?? 0);
        } catch {
            // do nothing
        }
        return defaultColor;
    }

    visual = {
        highlight: (params: { data: QueryParam[], color?: any, focus?: boolean, structureNumber?: number }) => {
            const loci = this.getLociForParams(params.data, params.structureNumber);
            if (Loci.isEmpty(loci)) return;
            if (params.color) {
                this.visual.setColor({ highlight: params.color });
            }
            this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
            if (params.focus) this.plugin.managers.camera.focusLoci(loci);

        },

        clearHighlight: async () => {
            this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci: EmptyLoci });
            if (this.isHighlightColorUpdated) this.visual.reset({ highlightColor: true });
        },

        /** `structureNumber` counts from 1; if not provided, select will be applied to all load structures */
        select: async (params: { data: QueryParam[], nonSelectedColor?: any, addedRepr?: boolean, structureNumber?: number }) => {
            await this.visual.clearSelection(params.structureNumber);

            // Structure list to apply selection
            let structures = this.plugin.managers.structure.hierarchy.current.structures.map((structureRef, i) => ({ structureRef, number: i + 1 }));
            if (params.structureNumber !== undefined) {
                structures = [structures[params.structureNumber - 1]];
            }

            // Filter selection items that apply added representations
            const addedReprParams: { [repr: string]: QueryParam[] } = {};
            for (const param of params.data) {
                const repr = param.representation ?? (param.sideChain ? 'ball-and-stick' : undefined);
                if (repr) {
                    (addedReprParams[repr] ??= []).push(param);
                }
            }

            const DefaultSelectColor = Color.fromRgb(255, 112, 3);
            const focusLoci: StructureElement.Loci[] = [];

            for (const struct of structures) {
                // Apply nonSelectedColor as background color
                if (params.nonSelectedColor) {
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(struct.structureRef.components, { color: 'uniform', colorParams: { value: this.normalizeColor(params.nonSelectedColor) } });
                }

                const selections = this.getSelections(params.data, struct.number);
                for (const selection of selections) {
                    if (selection.param.focus) {
                        focusLoci.push(selection.loci);
                    }
                }

                // Apply color to the main representation
                const overpaintLayers: Overpaint.BundleLayer[] = selections.map(s => ({
                    bundle: s.bundle,
                    color: s.param.color ? this.normalizeColor(s.param.color) : DefaultSelectColor,
                    clear: false,
                }));
                const update = this.plugin.build();
                for (const component of struct.structureRef.components) {
                    for (const repr of component.representations) {
                        update.to(repr.cell.transform.ref).apply(
                            StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                            { layers: overpaintLayers },
                            { tags: Tags.Overpaint },
                        );
                    }
                }
                await update.commit();

                // Add extra representations
                let addedRepr = false;
                for (const repr in addedReprParams) {
                    addedRepr = true;
                    const bundle = this.getBundle(addedReprParams[repr], struct.number);
                    if (!bundle) continue;
                    const overpaintLayers: Overpaint.BundleLayer[] = selections.filter(s => s.param.representationColor).map(s => ({
                        bundle: s.bundle,
                        color: this.normalizeColor(s.param.representationColor!),
                        clear: false,
                    }));
                    await this.plugin.build()
                        .to(struct.structureRef.cell)
                        .apply(StructureComponent, { type: { name: 'bundle', params: bundle }, label: repr }, { tags: Tags.AddedComponent })
                        .apply(StructureRepresentation3D, createStructureRepresentationParams(this.plugin, struct.structureRef.cell.obj?.data, { type: repr as any }))
                        .apply(
                            StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                            { layers: overpaintLayers },
                            { tags: Tags.Overpaint },
                        )
                        .commit();
                }

                // Save selection params for later clearSelection
                this.selectionParams[struct.number] = { ...params, addedRepr };
            }

            // Apply focus
            if (focusLoci.length > 0) {
                this.plugin.managers.camera.focusLoci(focusLoci);
            }
        },

        /** `structureNumber` counts from 1; if not provided, clearSelection will be applied to all load structures */
        clearSelection: async (structureNumber?: number) => {
            // Structure list to apply to
            let structures = this.plugin.managers.structure.hierarchy.current.structures.map((structureRef, i) => ({ structureRef, number: i + 1 }));
            if (structureNumber !== undefined) {
                structures = [structures[structureNumber - 1]];
            }
            for (const struct of structures) {
                const currentParams = this.selectionParams[struct.number];
                if (!currentParams) continue;
                // Remove nonSelectedColor
                if (currentParams.nonSelectedColor) {
                    const defaultTheme = { color: this.initParams.alphafoldView ? 'plddt-confidence' : 'default' };
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(struct.structureRef.components, defaultTheme as any);
                }
                // Remove overpaint
                await clearStructureOverpaint(this.plugin, struct.structureRef.components);
                // Remove added reprs
                if (currentParams.addedRepr) {
                    const componentsToDelete = struct.structureRef.components.filter(comp => comp.cell.transform.tags?.includes(Tags.AddedComponent));
                    const update = this.plugin.build();
                    for (const comp of componentsToDelete) {
                        update.delete(comp.cell.transform.ref);
                    }
                    await update.commit();
                }
                delete this.selectionParams[struct.number];
            }
        },

        update: async (options: Partial<InitParams>, fullLoad?: boolean) => {
            console.debug('Updating PDBeMolstarPlugin instance with options:', options);
            // Validate options
            if (!options) {
                console.error('Missing `options` argument to `PDBeMolstarPlugin.visual.update');
                return;
            }
            const validationIssues = validateInitParams(options);
            if (validationIssues) {
                console.error('Invalid PDBeMolstarPlugin options:', options);
                return;
            }

            this.initParams = addDefaults(options, DefaultParams);

            if (!this.initParams.moleculeId && !this.initParams.customData) return false;
            if (this.initParams.customData && this.initParams.customData.url && !this.initParams.customData.format) return false;
            PluginCustomState(this.plugin).initParams = this.initParams;

            // Show/hide buttons in the viewport control panel
            this.plugin.config.set(PluginConfig.Viewport.ShowExpand, !this.initParams.hideCanvasControls.includes('expand'));
            this.plugin.config.set(PluginConfig.Viewport.ShowSelectionMode, !this.initParams.hideCanvasControls.includes('selection'));
            this.plugin.config.set(PluginConfig.Viewport.ShowAnimation, !this.initParams.hideCanvasControls.includes('animation'));
            this.plugin.config.set(PluginConfig.Viewport.ShowControls, !this.initParams.hideCanvasControls.includes('controlToggle'));
            this.plugin.config.set(PluginConfig.Viewport.ShowSettings, !this.initParams.hideCanvasControls.includes('controlInfo'));

            // Set background colour
            if (this.initParams.bgColor || this.initParams.lighting) {
                await this.canvas.applySettings({ color: this.initParams.bgColor, lighting: this.initParams.lighting });
            }

            // Load Molecule CIF or coordQuery and Parse
            const dataSource = this.getMoleculeSrcUrl();
            if (dataSource) {
                await this.load({ url: dataSource.url, format: dataSource.format as BuiltInTrajectoryFormat, assemblyId: this.initParams.assemblyId, isBinary: dataSource.isBinary }, fullLoad);
            }
        },

        visibility: async (data: { polymer?: boolean, het?: boolean, water?: boolean, carbs?: boolean, nonStandard?: boolean, maps?: boolean, [key: string]: any }) => {
            if (!data) return;

            for (const visual in data) {
                const tags = StructureComponentTags[visual as keyof typeof StructureComponentTags] ?? [];
                for (const tag of tags) {
                    const componentRef = StateSelection.findTagInSubtree(this.plugin.state.data.tree, StateTransform.RootRef, tag);
                    if (componentRef) {
                        const compVisual = this.plugin.state.data.select(componentRef)[0];
                        if (compVisual && compVisual.obj) {
                            const currentlyVisible = (compVisual.state && compVisual.state.isHidden) ? false : true;
                            if (data[visual] !== currentlyVisible) {
                                await PluginCommands.State.ToggleVisibility(this.plugin, { state: this.state, ref: componentRef });
                            }
                        }
                    }
                }
            }

        },

        toggleSpin: async (isSpinning?: boolean, resetCamera?: boolean) => {
            if (!this.plugin.canvas3d) return;
            const trackball = this.plugin.canvas3d.props.trackball;

            let toggleSpinParam: any = trackball.animate.name === 'spin' ? { name: 'off', params: {} } : { name: 'spin', params: { speed: 1 } };

            if (typeof isSpinning !== 'undefined') {
                toggleSpinParam = { name: 'off', params: {} };
                if (isSpinning) toggleSpinParam = { name: 'spin', params: { speed: 1 } };
            }
            await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { trackball: { ...trackball, animate: toggleSpinParam } } });
            if (resetCamera) await PluginCommands.Camera.Reset(this.plugin, {});
        },

        focus: async (params: QueryParam[], structureNumber?: number) => {
            const loci = this.getLociForParams(params, structureNumber);
            this.plugin.managers.camera.focusLoci(loci);
        },

        setColor: async (param: { highlight?: ColorParams, select?: ColorParams }) => {
            if (!this.plugin.canvas3d) return;
            if (!param.highlight && !param.select) return;
            const renderer = { ...this.plugin.canvas3d.props.renderer };
            const marking = { ...this.plugin.canvas3d.props.marking };
            if (param.highlight) {
                renderer.highlightColor = this.normalizeColor(param.highlight);
                marking.highlightEdgeColor = Color.darken(this.normalizeColor(param.highlight), 1);
                this.isHighlightColorUpdated = true;
            }
            if (param.select) {
                renderer.selectColor = this.normalizeColor(param.select);
                marking.selectEdgeColor = Color.darken(this.normalizeColor(param.select), 1);
                this.isSelectedColorUpdated = true;
            }
            await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer, marking } });
        },

        reset: async (params: { camera?: boolean, theme?: boolean, highlightColor?: boolean, selectColor?: boolean }) => {
            if (params.camera) await PluginCommands.Camera.Reset(this.plugin, { durationMs: 250 });

            if (params.theme) {
                const defaultTheme: any = { color: this.initParams.alphafoldView ? 'plddt-confidence' : 'default' };
                const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
                for (const compGrp of componentGroups) {
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(compGrp, defaultTheme);
                }
            }

            if (params.highlightColor || params.selectColor) {
                if (!this.plugin.canvas3d) return;
                const renderer = { ...this.plugin.canvas3d.props.renderer };
                const marking = { ...this.plugin.canvas3d.props.marking };
                if (params.highlightColor) {
                    renderer.highlightColor = this.defaultRendererProps.highlightColor;
                    marking.highlightEdgeColor = this.defaultMarkingProps.highlightEdgeColor;
                    this.isHighlightColorUpdated = false;
                }
                if (params.selectColor) {
                    renderer.selectColor = this.defaultRendererProps.selectColor;
                    marking.selectEdgeColor = this.defaultMarkingProps.selectEdgeColor;
                    this.isSelectedColorUpdated = false;
                }
                await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer, marking } });
            }
        },
    };

    async clear() {
        await this.plugin.clear();
        this.assemblyRef = '';
        this.selectionParams = {};
        this.isHighlightColorUpdated = false;
        this.isSelectedColorUpdated = false;
    }
}

const Tags = {
    /** Tag needed for `clearStructureOverpaint`; defined in src/mol-plugin-state/helpers/structure-overpaint.ts but private */
    Overpaint: 'overpaint-controls',
    /** Marks structure components added by `select` */
    AddedComponent: 'pdbe-molstar.added-component',
};
const StructureComponentTags = {
    polymer: ['structure-component-static-polymer'],
    het: ['structure-component-static-ligand', 'structure-component-static-ion'],
    water: ['structure-component-static-water'],
    carbs: ['structure-component-static-branched'],
    nonStandard: ['structure-component-static-non-standard'],
    coarse: ['structure-component-static-coarse'],
    maps: ['volume-streaming-info'],
};


(window as any).PDBeMolstarPlugin = PDBeMolstarPlugin;
