import { PluginSpec } from 'Molstar/mol-plugin/spec';
import { createPlugin, DefaultPluginSpec, InitParams, DefaultParams } from './spec';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { StateTransforms } from 'Molstar/mol-plugin/state/transforms';
import { Color } from 'Molstar/mol-util/color';
import { PluginStateObject as PSO, PluginStateObject } from 'Molstar/mol-plugin/state/objects';
import { StateBuilder, StateObject } from 'Molstar/mol-state';
import { createCustomTheme } from './custom-theme';
import { LoadParams, SupportedFormats, ModelInfo, StateElements, QueryHelper, InteractivityHelper, DownloadPost } from './helpers';
import { RxEventHelper } from 'Molstar/mol-util/rx-event-helper';
import { ViewportWrapper, ControlsWrapper } from './ui/controls';
import { PluginState } from 'Molstar/mol-plugin/state';
import { Scheduler } from 'Molstar/mol-task';
import { createStructureComplex } from './complex';
import { toggleMap } from './maps';
import { EmptyLoci, Loci } from 'Molstar/mol-model/loci';
import { StructureRepresentationInteraction } from 'Molstar/mol-plugin/behavior/dynamic/selection/structure-representation-interaction';
import { SelectLoci } from 'Molstar/mol-plugin/behavior/dynamic/representation';
import { Binding } from 'Molstar/mol-util/binding';
import { ButtonsType, ModifiersKeys } from 'Molstar/mol-util/input/input-observer';
import { createNewEvent } from './custom-events'
import { createLigandStructure } from './ligand'
import { FocusLoci } from 'molstar/lib/mol-plugin/behavior/dynamic/camera';
require('Molstar/mol-plugin/skin/dark.scss');
// require('Molstar/mol-plugin/skin/light.scss');

class PDBeMolstarPlugin {
    static VERSION_MAJOR = 1;
    static VERSION_MINOR = 1;

    private _ev = RxEventHelper.create();

    readonly events = {
        loadComplete: this._ev<boolean>(),
        modelInfo: this._ev<ModelInfo>()
    };

    plugin: PluginContext;
    initParams: InitParams;
    selectedLoci: undefined | {loci: Loci, sideChain?: boolean};
    selectedLociProvider: any;
    targetElement: HTMLElement;
    pdbevents:any;

