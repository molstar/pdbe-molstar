
import * as React from 'react';
import { PluginUIComponent } from 'Molstar/mol-plugin/ui/base';
import { StateTransform } from 'Molstar/mol-state';
import { TransformUpdaterControl } from 'Molstar/mol-plugin/ui/state/update-transform';
import { StateElements } from '../helpers';
import { toggleMap } from '../maps'

export class MapControl extends PluginUIComponent<{ mapApplied: boolean }, { mapApplied: boolean  }> {
    
    get current() {
        return this.plugin.state.behavior.currentObject.value;
    }

    mapApplied() { return this.state.mapApplied; }
    

    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, o => {
            this.forceUpdate();
        });
    }

    state: any = { mapApplied: this.props.mapApplied };

    async toggleMap(){
        const applyMap = !this.state.mapApplied;
        this.setState({ mapApplied: applyMap });

        let ligView = false;
        const gbCtx:any = this.current.state.globalContext as any;
        if(gbCtx.customState && gbCtx.customState && gbCtx.customState.initParams && gbCtx.customState.initParams.ligandView) ligView = true;

        toggleMap(applyMap, this.plugin, this.current.state, ligView);

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
        
        const gbCtx:any = current.state.globalContext as any;
        if(!gbCtx.customState.initParams.loadMaps) return null;
        
        const assmeblyCreated = current.state.cells.get('assembly')!;

        const mapControlsHeading = {name: 'Map settings'};
       
        return <>
            {assmeblyCreated &&
            <div className='msp-transform-wrapper'>

                <div className="msp-transform-header">
                    <button className="msp-btn msp-btn-block">Map</button>
                </div>
                
                <div className="msp-control-row">
                    <span>Display</span>
                    <div>
                        <button onClick={(e) => this.toggleMap()}><span className={`msp-icon msp-icon-${this.mapApplied() ? 'off' : 'ok'}`}></span>{this.mapApplied() ? 'Hide' : 'Show'}</button>
                    </div>
                </div>
                <div className="remove-header">
                { this.mapApplied() && 
                    <TransformUpdaterControl nodeRef={StateElements.VolumeStreaming} header={mapControlsHeading} />}
                </div>
            </div>
            }
        </>
    }
}