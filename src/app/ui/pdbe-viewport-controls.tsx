import { Button } from 'molstar/lib/mol-plugin-ui/controls/common';
import { ViewportControls } from 'molstar/lib/mol-plugin-ui/viewport';
import { PluginCustomState } from '../plugin-custom-state';


export class PDBeViewportControls extends ViewportControls {
    render() {
        const initParams = PluginCustomState(this.plugin).initParams;
        const showPDBeLink = initParams?.moleculeId && initParams?.pdbeLink && !initParams?.superposition;

        return <>
            {showPDBeLink &&
                <div className='msp-viewport-controls'>
                    <div className='msp-viewport-controls-buttons'>
                        <div className='pdbemolstar-pdbe-link-box'>
                            <div className='msp-semi-transparent-background' />
                            <a target='_blank' href={`https://pdbe.org/${initParams!.moleculeId}`} style={{ textDecoration: 'none', color: 'initial' }}>
                                <Button className='msp-btn-link-toggle-on pdbemolstar-pdbe-link' title='Go to PDBe Pages'>
                                    <img className='pdbemolstar-pdbe-logo' alt='PDBe logo' src='https://www.ebi.ac.uk/pdbe/entry/static/images/logos/PDBe/logo_T_64.png' />
                                    {initParams!.moleculeId}
                                </Button>
                            </a>
                        </div>
                    </div>
                </div>
            }
            <div className={showPDBeLink ? 'pdbemolstar-viewport-controls-shifted' : 'pdbemolstar-viewport-controls-normal'}>
                {super.render()}
            </div>
        </>;
    }
}
