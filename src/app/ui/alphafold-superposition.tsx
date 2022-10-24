import React from 'react';
import { CollapsableControls, PurePluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { TuneSvg, SuperposeChainsSvg, SuperpositionSvg, Icon } from 'Molstar/mol-plugin-ui/controls/icons';
import { Button, ToggleButton } from 'Molstar/mol-plugin-ui/controls/common';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
import { superposeAf } from '../superposition';
import { scaleLinear as d3ScaleLinear } from 'd3-scale';
import { axisBottom as d3AxisBotom, axisLeft as d3AxisLeft } from 'd3-axis';
import { select as d3Select } from 'd3-selection';

const _InfoIcon = <svg width='24px' height='24px' viewBox='0 0 24 24' strokeWidth='0.1px'><path fill="currentColor" d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" /></svg>;
export function InfoIconSvg() { return _InfoIcon; }

export class AlphafoldPaeControls extends CollapsableControls {
    private axisBoxRef: any;
    defaultState() {
        return {
            isCollapsed: false,
            header: 'AlphaFold PAE',
            brand: { accent: 'gray' as const, svg: SuperpositionSvg },
            isHidden: true
        };
    }

    constructor(props: any, context: any) {
        super(props, context);
        this.axisBoxRef = React.createRef();
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, sel => {
            const superpositionState: any = (this.plugin.customState as any).superpositionState;
            if (superpositionState && superpositionState.alphafold.ref && superpositionState.alphafold.apiData.pae && superpositionState.alphafold.apiData.pae !== '' && superpositionState.alphafold.apiData.pae !== '') {
                this.setState({ isHidden: false });

                const domainMax = superpositionState.alphafold.apiData.length;

                const x = d3ScaleLinear().domain([0, domainMax]).range([0, 200]);
                const xAxis = d3AxisBotom(x).ticks(6).tickFormat(this.formatTicks).tickSizeOuter(0);
                const yAxis = d3AxisLeft(x).ticks(6).tickFormat(this.formatTicks).tickSizeOuter(0);
                const axisContainer = d3Select(this.axisBoxRef.current);

                axisContainer.append('svg:svg')
                .attr('width', 220)
                .attr('height', 30)
                .attr('class', 'pae-x-axis')
                .style('z-index', '1')
                .style('position', 'absolute')
                .attr('transform', `translate(-93,202)`)
                .append('g')
                .attr('transform', `translate(6,0)`)
                .call(xAxis);

                axisContainer.append('svg:svg')
                .attr('width', 50)
                .attr('height', 220)
                .attr('class', 'pae-y-axis')
                .style('z-index', '1')
                .style('position', 'absolute')
                .attr('transform', `translate(-123,0)`)
                .append('g')
                .attr('transform', `translate(36,4)`)
                .call(yAxis);

            }
        });

        
    }
    
    formatTicks(d: any) {
        return d > 999 ? d / 1000 + 'k' : d;
    }

    renderControls() {
        const superpositionState: any = (this.plugin.customState as any).superpositionState;
        if(!superpositionState || !superpositionState.alphafold) return null;

        const errorScale = [0, 5, 10, 15, 20, 25, 30];
        
        return <div className='msp-flex-row' style={{height: 'auto', textAlign: 'center', justifyContent: 'center', padding: '15px 0', position: 'relative', fontSize: '12px'}}>

            <div ref={this.axisBoxRef} className='pae-axis-box' style={{position: 'absolute', width: '100%', height: '100%'}}></div>
            <span style={{transform: 'rotate(270deg)', position: 'absolute', transformOrigin: '0 0', left: '10px', top: '165px', fontWeight:500}}>Aligned residue</span>
            
            <div className='msp-flex-row' style={{height: 'auto', flexDirection: 'column'}}>
                <div style={{width: '200px', height: '200px', border: '1px solid #6a635a', margin: '2px 0 25px 25px', position: 'relative'}}>
                    <img  style={{width: '100%', height: '100%', position: 'absolute', left: 0, top: 0}} src={`${superpositionState.alphafold.apiData.pae}`} alt="PAE"/>
                </div>
                <div style={{textAlign: 'center', paddingLeft: '30px', marginBottom: '20px', fontWeight:500}}>Scored residue</div>

                <img style={{width: '200px', height: '10px', border: '1px solid #6a635a', margin: '2px 0 25px 25px', transform: 'rotate(180deg)'}} src={'https://alphafold.ebi.ac.uk/assets/img/horizontal_colorbar.png'} alt="PAE Scale" />
                <ul style={{listStyleType: 'none', fontWeight:500, margin: 0, display: 'inline-block', position: 'absolute', top: '292px', marginLeft: '24px'}}>
                    {errorScale.map((errValue) => <li style={{float: 'left', marginRight: '18px'}} key={errValue}>{errValue}</li>)}
                </ul>

                <div style={{textAlign: 'center', paddingLeft: '20px', fontWeight:500}}>Expected position error (&Aring;ngstr&ouml;ms)</div>

            </div>
        </div>;
    }
}

