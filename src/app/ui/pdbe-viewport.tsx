import { AnimationViewportControls, LociLabels, SelectionViewportControls, StateSnapshotViewportControls, TrajectoryViewportControls, ViewportSnapshotDescription } from 'molstar/lib/mol-plugin-ui/controls';
import { DefaultViewport } from 'molstar/lib/mol-plugin-ui/plugin';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task';
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { CustomControls } from './custom-controls';
import { WithLoadingOverlay } from './overlay';


/** A modified copy of DefaultViewport */
export class CustomizableDefaultViewport extends DefaultViewport {
    render() {
        const VPControls = this.plugin.spec.components?.viewport?.controls || ViewportControls;
        const SnapshotDescription = this.plugin.spec.components?.viewport?.snapshotDescription || ViewportSnapshotDescription;

        return <>
            <Viewport />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div className='pdbemolstar-viewport-top-center-controls'>
                    <CustomControls region='viewport-top-center' />
                    <SelectionViewportControls />
                </div>
                <div style={{ position: 'relative', pointerEvents: 'auto' }}>
                    <div className='msp-viewport-top-left-controls'>
                        <AnimationViewportControls />
                        <TrajectoryViewportControls />
                        <StateSnapshotViewportControls />
                        <CustomControls region='viewport-top-left' />
                        <SnapshotDescription />
                    </div>
                </div>
            </div>
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
