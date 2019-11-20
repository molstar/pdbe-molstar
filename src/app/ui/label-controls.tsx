
import * as React from 'react';
import { PluginUIComponent } from 'Molstar/mol-plugin/ui/base';
import { StateTransform } from 'Molstar/mol-state';
import { StateTransforms } from 'Molstar/mol-plugin/state/transforms';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { StateElements } from '../helpers';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { ParameterControls, ParamOnChange } from 'Molstar/mol-plugin/ui/controls/parameters';
import { Text } from 'Molstar/mol-geo/geometry/text/text';
import { ColorNames } from 'Molstar/mol-util/color/names';

export class LabelControl extends PluginUIComponent<{ }, { labelApplied: boolean, labelValue: any  }> {
    
    get current() {
        return this.plugin.state.behavior.currentObject.value;
    }

    labelApplied() { return this.state.labelApplied; }
    labelValue() { return this.state.labelValue }
    

    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, o => {
            this.forceUpdate();
        });
    }

    state: any = { 
        labelApplied: false, 
        labelValue: {
            visual:"assembly", 
            target:{name:'residues'}, 
            options: {
                alpha: 1,
                attachment: "middle-center",
                background: true,
                backgroundColor: 16775930,
                backgroundMargin: 0.2,
                backgroundOpacity: 0.9,
                borderColor: 8421504,
                borderWidth: 0,
                fontFamily: "sans-serif",
                fontQuality: 3,
                fontStyle: "normal",
                fontVariant: "normal",
                fontWeight: "normal",
                highlightColor: 16737945,
                offsetX: 0,
                offsetY: 0,
                offsetZ: 0,
                quality: "auto",
                selectColor: 3407641,
                sizeFactor: 1,
                tether: false,
                tetherBaseWidth: 0.3,
                tetherLength: 1,
                useFog: true
            }
        } 
    };

    applyLabels(params: any, applyLabel: boolean){
        const ctx = this.current.state.globalContext as any;
        const tree = this.current.state.build();
        tree.delete('label-visual');
        if(applyLabel){
            tree.to(params.visual || StateElements.Assembly).apply(StateTransforms.Representation.StructureLabels3D, {
                target: params.target,
                options: params.options
            }, {ref: 'label-visual'});
        }
        PluginCommands.State.Update.dispatch(ctx.state.plugin, { state: this.current.state, tree });
    }

    async toggleLabels(){
        const applyLabel = !this.state.labelApplied;
        await this.setState({ labelApplied: applyLabel });

        this.applyLabels(this.state.labelValue, applyLabel);
    }

    getControlParams(){
        let visualOptions: [string, string][] = [[StateElements.Assembly, 'All visuals']];
        const current = this.current;
        if(current.state.cells.get(StateElements.Sequence)) visualOptions.push([StateElements.Sequence, 'Polymer']);
        if(current.state.cells.get(StateElements.Het)) visualOptions.push([StateElements.Het, 'Het Groups']);
        if(current.state.cells.get(StateElements.Water)) visualOptions.push([StateElements.Water, 'Water']);

        let parmaObj = {
            visual: PD.Select(visualOptions[0][0], visualOptions, { label: 'Visual' }),
            target: PD.MappedStatic('residues', {
                'elements': PD.Group({ }),
                'residues': PD.Group({ }),
                'static-text': PD.Group({
                    value: PD.Text(''),
                    size: PD.Optional(PD.Numeric(1, { min: 1, max: 1000, step: 0.1 })),
                    // TODO: this changes the position while rotated etc... fix
                    position: PD.Optional(Text.Params.attachment)
                }, { isFlat: true })
            }),
            options: PD.Group({
                ...Text.Params,
    
                background: PD.Boolean(true),
                backgroundMargin: PD.Numeric(0.2, { min: 0, max: 1, step: 0.01 }),
                backgroundColor: PD.Color(ColorNames.snow),
                backgroundOpacity: PD.Numeric(0.9, { min: 0, max: 1, step: 0.01 }),
            })
        }

        return parmaObj;

    }

    changeOption: ParamOnChange = ({name, value}) => {
        const updatedVal = this.state.labelValue;
        updatedVal[name] = value;
        this.setState({ labelValue: updatedVal });
        this.applyLabels(updatedVal, true);
    };

    render() {

        const current = this.current;
        const ref = current.ref;
        
        let showActions = true;
        if (ref === StateTransform.RootRef) {
            const children = current.state.tree.children.get(ref);
            showActions = children.size !== 0;
        }

        if (!showActions) return null;
        
        const assmeblyCreated = current.state.cells.get('assembly')!;

        const controlParams = this.getControlParams();
       
        return <>
            {assmeblyCreated &&
            <div className='msp-transform-wrapper'>

                <div className="msp-transform-header">
                    <button className="msp-btn msp-btn-block">3D Labels</button>
                </div>
                
                <div className="msp-control-row">
                    <span>Display</span>
                    <div>
                        <button onClick={(e) => this.toggleLabels()}><span className={`msp-icon msp-icon-${this.labelApplied() ? 'off' : 'ok'}`}></span>{this.labelApplied() ? 'Hide' : 'Show'}</button>
                    </div>
                </div>
                { this.labelApplied() &&
                    <ParameterControls onChange={this.changeOption} params={controlParams} values={this.labelValue()} />
                }
            </div>
            }
        </>
    }
}