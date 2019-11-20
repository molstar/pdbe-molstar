
import * as React from 'react';
import { PluginUIComponent } from 'Molstar/mol-plugin/ui/base';
import { StateTransform } from 'Molstar/mol-state';
import { TransformUpdaterControl } from 'Molstar/mol-plugin/ui/state/update-transform';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { StateElements } from '../helpers';

export class VisualsControl extends PluginUIComponent<{ }, {hetSurroundingVisual: boolean, carbsVisual: boolean, carbs3dVisual: boolean, polymerVisual: boolean, hetVisual: boolean, waterVisual: boolean, polymerOptions: boolean, hetOptions: boolean, hetSurroundingOptions: boolean, waterOptions: boolean, carbs3dOptions: boolean, carbsOptions: boolean  }> {
    
    get current() {
        return this.plugin.state.behavior.currentObject.value;
    }

    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, o => {
            this.forceUpdate();
        });
    }

    state: any = { hetSurroundingVisual: true, polymerVisual: true, hetVisual: true, waterVisual: true, carbsVisual: true, carbs3dVisual: true, polymerOptions: false, hetOptions: false, hetSurroundingOptions: false, waterOptions: false, carbs3dOptions: false, carbsOptions: false };

    async toggleVisual(visualType: string){
        const isVisible = this.state[visualType];
        let newVal:any = {};
        newVal[visualType] = !isVisible;
        this.setState(newVal);

        const refMappings: any = {
            polymerVisual: StateElements.SequenceVisual,
            hetVisual: StateElements.HetVisual,
            hetSurroundingVisual: StateElements.HetSurroundingVisual,
            waterVisual: StateElements.WaterVisual,
            carbs3dVisual: StateElements.Carbs3DVisual,
            carbsVisual: StateElements.CarbsVisual
        }

        PluginCommands.State.ToggleVisibility.dispatch(this.plugin, { state: this.current.state, ref: refMappings[visualType] });
    }

    toggleOptions(optionType: string){
        const optionFlag = !this.state[optionType];
        let newVal:any = {};
        newVal[optionType] = optionFlag;
        this.setState(newVal);
    }

    getVisualControls(visualType: string, visualOptions: string){

        const headers: any = {
            polymerVisual: {name: 'Polymer'},
            hetVisual: {name: 'Het Groups'},
            hetSurroundingVisual: {name: 'Neighbouring residues'},
            ligand: {name: 'Het Group'},
            ligandSur: {name: 'Neighbouring residues'},
            waterVisual: {name: 'Water'},
            carbs3dVisual: {name: 'Carbohydrates - 3D Visual'},
            carbsVisual: {name: 'Carbohydrates'}
        }

        const refMappings: any = {
            polymerVisual: StateElements.SequenceVisual,
            hetVisual: StateElements.HetVisual,
            hetSurroundingVisual: StateElements.HetSurroundingVisual,
            waterVisual: StateElements.WaterVisual,
            carbs3dVisual: StateElements.Carbs3DVisual,
            carbsVisual: StateElements.CarbsVisual
        }

        return <>
            
                <div className="msp-control-row" style={{marginBottom: this.state[visualType] ? '0px' : '10px'}}>
                    <span style={{fontWeight: 'bold'}}>{headers[visualType].name}</span>
                    <div>
                        <button onClick={(e) => this.toggleVisual(visualType)}><span className={`msp-icon msp-icon-${this.state[visualType] ? 'off' : 'ok'}`}></span>{this.state[visualType] ? 'Hide' : 'Show'}</button>
                    </div>
                </div>
                
                {this.state[visualType] && <div className="msp-control-group-wrapper remove-header" style={{marginBottom: '10px'}}>
                    <div className="msp-control-group-header">
                        <button onClick={(e) => this.toggleOptions(visualOptions)} className="msp-btn msp-btn-block">
                            <span className={`msp-icon msp-icon-${this.state[visualOptions] ? 'collapse' : 'expand'}`}></span>{headers[visualType].name} Properties
                        </button>
                    </div>
                    {/* <div className="msp-control-offset" style={{display: this.state[visualOptions] ? 'block' : 'none'}}> */}
                        {this.state[visualOptions] && <TransformUpdaterControl nodeRef={refMappings[visualType]} header={headers[visualType]} />}
                    {/* </div> */}
                </div>}
        </>

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
        
        // const gbCtx:any = current.state.globalContext as any;
        // if(!gbCtx.customState.initParams.loadMaps) return null;

        let controls = { polymer: false, hets: false, hetsurrounding: false, water: false, carbs3d: false, carbs: false }
        const assmeblyCreated = current.state.cells.get('assembly')!;

        if(assmeblyCreated){
            const seqVis = current.state.cells.get(StateElements.SequenceVisual);
            const hetVis = current.state.cells.get(StateElements.HetVisual);
            const hetSurroundingVis = current.state.cells.get(StateElements.HetSurroundingVisual);
            const waterVis = current.state.cells.get(StateElements.WaterVisual);
            const carb3DVis = current.state.cells.get(StateElements.Carbs3DVisual);
            const carbVis = current.state.cells.get(StateElements.CarbsVisual);
        
            if(seqVis && seqVis.status == "ok") controls.polymer = true;
            if(hetVis && hetVis.status == "ok") controls.hets = true;
            if(hetSurroundingVis && hetSurroundingVis.status == "ok") controls.hetsurrounding = true;
            if(waterVis && waterVis.status == "ok") controls.water = true;
            if(carb3DVis && carb3DVis.status == "ok") controls.carbs3d = true;
            if(carbVis && carbVis.status == "ok") controls.carbs = true;
        }
       
        return <>
            {(controls.polymer || controls.hets || controls.hetsurrounding || controls.water || controls.carbs3d || controls.carbs) &&
                <div className='msp-transform-wrapper'>
                    <div className="msp-transform-header">
                        <button className="msp-btn msp-btn-block">Visual settings</button>
                    </div>
                    {controls.polymer && this.getVisualControls('polymerVisual', 'polymerOptions')}
                    {controls.hets && this.getVisualControls('hetVisual', 'hetOptions')}
                    {controls.hetsurrounding && this.getVisualControls('hetSurroundingVisual', 'hetSurroundingOptions')}
                    {controls.carbs3d && this.getVisualControls('carbs3dVisual', 'carbs3dOptions')}
                    {controls.carbs && this.getVisualControls('carbsVisual', 'carbs3dOptions')}
                    {controls.water && this.getVisualControls('waterVisual', 'waterOptions')}
                </div>
            }
        </>
    }
}