    render(target: string | HTMLElement, options: InitParams) {

        if(!options) return;

        this.initParams = {...DefaultParams }

        for(let param in DefaultParams){
            if(typeof options[param] !== 'undefined') this.initParams[param] = options[param];
        }

        if(!this.initParams.moleculeId && !this.initParams.customData) return false;
        if(this.initParams.customData && this.initParams.customData.url && !this.initParams.customData.format) return false;

       
        const pdbePluginSpec = DefaultPluginSpec;
        if(!this.initParams.ligandView){
            pdbePluginSpec.behaviors.push(
                PluginSpec.Behavior(StructureRepresentationInteraction, {bindings: {clickInteractionAroundOnly: Binding([Binding.Trigger(ButtonsType.Flag.Primary, ModifiersKeys.create())], 'Show the volume around only the clicked element using ${trigger}.')}})
            )
        }

        // Override defualt bindings
        pdbePluginSpec.behaviors.push(
            PluginSpec.Behavior(SelectLoci, 
                {   
                    bindings: {
                        clickSelect: Binding.Empty,
                        clickSelectExtend: Binding([Binding.Trigger(ButtonsType.Flag.Primary, ModifiersKeys.create({ shift: true }))], 'Extend selection to clicked element along polymer using ${triggers}.'),
                        clickSelectOnly: Binding.Empty,
                        clickSelectToggle: Binding([Binding.Trigger(ButtonsType.Flag.Primary, ModifiersKeys.create({ alt: true }))], 'Toggle selection of clicked element using ${triggers}.'),
                        clickDeselect: Binding.Empty,
                        clickDeselectAllOnEmpty: Binding([Binding.Trigger(ButtonsType.Flag.Primary, ModifiersKeys.create({ shift: true }))], 'Deselect all when clicking on nothing using ${triggers}.')
                    }
                })
        )

        pdbePluginSpec.behaviors.push(
            PluginSpec.Behavior(FocusLoci, 
                {   
                    bindings: {
                        clickCenterFocus: Binding([Binding.Trigger(ButtonsType.Flag.Primary, ModifiersKeys.create())], 'Center and focus the clicked element using ${triggers}.')
                    }
                })
        )

        pdbePluginSpec.layout = {
            initial: {
                isExpanded: this.initParams.landscape ? false : this.initParams.expanded,
                showControls: !this.initParams.hideControls
            },
            controls: {
                top: "none",
                bottom: "none",
                left: "none",
                right: ControlsWrapper
            },
            viewport: ViewportWrapper
        }

        if(this.initParams.landscape && pdbePluginSpec.layout && pdbePluginSpec.layout.initial) pdbePluginSpec.layout.initial['controlsDisplay'] = 'landscape';

        this.targetElement = typeof target === 'string' ? document.getElementById(target)! : target;
        this.plugin = createPlugin(this.targetElement, pdbePluginSpec);

        (this.plugin.customState as any).initParams = this.initParams;

        // Set background colour
        if(this.initParams.bgColor){
            this.canvas.setBgColor(this.initParams.bgColor);
        }

        //Load Molecule CIF or coordQuery and Parse
        let urlAndFormatDetails = this.getMoleculeSrcUrl();
        if(urlAndFormatDetails){
            this.load({ url: urlAndFormatDetails.url, format: urlAndFormatDetails.format as SupportedFormats, assemblyId: this.initParams.assemblyId});
        }

        //Binding to other PDB Component events
        if(this.initParams.subscribeEvents){
        	this.subscribeToComponentEvents();
        }

        //Event handling
        this.pdbevents = createNewEvent(['PDB.molstar.click','PDB.molstar.mouseover','PDB.molstar.mouseout']);
        this.plugin.behaviors.interaction.click.subscribe((e: any) => { 
            if(e.buttons && e.buttons == 1 && e.current && e.current.loci.kind != "empty-loci"){
                const evData = InteractivityHelper.getDataFromLoci(e.current.loci);
                this.dispatchCustomEvent(this.pdbevents['PDB.molstar.click'], evData);
            }
        });
        this.plugin.behaviors.interaction.hover.subscribe((e: any) => { 
            if(e.current && e.current.loci && e.current.loci.kind != "empty-loci"){
                const evData = InteractivityHelper.getDataFromLoci(e.current.loci);
                this.dispatchCustomEvent(this.pdbevents['PDB.molstar.mouseover'], evData);
            }

            if(e.current && e.current.loci && e.current.loci.kind == "empty-loci"){
                this.dispatchCustomEvent(this.pdbevents['PDB.molstar.mouseout'], {});
            }
        });

    }

    dispatchCustomEvent(event:any, eventData:any) {
        if(typeof eventData !== 'undefined'){
            event['eventData'] = eventData;
            this.targetElement.dispatchEvent(event);
        }
    }

    get state() {
        return this.plugin.state.dataState;
    }

    private download(b: StateBuilder.To<PSO.Root>, url: string, format: SupportedFormats) {
        if(this.initParams.ligandView && this.initParams.ligandView.label_comp_id_list) { 
            const body = JSON.stringify(this.initParams.ligandView.label_comp_id_list);
            return b.apply(DownloadPost, { url, isBinary: format === 'bcif' ? true : false, body });
        }else {
            return b.apply(StateTransforms.Data.Download, { url, isBinary: format === 'bcif' ? true : false });
        }
    }

    private model(b: StateBuilder.To<PSO.Data.Binary | PSO.Data.String>, format: SupportedFormats) {
        const parsed = (format === 'cif' || format === 'bcif')
            ? b.apply(StateTransforms.Data.ParseCif).apply(StateTransforms.Model.TrajectoryFromMmCif, {}, { ref: 'molecule' })
            : b.apply(StateTransforms.Model.TrajectoryFromPDB);

        return parsed
            .apply(StateTransforms.Model.ModelFromTrajectory, { modelIndex: 0 }, { ref: StateElements.Model });
    }

    private structure(assemblyId: string, isHetView: boolean) {
        const model = this.state.build().to(StateElements.Model);

        const s = model
            .apply(StateTransforms.Model.CustomModelProperties, { properties: [] }, { ref: StateElements.ModelProps, state: { isGhost: false } })
            .apply(StateTransforms.Model.StructureAssemblyFromModel, { id: assemblyId || 'deposited' }, { ref: StateElements.Assembly });

        if(!isHetView){
            createStructureComplex(this.plugin, s);
        }

        return s;
    }

    private getObj<T extends StateObject>(ref: string): T['data'] {
        const state = this.state;
        const cell = state.select(ref)[0];
        if (!cell || !cell.obj) return void 0;
        return (cell.obj as T).data;
    }