export class AlphafoldSuperpositionControls extends CollapsableControls {
    defaultState() {
        return {
            isCollapsed: false,
            header: 'AlphaFold Superposition',
            brand: { accent: 'gray' as const, svg: SuperpositionSvg },
            isHidden: true
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, sel => {
            const superpositionState: any = (this.plugin.customState as any).superpositionState;
            if (superpositionState && superpositionState.alphafold.apiData.cif && superpositionState.alphafold.apiData.cif !== '') {
                this.setState({ isHidden: false });
            }
        });
    }

    rmsdTable() {
        const spData: any = (this.plugin.customState as any).superpositionState;
        const { activeSegment } = spData;
        const { rmsds } = spData.alphafold;
        return <div className='msp-control-offset'>
            {(rmsds.length == 0 || !rmsds[activeSegment - 1]) && <div className='msp-flex-row' style={{ padding: '5px 0 0 10px' }}>
                <strong>No overlap found!</strong>
            </div>
            }
            {rmsds[activeSegment - 1] && <div className='msp-flex-row'>
                <div style={{ width: '40%', borderRight: '1px solid rgb(213 206 196)', padding: '5px 0 0 5px' }}><strong>Entry</strong></div>
                <div style={{ padding: '5px 0 0 5px' }}><strong>RMSD (&#x212b;)</strong></div>
            </div>
            }
            {rmsds[activeSegment - 1] && rmsds[activeSegment - 1].map((d: string) => {
                const details = d.split(':');
                return details[1] !== '-' ? <div className='msp-flex-row' key={d}>
                    <div className='msp-control-row-label' style={{ width: '40%', borderRight: '1px solid rgb(213 206 196)', padding: '5px 0 0 5px' }}>{details[0]}</div>
                    <div style={{ padding: '5px 0 0 5px' }}>{details[1]}</div>
                </div> : null
            })}
            
        </div>

    }

    renderControls() {
        const superpositionState: any = (this.plugin.customState as any).superpositionState;
        return <>
            {superpositionState.alphafold.ref !== '' && this.rmsdTable()}
            {superpositionState.alphafold.ref === '' && <AfSuperpositionControls />}
        </>;
    }
}

export const AlphafoldSuperpositionParams = {
    // alignSequences: PD.Boolean(true, { isEssential: true, description: 'For Chain-based 3D superposition, perform a sequence alignment and use the aligned residue pairs to guide the 3D superposition.' }),
    traceOnly: PD.Boolean(true, { description: 'For Chain- and Uniprot-based 3D superposition, base superposition only on CA (and equivalent) atoms.' })
};
const DefaultAlphafoldSuperpositionOptions = PD.getDefaultValues(AlphafoldSuperpositionParams);
export type AlphafoldSuperpositionOptions = PD.ValuesFor<typeof AlphafoldSuperpositionParams>

// const SuperpositionTag = 'SuperpositionTransform';

type AfSuperpositionControlsState = {
    isBusy: boolean,
    action?: 'byChains' | 'byAtoms' | 'options',
    canUseDb?: boolean,
    options: AlphafoldSuperpositionOptions
}

export class AfSuperpositionControls extends PurePluginUIComponent<{ }, AfSuperpositionControlsState> {
    state: AfSuperpositionControlsState = {
        isBusy: false,
        canUseDb: true,
        action: undefined,
        options: DefaultAlphafoldSuperpositionOptions
    };

    componentDidMount() {
        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v });
        });
    }

    get selection() {
        return this.plugin.managers.structure.selection;
    }

    get customState() {
        return this.plugin.customState as any;
    }

    superposeDb = async () => {
        this.setState({ isBusy: true });
        const spData: any = (this.plugin.customState as any).superpositionState;
        spData.alphafold.traceOnly = this.state.options.traceOnly;
        superposeAf(this.plugin, this.state.options.traceOnly);
    };

    toggleOptions = () => this.setState({ action: this.state.action === 'options' ? void 0 : 'options' });
   
    superposeByDbMapping() {
        return <>
            <Button icon={SuperposeChainsSvg} title='Superpose AlphaFold structure using intersection of residues from SIFTS UNIPROT mapping.' className='msp-btn msp-btn-block' onClick={this.superposeDb} style={{ marginTop: '1px', textAlign: 'left' }} disabled={this.state.isBusy}>
                Load AlphaFold structure
            </Button>
        </>;
    }

    private setOptions = (values: AlphafoldSuperpositionOptions) => {
        this.setState({ options: values });
    };

    render() {
        return <>
            <div style={{backgroundColor: '#dce54e', fontWeight: 500, padding: '5px 12px'}}>New Feature!</div>
            <div className='msp-help-text' style={{margin: '2px 0'}}>
                <div className='msp-help-description'><Icon svg={InfoIconSvg} inline />Load and superpose AlphaFold structure against representative chains.</div>
            </div>
            <div className='msp-flex-row'>
                {this.state.canUseDb && this.superposeByDbMapping()}
                <ToggleButton icon={TuneSvg} label='' title='Options' toggle={this.toggleOptions} isSelected={this.state.action === 'options'} disabled={this.state.isBusy} style={{ flex: '0 0 40px', padding: 0 }} />
            </div>
            {this.state.action === 'options' && <div className='msp-control-offset'>
                <ParameterControls params={AlphafoldSuperpositionParams} values={this.state.options} onChangeValues={this.setOptions} isDisabled={this.state.isBusy} />
            </div>}
        </>;

    }
}