import * as React from 'react';
import { IconButton, Button } from 'Molstar/mol-plugin-ui/controls/common';
import { PurePluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { StateSelection, StateTransform } from 'Molstar/mol-state';
import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
import { AfConfidenceScore } from '../af-confidence/behavior';
import { AfConfidenceColorThemeProvider } from '../af-confidence/color';
import { Icon, ArrowRightSvg, ArrowDropDownSvg, VisibilityOffOutlinedSvg, VisibilityOutlinedSvg, MoreHorizSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { StructureHierarchyManager } from 'Molstar/mol-plugin-state/manager/structure/hierarchy';

const _TextsmsOutlined = <svg width='24px' height='24px' viewBox='0 0 24 24'><path fill="none" d="M0 0h24v24H0V0z" /><g><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" /><path d="M7 9h2v2H7zM11 9h2v2h-2zM15 9h2v2h-2z" /></g></svg>;
export function TextsmsOutlinedSvg() { return _TextsmsOutlined; }

export class AFConfidenceComponentControls extends PurePluginUIComponent<{}, { isCollapsed: boolean, annotationApplied: boolean, displayOptions: any, afConfParams: any, description?: string}> {

    state: any = {
        isCollapsed: false,
        annotationApplied: false,
        displayOptions: false
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            this.getOptionParams();
            this.forceUpdate();
        });
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, c => this.setState({
            description: StructureHierarchyManager.getSelectedStructuresDescription(this.plugin)
        }));
    }

    getOptionParams = () => {
        if(!this.state.afConfParams){

            const groupRef = StateSelection.findTagInSubtree(this.plugin.state.data.tree, StateTransform.RootRef, 'structure-component-static-polymer');
            if(groupRef){
                const struct = this.plugin.state.data.select(groupRef)[0].obj;
                if(struct){
                    const themeDataCtx = { structure: struct.data };
                    const actionsParams = AfConfidenceColorThemeProvider.getParams(themeDataCtx);
                    if(actionsParams){
                        this.setState({afConfParams: {
                            params: actionsParams,
                            values: { type: actionsParams.type.defaultValue}
                        }});
                    }
                }
            }

        }
    }

    toggleCollapsed = () => {
        this.setState({ isCollapsed: !this.state.isCollapsed });
    }

    toggleOptions = () => {
        this.setState({ displayOptions: !this.state.displayOptions });
    }

    applyAnnotation = (visibleState: boolean, params?: any) => {
        // Defaults
        let themeName: any = 'polymer-id';
        if(visibleState) {
            themeName = 'af-confidence';
            this.setState({ annotationApplied: true });
        } else {
            this.setState({ annotationApplied: false });
        }
        
        // Update Tooltip
        const tooltipUpdate = this.plugin.state.behaviors.build().to(AfConfidenceScore.id).update(AfConfidenceScore, (old: any) => { old.showTooltip = visibleState ? true : false; });
        this.plugin.runTask(this.plugin.state.behaviors.updateTree(tooltipUpdate));

        let polymerGroup: any;
        const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
        componentGroups.forEach((compGrp) => {
            if(compGrp[0].key === 'structure-component-static-polymer') polymerGroup = compGrp;
        });
        if (polymerGroup){
            this.plugin.managers.structure.component.updateRepresentationsTheme(polymerGroup, {color: themeName, colorParams: params ? params : void 0});
        }
    }

    initApplyAnnotation = () => {
        this.applyAnnotation(!this.state.annotationApplied, this.state.afConfParams.values);
    }

    updateAfConfParams = (val: any) => {
        const updatedParams = {...this.state.afConfParams};
        updatedParams.values = val;
        this.setState({ afConfParams: updatedParams });
        if(this.state.annotationApplied) this.applyAnnotation(this.state.annotationApplied, val);
    }

    render() {

        // if(!this.state.validationParams && !this.state.domainAtnParams) return <></>;

        const brand = {
            accent: 'green',
            svg: TextsmsOutlinedSvg
        };

        const wrapClass = this.state.isCollapsed
            ? 'msp-transform-wrapper msp-transform-wrapper-collapsed'
            : 'msp-transform-wrapper';

        return <div className={wrapClass}>
            <div className='msp-transform-header'>
                <Button icon={brand ? void 0 : this.state.isCollapsed ? ArrowRightSvg : ArrowDropDownSvg} noOverflow onClick={this.toggleCollapsed}
                    className={brand ? `msp-transform-header-brand msp-transform-header-brand-${brand.accent}` : void 0} title={`Click to ${this.state.isCollapsed ? 'expand' : 'collapse'}`}>
                    {/* {brand && <div className={`msp-accent-bg-${brand.accent}`}>{brand.name}</div>} */}
                    <Icon svg={brand?.svg} inline />
                    Annotations
                    <small style={{ margin: '0 6px' }}>{this.state.isCollapsed ? '' : this.state.description}</small>
                </Button>
            </div>
            {!this.state.isCollapsed && 
            <div className='msp-flex-row'>
                <Button noOverflow className='msp-control-button-label' title={`AlphaFold Confidence Score`} style={{ textAlign: 'left' }}>
                    AlphaFold Confidence Score
                </Button>
                <IconButton onClick={() => this.initApplyAnnotation()} toggleState={false} svg={!this.state.annotationApplied ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg}  title={`Click to ${this.state.domainAtnApplied ? 'Hide' : 'Show'} Local Metric Annotation`} small className='msp-form-control' flex />
                <IconButton onClick={() => this.toggleOptions()} svg={MoreHorizSvg} title='Actions' toggleState={this.state.displayOptions} className='msp-form-control' flex />
            </div>
            }
            {!this.state.isCollapsed && this.state.displayOptions && this.state.afConfParams && <div style={{ marginBottom: '6px' }}>
                <div className="msp-accent-offset">
                    <div className='msp-representation-entry'>
                        <ParameterControls params={this.state.afConfParams.params} values={this.state.afConfParams.values} onChangeValues={this.updateAfConfParams} />
                    </div>
                </div>
            </div>}

        </div>;
    }
}