    private async doInfo(checkPreferredAssembly: boolean) {
        const model = this.getObj<PluginStateObject.Molecule.Model>('model');
        if (!model) return;
        let checkValidationApi = false;
        let getMappings = false;
        if(this.initParams.validationAnnotation) checkValidationApi = true;
        if(this.initParams.domainAnnotation) getMappings = true;
        const info = await ModelInfo.get(this.plugin, model, checkPreferredAssembly, checkValidationApi, getMappings);
        this.events.modelInfo.next(info);
        return info;
    }

    private applyState(tree: StateBuilder) {
        return PluginCommands.State.Update.dispatch(this.plugin, { state: this.plugin.state.dataState, tree });
    }

    async ligandRepresentation(params?: {label_comp_id?: string, auth_asym_Id?: string, auth_seq_id?: string}){
        await createLigandStructure(this.plugin, this.state, params);
    }

    async load({ url, format = 'cif', assemblyId = 'deposited' }: LoadParams) {
        const state = this.plugin.state.dataState;
        const isHetView = (this.initParams.ligandView && !this.initParams.ligandView.label_comp_id_list) ? true : false;

        await PluginCommands.State.RemoveObject.dispatch(this.plugin, { state, ref: state.tree.root.ref });
        const modelTree = this.model(this.download(state.build().toRoot(), url, format), format);
        await this.applyState(modelTree);
        const info = await this.doInfo(true);
        (this.plugin.customState as any).info = info;
        const asmId = (assemblyId === 'preferred' && info && info.preferredAssemblyId) || assemblyId;
        const structureTree = this.structure(asmId, isHetView);
        await this.applyState(structureTree);
            
        if(isHetView){
            await this.ligandRepresentation();
        }else{
            Scheduler.setImmediate(() => PluginCommands.Camera.Reset.dispatch(this.plugin, { }));
            if(this.initParams.loadMaps){
                toggleMap(true, this.plugin, this.state, false);
            }
        }        

        this.events.loadComplete.next(true);

    }

    getMoleculeSrcUrl() {
        let id = this.initParams.moleculeId;

        if(!id && !(this.initParams.customData && this.initParams.customData.url && this.initParams.customData.format)) return void 0;

        let query = this.initParams.loadCartoonsOnly == true ? 'cartoon' : 'full';
        let sep = '?';
        // let serverName = 'coordinates';
        // if(this.initParams.ligandView){
        //     if(this.initParams.ligandView.label_comp_id_list) {
        //         serverName = 'model-server/v1';
        //         query = 'residueInteraction';
        //     } else {
        //         let queryParams = [];
        //         if(this.initParams.ligandView.label_comp_id) {
        //             queryParams.push('name='+this.initParams.ligandView.label_comp_id);
        //         } else if(this.initParams.ligandView.auth_seq_id) {
        //             queryParams.push('authSequenceNumber='+this.initParams.ligandView.auth_seq_id);
        //         }
        //         if(this.initParams.ligandView.auth_asym_id) queryParams.push('authAsymId='+this.initParams.ligandView.auth_asym_id);
        //         if(this.initParams.ligandView.hydrogens) queryParams.push('dataSource=hydrogens');
        //         query = 'ligandInteraction?'+queryParams.join('&')
        //         sep = '&';
        //     }
        // }        
        // let url = `${this.initParams.pdbeUrl}${serverName}/${id}/${query}${sep}encoding=bcif${this.initParams.lowPrecisionCoords ? '&lowPrecisionCoords=1' : '' }`;

        if(this.initParams.ligandView){
            if(this.initParams.ligandView.label_comp_id_list) {
                query = 'residueInteraction';
            } else {
                let queryParams = [];
                if(this.initParams.ligandView.label_comp_id) {
                    queryParams.push('label_comp_id='+this.initParams.ligandView.label_comp_id);
                } else if(this.initParams.ligandView.auth_seq_id) {
                    queryParams.push('auth_seq_id='+this.initParams.ligandView.auth_seq_id);
                }
                if(this.initParams.ligandView.auth_asym_id) queryParams.push('auth_asym_id='+this.initParams.ligandView.auth_asym_id);
                if(this.initParams.ligandView.hydrogens) queryParams.push('data_source=pdb-h');
                query = 'residueInteraction?'+queryParams.join('&')
                sep = '&';
            }
        }        
        let url = `${this.initParams.pdbeUrl}model-server/v1/${id}/${query}${sep}encoding=bcif${this.initParams.lowPrecisionCoords ? '&lowPrecisionCoords=1' : '' }`;

        url = `http://miranda.ebi.ac.uk:1337/ModelServer/v1/${id}/${query}${sep}encoding=cif${this.initParams.lowPrecisionCoords ? '&lowPrecisionCoords=1' : '' }`

        let customFormat: any;
        if(this.initParams.customData && this.initParams.customData.url && this.initParams.customData.format){
            if(!this.initParams.customData.format){
                // Bootstrap.Command.Toast.Show.dispatch(plugin.context, { key: 'format-issue', title: 'Source Format', message: 'Please specify data format!' });
                return void 0;
            }
            url = this.initParams.customData.url;
            customFormat = this.initParams.customData.format;
        }

        //Decide Format from arguments
        if(new RegExp("encoding=bcif", "i").test(url)){
            customFormat = 'bcif';
        }

        let format = 'cif';
        if (customFormat) {
            if (customFormat == 'cif' || customFormat == 'bcif' || customFormat == 'pdb' || customFormat == 'sdf') {
                format = customFormat;
            }
            else {
                // let f = LiteMol.Core.Formats.FormatInfo.fromShortcut(LiteMol.Core.Formats.Molecule.SupportedFormats.All, customFormat);
                // if (!f) {
                //     throw new Error("'" + customFormat + "' is not a supported format.");
                // }
                // format = f;
                return void 0;
            }
        }

        return {
            url: url,
            format: format
        }
    }

