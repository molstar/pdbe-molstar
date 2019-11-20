import * as React from 'react';
import { PluginUIComponent } from 'Molstar/mol-plugin/ui/base';
import { StateTransform } from 'Molstar/mol-state';
import { ApplyActionControl } from 'Molstar/mol-plugin/ui/state/apply-action';
import { Viewport } from 'Molstar/mol-plugin/ui/viewport';
import { CanvasControls } from './canvas-controls';
import { BackgroundTaskProgress } from 'Molstar/mol-plugin/ui/task';
import { LociLabels } from 'Molstar/mol-plugin/ui/controls';
import { AnnotationsControl } from './annotation-controls'
import { MapControl } from './map-controls'
import { LabelControl } from './label-controls'
import { VisualsControl } from './visual-controls'
import { Toasts } from 'Molstar/mol-plugin/ui/toast';
import { CreateSourceVisual } from '../state-actions';
import { ImageControls } from 'Molstar/mol-plugin/ui/image';

export class ControlsWrapper extends PluginUIComponent {

    get current() {
        return this.plugin.state.behavior.currentObject.value;
    }

    componentDidMount() {
        this.subscribe(this.plugin.state.behavior.currentObject, o => {
            this.forceUpdate();
        });
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
        const assmeblyCreated = current.state.cells.get('assembly')!;

        let ligView = false;
        const gbCtx:any = current.state.globalContext as any;
        if(gbCtx.customState && gbCtx.customState && gbCtx.customState.initParams && gbCtx.customState.initParams.ligandView) ligView = true;

        return <div className='msp-scrollable-container msp-right-controls'>
            {!ligView && assmeblyCreated && <ApplyActionControl plugin={this.plugin} key={`${CreateSourceVisual.id}`} state={current.state} action={CreateSourceVisual} nodeRef={'model'} />}
            {!ligView && <AnnotationsControl />}
            <MapControl mapApplied={true} />
            {<LabelControl />}
            {<VisualsControl />}
            <ImageControls />
        </div>;
        
    }
}

export class ViewportWrapper extends PluginUIComponent {
    render() {
        return <>
            <Viewport />
            <CanvasControls />
            <div style={{ position: 'absolute', left: '10px', bottom: '10px' }}>
                <BackgroundTaskProgress />
            </div>
            <div className='msp-highlight-toast-wrapper'>
                <LociLabels />
                <Toasts />
            </div>
        </>;
    }
}