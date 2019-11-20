
import * as React from 'react';
import { PluginUIComponent } from 'Molstar/mol-plugin/ui/base';
import { StateTransform } from 'Molstar/mol-state';
import { StateTransforms } from 'Molstar/mol-plugin/state/transforms';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { StateElements } from '../helpers';
import { PDBeStructureQualityReport } from 'Molstar/mol-plugin/behavior/dynamic/custom-props';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { ParameterControls, ParamOnChange } from 'Molstar/mol-plugin/ui/controls/parameters';
import { createCustomTheme } from '../custom-theme';

export class AnnotationsControl extends PluginUIComponent<{ }, { validationApplied: boolean, domainAtnApplied: boolean, mapApplied: boolean, domainType: any, labelProvider?: any  }> {
    
    get current() {
        return this.plugin.state.behavior.currentObject.value;
    }

    get currentInstance() {
        return this;
    }

    mapApplied() { return this.state.mapApplied; }
    validatationApplied() { return this.state.validationApplied; }
    domainAtnApplied() { return this.state.domainAtnApplied; }
    domainType() { 
        if(this.state.domainType.type.name !== ''){
            return this.state.domainType;
        } else {
            const mappings = (this.plugin.customState as any).info.domainMappings;
            return {type:{name:mappings.types[0][0], params: '0_0'}};
        }
    }

    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, o => {
            this.forceUpdate();
        });
    }

    state: any = { validationApplied: false, domainAtnApplied: false, mapApplied: false, domainType: {type:{name:''}} };

    async applyValidationTheme(appyTheme: boolean){

        let applyParams = {
            showTooltip: false,
            props: "",
            themeName: "chain-id"
        }
        if(appyTheme){
            applyParams = {
                showTooltip: true,
                props: "pdbe_structure_quality_report",
                themeName: "pdbe-structure-quality-report"
            }
        }

        const behaviorState = this.plugin.state.behaviorState;
        const behaviorTree = behaviorState.build().to(PDBeStructureQualityReport.id).update(PDBeStructureQualityReport, p => ({ ...p, showTooltip: applyParams.showTooltip }));
        await PluginCommands.State.Update.dispatch(this.plugin, { state: behaviorState, tree: behaviorTree });


        const tree = this.current.state.build();
        tree.to('model-props').update(StateTransforms.Model.CustomModelProperties, () => ({ properties: [applyParams.props] }))
        
        const visuals = this.current.state.select(StateElements.SequenceVisual)
        const colorTheme = { name: applyParams.themeName, params: this.plugin.structureRepresentation.themeCtx.colorThemeRegistry.get(applyParams.themeName).defaultValues };

        for (const v of visuals) {
            tree.to(v).update((old: any) => ({ ...old, colorTheme }));
        }

        PluginCommands.State.Update.dispatch(this.plugin, { state: this.current.state, tree });

        if(applyParams.props == "" && this.state.domainAtnApplied){
            const params = this.domainType();
            this.applyDomainAtn(params);
        }

    }

    toggleValidation(){
        
        const applyValidation = !this.state.validationApplied;
        this.setState({ validationApplied: applyValidation });

        this.applyValidationTheme(applyValidation);
        

    }

    removeDomainAtn(){
        const ctx = this.current.state.globalContext as any;
        ctx.state.plugin.structureRepresentation.themeCtx.colorThemeRegistry.remove('domain-annotation');
        if(this.state.labelProvider) ctx.state.plugin.lociLabels.removeProvider(this.state.labelProvider);
        ctx.state.plugin.customModelProperties.unregister('domain-annotation');
    }

    applyDomainAtn(params: any){
        
        // const params = this.domainType();
        
        const mappingIndexs = params.type.params.split('_');
        const ctx = this.current.state.globalContext as any;
        const mappings = ctx.customState.info.domainMappings.mappings[mappingIndexs[0]][mappingIndexs[1]];

        let domainLabel = params.type.name as string;
        domainLabel += ': '+ctx.customState.info.domainMappings.mappingsSelect[mappingIndexs[0]][mappingIndexs[1]][1];
    
        const customColoring = createCustomTheme(mappings, domainLabel, 'domain-annotation');

        //remove previous selection theme
        this.removeDomainAtn();
        
        //register new selection theme
        ctx.state.plugin.structureRepresentation.themeCtx.colorThemeRegistry.add('domain-annotation', customColoring.colorTheme!);
        ctx.state.plugin.lociLabels.addProvider(customColoring.labelProvider);
        ctx.state.plugin.customModelProperties.register(customColoring.propertyProvider);

        //save the label provider in state to remove it
        this.setState({ labelProvider: customColoring.labelProvider });

        //apply new selction theme
        const newPropName = customColoring.Descriptor.name;
        const tree = this.current.state.build();
        tree.to(StateElements.ModelProps).update(StateTransforms.Model.CustomModelProperties, () => ({ properties: [newPropName] }))
        
        //const visuals = this.current.state.selectQ(q => q.ofTransformer(StateTransforms.Representation.StructureRepresentation3D));
        const visuals = this.current.state.select(StateElements.SequenceVisual);
        const colorTheme = { name: customColoring.Descriptor.name, params: ctx.state.plugin.structureRepresentation.themeCtx.colorThemeRegistry.get(customColoring.Descriptor.name).defaultValues };

        for (const v of visuals) {
            tree.to(v).update((old:any) => ({ ...old, colorTheme }));
        }

        PluginCommands.State.Update.dispatch(ctx.state.plugin, { state: this.current.state, tree });
       
    }

    toggleDomainAtn(){
        const applyDomainAtn = !this.state.domainAtnApplied;
        this.setState({ domainAtnApplied: applyDomainAtn });
        if(applyDomainAtn){
            const params = this.domainType();
            this.applyDomainAtn(params);
        }else{
            this.removeDomainAtn();
            //update style
            if(this.state.validationApplied){
                this.applyValidationTheme(true);
            }else{
                this.applyValidationTheme(false);
            }
        }

    }

    changeDomainsOption: ParamOnChange = ({ value }) => {
        this.setState({ domainType: {type:value} });
        const params = {type:value};
        this.applyDomainAtn(params);
    };

    domainLayout(){

        const mappings = (this.plugin.customState as any).info.domainMappings;

        let subOptions:any = {};
        mappings.types.forEach((type:string, typeIndex:number) => {
            subOptions[type[0]] = PD.Select( mappings.mappingsSelect[typeIndex][0][0], mappings.mappingsSelect[typeIndex], {label: 'Name'});
        });

        let parmaObj = {
            type: PD.MappedStatic(mappings.types[0][0], subOptions, { options: mappings.types })
        };

        return <>
            <ParameterControls onChange={this.changeDomainsOption} params={parmaObj} values={this.domainType()} />
        </>
    }

    toggleMap(){
        const applyMap = !this.state.mapApplied;
        this.setState({ mapApplied: applyMap });
    }

    render() {

        const current = this.current;
        const ref = current.ref;
        
        let showActions = true;
        if (ref === StateTransform.RootRef) {
            const children = current.state.tree.children.get(ref);
            showActions = children.size !== 0;
        }

        if (!showActions) return null;
        
        let showValidationControls = false;
        let showDomainsControls = false;
        const gbCtx:any = current.state.globalContext as any;
        if(gbCtx.customState && gbCtx.customState.info && gbCtx.customState.info.validationApi) showValidationControls = true;
        if(gbCtx.customState && gbCtx.customState.info && gbCtx.customState.info.domainMappings) showDomainsControls = true;
        
        const assmeblyCreated = current.state.cells.get('assembly')!;
       
        return <>
            {assmeblyCreated && (showValidationControls || showDomainsControls) &&
            <div className='msp-transform-wrapper'>
                <div className="msp-transform-header">
                    <button className="msp-btn msp-btn-block">Annotations</button>
                </div>
                
                {showValidationControls && <div className="msp-control-row">
                    <span>Validation report</span>
                    <div>
                        <button onClick={(e) => this.toggleValidation()}><span className={`msp-icon msp-icon-${this.validatationApplied() ? 'off' : 'ok'}`}></span>{this.validatationApplied() ? 'Hide' : 'Show'}</button>
                    </div>
                </div>}
                
                {showDomainsControls && <div className="msp-control-row">
                    <span>Domains</span>
                    <div>
                        <button onClick={(e) => this.toggleDomainAtn()}><span className={`msp-icon msp-icon-${this.domainAtnApplied() ? 'off' : 'ok'}`}></span>{this.domainAtnApplied() ? 'Hide' : 'Show'}</button>
                    </div>
                </div>}
                {showDomainsControls && this.domainAtnApplied() && this.domainLayout()}
                
            </div>}
        </>
    }
}