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
                                    <div className='pdbemolstar-pdbe-logo'><PDBeLogo /></div>
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

function PDBeLogo({ className }: { className?: string }) {
    return <svg className={className} viewBox='0 0 300 300'>
        <path className='path-bg' fill='transparent' stroke='#E13D3D' strokeWidth='35' d='M 150 200 L 150 100 A 50 50 0 1 0 100 150 L 200 150 A 50 50 0 1 0 150 100 L 150 200 A 50 50 0 1 0 200 150 L 100 150 A 50 50 0 1 0 150 200 '></path>
        <path className='path-fg' fill='transparent' stroke='#72B260' strokeWidth='35' d='M 200 150 A 50 50 0 1 0 150 100 L 150 200 A 50 50 0 1 0 200 150 L 100 150 A 50 50 0 1 0 150 200 '></path>
    </svg>;
}
