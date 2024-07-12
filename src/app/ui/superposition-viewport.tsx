import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { LociLabels, SelectionViewportControls, StateSnapshotViewportControls } from 'molstar/lib/mol-plugin-ui/controls';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task';
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';


export class SuperpostionViewport extends PluginUIComponent {
    render() {
        const VPControls = this.plugin.spec.components?.viewport?.controls || ViewportControls;

        return <>
            <Viewport />
            <div className='msp-viewport-top-left-controls'>
                <StateSnapshotViewportControls />
            </div>
            <SelectionViewportControls />
            <VPControls />
            <BackgroundTaskProgress />
            <div className='msp-highlight-toast-wrapper'>
                <LociLabels />
                <Toasts />
            </div>
        </>;
    }
}