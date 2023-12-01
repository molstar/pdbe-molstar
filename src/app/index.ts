import { GeometryExport } from 'Molstar/extensions/geo-export';
import { MAQualityAssessment } from 'Molstar/extensions/model-archive/quality-assessment/behavior';
import { Mp4Export } from 'Molstar/extensions/mp4-export';
import { PDBeStructureQualityReport } from 'Molstar/extensions/pdbe';
import { RCSBAssemblySymmetry } from 'Molstar/extensions/rcsb/assembly-symmetry/behavior';
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
import { StructureComponentManager } from 'Molstar/mol-plugin-state/manager/structure/component';
import { PluginStateObject } from 'Molstar/mol-plugin-state/objects';
import { PluginUISpec } from 'Molstar/mol-plugin-ui/spec';
import { FocusLoci } from 'Molstar/mol-plugin/behavior/dynamic/camera';
import { SelectLoci } from 'Molstar/mol-plugin/behavior/dynamic/representation';
import { StructureFocusRepresentation } from 'Molstar/mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { InitVolumeStreaming } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { PluginConfig } from 'Molstar/mol-plugin/config';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginSpec } from 'Molstar/mol-plugin/spec';
import { StateSelection, StateTransform } from 'Molstar/mol-state';
import { ElementSymbolColorThemeParams } from 'Molstar/mol-theme/color/element-symbol';
import { Asset } from 'Molstar/mol-util/assets';
import { Color } from 'Molstar/mol-util/color/color';
import { ParamDefinition } from 'Molstar/mol-util/param-definition';
import { RxEventHelper } from 'Molstar/mol-util/rx-event-helper';
import { hackRCSBAssemblySymmetry } from './assembly-symmetry';
import { CustomEvents } from './custom-events';
import { PDBeDomainAnnotations } from './domain-annotations/behavior';
import { AlphafoldView, LigandView, LoadParams, ModelServerRequest, PDBeVolumes, QueryHelper, QueryParam, getStructureUrl, runWithProgressMessage } from './helpers';
import { LoadingOverlay } from './overlay';
import { DefaultParams, DefaultPluginUISpec, InitParams, createPluginUI } from './spec';
import { subscribeToComponentEvents } from './subscribe-events';
import { initSuperposition } from './superposition';
import { SuperpositionFocusRepresentation } from './superposition-focus-representation';
import { LeftPanelControls } from './ui/pdbe-left-panel';
import { PDBeLigandViewStructureTools, PDBeStructureTools, PDBeSuperpositionStructureTools } from './ui/pdbe-structure-controls';
import { PDBeViewportControls } from './ui/pdbe-viewport-controls';
import { SuperpostionViewport } from './ui/superposition-viewport';

import 'Molstar/mol-plugin-ui/skin/dark.scss';
import './overlay.scss';

class PDBeMolstarPlugin {

    private _ev = RxEventHelper.create();

    readonly events = {
        loadComplete: this._ev<boolean>()
    };

    plugin: PluginContext;
    initParams: InitParams;
    targetElement: HTMLElement;
    assemblyRef = '';
    selectedParams: any;
    defaultRendererProps: any;
    isHighlightColorUpdated = false;
    isSelectedColorUpdated = false;

    async render(target: string | HTMLElement, options: InitParams) {
        if (!options) return;
        this.initParams = { ...DefaultParams };
        for (const param in DefaultParams) {
            if (typeof options[param] !== 'undefined') this.initParams[param] = options[param];
        }

        if (!this.initParams.moleculeId && !this.initParams.customData) return false;
        if (this.initParams.customData && this.initParams.customData.url && !this.initParams.customData.format) return false;

        // Set PDBe Plugin Spec
        const defaultPDBeSpec = DefaultPluginUISpec();
        const pdbePluginSpec: PluginUISpec = {
            actions: [...defaultPDBeSpec.actions || []],
            behaviors: [...defaultPDBeSpec.behaviors],
            animations: [...defaultPDBeSpec.animations || []],
            customParamEditors: defaultPDBeSpec.customParamEditors ?? [],
            config: defaultPDBeSpec.config ?? [],
        };

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
            hackRCSBAssemblySymmetry();
        }