    snapshot = {
        get: () => {
            return this.plugin.state.getSnapshot();
        },
        set: (snapshot: PluginState.Snapshot) => {
            return this.plugin.state.setSnapshot(snapshot);
        },
        download: async (url: string) => {
            try {
                const data = await this.plugin.runTask(this.plugin.fetch({ url }));
                const snapshot = JSON.parse(data);
                await this.plugin.state.setSnapshot(snapshot);
            } catch (e) {
                console.log(e);
            }
        }

    }

    interactionEvents = {
        highlight: (interactions: {pdb_res_id: string, auth_asym_id: string, auth_ins_code_id: string, auth_seq_id: number, atoms?: string[]}[]) => {
            const data = (this.plugin.state.dataState.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure).data;
            const nodeLoci = QueryHelper.interactionsNodeLoci(interactions, data);
            this.plugin.interactivity.lociHighlights.highlightOnly({ loci: nodeLoci });
        },
        select: async (interactions: {pdb_res_id: string, auth_asym_id: string, auth_ins_code_id: string, auth_seq_id: string | number, atoms?: string[]}[]) => {
            await this.interactivity.clearSelection();
            const data = (this.plugin.state.dataState.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure).data;
            const loci = QueryHelper.interactionsNodeLoci(interactions, data);
            const buttons = 1 as ButtonsType;
            const modifiers =  ModifiersKeys.create();
            const ev = { current: {loci: loci}, buttons, modifiers }
            await this.plugin.behaviors.interaction.click.next(ev);
            this.selectedLoci = {loci, sideChain: false};
           
            ev.modifiers = ModifiersKeys.create({ shift: true });
            await this.plugin.behaviors.interaction.click.next(ev);

        }
    }

    interactivity ={
        highlight: (params: {entity_id?: string, struct_asym_id?: string, start_residue_number?: number, end_residue_number?: number, color?: any, showSideChain?: boolean}[]) => {
            const data = (this.plugin.state.dataState.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure).data;
            const loci = QueryHelper.getInteractivityLoci(params, data);
            this.plugin.interactivity.lociHighlights.highlightOnly({ loci });
        },
        clearHighlight: async() => {
            this.plugin.interactivity.lociHighlights.highlightOnly({ loci: EmptyLoci });
        },
        select: async (params: {entity_id?: string, struct_asym_id?: string, start_residue_number?: number, end_residue_number?: number, sideChain?: boolean}[]) => {
            await this.interactivity.clearHighlight();
            await this.interactivity.clearSelection();
            const data = (this.plugin.state.dataState.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure).data;
            const loci = QueryHelper.getInteractivityLoci(params, data);
            const buttons = 1 as ButtonsType;
            const modifiers =  ModifiersKeys.create();
            const ev = { current: {loci: loci}, buttons, modifiers }
            await this.plugin.behaviors.interaction.click.next(ev);
           
            if(!params[0].sideChain){
                // ev.buttons = 2;
                await this.plugin.behaviors.interaction.click.next(ev);
            }

            ev.buttons = 1
            ev.modifiers.shift = true;
            await this.plugin.behaviors.interaction.click.next(ev);

            this.selectedLoci = {loci, sideChain: params[0].sideChain};

        },
        clearSelection: async () => {
            if(this.selectedLoci){
                const buttons = 1 as ButtonsType;
                const modifiers =  ModifiersKeys.create();
                const ev = { current: {loci: this.selectedLoci.loci}, buttons, modifiers }
                ev.modifiers.shift = true;
                await this.plugin.behaviors.interaction.click.next(ev);

                if(this.selectedLoci.sideChain){
                    // ev.buttons = 2;
                    ev.modifiers.shift = false;
                    await this.plugin.behaviors.interaction.click.next(ev);
                }

                this.selectedLoci = undefined;
            }
        }
    }

