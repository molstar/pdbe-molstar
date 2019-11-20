import * as React from 'react';
import { ParameterControls } from 'Molstar/mol-plugin/ui/controls/parameters';
import { ControlGroup } from 'Molstar/mol-plugin/ui/controls/common';
import { Canvas3DParams } from 'Molstar/mol-canvas3d/canvas3d';
import { PluginLayoutStateParams } from 'Molstar/mol-plugin/layout';
import { Interactivity } from 'Molstar/mol-plugin/util/interactivity';
import { Task } from 'Molstar/mol-task';
import { ImagePass } from 'Molstar/mol-canvas3d/passes/image';
import { canvasToBlob } from 'Molstar/mol-canvas3d/util';
import { download } from 'Molstar/mol-util/download';
import { ViewportControls } from 'Molstar/mol-plugin/ui/viewport';
// import { PluginCommands } from 'Molstar/mol-plugin/command';

export class CanvasControls extends ViewportControls {

    private downloadTask = () => {
        return Task.create('Download Image', async ctx => {
            const width = this.plugin.canvas3d.webgl.gl.drawingBufferWidth;
            const height = this.plugin.canvas3d.webgl.gl.drawingBufferHeight;
            const imagePass: ImagePass = this.plugin.canvas3d.getImagePass()
            // imagePass.setProps({
            //     multiSample: { mode: 'on', sampleLevel: 2 },
            //     postprocessing: this.plugin.canvas3d.props.postprocessing
            // })
            
            if (width <= 0 || height <= 0) return

            await ctx.update('Rendering image...')
            const imageData = imagePass.getImageData(width, height)

            await ctx.update('Encoding image...')
            const canvas = document.createElement('canvas')
            canvas.width = imageData.width
            canvas.height = imageData.height
            const canvasCtx = canvas.getContext('2d')
            if (!canvasCtx) throw new Error('Could not create canvas 2d context')
            canvasCtx.putImageData(imageData, 0, 0)

            await ctx.update('Downloading image...')
            const blob = await canvasToBlob(canvas)
            download(blob, 'molstar-image')
        })
    }

    getScreenshot = () => {
        this.plugin.runTask(this.downloadTask());
    }

    toggleSettingsExpanded = (e: React.MouseEvent<HTMLButtonElement>) => {
        this.setState({ isSettingsExpanded: !this.state.isSettingsExpanded });
        e.currentTarget.blur();
        this.helpPanelOpen = false;
    }

    helpPanelOpen = false;
    toggleControlsHelp = () => {
        this.helpPanelOpen = !this.helpPanelOpen;
        this.setState({isSettingsExpanded: false});
    }

    isBlack(customeState:any): boolean{
        if(customeState && customeState.initParams && customeState.initParams.bgColor){
            const color = customeState.initParams.bgColor;
            if(color.r == 0 && color.g == 0 && color.b == 0) return true;    
        }
        return false;
    }

    render() {
        const customeState:any = this.plugin.customState;
        let showPDBeLink = false;
        let hiddenIcons = [];
        if(customeState && customeState.initParams && customeState.initParams.hideQuickControls) hiddenIcons = customeState.initParams.hideQuickControls;
        if(customeState && customeState.initParams && customeState.initParams.moleculeId && customeState.initParams.pdbeLink) showPDBeLink = true;
        const bgColor = this.isBlack(customeState) ? '#fff' : '#555';
        const pdbeLink:any = {
            parentStyle: {width: 'auto'},
            containerStyle: {position:'absolute', width: '55px', right: '-8px', height: '32px', lineHeight: '32px'},
            style: { fontSize:'16px', fontWeight:'bold', color: bgColor, borderBottom: 'none', cursor: 'pointer' },
            pdbeImg: {
                src: 'https://www.ebi.ac.uk/pdbe/entry/static/images/logos/PDBe/logo_T_64.png',
                alt: 'PDBe logo',
                style: { height:'11px', width:'11px', border:0 ,marginTop:'-2px' }
            }
        }

        const helpRowStyle:any = { height: '50px' }

        const controlsStyle = showPDBeLink ? { marginRight: '55px' } : {};
        
        return <div className={'msp-viewport-controls'} onMouseMove={this.onMouseMove} style={pdbeLink.parentStyle}>
            {showPDBeLink && <div style={pdbeLink.containerStyle}>
                    <a className='msp-pdbe-link' style={pdbeLink.style} target="_blank" href={'https://pdbe.org/'+customeState.initParams.moleculeId}>
                        <img src={pdbeLink.pdbeImg.src} alt={pdbeLink.pdbeImg.alt} style={pdbeLink.pdbeImg.style} />
                        {customeState.initParams.moleculeId}
                    </a>
            </div>}
            <div className='msp-viewport-controls-buttons' style={controlsStyle}>
                <div className='msp-semi-transparent-background' />
                { hiddenIcons.indexOf('help') == -1 && this.icon('help-circle', this.toggleControlsHelp, 'Controls help', this.helpPanelOpen)}
                { hiddenIcons.indexOf('settings') == -1 && !this.props.hideSettingsIcon && this.icon('settings', this.toggleSettingsExpanded, 'Settings', this.state.isSettingsExpanded)}
                { hiddenIcons.indexOf('camera') == -1 && this.icon('screenshot', this.getScreenshot, 'Screenshot')}
                { hiddenIcons.indexOf('controls') == -1 && this.icon('tools', this.toggleControls, 'Toggle Controls', this.plugin.layout.state.showControls)}
                { hiddenIcons.indexOf('expand') == -1 && this.icon('expand-layout', this.toggleExpanded, 'Toggle Expanded', this.plugin.layout.state.isExpanded)}
                { hiddenIcons.indexOf('reset') == -1 && this.icon('reset-scene', this.resetCamera, 'Reset Camera')}
            </div>
            {this.state.isSettingsExpanded && <div className='msp-viewport-controls-scene-options'>
                <ControlGroup header='Viewport' initialExpanded={true}>
                    <ParameterControls params={Canvas3DParams} values={this.plugin.canvas3d.props} onChange={this.setSettings} />
                </ControlGroup>
                <ControlGroup header='Layout' initialExpanded={true}>
                    <ParameterControls params={PluginLayoutStateParams} values={this.plugin.layout.state} onChange={this.setLayout} />
                </ControlGroup>
                <ControlGroup header='Interactivity' initialExpanded={true}>
                    <ParameterControls params={Interactivity.Params} values={this.plugin.interactivity.props} onChange={this.setInteractivityProps} />
                </ControlGroup>
            </div>}
            {this.helpPanelOpen && <div className='msp-viewport-controls-scene-options'>
                <div className='msp-control-row' style={helpRowStyle}>
                    <span><strong>Rotate</strong></span>
                    <div>Left Mouse button <br/> One finger touch</div>
                </div>
                <div className='msp-control-row' style={helpRowStyle}>
                    <span><strong>Zoom</strong></span>
                    <div>Mouse wheel <br/> Pinch</div>
                </div>
                <div className='msp-control-row' style={helpRowStyle}>
                    <span><strong>Move</strong></span>
                    <div>Right Mouse button <br/> Two finger touch</div>
                </div>
                <div className='msp-control-row' style={helpRowStyle}>
                    <span><strong>Slab</strong></span>
                    <div>Shift key + Mouse wheel <br/> Three finger touch</div>
                </div>
            </div>
            }
        </div>
    }
}