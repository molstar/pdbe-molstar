import { PurePluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { ComponentClass, JSXElementConstructor } from 'react';
import { PluginCustomState } from '../plugin-custom-state';


export function WithLoadingOverlay(MainContent: JSXElementConstructor<{}>, OverlayContent: JSXElementConstructor<{}> = PDBeLoadingOverlayBox): ComponentClass<{}> {
    return class _WithLoadingOverlay extends PurePluginUIComponent<{}, { showOverlay: boolean }> {
        state: Readonly<{ showOverlay: boolean; }> = { showOverlay: false };
        componentDidMount(): void {
            super.componentDidMount?.();
            const busyEvent = PluginCustomState(this.plugin).events?.isBusy;
            if (busyEvent) {
                this.subscribe(busyEvent, busy => {
                    this.setState({ showOverlay: busy && !!PluginCustomState(this.plugin).initParams?.loadingOverlay });
                });
            }
        }
        render() {
            return <>
                <MainContent />
                {this.state.showOverlay && <div className='pdbemolstar-overlay'>
                    <OverlayContent />
                </div>}
            </>;
        }
    };
}

function PDBeLoadingOverlayBox() {
    return <div className='pdbemolstar-overlay-box'>
        <svg className='pdbe-animated-logo' viewBox='0 0 300 300'>
            <path className='path-bg' fill='transparent' stroke='#E13D3D' strokeWidth='30' d='M 150 200 L 150 100 A 50 50 0 1 0 100 150 L 200 150 A 50 50 0 1 0 150 100 L 150 200 A 50 50 0 1 0 200 150 L 100 150 A 50 50 0 1 0 150 200 '></path>
            <path className='path-cross' fill='transparent' stroke='#72B260' strokeWidth='30' d='M 150 100 L 150 200 M 100 150 L 200 150'></path>
            <path className='path-fg' fill='transparent' stroke='#72B260' strokeWidth='30' d='M 100 150 A 50 50 0 1 1 150 100 L 150 170 L 150 100 L 150 170 L 150 100 L 150 100 A 50 50 0 1 1 200 150 L 130 150 L 200 150 L 130 150 L 200 150 L 200 150 A 50 50 0 1 1 150 200 L 150 130 L 150 200 L 150 130 L 150 200 L 150 200 A 50 50 0 1 1 100 150 L 170 150 L 100 150 L 170 150 L 100 150'>
            </path>
        </svg>
    </div>;
}
