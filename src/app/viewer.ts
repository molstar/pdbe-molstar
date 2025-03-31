import { AssemblySymmetry, AssemblySymmetryConfig } from 'molstar/lib/extensions/assembly-symmetry/behavior';
import { GeometryExport } from 'molstar/lib/extensions/geo-export';
import { MAQualityAssessment } from 'molstar/lib/extensions/model-archive/quality-assessment/behavior';
import { Mp4Export } from 'molstar/lib/extensions/mp4-export';
import { MolViewSpec } from 'molstar/lib/extensions/mvs/behavior';
import { CustomTooltipsProps, CustomTooltipsProvider } from 'molstar/lib/extensions/mvs/components/custom-tooltips-prop';
import { PDBeStructureQualityReport } from 'molstar/lib/extensions/pdbe';
import { Canvas3DProps } from 'molstar/lib/mol-canvas3d/canvas3d';
import { EmptyLoci, Loci } from 'molstar/lib/mol-model/loci';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { AnimateAssemblyUnwind } from 'molstar/lib/mol-plugin-state/animation/built-in/assembly-unwind';
import { AnimateCameraRock } from 'molstar/lib/mol-plugin-state/animation/built-in/camera-rock';
import { AnimateCameraSpin } from 'molstar/lib/mol-plugin-state/animation/built-in/camera-spin';
import { AnimateModelIndex } from 'molstar/lib/mol-plugin-state/animation/built-in/model-index';
import { AnimateStructureSpin } from 'molstar/lib/mol-plugin-state/animation/built-in/spin-structure';
import { AnimateStateInterpolation } from 'molstar/lib/mol-plugin-state/animation/built-in/state-interpolation';
import { AnimateStateSnapshots } from 'molstar/lib/mol-plugin-state/animation/built-in/state-snapshots';
import { BuiltInTrajectoryFormat } from 'molstar/lib/mol-plugin-state/formats/trajectory';
import { clearStructureOverpaint } from 'molstar/lib/mol-plugin-state/helpers/structure-overpaint';
import { StructureRepresentationBuiltInProps, createStructureRepresentationParams } from 'molstar/lib/mol-plugin-state/helpers/structure-representation-params';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { CustomStructureProperties, StructureComponent } from 'molstar/lib/mol-plugin-state/transforms/model';
import { StructureRepresentation3D } from 'molstar/lib/mol-plugin-state/transforms/representation';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui/index';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { FocusLoci } from 'molstar/lib/mol-plugin/behavior/dynamic/camera';
import { SelectLoci } from 'molstar/lib/mol-plugin/behavior/dynamic/representation';
import { StructureFocusRepresentation } from 'molstar/lib/mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { InitVolumeStreaming } from 'molstar/lib/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginLayoutStateParams } from 'molstar/lib/mol-plugin/layout';
import { PluginSpec } from 'molstar/lib/mol-plugin/spec';
import { Representation } from 'molstar/lib/mol-repr/representation';
import { StateObjectSelector, StateSelection, StateTransform } from 'molstar/lib/mol-state';
import { ElementSymbolColorThemeParams } from 'molstar/lib/mol-theme/color/element-symbol';
import { Overpaint } from 'molstar/lib/mol-theme/overpaint';
import { Asset } from 'molstar/lib/mol-util/assets';
import { Color } from 'molstar/lib/mol-util/color/color';
import { RxEventHelper } from 'molstar/lib/mol-util/rx-event-helper';
import { CustomEvents } from './custom-events';
import { PDBeDomainAnnotations } from './domain-annotations/behavior';
import * as Foldseek from './extensions/foldseek';
import { StateGallery, StateGalleryExtensionFunctions } from './extensions/state-gallery/behavior';
import { StateGalleryManager } from './extensions/state-gallery/manager';
import { StateGalleryControls } from './extensions/state-gallery/ui';
import { AlphafoldView, LigandView, LoadParams, ModelServerRequest, PDBeVolumes, QueryHelper, QueryParam, StructureComponentTags, Tags, addDefaults, applyOverpaint, getComponentTypeFromTags, getStructureUrl, normalizeColor, runWithProgressMessage } from './helpers';
import { PluginCustomState } from './plugin-custom-state';
import { AnyColor, ComponentType, DefaultParams, DefaultPluginUISpec, InitParams, VisualStylesSpec, resolveVisualStyleSpec, validateInitParams } from './spec';
import { initParamsFromHtmlAttributes } from './spec-from-html';
import { subscribeToComponentEvents } from './subscribe-events';
import { initSuperposition } from './superposition';
import { SuperpositionFocusRepresentation } from './superposition-focus-representation';
import { DefaultLeftPanelControls, PDBeLeftPanelControls } from './ui/left-panel/pdbe-left-panel';
import { PDBeLigandViewStructureTools, PDBeStructureTools, PDBeSuperpositionStructureTools } from './ui/pdbe-structure-controls';
import { PDBeViewport } from './ui/pdbe-viewport';
import { PDBeViewportControls } from './ui/pdbe-viewport-controls';
import { UIComponents } from './ui/split-ui/components';
import { LayoutSpec, createPluginSplitUI, resolveHTMLElement } from './ui/split-ui/split-ui';


