import { ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { PluginCustomState } from '../plugin-custom-state';


export class PDBeViewportControls extends ViewportControls {
    render() {
        const initParams = PluginCustomState(this.plugin).initParams;
        const showPDBeLink = initParams?.moleculeId && initParams?.pdbeLink && !initParams?.superposition;

        return <>
            {showPDBeLink &&
                <div className='msp-pdbe-link-box msp-viewport-controls-buttons'>
                    <div className='msp-pdbe-link-bg msp-semi-transparent-background' />
                    <a className='msp-pdbe-link' target='_blank' href={`https://pdbe.org/${initParams!.moleculeId}`}>
                        <img className='msp-pdbe-logo' alt='PDBe logo'
                            src='https://www.ebi.ac.uk/pdbe/entry/static/images/logos/PDBe/logo_T_64.png' />
                        {initParams!.moleculeId}
                    </a>
                </div>
            }
            <div style={{ position: 'absolute', top: showPDBeLink ? (32 + 4) : 0, right: 0 }}>
                {super.render()}
            </div>
        </>;
    }
}
