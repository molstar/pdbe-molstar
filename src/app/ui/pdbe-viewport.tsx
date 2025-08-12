import { PurePluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { AnimationViewportControls, LociLabels, SelectionViewportControls, StateSnapshotViewportControls, TrajectoryViewportControls, ViewportSnapshotDescription } from 'molstar/lib/mol-plugin-ui/controls';
import { DefaultViewport } from 'molstar/lib/mol-plugin-ui/plugin';
import { BackgroundTaskProgress } from 'molstar/lib/mol-plugin-ui/task';
import { Toasts } from 'molstar/lib/mol-plugin-ui/toast';
import { Viewport, ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { ComponentClass, JSXElementConstructor } from 'react';
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

/** Return a React component with MainContent, expanded to whole browser window whenever `this.plugin.layout.state.isExpanded === true`. */
function Fullscreenable(MainContent: JSXElementConstructor<{}> | React.FC): ComponentClass<{}> {
    return class _Fullscreenable extends PurePluginUIComponent<{}, { fullscreen: boolean }> {
        state = { fullscreen: this.plugin.layout.state.isExpanded };

        componentDidMount(): void {
            this.subscribe(this.plugin.layout.events.updated, () => {
                this.setState({ fullscreen: this.plugin.layout.state.isExpanded });
            });
        }

        render() {
            return <div className={this.state.fullscreen ? 'msp-layout-expanded msp-viewport-expanded' : undefined}>
                <MainContent />;
            </div>;
        }
    };
}


/** Version of `PDBeViewport` to use as part of other components. Does not expand to fullscreen individually. */
export const PDBeViewport_NoFullscreen = WithLoadingOverlay(CustomizableDefaultViewport);

/** Component containing 3D canvas, button in top left and top right corners, and tooltip box (center panel in default layout). Changes to fullscreen view by "Toggle Expanded Viewport" button, or "expanded" option. */
export const PDBeViewport = Fullscreenable(PDBeViewport_NoFullscreen);
