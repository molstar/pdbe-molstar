import { PluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { LociLabels, StateSnapshotViewportControls, SelectionViewportControls } from 'Molstar/mol-plugin-ui/controls';
import { BackgroundTaskProgress } from 'Molstar/mol-plugin-ui/task';
import { Toasts } from 'Molstar/mol-plugin-ui/toast';
import { Viewport, ViewportControls } from 'Molstar/mol-plugin-ui/viewport';

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