        pdbePluginSpec.layout = {
            initial: {
                isExpanded: this.initParams.landscape ? false : this.initParams.expanded,
                showControls: !this.initParams.hideControls,
                regionState: {
                    left: 'full',
                    right: 'full',
                    top: this.initParams.sequencePanel ? 'full' : 'hidden',
                    bottom: 'full',
                },
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

        pdbePluginSpec.config!.push([PluginConfig.Structure.DefaultRepresentationPresetParams, {
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
            pdbePluginSpec['animations'] = [AnimateModelIndex, AnimateCameraSpin, AnimateCameraRock, AnimateStateSnapshots, AnimateAssemblyUnwind, AnimateStructureSpin, AnimateStateInterpolation];
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(Mp4Export));
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(GeometryExport));
        }

        if (this.initParams.hideCanvasControls) {
            if (this.initParams.hideCanvasControls.indexOf('expand') > -1) pdbePluginSpec.config!.push([PluginConfig.Viewport.ShowExpand, false]);
            if (this.initParams.hideCanvasControls.indexOf('selection') > -1) pdbePluginSpec.config!.push([PluginConfig.Viewport.ShowSelectionMode, false]);
            if (this.initParams.hideCanvasControls.indexOf('animation') > -1) pdbePluginSpec.config!.push([PluginConfig.Viewport.ShowAnimation, false]);
        };

        if (this.initParams.landscape && pdbePluginSpec.layout && pdbePluginSpec.layout.initial) pdbePluginSpec.layout.initial['controlsDisplay'] = 'landscape';
        if (this.initParams.reactive && pdbePluginSpec.layout && pdbePluginSpec.layout.initial) pdbePluginSpec.layout.initial['controlsDisplay'] = 'reactive';

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

        // Create/ Initialise Plugin
        this.plugin = await createPluginUI(this.targetElement, pdbePluginSpec);
        (this.plugin.customState as any).initParams = { ...this.initParams };
        (this.plugin.customState as any).events = {
            segmentUpdate: this._ev<boolean>(),
            superpositionInit: this._ev<boolean>(),
            isBusy: this._ev<boolean>()
        };

        // Set background colour
        if (this.initParams.bgColor || this.initParams.lighting) {
            const settings: any = {};
            if (this.initParams.bgColor) settings.color = this.initParams.bgColor;
            if (this.initParams.lighting) settings.lighting = this.initParams.lighting;
            this.canvas.applySettings(settings);
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
            this.plugin.behaviors.layout.leftPanelTabName.next('none' as any);

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
        if (cell) {
            const ligLoci = cell.obj!.data.repr.getLoci();
            this.plugin.managers.structure.focus.setFromLoci(ligLoci);
            setTimeout(() => {
                // focus-add is not handled in camera behavior, doing it here
                const current = this.plugin.managers.structure.focus.current?.loci;
                if (current) this.plugin.managers.camera.focusLoci(current);
            }, 500);
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
                    downloadOptions = { body: JSON.stringify(this.initParams.ligandView!.label_comp_id_list), headers: [['Content-type', 'application/json']] };
                }

                const data = await this.plugin.builders.data.download({ url: Asset.Url(url, downloadOptions), isBinary }, { state: { isGhost: true } });
                const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);

                if (!isHetView) {

                    await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, this.initParams.defaultPreset as any, {
                        structure: assemblyId ? (assemblyId === 'preferred') ? void 0 : { name: 'assembly', params: { id: assemblyId } } : { name: 'model', params: {} },
                        showUnitcell: false,
                        representationPreset: 'auto'
                    });

                    if (this.initParams.hideStructure || this.initParams.visualStyle) {
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
        const TagRefs: any = {
            'structure-component-static-polymer': 'polymer',
            'structure-component-static-ligand': 'het',
            'structure-component-static-branched': 'carbs',
            'structure-component-static-water': 'water',
            'structure-component-static-coarse': 'coarse',
            'non-standard': 'nonStandard'
        };

        const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
        componentGroups.forEach((compGrp) => {
            const compGrpIndex = compGrp.length - 1;
            const key = compGrp[compGrpIndex].key;
            let rm = false;
            if (key && this.initParams.hideStructure) {
                const structType: any = TagRefs[key];
                if (structType && this.initParams.hideStructure?.indexOf(structType) > -1) rm = true;
            }
            if (rm) {
                this.plugin.managers.structure.hierarchy.remove([compGrp[compGrpIndex]]);
            }

            if (!rm && this.initParams.visualStyle) {
                if (compGrp[compGrpIndex] && compGrp[compGrpIndex].representations) {
                    compGrp[compGrpIndex].representations.forEach(rep => {
                        const currentParams = createStructureRepresentationParams(this.plugin, void 0, { type: this.initParams.visualStyle });
                        this.plugin.managers.structure.component.updateRepresentations([compGrp[compGrpIndex]], rep, currentParams);
                    });
                }
            }
        });
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

        setBgColor: (color?: { r: number, g: number, b: number }) => {
            if (!color) return;
            this.canvas.applySettings({ color });
        },

        applySettings: (settings?: { color?: { r: number, g: number, b: number }, lighting?: string }) => {
            if (!settings) return;
            const rendererParams: any = {};
            if (settings.color) rendererParams['backgroundColor'] = Color.fromRgb(settings.color.r, settings.color.g, settings.color.b);
            if (settings.lighting) rendererParams['style'] = { name: settings.lighting };
            const renderer = this.plugin.canvas3d!.props.renderer;
            PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer: { ...renderer, ...rendererParams } } });
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



    normalizeColor(colorVal: any, defaultColor?: Color) {
        let color = Color.fromRgb(170, 170, 170);
        try {
            if (typeof colorVal.r !== 'undefined') {
                color = Color.fromRgb(colorVal.r, colorVal.g, colorVal.b);
            } else if (colorVal[0] === '#') {
                color = Color(Number(`0x${colorVal.substr(1)}`));
            } else {
                color = Color(colorVal);
            }
        } catch (e) {
            if (defaultColor) color = defaultColor;
        }
        return color;
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
        select: async (params: { data: QueryParam[], nonSelectedColor?: any, addedRepr?: boolean, structureNumber?: number }) => {

            // clear prvious selection
            if (this.selectedParams) {
                await this.visual.clearSelection(params.structureNumber);
            }

            // Structure list to apply selection
            let structureData = this.plugin.managers.structure.hierarchy.current.structures;
            if (params.structureNumber) {
                structureData = [this.plugin.managers.structure.hierarchy.current.structures[params.structureNumber - 1]];
            }

            // set non selected theme color
            if (params.nonSelectedColor) {
                for await (const s of structureData) {
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(s.components, { color: 'uniform', colorParams: { value: this.normalizeColor(params.nonSelectedColor) } });
                }
            }

            // apply individual selections
            for await (const param of params.data) {
                // get loci from param
                const loci = this.getLociForParams([param], params.structureNumber);
                if (Loci.isEmpty(loci)) return;
                // set default selection color to minimise change display
                this.visual.setColor({ select: param.color ? param.color : { r: 255, g: 112, b: 3 } });
                // apply selection
                this.plugin.managers.interactivity.lociSelects.selectOnly({ loci });
                // create theme param values and apply them to create overpaint
                const themeParams = StructureComponentManager.getThemeParams(this.plugin, this.plugin.managers.structure.component.pivotStructure);
                const colorValue = ParamDefinition.getDefaultValues(themeParams);
                colorValue.action.params = { color: param.color ? this.normalizeColor(param.color) : Color.fromRgb(255, 112, 3), opacity: 1 };
                await this.plugin.managers.structure.component.applyTheme(colorValue, structureData);
                // add new representations
                if (param.sideChain || param.representation) {
                    let repr = 'ball-and-stick';
                    if (param.representation) repr = param.representation;
                    const defaultParams = StructureComponentManager.getAddParams(this.plugin, { allowNone: false, hideSelection: true, checkExisting: true });
                    const defaultValues = ParamDefinition.getDefaultValues(defaultParams);
                    defaultValues.options = { label: 'selection-by-script', checkExisting: params.structureNumber ? false : true };
                    const values = { ...defaultValues, ...{ representation: repr } };
                    const structures = this.plugin.managers.structure.hierarchy.getStructuresWithSelection();
                    await this.plugin.managers.structure.component.add(values, structures);

                    // Apply uniform theme
                    if (param.representationColor) {
                        let updatedStructureData = this.plugin.managers.structure.hierarchy.current.structures;
                        if (params.structureNumber) {
                            updatedStructureData = [this.plugin.managers.structure.hierarchy.current.structures[params.structureNumber - 1]];
                        }
                        const comps = updatedStructureData[0].components;
                        const lastCompsIndex = comps.length - 1;
                        const recentRepComp = [comps[lastCompsIndex]];
                        const uniformColor = param.representationColor ? this.normalizeColor(param.representationColor) : Color.fromRgb(255, 112, 3);
                        this.plugin.managers.structure.component.updateRepresentationsTheme(recentRepComp, { color: 'uniform', colorParams: { value: uniformColor } });
                    }

                    params.addedRepr = true;
                }
                // focus loci
                if (param.focus) this.plugin.managers.camera.focusLoci(loci);
                // remove selection
                this.plugin.managers.interactivity.lociSelects.deselect({ loci });
            }

            // reset selection color
            this.visual.reset({ selectColor: true });
            // save selection params to optimise clear
            this.selectedParams = params;

        },
        clearSelection: async (structureNumber?: number) => {
            const structIndex = structureNumber ? structureNumber - 1 : 0;
            this.plugin.managers.interactivity.lociSelects.deselectAll();
            // reset theme to default
            if (this.selectedParams && this.selectedParams.nonSelectedColor) {
                this.visual.reset({ theme: true });
            }
            // remove overpaints
            await clearStructureOverpaint(this.plugin, this.plugin.managers.structure.hierarchy.current.structures[structIndex].components);
            // remove selection representations
            if (this.selectedParams && this.selectedParams.addedRepr) {
                const selReprCells = [];
                for (const c of this.plugin.managers.structure.hierarchy.current.structures[structIndex].components) {
                    if (c.cell && c.cell.params && c.cell.params.values && c.cell.params.values.label === 'selection-by-script') selReprCells.push(c.cell);
                }
                if (selReprCells.length > 0) {
                    for await (const selReprCell of selReprCells) {
                        await PluginCommands.State.RemoveObject(this.plugin, { state: selReprCell.parent!, ref: selReprCell.transform.ref });
                    };
                }

            }
            this.selectedParams = undefined;
        },
        update: async (options: InitParams, fullLoad?: boolean) => {
            if (!options) return;

            // for(let param in this.initParams){
            //     if(options[param]) this.initParams[param] = options[param];
            // }

            this.initParams = { ...DefaultParams };
            for (const param in DefaultParams) {
                if (typeof options[param] !== 'undefined') this.initParams[param] = options[param];
            }

            if (!this.initParams.moleculeId && !this.initParams.customData) return false;
            if (this.initParams.customData && this.initParams.customData.url && !this.initParams.customData.format) return false;
            (this.plugin.customState as any).initParams = this.initParams;

            // Set background colour
            if (this.initParams.bgColor || this.initParams.lighting) {
                const settings: any = {};
                if (this.initParams.bgColor) settings.color = this.initParams.bgColor;
                if (this.initParams.lighting) settings.lighting = this.initParams.lighting;
                this.canvas.applySettings(settings);
            }

            // Load Molecule CIF or coordQuery and Parse
            const dataSource = this.getMoleculeSrcUrl();
            if (dataSource) {
                this.load({ url: dataSource.url, format: dataSource.format as BuiltInTrajectoryFormat, assemblyId: this.initParams.assemblyId, isBinary: dataSource.isBinary }, fullLoad);
            }
        },
        visibility: (data: { polymer?: boolean, het?: boolean, water?: boolean, carbs?: boolean, maps?: boolean, [key: string]: any }) => {

            if (!data) return;

            const refMap: any = {
                polymer: 'structure-component-static-polymer',
                het: 'structure-component-static-ligand',
                water: 'structure-component-static-water',
                carbs: 'structure-component-static-branched',
                maps: 'volume-streaming-info'
            };

            for (const visual in data) {
                const tagName = refMap[visual];
                const componentRef = StateSelection.findTagInSubtree(this.plugin.state.data.tree, StateTransform.RootRef, tagName);
                if (componentRef) {
                    const compVisual = this.plugin.state.data.select(componentRef)[0];
                    if (compVisual && compVisual.obj) {
                        const currentlyVisible = (compVisual.state && compVisual.state.isHidden) ? false : true;
                        if (data[visual] !== currentlyVisible) {
                            PluginCommands.State.ToggleVisibility(this.plugin, { state: this.state, ref: componentRef });
                        }
                    }
                }

            }

        },
        toggleSpin: (isSpinning?: boolean, resetCamera?: boolean) => {
            if (!this.plugin.canvas3d) return;
            const trackball = this.plugin.canvas3d.props.trackball;

            let toggleSpinParam: any = trackball.animate.name === 'spin' ? { name: 'off', params: {} } : { name: 'spin', params: { speed: 1 } };

            if (typeof isSpinning !== 'undefined') {
                toggleSpinParam = { name: 'off', params: {} };
                if (isSpinning) toggleSpinParam = { name: 'spin', params: { speed: 1 } };
            }
            PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { trackball: { ...trackball, animate: toggleSpinParam } } });
            if (resetCamera) PluginCommands.Camera.Reset(this.plugin, {});
        },
        focus: async (params: QueryParam[], structureNumber?: number) => {
            const loci = this.getLociForParams(params, structureNumber);
            this.plugin.managers.camera.focusLoci(loci);
        },
        setColor: (param: { highlight?: any, select?: any }) => {
            if (!this.plugin.canvas3d) return;
            const renderer = this.plugin.canvas3d.props.renderer;
            const rParam: any = {};
            if (param.highlight) rParam['highlightColor'] = this.normalizeColor(param.highlight);
            if (param.select) rParam['selectColor'] = this.normalizeColor(param.select);
            PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer: { ...renderer, ...rParam } } });
            if (rParam.highlightColor) this.isHighlightColorUpdated = true;
        },
        reset: async (params: { camera?: boolean, theme?: boolean, highlightColor?: boolean, selectColor?: boolean }) => {

            if (params.camera) await PluginCommands.Camera.Reset(this.plugin, { durationMs: 250 });

            if (params.theme) {
                const defaultTheme: any = { color: this.initParams.alphafoldView ? 'plddt-confidence' : 'default' };
                const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
                componentGroups.forEach((compGrp) => {
                    this.plugin.managers.structure.component.updateRepresentationsTheme(compGrp, defaultTheme);
                });
            }

            if (params.highlightColor || params.selectColor) {
                if (!this.plugin.canvas3d) return;
                const renderer = this.plugin.canvas3d.props.renderer;
                const rParam: any = {};
                if (params.highlightColor) rParam['highlightColor'] = this.defaultRendererProps.highlightColor;
                if (params.selectColor) rParam['selectColor'] = this.defaultRendererProps.selectColor;
                PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer: { ...renderer, ...rParam } } });
                if (rParam.highlightColor) this.isHighlightColorUpdated = false;
            }
        },
    };

    async clear() {
        await this.plugin.clear();
        this.assemblyRef = '';
        this.selectedParams = void 0;
        this.isHighlightColorUpdated = false;
        this.isSelectedColorUpdated = false;
    }
}

(window as any).PDBeMolstarPlugin = PDBeMolstarPlugin;