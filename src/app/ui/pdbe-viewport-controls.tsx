import { ControlGroup } from 'Molstar/mol-plugin-ui/controls/common';
import { AutorenewSvg, BuildOutlinedSvg, CameraOutlinedSvg, CloseSvg, FullscreenSvg, TuneSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { ToggleSelectionModeButton } from 'Molstar/mol-plugin-ui/structure/selection';
import { ViewportControls } from 'Molstar/mol-plugin-ui/viewport';
import { SimpleSettingsControl } from 'Molstar/mol-plugin-ui/viewport/simple-settings';
import { PluginConfig } from 'Molstar/mol-plugin/config';
import { PluginCustomState } from '../plugin-custom-state';
import { DownloadScreenshotControls } from './pdbe-screenshot-controls';


export class PDBeViewportControls extends ViewportControls {
    isBlack(customeState: any): boolean {
        if (customeState && customeState.initParams && customeState.initParams.bgColor) {
            const color = customeState.initParams.bgColor;
            if (color.r === 0 && color.g === 0 && color.b === 0) return true;
        }
        return false;
    }

    render() {
        const customeState = PluginCustomState(this.plugin);
        let showPDBeLink = false;
        let showControlToggle = true;
        let showControlInfo = true;
        if (customeState && customeState.initParams && customeState.initParams.moleculeId && customeState.initParams.pdbeLink) showPDBeLink = true;
        if (customeState && customeState.initParams && customeState.initParams.superposition) showPDBeLink = false;
        if (customeState && customeState.initParams && customeState.initParams.hideCanvasControls && customeState.initParams.hideCanvasControls.indexOf('controlToggle') > -1) showControlToggle = false;
        if (customeState && customeState.initParams && customeState.initParams.hideCanvasControls && customeState.initParams.hideCanvasControls.indexOf('controlInfo') > -1) showControlInfo = false;
        const bgColor = this.isBlack(customeState) ? '#fff' : '#555';
        const pdbeLink: any = {
            parentStyle: { width: 'auto' },
            bgStyle: { position: 'absolute', height: '27px', width: '54px', marginLeft: '-33px' },
            containerStyle: { position: 'absolute', right: '10px', top: '10px', padding: '3px 3px 3px 18px' },
            style: { display: 'inline-block', fontSize: '14px', color: bgColor, borderBottom: 'none', cursor: 'pointer', textDecoration: 'none', position: 'absolute', right: '5px' },
            pdbeImg: {
                src: 'https://www.ebi.ac.uk/pdbe/entry/static/images/logos/PDBe/logo_T_64.png',
                alt: 'PDBe logo',
                style: { height: '12px', width: '12px', border: 0, position: 'absolute', margin: '4px 0 0 -13px' }
            }
        };
        const vwpBtnsTopMargin = { marginTop: '30px' };

        return <>
            {showPDBeLink && <div className='msp-viewport-controls-buttons' style={pdbeLink.containerStyle}>
                <div className='msp-semi-transparent-background' style={pdbeLink.bgStyle} />
                <a className='msp-pdbe-link' style={pdbeLink.style} target="_blank" href={`https://pdbe.org/${customeState.initParams!.moleculeId}`}>
                    <img src={pdbeLink.pdbeImg.src} alt={pdbeLink.pdbeImg.alt} style={pdbeLink.pdbeImg.style} />
                    {customeState.initParams!.moleculeId}
                </a>
            </div>}
            <div className={'msp-viewport-controls'} onMouseMove={this.onMouseMove} style={showPDBeLink ? vwpBtnsTopMargin : void 0}>
                <div className='msp-viewport-controls-buttons'>
                    <div>
                        <div className='msp-semi-transparent-background' />
                        {this.icon(AutorenewSvg, this.resetCamera, 'Reset Camera')}
                    </div>
                    <div>
                        <div className='msp-semi-transparent-background' />
                        {this.icon(CameraOutlinedSvg, this.toggleScreenshotExpanded, 'Screenshot / State Snapshot', this.state.isScreenshotExpanded)}
                    </div>
                    <div>
                        <div className='msp-semi-transparent-background' />
                        {showControlToggle && this.icon(BuildOutlinedSvg, this.toggleControls, 'Toggle Controls Panel', this.plugin.layout.state.showControls)}
                        {this.plugin.config.get(PluginConfig.Viewport.ShowExpand) && this.icon(FullscreenSvg, this.toggleExpanded, 'Toggle Expanded Viewport', this.plugin.layout.state.isExpanded)}
                        {showControlInfo && this.icon(TuneSvg, this.toggleSettingsExpanded, 'Settings / Controls Info', this.state.isSettingsExpanded)}
                    </div>
                    {this.plugin.config.get(PluginConfig.Viewport.ShowSelectionMode) && <div>
                        <div className='msp-semi-transparent-background' />
                        <ToggleSelectionModeButton />
                    </div>}
                </div>
                {this.state.isScreenshotExpanded && <div className='msp-viewport-controls-panel'>
                    <ControlGroup header='Screenshot / State' title='Click to close.' initialExpanded={true} hideExpander={true} hideOffset={true} onHeaderClick={this.toggleScreenshotExpanded}
                        topRightIcon={CloseSvg} noTopMargin childrenClassName='msp-viewport-controls-panel-controls'>
                        <DownloadScreenshotControls close={this.toggleScreenshotExpanded} />
                    </ControlGroup>
                </div>}
                {this.state.isSettingsExpanded && <div className='msp-viewport-controls-panel'>
                    <ControlGroup header='Settings / Controls Info' title='Click to close.' initialExpanded={true} hideExpander={true} hideOffset={true} onHeaderClick={this.toggleSettingsExpanded}
                        topRightIcon={CloseSvg} noTopMargin childrenClassName='msp-viewport-controls-panel-controls'>
                        <SimpleSettingsControl />
                    </ControlGroup>
                </div>}
            </div>
        </>;
    }
}