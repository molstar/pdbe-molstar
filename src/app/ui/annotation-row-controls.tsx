import { Button, IconButton } from 'molstar/lib/mol-plugin-ui/controls/common';
import { MoreHorizSvg, VisibilityOffOutlinedSvg, VisibilityOutlinedSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { ParameterControls, ParameterControlsProps } from 'molstar/lib/mol-plugin-ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import React from 'react';


type AnnotationRowControlsProps<P extends PD.Params> = ParameterControlsProps<P> & {
    shortTitle?: string,
    title: string,
    applied?: boolean,
    onChangeApplied?: (applied: boolean) => void,
}

type AnnotationRowControlsState = {
    applied: boolean,
    optionsExpanded: boolean,
}


/** UI controls for a single annotation source (row) in Annotations section */
export class AnnotationRowControls<P extends PD.Params> extends React.PureComponent<AnnotationRowControlsProps<P>, AnnotationRowControlsState> {
    state = { applied: false, optionsExpanded: false };

    // componentDidMount() {
    //     this.subscribe(this.plugin.state.events.cell.stateUpdated, e => {
    //         if (State.ObjectEvent.isCell(e, this.pivot.cell)) this.forceUpdate();
    //     });
    // }

    isApplied() {
        return this.props.applied ?? this.state.applied;
    }

    toggleApplied(applied?: boolean) {
        const newState = applied ?? !this.isApplied();
        if (this.props.applied === undefined) {
            this.setState({ applied: newState });
        }
        this.props.onChangeApplied?.(newState);
    }

    toggleOptions() {
        this.setState(s => ({ optionsExpanded: !s.optionsExpanded }));
    }

    render() {
        if (!this.props.params) return null;
        return <>
            <div className='msp-flex-row'>
                <Button noOverflow className='msp-control-button-label' title={this.props.title} style={{ textAlign: 'left' }}>
                    {this.props.shortTitle ?? this.props.title}
                </Button>
                <IconButton onClick={() => this.toggleApplied()} toggleState={false}
                    svg={!this.isApplied() ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg}
                    title={`Click to ${this.isApplied() ? 'hide' : 'show'} ${this.props.title}`} small className='msp-form-control' flex />
                <IconButton onClick={() => this.toggleOptions()} svg={MoreHorizSvg} title='Options' toggleState={this.state.optionsExpanded} className='msp-form-control' flex />
            </div>
            {this.state.optionsExpanded &&
                <div style={{ marginBottom: '6px' }}>
                    <div className="msp-accent-offset">
                        <div className='msp-representation-entry'>
                            {this.renderOptions()}
                        </div>
                    </div>
                </div>
            }
        </>;
    }

    renderOptions() {
        return <ParameterControls params={this.props.params} onChange={this.props.onChange} values={this.props.values} onChangeValues={this.props.onChangeValues} onEnter={this.props.onEnter} />;
    }
}