    canvas = {
        toggleControls: (isVisible?:boolean) => {
            if(typeof isVisible === 'undefined') isVisible = !this.plugin.layout.state.showControls;
            PluginCommands.Layout.Update.dispatch(this.plugin, { state: { showControls: isVisible } });
        },
    
        toggleExpanded: (isExpanded?:boolean) => {
            if(typeof isExpanded === 'undefined') isExpanded = !this.plugin.layout.state.isExpanded;
            PluginCommands.Layout.Update.dispatch(this.plugin, { state: { isExpanded: isExpanded } });
        },
    
        setBgColor: (color?:{r:number, g:number, b:number}) => {
            if(!color) return;
            const renderer = this.plugin.canvas3d.props.renderer;
            PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { renderer: { ...renderer, backgroundColor: Color.fromRgb(color.r, color.g, color.b) } } });
        },

    }

    visual = {
        update: (options: InitParams) => {

            if(!options) return;
    
            for(let param in this.initParams){
                if(options[param]) this.initParams[param] = options[param];
            }
    
            if(!this.initParams.moleculeId && !this.initParams.customData) return false;
            if(this.initParams.customData && this.initParams.customData.url && !this.initParams.customData.format) return false;
           
            (this.plugin.customState as any).initParams = this.initParams;
    
            // Set background colour
            if(this.initParams.bgColor){
                this.canvas.setBgColor(this.initParams.bgColor);
            }
    
            //Load Molecule CIF or coordQuery and Parse
            let urlAndFormatDetails = this.getMoleculeSrcUrl();
            if(urlAndFormatDetails){
                this.load({ url: urlAndFormatDetails.url, format: urlAndFormatDetails.format as SupportedFormats, assemblyId: this.initParams.assemblyId});
            }
    
        },
        visibility: (data: {polymer?: boolean, het?: boolean, water?: boolean, carbs?: boolean, maps?: boolean, [key: string]: any}) => {

            if(!data) return;

            const refMap:any = {
                polymer: [StateElements.SequenceVisual],
                het: [StateElements.HetVisual],
                hetSurroundingVisual: [StateElements.HetSurroundingVisual],
                water: [StateElements.WaterVisual],
                carbs: [StateElements.Carbs3DVisual, StateElements.CarbsVisual],
                maps: ['densityRef']              
            }

            for(let visual in data){
                if(refMap[visual]){
                    if(visual == 'maps'){
                        const showMap = data.maps ? data.maps : false;
                        toggleMap(showMap, this.plugin, this.state, false);

                    }else{

                        refMap[visual].forEach((vType: string) => {
                            const visualState = this.plugin.state.dataState.select(vType)[0];
                            if(visualState && visualState.obj){
                                const currentlyVisible = visualState.obj.data.repr.state.visible;
                                if(data[visual] !== currentlyVisible){
                                    PluginCommands.State.ToggleVisibility.dispatch(this.plugin, { state: this.state, ref: vType });
                                }
                            }
                            
                        });
                    }
                }
            }

        },

        toggleSpin: (isSpinning?: boolean, resetCamera?: boolean) => {
            const trackball =  this.plugin.canvas3d.props.trackball;
            if(typeof isSpinning === 'undefined') isSpinning = !trackball.spin;
            PluginCommands.Canvas3D.SetSettings.dispatch(this.plugin, { settings: { trackball: { ...trackball, spin: isSpinning } } });
            //const spinning = trackball.spin;
            //if (!spinning && !disableReset) PluginCommands.Camera.Reset.dispatch(this.plugin, { });
            if (resetCamera) PluginCommands.Camera.Reset.dispatch(this.plugin, { });
        },

        focus: async (params: {entity_id?: string, struct_asym_id?: string, start_residue_number?: number, end_residue_number?: number}[]) => {
            
            
            if (!this.state.transforms.has(StateElements.Assembly)) return;
            // await PluginCommands.Camera.Reset.dispatch(this.plugin, { });

            const update = this.state.build();

            update.delete('focus-sel-group');

            const core = QueryHelper.getQueryObject(params);
            
            const group = update.to(StateElements.Assembly).group(StateTransforms.Misc.CreateGroup, { label: 'Focus' }, { ref: 'focus-sel-group' });
            group.apply(StateTransforms.Model.StructureSelectionFromExpression, { label: 'Core', expression: core }, { ref: 'focus-sel' })
            
            await PluginCommands.State.Update.dispatch(this.plugin, { state: this.state, tree: update });

            const focus = (this.state.select('focus-sel')[0].obj as PluginStateObject.Molecule.Structure).data;
            const sphere = focus.boundary.sphere;
            const snapshot = this.plugin.canvas3d.camera.getFocus(sphere.center, Math.max(sphere.radius, 15));
            PluginCommands.Camera.SetSnapshot.dispatch(this.plugin, { snapshot, durationMs: 250 });
           
        },

        selection: async (params: {entity_id: string, struct_asym_id: string, start_residue_number: number, end_residue_number: number, color?: any, showSideChain?: boolean}[], defaultColor?:{r:number, g:number, b:number}, focus?:boolean) => {
            
            await this.interactivity.clearHighlight();
            await this.interactivity.clearSelection();
            
            const selRef = 'show-sel-int';

            //remove previous selection theme
            if(this.selectedLociProvider){
                this.plugin.structureRepresentation.themeCtx.colorThemeRegistry.remove(selRef);
                this.plugin.lociLabels.removeProvider(this.selectedLociProvider);
                this.plugin.customModelProperties.unregister(selRef);
            }

            // await this.selection.applyCustomTheme(params);
            const customColoring = createCustomTheme(params, undefined, selRef, defaultColor);
            
            //register new selection theme
            this.plugin.structureRepresentation.themeCtx.colorThemeRegistry.add(customColoring.Descriptor.name, customColoring.colorTheme!);
            this.plugin.lociLabels.addProvider(customColoring.labelProvider);
            this.plugin.customModelProperties.register(customColoring.propertyProvider);

            this.selectedLociProvider = customColoring.labelProvider;

            //apply new selction theme
            const state = this.state;
            const tree = state.build();
            tree.to(StateElements.ModelProps).update(StateTransforms.Model.CustomModelProperties, () => ({ properties: [selRef] }))
            
            // const visuals = state.selectQ(q => q.ofTransformer(StateTransforms.Representation.StructureRepresentation3D));
            const visuals = state.select(StateElements.SequenceVisual);
            const colorTheme = { name: customColoring.Descriptor.name, params: this.plugin.structureRepresentation.themeCtx.colorThemeRegistry.get(customColoring.Descriptor.name).defaultValues };

            for (const v of visuals) {
                tree.to(v).update((old:any) => ({ ...old, colorTheme }));
            }

            await PluginCommands.State.Update.dispatch(this.plugin, { state, tree });

            if(typeof focus == 'undefined' || focus == true) this.visual.focus(params);
            
        },

        reset: async(resetCamera?:boolean, resetTheme?:boolean) => {

            if (resetCamera) await PluginCommands.Camera.Reset.dispatch(this.plugin, { durationMs: 250 });

            if(resetTheme){
                let applyParams = {
                    showTooltip: false,
                    props: "",
                    themeName: "polymer-id"
                }

                // const behaviorState = this.plugin.state.behaviorState;
                // const behaviorTree = behaviorState.build().to(PDBeStructureQualityReport.id).update(PDBeStructureQualityReport, p => ({ ...p, showTooltip: applyParams.showTooltip }));
                // await PluginCommands.State.Update.dispatch(this.plugin, { state: behaviorState, tree: behaviorTree });


                const tree = this.state.build();
                tree.to('model-props').update(StateTransforms.Model.CustomModelProperties, () => ({ properties: [applyParams.props] }))
                
                const visuals = this.state.select(StateElements.SequenceVisual)
                const colorTheme = { name: applyParams.themeName, params: this.plugin.structureRepresentation.themeCtx.colorThemeRegistry.get(applyParams.themeName).defaultValues };

                for (const v of visuals) {
                    tree.to(v).update((old: any) => ({ ...old, colorTheme }));
                }

                await PluginCommands.State.Update.dispatch(this.plugin, { state: this.state, tree });
            }

        }
            
    }

    subscribeToComponentEvents(){
        var _this = this;

        document.addEventListener('PDB.interactions.click', function(e: any){ //do something on event
            if(typeof e.detail !== 'undefined'){
                const data = e.detail.interacting_nodes ? e.detail.interacting_nodes : [e.detail.selected_node];
                _this.interactionEvents.select(data);
                
	   		}
        });

        document.addEventListener('PDB.interactions.mouseover', function(e: any){ //do something on event
            
            if(typeof e.detail !== 'undefined'){
                const data = e.detail.interacting_nodes ? e.detail.interacting_nodes : [e.detail.selected_node];
                _this.interactionEvents.highlight(data);
                
	   		}
        });

        document.addEventListener('PDB.interactions.mouseout', function(e: any){
            //Remove highlight
            _this.interactivity.clearHighlight();
        });

        document.addEventListener('PDB.topologyViewer.click', function(e: any){ //do something on event
            
            if(typeof e.eventData !== 'undefined'){
	   			
	   			//Create query object from event data					
	   			let highlightQuery = {
	   				entity_id: e.eventData.entityId,
	   				struct_asym_id: e.eventData.structAsymId,
	   				start_residue_number: e.eventData.residueNumber,
                    end_residue_number: e.eventData.residueNumber,
                    sideChain: true
                }
	   			
	   			//Call highlightAnnotation
                _this.interactivity.select([highlightQuery]);
                
	   		}
        });
        
        document.addEventListener('PDB.topologyViewer.mouseover', function(e: any){
            if(typeof e.eventData !== 'undefined'){
                //Abort if entryid do not match or viewer type is unipdb
                //if(e.eventData.entryId != scope.pdbId) return;
                
                //Create query object from event data					
                let highlightQuery = {
                    entity_id: e.eventData.entityId,
                    struct_asym_id: e.eventData.structAsymId,
                    start_residue_number: e.eventData.residueNumber,
                    end_residue_number: e.eventData.residueNumber
                }
                
                //Call highlightAnnotation
                _this.interactivity.highlight([highlightQuery]);
                
            }
        });

        document.addEventListener('PDB.topologyViewer.mouseout', function(e: any){
            //Remove highlight
            _this.interactivity.clearHighlight();
        });

        document.addEventListener('protvista-mouseover', function(e: any){
            if(typeof e.detail !== 'undefined'){

                let highlightQuery: any = undefined;

                //Create query object from event data	
                if(e.detail.start && e.detail.end){				
                    highlightQuery = {
                        start_residue_number: parseInt(e.detail.start),
                        end_residue_number: parseInt(e.detail.end)
                    }
                }

                if(e.detail.feature && e.detail.feature.entityId) highlightQuery['entity_id'] = e.detail.feature.entityId+'';
                if(e.detail.feature && e.detail.feature.bestChainId) highlightQuery['struct_asym_id'] = e.detail.feature.bestChainId;
                
                
                if(highlightQuery) _this.interactivity.highlight([highlightQuery]);
	   				
	   		}
        });
           
        document.addEventListener('protvista-mouseout', function(e: any){
            //Remove highlight
            _this.interactivity.clearHighlight();
        });

        document.addEventListener('protvista-click', function(e: any){
            if(typeof e.detail !== 'undefined'){

                let showInteraction = false;

                let highlightQuery: any = undefined;

                //Create query object from event data	
                if(e.detail.start && e.detail.end){				
                    highlightQuery = {
                        start_residue_number: parseInt(e.detail.start),
                        end_residue_number: parseInt(e.detail.end)
                    }
                }

                if(e.detail.feature && e.detail.feature.entityId) highlightQuery['entity_id'] = e.detail.feature.entityId+'';
                if(e.detail.feature && e.detail.feature.bestChainId) highlightQuery['struct_asym_id'] = e.detail.feature.bestChainId;
                
                if(e.detail.feature && e.detail.feature.accession && e.detail.feature.accession.split(' ')[0] == 'Chain' || e.detail.feature.tooltipContent == 'Ligand binding site') {
                    showInteraction = true;
                }

                if(e.detail.start == e.detail.end) showInteraction = true;

                if(highlightQuery){

                    if(showInteraction){
                        highlightQuery['sideChain'] = true;
                        _this.interactivity.select([highlightQuery]);
                    }else{
                    
                        var selColor = undefined;
                        if(e.detail.trackIndex > -1 && e.detail.feature.locations && e.detail.feature.locations[0].fragments[e.detail.trackIndex].color) selColor = e.detail.feature.locations[0].fragments[e.detail.trackIndex].color;
                        if(typeof selColor == 'undefined' && e.detail.feature.color) selColor = e.detail.feature.color;
                        if(typeof selColor == 'undefined' && e.detail.color) selColor = e.detail.color;

                        
                        if(typeof selColor == 'undefined'){ 
                            selColor = {r:65, g:96, b:91}; //CoreVis.Theme.Default.SelectionColor;
                        }else{
                            let isRgb = /rgb/g;
                            if(isRgb.test(selColor)){
                                let rgbArr = selColor.substring(4, selColor.length - 1).split(',');
                                selColor = {r:rgbArr[0], g:rgbArr[1], b:rgbArr[2]}
                            }
                        }

                        highlightQuery['color'] = selColor;
                        _this.visual.selection([highlightQuery]);
                    }
                }
	   				
	   		}
        });

        const elementTypeArrForRange = ['uniprot', 'pfam', 'cath', 'scop', 'strand', 'helice']
	   	const elementTypeArrForSingle = ['chain', 'quality', 'quality_outlier', 'binding site', 'alternate conformer']
	   	document.addEventListener('PDB.seqViewer.click', function(e: any){
            if(typeof e.eventData !== 'undefined'){
	   			//Abort if entryid and entityid do not match or viewer type is unipdb
                   //if(e.eventData.entryId != scope.pdbId) return;
                   
                if(typeof e.eventData.elementData !== 'undefined' && elementTypeArrForSingle.indexOf(e.eventData.elementData.elementType) > -1){
	   				
	   				//Create query object from event data					
	   				const highlightQuery = {
	   					entity_id: e.eventData.entityId,
	   					struct_asym_id: e.eventData.elementData.pathData.struct_asym_id,
	   					start_residue_number: e.eventData.residueNumber,
                        end_residue_number: e.eventData.residueNumber,
                        sideChain: true
	   				}
	   				
	   				//Call highlightAnnotation
                    _this.interactivity.select([highlightQuery]);
                    
	   			
	   			}else if(typeof e.eventData.elementData !== 'undefined' && elementTypeArrForRange.indexOf(e.eventData.elementData.elementType) > -1){
	   				
	   				const seqColorArray =  e.eventData.elementData.color;
	   				
	   				//Create query object from event data					
	   				const highlightQuery = {
                        entity_id: e.eventData.entityId,
                        struct_asym_id: e.eventData.elementData.pathData.struct_asym_id,
                        start_residue_number: e.eventData.elementData.pathData.start.residue_number,
                        end_residue_number: e.eventData.elementData.pathData.end.residue_number,
                        color: {r: seqColorArray[0], g: seqColorArray[1], b: seqColorArray[2]}
                    }

                    _this.visual.selection([highlightQuery]);
	   			}
	   				
	   		}
           });
           
           document.addEventListener('PDB.seqViewer.mouseover', function(e: any){
            if(typeof e.eventData !== 'undefined'){
                //Abort if entryid and entityid do not match or viewer type is unipdb
                //if(e.eventData.entryId != scope.pdbId) return;
                
                if(typeof e.eventData.elementData !== 'undefined' && elementTypeArrForSingle.indexOf(e.eventData.elementData.elementType) > -1){
                    
                    //Create query object from event data					
                    let highlightQuery = {
                        entity_id: e.eventData.entityId,
                        struct_asym_id: e.eventData.elementData.pathData.struct_asym_id,
                        start_residue_number: e.eventData.residueNumber,
                        end_residue_number: e.eventData.residueNumber
                    }
                    
                    _this.interactivity.highlight([highlightQuery]);
                    
                }else if(typeof e.eventData.elementData !== 'undefined' && elementTypeArrForRange.indexOf(e.eventData.elementData.elementType) > -1){
                    
                    //Create query object from event data					
                    let highlightQuery = {
                        entity_id: e.eventData.entityId,
                        struct_asym_id: e.eventData.elementData.pathData.struct_asym_id,
                        start_residue_number: e.eventData.elementData.pathData.start.residue_number,
                        end_residue_number: e.eventData.elementData.pathData.end.residue_number
                    }
                    
                    //Call highlightAnnotation
                    _this.interactivity.highlight([highlightQuery]);
                }
                
            }
        });
        
        document.addEventListener('PDB.seqViewer.mouseout', function(e){
            _this.interactivity.clearHighlight();
        });

    }
}

(window as any).PDBeMolstarPlugin = PDBeMolstarPlugin;