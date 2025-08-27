import { ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { normalizeColor } from '../helpers';
import { PluginCustomState } from '../plugin-custom-state';


export class PDBeViewportControls extends ViewportControls {
    private isBlack(): boolean {
        const bgColor = PluginCustomState(this.plugin).initParams?.bgColor;
        return bgColor !== undefined && normalizeColor(bgColor) === ColorNames.black;
    }

    render() {
        const initParams = PluginCustomState(this.plugin).initParams;
        const showPDBeLink = initParams?.moleculeId && initParams?.pdbeLink && !initParams?.superposition;
        const pdbeLinkColor = this.isBlack() ? '#fff' : '#555';
        const pdbeLink = {
            containerStyle: { position: 'absolute', right: '10px', top: '10px', padding: '6px', paddingRight: '3px', paddingLeft: '18px' },
            bgStyle: { position: 'absolute', height: '32px', width: '54px', marginLeft: '-33px' },
            style: { display: 'inline-block', fontSize: '14px', color: pdbeLinkColor, borderBottom: 'none', cursor: 'pointer', textDecoration: 'none', position: 'absolute', right: '5px' },
            pdbeImg: {
                src: 'https://www.ebi.ac.uk/pdbe/entry/static/images/logos/PDBe/logo_T_64.png',
                alt: 'PDBe logo',
                style: { height: '12px', width: '12px', border: 0, position: 'absolute', margin: '4px 0 0 -13px' },
            },
        } as const;

        return <>
            {showPDBeLink && <div className='msp-viewport-controls-buttons' style={pdbeLink.containerStyle}>
                <div className='msp-semi-transparent-background' style={pdbeLink.bgStyle} />
                <a className='msp-pdbe-link' style={pdbeLink.style} target="_blank" href={`https://pdbe.org/${initParams!.moleculeId}`}>
                    <img src={pdbeLink.pdbeImg.src} alt={pdbeLink.pdbeImg.alt} style={pdbeLink.pdbeImg.style} />
                    {initParams!.moleculeId}
                </a>
            </div>}
            <div style={{ position: 'absolute', top: showPDBeLink ? (32 + 4) : 0, right: 0 }}>
                {super.render()}
            </div>
        </>;
    }
}