export class PDBeMolstarPlugin {

    /** Helper for creating events (e.g. RxJS Subjects) */
    private _ev = RxEventHelper.create();

    readonly events = {
        loadComplete: this._ev<boolean>(),
    };

    plugin: PluginContext;
    initParams: InitParams;
    targetElement: HTMLElement;
    assemblyRef = '';
    defaultRendererProps: Canvas3DProps['renderer'];
    defaultMarkingProps: Canvas3DProps['marking'];
    isHighlightColorUpdated = false;
    isSelectedColorUpdated = false;
    /** Keeps track of representations added by `.visual.select` for each structure. */
    private addedReprs: { [structureNumber: number]: boolean } = {};
    /** Maps structure IDs (assigned when loading) to cell refs. */
    private structureRefMap = new Map<string, StateTransform.Ref>();

    /** Extract InitParams from attributes of an HTML element */
    static initParamsFromHtmlAttributes(element: HTMLElement): Partial<InitParams> {
        return initParamsFromHtmlAttributes(element);
    }

    async render(target: string | HTMLElement | LayoutSpec, options: Partial<InitParams>) {
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

        pdbePluginSpec.behaviors.push(PluginSpec.Behavior(MolViewSpec));
        pdbePluginSpec.behaviors.push(PluginSpec.Behavior(PDBeStructureQualityReport, { autoAttach: false, showTooltip: false }));
        pdbePluginSpec.behaviors.push(PluginSpec.Behavior(PDBeDomainAnnotations, { autoAttach: false, showTooltip: false }));
        pdbePluginSpec.behaviors.push(PluginSpec.Behavior(AssemblySymmetry));
        pdbePluginSpec.config.push(
            [AssemblySymmetryConfig.DefaultServerType, 'pdbe'],
            [AssemblySymmetryConfig.DefaultServerUrl, 'https://www.ebi.ac.uk/pdbe/aggregated-api/pdb/symmetry'],
            [AssemblySymmetryConfig.ApplyColors, false],
        );

        if (this.initParams.galleryView) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(StateGallery));
        }

        if (!this.initParams.ligandView && !this.initParams.superposition && this.initParams.selectInteraction) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(StructureFocusRepresentation));
        }

        if (this.initParams.superposition) {
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(SuperpositionFocusRepresentation), PluginSpec.Behavior(MAQualityAssessment, { autoAttach: true, showTooltip: true }));
        }


        pdbePluginSpec.layout = {
            initial: {
                isExpanded: this.initParams.expanded,
                showControls: !this.initParams.hideControls,
                regionState: {
                    left: this.initParams.leftPanel ? 'full' : 'hidden',
                    right: this.initParams.rightPanel ? 'full' : 'hidden',
                    top: this.initParams.sequencePanel ? 'full' : 'hidden',
                    bottom: this.initParams.logPanel ? 'full' : 'hidden',
                },
                controlsDisplay: this.initParams.reactive ? 'reactive' : this.initParams.landscape ? 'landscape' : PluginLayoutStateParams.controlsDisplay.defaultValue,
            },
        };

        pdbePluginSpec.components = {
            controls: {
                left: this.initParams.tabs === 'pdbe' ? PDBeLeftPanelControls : DefaultLeftPanelControls,
            },
            viewport: {
                controls: PDBeViewportControls,
                view: PDBeViewport,
            },
            remoteState: 'none',
            structureTools: this.initParams.superposition ? PDBeSuperpositionStructureTools
                : this.initParams.ligandView ? PDBeLigandViewStructureTools
                    : this.initParams.galleryView ? StateGalleryControls
                        : PDBeStructureTools,
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
                    params: { carbonColor: { name: 'element-symbol', params: {} } },
                },
            },
        }]);

        ElementSymbolColorThemeParams.carbonColor.defaultValue = { name: 'element-symbol', params: {} };

        // Add animation props
        if (!this.initParams.ligandView && !this.initParams.superposition) {
            pdbePluginSpec.animations = [AnimateModelIndex, AnimateCameraSpin, AnimateCameraRock, AnimateStateSnapshots, AnimateAssemblyUnwind, AnimateStructureSpin, AnimateStateInterpolation];
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(Mp4Export));
            pdbePluginSpec.behaviors.push(PluginSpec.Behavior(GeometryExport));
        }

        if (this.initParams.hideCanvasControls.includes('expand')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowExpand, false]);
        if (this.initParams.hideCanvasControls.includes('controlToggle')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowControls, false]);
        if (this.initParams.hideCanvasControls.includes('controlInfo')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowSettings, false]);
        if (this.initParams.hideCanvasControls.includes('selection')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowSelectionMode, false]);
        if (this.initParams.hideCanvasControls.includes('animation')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowAnimation, false]);
        if (this.initParams.hideCanvasControls.includes('trajectory')) pdbePluginSpec.config.push([PluginConfig.Viewport.ShowTrajectoryControls, false]);

        // override default event bindings
        if (this.initParams.selectBindings) {
            pdbePluginSpec.behaviors.push(
                PluginSpec.Behavior(SelectLoci, { bindings: this.initParams.selectBindings }),
            );
        }

        if (this.initParams.focusBindings) {
            pdbePluginSpec.behaviors.push(
                PluginSpec.Behavior(FocusLoci, { bindings: this.initParams.focusBindings }),
            );
        }

        // Create/ Initialise Plugin
        const onBeforeUIRender = async (plugin: PluginContext) => {
            // This needs to run after the plugin is created but before the UI is rendered
            PluginCustomState(plugin).initParams = { ...this.initParams };
            PluginCustomState(plugin).events = {
                segmentUpdate: this._ev<boolean>(),
                superpositionInit: this._ev<boolean>(),
                isBusy: this._ev<boolean>(),
            };
            if (this.initParams.galleryView && this.initParams.moleculeId) {
                try {
                    await StateGalleryManager.create(plugin, this.initParams.moleculeId); // sets extension custom state
                } catch (err) {
                    console.error(`Failed to initialize StateGalleryManager for entry ${this.initParams.moleculeId}.\n${err}`);
                }
            }
        };

        if (Array.isArray(target)) {
            this.targetElement = resolveHTMLElement(target[0].target);
            this.plugin = await createPluginSplitUI({
                layout: target,
                spec: pdbePluginSpec,
                onBeforeUIRender,
            });
            for (const comp of target) {
                try {
                    (resolveHTMLElement(comp.target) as any).viewerInstance = this;
                } catch { /* some of the target elements missing, ignore */ }
            }
        } else {
            this.targetElement = resolveHTMLElement(target);
            this.plugin = await createPluginUI({ target: this.targetElement, spec: pdbePluginSpec, onBeforeUIRender, render: renderReact18 });
            (this.targetElement as any).viewerInstance = this;
        }

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
            initSuperposition(this.plugin, this.events.loadComplete);

        } else if (this.initParams.galleryView) {
            // Do nothing, StateGalleryManager initialized in onBeforeUIRender
        } else {
            // Load Molecule CIF or coordQuery and Parse
            const dataSource = this.getMoleculeSrcUrl();
            if (dataSource) {
                this.load({
                    url: dataSource.url,
                    format: dataSource.format as BuiltInTrajectoryFormat,
                    assemblyId: this.initParams.assemblyId,
                    isBinary: dataSource.isBinary,
                    progressMessage: `Loading ${this.initParams.moleculeId ?? ''} ...`,
                    id: 'main',
                });
            }

            // Subscribe to events from other PDB Component
            if (this.initParams.subscribeEvents) {
                subscribeToComponentEvents(this);
            }

            // Emit events for other PDB Components
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
            ligandQuery = LigandView.branchedQuery(this.initParams.ligandView?.label_comp_id_list);
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

    async load({ url, format = 'mmcif', isBinary = false, assemblyId = '', progressMessage, id }: LoadParams, fullLoad = true) {
        await runWithProgressMessage(this.plugin, progressMessage, async () => {
            let success = false;
            try {
                PluginCustomState(this.plugin).events?.isBusy.next(true);
                if (fullLoad) await this.clear();
                const isHetView = this.initParams.ligandView ? true : false;
                let downloadOptions: any = undefined;
                let isBranchedView = false;
                if (this.initParams.ligandView && this.initParams.ligandView.label_comp_id_list) {
                    isBranchedView = true;
                    downloadOptions = { body: JSON.stringify(this.initParams.ligandView.label_comp_id_list), headers: [['Content-type', 'application/json']] };
                }

                const data = await this.plugin.builders.data.download({ url: Asset.Url(url, downloadOptions), isBinary }, { state: { isGhost: true } });
                const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);

                let structRef: string;
                if (!isHetView) {
                    await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, this.initParams.defaultPreset as any, {
                        structure: assemblyId ? (assemblyId === 'preferred') ? undefined : { name: 'assembly', params: { id: assemblyId } } : { name: 'model', params: {} },
                        showUnitcell: false,
                        representationPreset: 'auto',
                    });
                    structRef = this.plugin.state.data.selectQ(q => q.byRef(data.ref).subtree().ofType(PluginStateObject.Molecule.Structure))[0].transform.ref;
                    await this.deleteStructureComponents(structRef, this.initParams.hideStructure);
                    await this.applyVisualStyles(structRef, this.initParams.visualStyle);
                    await PluginCommands.Camera.Reset(this.plugin, { durationMs: fullLoad ? 0 : undefined });
                } else {
                    const model = await this.plugin.builders.structure.createModel(trajectory);
                    const structure = await this.plugin.builders.structure.createStructure(model, { name: 'model', params: {} });
                    structRef = structure.ref;
                }
                if (id) {
                    this.structureRefMap.set(id, structRef);
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
                PluginCustomState(this.plugin).events?.isBusy.next(false);
            }
        });
    }

    /** Remove loaded structure(s).
     * `structureNumberOrId` is either index (numbered from 1!) or the ID that was provided when loading the structure.
     * If `structureNumberOrId` is undefined, remove all structures.
     * You will likely need to call `await this.visual.reset({ camera: true })` afterwards. */
    async deleteStructure(structureNumberOrId?: number) {
        const structs = this.getStructures(structureNumberOrId);
        if (structureNumberOrId !== undefined && structs.length === 0) {
            console.error(`Cannot delete structure: there is no structure with number or id ${structureNumberOrId}.`);
        }
        for (const struct of structs) {
            const dataNode = this.plugin.state.data.selectQ(q => q.byRef(struct.structureRef.cell.transform.ref).ancestorOfType([PluginStateObject.Data.String, PluginStateObject.Data.Binary]))[0];
            if (dataNode) {
                await this.plugin.build().delete(dataNode).commit();
            }
        }
        // no need to remove ID from this.structRefMap, it will get remove in the next getStructureRefs call
    }

    /** Apply representations to structure components based on `styles`, also removing any existing representations.
     * Components not included in `styles` will keep their representations.
     * E.g. `styles={polymer:'putty',nonStandard:'ball-and-stick'}` - apply only putty to polymer, only ball-and-stick to non-standard residues, leave other components untouched.
     * E.g. `styles='ball-and-stick'` - apply only ball-and-stick to all components. */
    private async applyVisualStyles(structureRef: string, styles: VisualStylesSpec | undefined) {
        if (styles === undefined) return;
        const components = this.plugin.state.data.selectQ(q => q.byRef(structureRef).subtree().withTransformer(StructureComponent));
        const compStyles = resolveVisualStyleSpec(styles);
        const addedReprs: { style: StructureRepresentationBuiltInProps, repr: StateObjectSelector }[] = [];
        const update = this.plugin.build();
        for (const comp of components) {
            const compType = getComponentTypeFromTags(comp.obj?.tags);
            if (compType === undefined) continue;
            const compStyle = compStyles[compType as keyof typeof compStyles];
            if (compStyle === undefined) continue;
            const existingReprs = this.plugin.state.data.selectQ(q => q.byValue(comp).subtree().withTransformer(StructureRepresentation3D));
            for (const repr of existingReprs) {
                update.delete(repr);
            }
            const newReprProps = createStructureRepresentationParams(this.plugin, comp.obj?.data, { color: this.defaultColorTheme() as any, ...compStyle });
            const newRepr = update.to(comp).apply(StructureRepresentation3D, newReprProps).selector;
            addedReprs.push({ style: compStyle, repr: newRepr });
        }
        await update.commit();

        // Sometimes Molstar applies different repr type than requested (especially for water), we must remove such unwanted reprs:
        const rubbishReprs = addedReprs.filter(r => r.repr.cell?.params?.values.type.name !== r.style.type);
        if (rubbishReprs.length > 0) {
            const update = this.plugin.build();
            for (const r of rubbishReprs) {
                update.delete(r.repr);
            }
            await update.commit();
        }
    }
    private defaultColorTheme() {
        return this.initParams.alphafoldView ? 'plddt-confidence' : 'default';
    }

    /** Remove all structure components of the given structure which correspond to any component type listed in `deleteComponents`. */
    private async deleteStructureComponents(structureRef: string, deleteComponents: ComponentType[]) {
        if (deleteComponents.length === 0) return;
        const comps = this.plugin.state.data.selectQ(q => q.byRef(structureRef).subtree().withTransformer(StructureComponent));
        const deleteTags = deleteComponents.flatMap(comp => StructureComponentTags[comp] ?? []);
        const update = this.plugin.build();
        for (const comp of comps) {
            const tags = comp.obj?.tags ?? [];
            const remove = tags.some(tag => deleteTags.includes(tag));
            if (remove) {
                update.delete(comp);
            }
        }
        if (update.editInfo.count > 0) {
            await update.commit();
        }
    }

    /** Get loci corresponding to a selection within a structure.
     * If `params` contains more items, return loci for the union of the selections.
     * If `structureNumber` is provided, use the specified structure (numbered from 1!); otherwise use the last added structure. */
    getLociForParams(params: QueryParam[], structureNumberOrId?: number | string): StructureElement.Loci | EmptyLoci {
        const struct = (structureNumberOrId !== undefined) ?
            this.getStructure(structureNumberOrId)?.cell.obj?.data
            : this.assemblyRef ?
                (this.plugin.state.data.select(this.assemblyRef)[0]?.obj as PluginStateObject.Molecule.Structure | undefined)?.data
                : undefined;
        if (!struct) return EmptyLoci;
        return QueryHelper.getInteractivityLoci(params, struct);
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

    normalizeColor(colorVal: AnyColor | null | undefined, defaultColor: Color = Color.fromRgb(170, 170, 170)): Color {
        return normalizeColor(colorVal, defaultColor);
    }

    /** Get structure ref for a structure with given `structureNumberOrId`.
     * `structureNumberOrId` is either index (numbered from 1!) or the ID that was provided when loading the structure.
     * If `structureNumberOrId` is undefined, return refs for all loaded structures. */
    private getStructures(structureNumberOrId: number | string | undefined): { structureRef: StructureRef, number: number }[] {
        const allStructures = this.plugin.managers.structure.hierarchy.current.structures.map((structureRef, i) => ({ structureRef, number: i + 1 }));
        if (typeof structureNumberOrId === 'number') {
            const theStructure = allStructures[structureNumberOrId - 1];
            return theStructure ? [theStructure] : [];
        } else if (typeof structureNumberOrId === 'string') {
            const structRef = this.structureRefMap.get(structureNumberOrId);
            if (structRef === undefined) {
                return [];
            }
            const found = allStructures.find(s => s.structureRef.cell.transform.ref === structRef);
            if (found) {
                return [found];
            } else {
                this.structureRefMap.delete(structureNumberOrId); // remove outdated record
                return [];
            }
        } else {
            return allStructures;
        }
    }
    /** Get StructureRef for a structure with given `structureNumberOrId`.
     * `structureNumberOrId` is either index (numbered from 1!) or the ID that was provided when loading the structure. */
    getStructure(structureNumberOrId: number | string): StructureRef | undefined {
        return this.getStructures(structureNumberOrId)[0]?.structureRef;
    }

    /** Helper methods related to canvas and layout */
    canvas = {
        /** Set canvas background color. */
        setBgColor: async (color?: AnyColor) => {
            if (color === undefined || color === null) return;
            await this.canvas.applySettings({ color });
        },

        /** Set controls panel visibility. Without `isVisible` parameter, toggle controls panel visibility. */
        toggleControls: (isVisible?: boolean) => {
            if (typeof isVisible === 'undefined') isVisible = !this.plugin.layout.state.showControls;
            PluginCommands.Layout.Update(this.plugin, { state: { showControls: isVisible } });
        },

        /** Set full-screen mode on or off. Without `isExpanded` parameter, toggle full-screen mode. */
        toggleExpanded: (isExpanded?: boolean) => {
            if (typeof isExpanded === 'undefined') isExpanded = !this.plugin.layout.state.isExpanded;
            PluginCommands.Layout.Update(this.plugin, { state: { isExpanded: isExpanded } });
        },

        applySettings: async (settings?: { color?: AnyColor, lighting?: string }) => {
            if (!settings) return;
            if (!this.plugin.canvas3d) return;
            const renderer = { ...this.plugin.canvas3d.props.renderer };
            if (settings.color) {
                renderer.backgroundColor = normalizeColor(settings.color);
            }
            if (settings.lighting) {
                (renderer as any).style = { name: settings.lighting }; // I don't think this does anything and I don't see how it could ever have worked
            }
            await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer } });
        },

    };

    /** Helper methods related to 3D visuals */
    visual = {
        /** Change the visibility of individual entity visuals */
        visibility: async (data: { polymer?: boolean, het?: boolean, water?: boolean, carbs?: boolean, nonStandard?: boolean, maps?: boolean }) => {
            if (!data) return;

            for (const visual in data) {
                const requiredVisibility = data[visual as keyof typeof data];
                if (requiredVisibility === undefined) continue;
                const tags = StructureComponentTags[visual as keyof typeof StructureComponentTags] ?? [];
                for (const tag of tags) {
                    const componentRef = StateSelection.findTagInSubtree(this.plugin.state.data.tree, StateTransform.RootRef, tag);
                    if (componentRef) {
                        const compVisual = this.plugin.state.data.select(componentRef)[0];
                        if (compVisual && compVisual.obj) {
                            const currentlyVisible = !(compVisual.state && compVisual.state.isHidden);
                            if (currentlyVisible !== requiredVisibility) {
                                await PluginCommands.State.ToggleVisibility(this.plugin, { state: this.state, ref: componentRef });
                            }
                        }
                    }
                }
            }
        },

        /** Change the visibility of a structure.
         * `structureNumberOrId` is either index (numbered from 1!) or the ID that was provided when loading the structure.
         * If `visibility` is undefined, toggle current visibility state. */
        structureVisibility: async (structureNumberOrId: string | number, visibility?: boolean) => {
            const struct = this.getStructure(structureNumberOrId);
            if (!struct) {
                console.error(`Cannot change visibility of structure ${structureNumberOrId}: structure not found.`);
                return;
            }
            const currentVisibility = !struct.cell.state.isHidden;
            if (visibility !== currentVisibility) {
                await PluginCommands.State.ToggleVisibility(this.plugin, { state: this.state, ref: struct.cell.transform.ref });
            }
        },

        /** With `isSpinning` parameter, switch visual rotation on or off. Without `isSpinning` parameter, toggle rotation. If `resetCamera`, also reset the camera zoom. */
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

        /** Focus (zoom) on the part of the structure defined by `selection`.
         * If `selection` contains more items, focus on the union of those.
         * `structureNumberOrId` is either index (numbered from 1!) or the ID that was provided when loading the structure;
         * if not provided, will use the last added structure. */
        focus: async (selection: QueryParam[], structureNumberOrId?: number | string) => {
            const loci = this.getLociForParams(selection, structureNumberOrId);
            this.plugin.managers.camera.focusLoci(loci);
        },

        /** Apply interactive focus behavior on the part of the structure defined by `data` (i.e. emulate user clicking on a substructure).
         * This includes behaviors like "show non-covalent interactions" or "show streamed volume data"
         * but not camera adjustment (call `.visual.focus` for that).
         * If `data` contains more items, focus on the union of those.
         * If `structureId` or `structureNumber` is provided, use the specified structure (numbered from 1!);
         * otherwise use the last added structure. */
        interactivityFocus: async (params: { data: QueryParam[], structureId?: string, structureNumber?: number }) => {
            const structureNumberOrId = params.structureId ?? params.structureNumber;
            const loci = this.getLociForParams(params.data, structureNumberOrId);
            this.plugin.managers.structure.focus.setFromLoci(loci);
        },

        /** Trigger highlight on the part of the structure defined by `data`
         * (this will look the same as when the user hovers over a part of the structure).
         * If `focus`, also zoom on the highlighted part.
         * If `structureId` or `structureNumber` is provided, use the specified structure (numbered from 1!); otherwise use the last added structure. */
        highlight: async (params: { data: QueryParam[], color?: AnyColor, focus?: boolean, structureId?: string, structureNumber?: number }) => {
            const loci = this.getLociForParams(params.data, params.structureId ?? params.structureNumber);
            if (Loci.isEmpty(loci)) return;
            if (params.color) {
                await this.visual.setColor({ highlight: params.color });
            }
            this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
            if (params.focus) this.plugin.managers.camera.focusLoci(loci);
        },

        /** Remove any current highlight and reset the highlight color to its default value. */
        clearHighlight: async () => {
            this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci: EmptyLoci });
            if (this.isHighlightColorUpdated) {
                await this.visual.reset({ highlightColor: true });
            }
        },

        /** Color the parts of the structure defined by `data`. Color the rest of the structure in `nonSelectedColor` if provided.
         * If any items in `data` contain `focus`, zoom to the union of these items.
         * If any items in `data` contain `sideChain` or `representation`, add extra representations to them (colored in `representationColor` if provided).
         * If `structureNumber` is provided, apply to the specified structure (numbered from 1!); otherwise apply to all loaded structures.
         * Remove any previously added coloring and extra representations, unless `keepColors` and/or `keepRepresentations` is set. */
        select: async (params: { data: QueryParam[], nonSelectedColor?: AnyColor, structureId?: string, structureNumber?: number, keepColors?: boolean, keepRepresentations?: boolean }) => {
            const structureNumberOrId = params.structureId ?? params.structureNumber;
            await this.visual.clearSelection(structureNumberOrId, { keepColors: params.keepColors, keepRepresentations: params.keepRepresentations });

            // Structure list to apply selection
            const structures = this.getStructures(structureNumberOrId);

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
                const selections = this.getSelections(params.data, struct.number);
                for (const selection of selections) {
                    if (selection.param.focus) {
                        focusLoci.push(selection.loci);
                    }
                }

                // Apply color to the main representation (color:undefined (or omitted) means apply default color, color:null means do not apply color)
                const overpaintLayers: Overpaint.BundleLayer[] = selections
                    .filter(s => s.param.color !== null)
                    .map(s => ({
                        bundle: s.bundle,
                        color: s.param.color ? normalizeColor(s.param.color) : DefaultSelectColor,
                        clear: false,
                    }));
                if (params.nonSelectedColor) {
                    const wholeStructBundle = this.getBundle([{}], struct.number);
                    if (wholeStructBundle) {
                        overpaintLayers.unshift({
                            bundle: wholeStructBundle,
                            color: normalizeColor(params.nonSelectedColor),
                            clear: false,
                        });
                    }
                }
                await applyOverpaint(this.plugin, struct.structureRef, overpaintLayers);

                // Add extra representations
                for (const repr in addedReprParams) {
                    const bundle = this.getBundle(addedReprParams[repr], struct.number);
                    if (!bundle) continue;
                    const overpaintLayers: Overpaint.BundleLayer[] = selections.filter(s => s.param.representationColor).map(s => ({
                        bundle: s.bundle,
                        color: normalizeColor(s.param.representationColor!),
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
                    // Track that reprs have been added (for later clearSelection)
                    this.addedReprs[struct.number] = true;
                }
            }

            // Apply focus
            if (focusLoci.length > 0) {
                this.plugin.managers.camera.focusLoci(focusLoci);
            }
        },

        /** Remove any coloring and extra representations previously added by the `select` method.
         * `structureNumberOrId` is either index (numbered from 1!) or the ID that was provided when loading the structure;
         * if not provided, will apply to all loaded structures.
         * If `keepColors`, current residue coloring is preserved. If `keepRepresentations`, current added representations are preserved. */
        clearSelection: async (structureNumberOrId?: number | string, options?: { keepColors?: boolean, keepRepresentations?: boolean }) => {
            // Structure list to apply to
            const structures = this.getStructures(structureNumberOrId);
            for (const struct of structures) {
                // Remove overpaint
                if (!options?.keepColors) {
                    const componentsToClear = struct.structureRef.components.filter(c => !c.cell.transform.tags?.includes(Tags.AddedComponent));
                    await clearStructureOverpaint(this.plugin, componentsToClear);
                }
                // Remove added reprs
                if (!options?.keepRepresentations) {
                    if (this.addedReprs[struct.number]) {
                        const componentsToDelete = struct.structureRef.components.filter(comp => comp.cell.transform.tags?.includes(Tags.AddedComponent));
                        const update = this.plugin.build();
                        for (const comp of componentsToDelete) {
                            update.delete(comp.cell.transform.ref);
                        }
                        await update.commit();
                        delete this.addedReprs[struct.number];
                    }
                }
            }
        },

        /** Add interactive tooltips to parts of the structure. The added tooltips will be shown on a separate line in the tooltip box.
         * Repeated call to this function removes any previously added tooltips.
         * `structureNumber` counts from 1; if not provided, tooltips will be applied to all loaded structures.
         * Example: `await this.visual.tooltips({ data: [{ struct_asym_id: 'A', tooltip: 'Chain A' }, { struct_asym_id: 'B', tooltip: 'Chain B' }] });`. */
        tooltips: async (params: { data: QueryParam[], structureId?: string, structureNumber?: number }) => {
            // Structure list to apply tooltips
            const structures = this.getStructures(params.structureId ?? params.structureNumber);

            for (const struct of structures) {
                const selections = this.getSelections(params.data, struct.number);
                const customTooltipProps: CustomTooltipsProps = {
                    tooltips: selections.map(s => ({ text: s.param.tooltip ?? '', selector: { name: 'bundle', params: s.bundle } })),
                };

                const structRef = struct.structureRef.cell.transform.ref;
                let customPropsCells = this.plugin.state.data.select(StateSelection.Generators.ofTransformer(CustomStructureProperties, structRef));
                if (customPropsCells.length === 0) {
                    await this.plugin.build().to(structRef).apply(CustomStructureProperties).commit();
                    customPropsCells = this.plugin.state.data.select(StateSelection.Generators.ofTransformer(CustomStructureProperties, structRef));
                }

                await this.plugin.build().to(customPropsCells[0]).update(old => ({
                    properties: {
                        ...old.properties,
                        [CustomTooltipsProvider.descriptor.name]: customTooltipProps,
                    },
                    autoAttach: old.autoAttach.includes(CustomTooltipsProvider.descriptor.name) ?
                        old.autoAttach
                        : [...old.autoAttach, CustomTooltipsProvider.descriptor.name],
                })).commit();
            }
        },

        /** Remove any custom tooltips added by the `tooltips` method. */
        clearTooltips: async (structureNumberOrId?: number | string) => {
            await this.visual.tooltips({ data: [], structureId: structureNumberOrId as any });
        },

        /** Set highlight and/or selection color.
         * Highlight color is used when the user hovers over a part of the structure or when applying the `highlight` method.
         * Selection color is used when creating selections with Selection Mode (the mouse cursor icon) and is not related to the color used by the `select` method. */
        setColor: async (params: { highlight?: AnyColor, select?: AnyColor }) => {
            if (!this.plugin.canvas3d) return;
            if (!params.highlight && !params.select) return;
            const renderer = { ...this.plugin.canvas3d.props.renderer };
            const marking = { ...this.plugin.canvas3d.props.marking };
            if (params.highlight) {
                renderer.highlightColor = normalizeColor(params.highlight);
                marking.highlightEdgeColor = Color.darken(normalizeColor(params.highlight), 1);
                this.isHighlightColorUpdated = true;
            }
            if (params.select) {
                renderer.selectColor = normalizeColor(params.select);
                marking.selectEdgeColor = Color.darken(normalizeColor(params.select), 1);
                this.isSelectedColorUpdated = true;
            }
            await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { renderer, marking } });
        },

        /** Reset various settings to defaults:
         * `camera` resets camera position (i.e. zooms on the whole scene).
         * `theme` resets color theme for visual representations.
         * `highlightColor` and `selectColor` reset colors previously set by the `setColor` method. */
        reset: async (params: { camera?: boolean, theme?: boolean, highlightColor?: boolean, selectColor?: boolean }) => {
            if (params.camera) await PluginCommands.Camera.Reset(this.plugin, { durationMs: 250 });

            if (params.theme) {
                const defaultTheme = { color: this.defaultColorTheme() as any };
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

        /** Change parameters of the plugin instance.
         * Can be used to load a different structure.
         * If `fullLoad`, remove currently loaded structure before loading the new one;
         * otherwise add the new structure to existing structures. */
        update: async (options: Partial<InitParams>, fullLoad?: boolean) => {
            console.debug('Updating PDBeMolstarPlugin instance with options:', options);
            // Validate options
            if (!options) {
                console.error('Missing `options` argument to `PDBeMolstarPlugin.visual.update');
                return false;
            }
            const validationIssues = validateInitParams(options);
            if (validationIssues) {
                console.error('Invalid PDBeMolstarPlugin options:', options);
                return false;
            }

            this.initParams = addDefaults(options, DefaultParams);

            if (!this.initParams.moleculeId && !this.initParams.customData) return false;
            if (this.initParams.customData && this.initParams.customData.url && !this.initParams.customData.format) return false;
            PluginCustomState(this.plugin).initParams = this.initParams;

            // Show/hide buttons in the viewport control panel
            this.plugin.config.set(PluginConfig.Viewport.ShowExpand, !this.initParams.hideCanvasControls.includes('expand'));
            this.plugin.config.set(PluginConfig.Viewport.ShowControls, !this.initParams.hideCanvasControls.includes('controlToggle'));
            this.plugin.config.set(PluginConfig.Viewport.ShowSettings, !this.initParams.hideCanvasControls.includes('controlInfo'));
            this.plugin.config.set(PluginConfig.Viewport.ShowSelectionMode, !this.initParams.hideCanvasControls.includes('selection'));
            this.plugin.config.set(PluginConfig.Viewport.ShowAnimation, !this.initParams.hideCanvasControls.includes('animation'));
            this.plugin.config.set(PluginConfig.Viewport.ShowTrajectoryControls, !this.initParams.hideCanvasControls.includes('trajectory'));

            // Set background colour
            if (this.initParams.bgColor || this.initParams.lighting) {
                await this.canvas.applySettings({ color: this.initParams.bgColor, lighting: this.initParams.lighting });
            }

            // Load Molecule CIF or coordQuery and Parse
            const dataSource = this.getMoleculeSrcUrl();
            if (dataSource) {
                await this.load(
                    { url: dataSource.url, format: dataSource.format as BuiltInTrajectoryFormat, assemblyId: this.initParams.assemblyId, isBinary: dataSource.isBinary },
                    fullLoad,
                );
            }
            return true;
        },
    };

    async clear() {
        await this.plugin.clear();
        this.assemblyRef = '';
        this.addedReprs = {};
        this.isHighlightColorUpdated = false;
        this.isSelectedColorUpdated = false;
    }

    /** Helper functions related to specific views or use cases */
    static extensions = {
        Foldseek: Foldseek,
        StateGallery: StateGalleryExtensionFunctions,
    };

    /** Components for building custom UI layouts */
    static UIComponents = UIComponents;
}
