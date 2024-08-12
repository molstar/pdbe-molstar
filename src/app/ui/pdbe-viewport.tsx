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

        const customControls_viewportTopCenter = Array.from(CustomControls(this.plugin, 'viewportTopCenter').entries());
        const customControls_viewportTopLeft = Array.from(CustomControls(this.plugin, 'viewportTopLeft').entries());

        return <>
            <Viewport />
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div className='pdbemolstar-viewport-top-center-controls'>
                    {customControls_viewportTopCenter.map(([name, Control]) =>
                        <Control key={name} />
                    )}
                    <SelectionViewportControls />
                </div>
                <div style={{ position: 'relative', pointerEvents: 'auto' }}>
                    <div className='msp-viewport-top-left-controls'>
                        <AnimationViewportControls />
                        <TrajectoryViewportControls />
                        <StateSnapshotViewportControls />
                        {customControls_viewportTopLeft.map(([name, Control]) =>
                            <div className='pdbemolstar-viewport-top-left-control' key={name}>
                                <Control />
                            </div>
                        )}
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
