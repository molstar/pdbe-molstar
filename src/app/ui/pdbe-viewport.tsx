import { AnimationViewportControls, LociLabels, SelectionViewportControls, StateSnapshotViewportControls, TrajectoryViewportControls, ViewportSnapshotDescription } from 'molstar/lib/mol-plugin-ui/controls';
import { DefaultViewport } from 'molstar/lib/mol-plugin-ui/plugin';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task';
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { WithLoadingOverlay } from './overlay';
import { CustomControls } from '../plugin-custom-state';


/** A modified copy of DefaultViewport */
export class CustomizableDefaultViewport extends DefaultViewport {
    render() {
        const VPControls = this.plugin.spec.components?.viewport?.controls || ViewportControls;
        const SnapshotDescription = this.plugin.spec.components?.viewport?.snapshotDescription || ViewportSnapshotDescription;

        const customControls_viewportTop = Array.from(CustomControls(this.plugin, 'viewportTop').entries());

        return <>
            <Viewport />
            <div className='msp-viewport-top-left-controls'>
                <AnimationViewportControls />
                <TrajectoryViewportControls />
                <StateSnapshotViewportControls />
                {customControls_viewportTop.map(([name, Control]) => <Control key={name} />)}
                {/* TODO continue here, think about proper placement */}
                <SnapshotDescription />
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


export const PDBeViewport = WithLoadingOverlay(CustomizableDefaultViewport);
