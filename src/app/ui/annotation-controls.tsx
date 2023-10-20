import { IconButton, Button } from 'Molstar/mol-plugin-ui/controls/common';
import { PurePluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { StructureQualityReportColorThemeProvider } from 'Molstar/extensions/pdbe/structure-quality-report/color';
import { StateSelection, StateTransform } from 'Molstar/mol-state';
import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
import { DomainAnnotationsColorThemeProvider } from '../domain-annotations/color';
import { PDBeStructureQualityReport } from 'Molstar/extensions/pdbe/structure-quality-report/behavior';
import { PDBeDomainAnnotations } from '../domain-annotations/behavior';
import { Icon, ArrowRightSvg, ArrowDropDownSvg, VisibilityOffOutlinedSvg, VisibilityOutlinedSvg, MoreHorizSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { StructureHierarchyManager } from 'Molstar/mol-plugin-state/manager/structure/hierarchy';
import { InitParams } from '../spec';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { AssemblySymmetryProvider } from 'molstar/lib/extensions/rcsb/assembly-symmetry/prop';
import { AnnotationRowControls } from './annotation-row-controls';

const _TextsmsOutlined = <svg width='24px' height='24px' viewBox='0 0 24 24'><path fill="none" d="M0 0h24v24H0V0z" /><g><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" /><path d="M7 9h2v2H7zM11 9h2v2h-2zM15 9h2v2h-2z" /></g></svg>;
export function TextsmsOutlinedSvg() { return _TextsmsOutlined; }

type AnnotationType = 'validation' | 'domains' | 'symmetry'

interface AnnotationsComponentControlsState {
    isCollapsed: boolean,
    validationApplied: boolean,
    validationOptions: boolean,
    validationParams: any,
    domainsApplied: boolean,
    domainsOptions: boolean,
    domainsParams: any,
    symmetryApplied: boolean,
    symmetryOptions: boolean,
    symmetryParams: any,
    description?: string,
}
interface SymmetryParams { } // TODO fill


export class AnnotationsComponentControls extends PurePluginUIComponent<{}, AnnotationsComponentControlsState> {

    state: AnnotationsComponentControlsState = {
        isCollapsed: false,
        validationApplied: false,
        validationOptions: false,
        validationParams: undefined,
        domainsApplied: false,
        domainsOptions: false,
        domainsParams: undefined,
        symmetryApplied: false,
        symmetryOptions: false,
        symmetryParams: undefined,
    };

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            this.initOptionParams();
            this.forceUpdate();
        });
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, c => this.setState({
            description: StructureHierarchyManager.getSelectedStructuresDescription(this.plugin)
        }));
    }

    initOptionParams = () => {
        const initParams: InitParams | undefined = (this.plugin.customState as any)?.initParams; // TODO define getters/setters for manipulating custom state?
        const validationAnnotationCtrl = !!initParams?.validationAnnotation;
        const domainAnnotationCtrl = !!initParams?.domainAnnotation;
        const symmetryAnnotationCtrl = !!initParams?.symmetryAnnotation;

        if ((validationAnnotationCtrl && !this.state.validationParams)
            || (domainAnnotationCtrl && !this.state.domainsParams)
            || (symmetryAnnotationCtrl && !this.state.symmetryParams)) {

            const structure = this.getStructure()?.data;
            if (structure) {
                const themeDataCtx = { structure };

                if (validationAnnotationCtrl && !this.state.validationParams) {
                    const validationActionsParams = StructureQualityReportColorThemeProvider.getParams(themeDataCtx);
                    if (validationActionsParams) {
                        this.setState({
                            validationParams: {
                                params: validationActionsParams,
                                values: { type: validationActionsParams.type.defaultValue }
                            }
                        });
                    }
                }

                if (domainAnnotationCtrl && !this.state.domainsParams) {
                    const domainActionsParams = DomainAnnotationsColorThemeProvider.getParams(themeDataCtx);
                    if (domainActionsParams) {
                        this.setState({
                            domainsParams: {
                                params: domainActionsParams,
                                values: { type: domainActionsParams.type.defaultValue }
                            }
                        });
                    }
                }

                if (symmetryAnnotationCtrl && !this.state.symmetryParams) {
                    const symmetryActionsParams = PD.clone(structure ? AssemblySymmetryProvider.getParams(structure) : AssemblySymmetryProvider.defaultParams);
                    if ((symmetryActionsParams as any).serverType) { // TODO remove this condition and "as any" once we have newer Mol* version
                        (symmetryActionsParams as any).serverType.isHidden = true;
                    }
                    symmetryActionsParams.serverUrl.isHidden = true;
                    PD.getDefaultValues(symmetryActionsParams);
                    console.log('params', symmetryActionsParams)
                    this.setState({
                        symmetryParams: {
                            params: symmetryActionsParams,
                            values: PD.getDefaultValues(symmetryActionsParams),
                        }
                    });
                    // TODO symmetry
                }
            }
        }
    }
    getStructure = () => {
        const groupRef = StateSelection.findTagInSubtree(this.plugin.state.data.tree, StateTransform.RootRef, 'structure-component-static-polymer');
        return groupRef ? this.plugin.state.data.select(groupRef)[0].obj : undefined;
    }

    toggleCollapsed = () => {
        this.setState({ isCollapsed: !this.state.isCollapsed });
    }

    toggleOptions = (type: AnnotationType) => {
        if (type === 'validation') this.setState({ validationOptions: !this.state.validationOptions });
        if (type === 'domains') this.setState({ domainsOptions: !this.state.domainsOptions });
        if (type === 'symmetry') this.setState({ symmetryOptions: !this.state.symmetryOptions });
    }

    applyAnnotation = (type: 'validation' | 'domains', visibleState: boolean, params?: any) => {
        // Defaults
        let themeName: any = 'polymer-id';
        let themePropsToAdd = PDBeStructureQualityReport;
        let themePropsToRemove = this.state.domainsParams ? PDBeDomainAnnotations : void 0;

        // Set Theme Params
        if (type === 'validation') {
            if (visibleState) {
                themeName = 'pdbe-structure-quality-report';
            }
            this.setState({ validationApplied: visibleState });
            this.setState({ domainsApplied: false });
        } else if (type === 'domains') {
            themePropsToAdd = PDBeDomainAnnotations;
            themePropsToRemove = this.state.validationParams ? PDBeStructureQualityReport : void 0;
            if (visibleState) themeName = 'pdbe-domain-annotations';
            this.setState({ domainsApplied: visibleState });
            this.setState({ validationApplied: false });
        }

        // Update Tooltip
        if (visibleState && themeName !== 'polymer-id') {
            const addTooltipUpdate = this.plugin.state.behaviors.build().to(themePropsToAdd.id).update(themePropsToAdd, (old: any) => { old.showTooltip = true; });
            this.plugin.runTask(this.plugin.state.behaviors.updateTree(addTooltipUpdate));

            if (themePropsToRemove) {
                const removeTooltipUpdate = this.plugin.state.behaviors.build().to(themePropsToRemove.id).update(themePropsToRemove, (old: any) => { old.showTooltip = false; });
                this.plugin.runTask(this.plugin.state.behaviors.updateTree(removeTooltipUpdate));
            }
        }

        let polymerGroup: any;
        const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
        componentGroups.forEach((compGrp) => {
            if (compGrp[0].key === 'structure-component-static-polymer') polymerGroup = compGrp;
        });
        if (polymerGroup) {
            this.plugin.managers.structure.component.updateRepresentationsTheme(polymerGroup, { color: themeName, colorParams: params ? params : void 0 });
        }
    }

    applySymmetry(visibleState: boolean, params: SymmetryParams) {
        this.setState({ symmetryApplied: visibleState });
    }

    toggleAnnotation = (type: AnnotationType) => {
        if (type === 'validation') this.applyAnnotation('validation', !this.state.validationApplied, this.state.validationParams.values);
        if (type === 'domains') this.applyAnnotation('domains', !this.state.domainsApplied, this.state.domainsParams.values);
        if (type === 'symmetry') this.applySymmetry(!this.state.symmetryApplied, this.state.symmetryParams.values);
    };

    updateValidationParams = (val: any) => {
        const updatedParams = { ...this.state.validationParams };
        updatedParams.values = val;
        this.setState({ validationParams: updatedParams });
        if (this.state.validationApplied) this.applyAnnotation('validation', this.state.validationApplied, val);
    }
    updateDomainParams = (val: any) => {
        const updatedParams = { ...this.state.domainsParams };
        updatedParams.values = val;
        this.setState({ domainsParams: updatedParams });
        if (this.state.domainsApplied) this.applyAnnotation('domains', this.state.domainsApplied, val);
    }
    updateSymmetryParams = (val: any) => {
        const updatedParams = { ...this.state.symmetryParams };
        updatedParams.values = val;
        this.setState({ symmetryParams: updatedParams });
        if (this.state.symmetryApplied) this.applySymmetry(this.state.symmetryApplied, val);
    }

    render() {
        console.log('state:', this.state)
        if (!this.state.validationParams && !this.state.domainsParams) return <></>;

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

            {!this.state.isCollapsed && <>
                <AnnotationRowControls title='Validation'
                    params={this.state.validationParams?.params} values={this.state.validationParams?.values} onChangeValues={this.updateValidationParams}
                    applied={this.state.validationApplied} onChangeApplied={() => this.toggleAnnotation('validation')} />
                <AnnotationRowControls title='Domain Annotations' shortTitle='Domains'
                    params={this.state.domainsParams?.params} values={this.state.domainsParams?.values} onChangeValues={this.updateDomainParams}
                    applied={this.state.domainsApplied} onChangeApplied={() => this.toggleAnnotation('domains')} />
                <AnnotationRowControls title='Assembly Symmetry'
                    params={this.state.symmetryParams?.params} values={this.state.symmetryParams?.values} onChangeValues={this.updateSymmetryParams} />
            </>}

            {/* <div style={{ height: 10 }}></div>
            {!this.state.isCollapsed && this.state.validationParams &&
                <div className='msp-flex-row'>
                    <Button noOverflow className='msp-control-button-label' title={`Validation Report Annotations.`} style={{ textAlign: 'left' }}>
                        Validation Report
                    </Button>
                    <IconButton onClick={() => this.toggleAnnotation('validation')} toggleState={false} svg={!this.state.validationApplied ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg} title={`Click to ${this.state.validationApplied ? 'Hide' : 'Show'} Validation Report Annotation`} small className='msp-form-control' flex />
                    <IconButton onClick={() => this.toggleOptions('validation')} svg={MoreHorizSvg} title='Actions' toggleState={this.state.validationOptions} className='msp-form-control' flex />
                </div>
            }
            {!this.state.isCollapsed && this.state.validationParams && this.state.validationOptions &&
                <div style={{ marginBottom: '6px' }}>
                    <div className="msp-accent-offset">
                        <div className='msp-representation-entry'>
                            <ParameterControls params={this.state.validationParams.params} values={this.state.validationParams.values} onChangeValues={this.updateValidationParams} />
                        </div>
                    </div>
                </div>
            }

            {!this.state.isCollapsed && this.state.domainsParams &&
                <div className='msp-flex-row'>
                    <Button noOverflow className='msp-control-button-label' title={`Domain Annotations.`} style={{ textAlign: 'left' }}>
                        Domains
                    </Button>
                    <IconButton onClick={() => this.toggleAnnotation('domains')} toggleState={false} svg={!this.state.domainsApplied ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg} title={`Click to ${this.state.domainsApplied ? 'Hide' : 'Show'} Domain Annotation`} small className='msp-form-control' flex />
                    <IconButton onClick={() => this.toggleOptions('domains')} svg={MoreHorizSvg} title='Actions' toggleState={this.state.domainsOptions} className='msp-form-control' flex />

                </div>
            }
            {!this.state.isCollapsed && this.state.domainsParams && this.state.domainsOptions &&
                <div style={{ marginBottom: '6px' }}>
                    <div className="msp-accent-offset">
                        <div className='msp-representation-entry'>
                            <ParameterControls params={this.state.domainsParams.params} values={this.state.domainsParams.values} onChangeValues={this.updateDomainParams} />
                        </div>
                    </div>
                </div>
            }

            {!this.state.isCollapsed && this.state.symmetryParams &&
                <div className='msp-flex-row'>
                    <Button noOverflow className='msp-control-button-label' title={`Assembly Symmetry.`} style={{ textAlign: 'left' }}>
                        Assembly Symmetry
                    </Button>
                    <IconButton onClick={() => this.toggleAnnotation('symmetry')} toggleState={false} svg={!this.state.symmetryApplied ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg} title={`Click to ${this.state.symmetryApplied ? 'Hide' : 'Show'} Assembly Symmetry`} small className='msp-form-control' flex />
                    <IconButton onClick={() => this.toggleOptions('symmetry')} svg={MoreHorizSvg} title='Actions' toggleState={this.state.symmetryOptions} className='msp-form-control' flex />

                </div>
            }
            {!this.state.isCollapsed && this.state.symmetryParams && this.state.symmetryOptions &&
                <div style={{ marginBottom: '6px' }}>
                    <div className="msp-accent-offset">
                        <div className='msp-representation-entry'>
                            {this.state.symmetryApplied &&
                                <ParameterControls params={this.state.symmetryParams.params} values={this.state.symmetryParams.values} onChangeValues={this.updateSymmetryParams} />
                                || <div className='msp-row-text'>
                                    <div title='You must enable Assembly Symmetry before setting parameters'>Off</div>
                                </div>
                            }
                        </div>
                    </div>
                </div>

            } */}
        </div>;
    }
}