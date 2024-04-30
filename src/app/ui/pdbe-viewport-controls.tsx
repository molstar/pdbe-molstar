import { ViewportControls } from 'Molstar/mol-plugin-ui/viewport';
import { PluginCustomState } from '../plugin-custom-state';
import { ArrowDropDownSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';


export class PDBeViewportControls extends ViewportControls {
    private isBlack(): boolean {
        const bgColor = PluginCustomState(this.plugin).initParams?.bgColor;
        return bgColor !== undefined && bgColor.r === 0 && bgColor.g === 0 && bgColor.b === 0;
    }

    render() {
        const initParams = PluginCustomState(this.plugin).initParams;
        const showPDBeLink = initParams?.moleculeId && initParams?.pdbeLink && !initParams?.superposition;
        const pdbeLinkColor = this.isBlack() ? '#fff' : '#555';
        const pdbeLink = {
            parentStyle: { width: 'auto' },
            bgStyle: { position: 'absolute', height: '27px', width: '54px', marginLeft: '-33px' },
            containerStyle: { position: 'absolute', right: '10px', top: '10px', padding: '3px 3px 3px 18px' },
            style: { display: 'inline-block', fontSize: '14px', color: pdbeLinkColor, borderBottom: 'none', cursor: 'pointer', textDecoration: 'none', position: 'absolute', right: '5px' },
            pdbeImg: {
                src: 'https://www.ebi.ac.uk/pdbe/entry/static/images/logos/PDBe/logo_T_64.png',
                alt: 'PDBe logo',
                style: { height: '12px', width: '12px', border: 0, position: 'absolute', margin: '4px 0 0 -13px' }
            }
        } as const;

        return <>
            {showPDBeLink && <div className='msp-viewport-controls-buttons' style={pdbeLink.containerStyle}>
                <div className='msp-semi-transparent-background' style={pdbeLink.bgStyle} />
                <a className='msp-pdbe-link' style={pdbeLink.style} target="_blank" href={`https://pdbe.org/${initParams!.moleculeId}`}>
                    <img src={pdbeLink.pdbeImg.src} alt={pdbeLink.pdbeImg.alt} style={pdbeLink.pdbeImg.style} />
                    {initParams!.moleculeId}
                </a>
            </div>}
            <div style={{ position: 'absolute', top: showPDBeLink ? (27 + 4) : 0, right: 0 }}>
                {super.render()}
            </div>
            <div className={'msp-viewport-controls'} style={{ top: 250 }}>
                <div className='msp-viewport-controls-buttons'>
                    <div>
                        <div className='msp-semi-transparent-background' />
                        {this.icon(ArrowDropDownSvg, () => this.togglePanel('top'), 'Toggle Top Panel', this.plugin.layout.state.showControls)}
                        {this.icon(ArrowDropDownSvg, () => this.togglePanel('left'), 'Toggle Left Panel', this.plugin.layout.state.showControls)}
                        {this.icon(ArrowDropDownSvg, () => this.togglePanel('right'), 'Toggle Right Panel', this.plugin.layout.state.showControls)}
                        {this.icon(ArrowDropDownSvg, () => this.togglePanel('bottom'), 'Toggle Bottom Panel', this.plugin.layout.state.showControls)}
                    </div>
                </div>
            </div>
        </>;
    }

    async togglePanel(panel: LayoutOptions) {
        const controls = this.plugin.spec.components?.controls ?? {};
        const regionState = this.plugin.layout.state.regionState;
        const available = controls[panel] !== 'none';
        if (!available) return;
        const visible = regionState[panel] !== 'hidden';
        const newState = visible ? 'hidden' : 'full'; // TODO deal with left in a special way
        console.log('controls', controls, 'regionState', regionState)
        await PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...regionState, [panel]: newState } } });
    }
}

const LayoutOptions = {
    'top': 'Sequence',
    'bottom': 'Log',
    'left': 'Left Panel',
    'right': 'Right Panel',
};
type LayoutOptions = keyof typeof LayoutOptions
