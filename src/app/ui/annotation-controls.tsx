import { PDBeStructureQualityReport } from 'molstar/lib/extensions/pdbe/structure-quality-report/behavior';
import { StructureQualityReportColorThemeParams, StructureQualityReportColorThemeProvider } from 'molstar/lib/extensions/pdbe/structure-quality-report/color';
import { StructureQualityReportProvider } from 'molstar/lib/extensions/pdbe/structure-quality-report/prop';
import { Structure } from 'molstar/lib/mol-model/structure';
import { StructureHierarchyManager } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy';
import { StructureComponentRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PurePluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { Button } from 'molstar/lib/mol-plugin-ui/controls/common';
import { ArrowDropDownSvg, ArrowRightSvg, Icon } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { StateObject, StateSelection, StateTransform } from 'molstar/lib/mol-state';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { PDBeDomainAnnotations } from '../domain-annotations/behavior';
import { DomainAnnotationsColorThemeParams, DomainAnnotationsColorThemeProps, DomainAnnotationsColorThemeProvider } from '../domain-annotations/color';
import { DomainAnnotationsProvider } from '../domain-annotations/prop';
import { PluginCustomState } from '../plugin-custom-state';
import { AnnotationRowControls } from './annotation-row-controls';
import { TextsmsOutlinedSvg } from './icons';
import { SymmetryAnnotationControls, isAssemblySymmetryAnnotationApplicable } from './symmetry-annotation-controls';


type AnnotationType = 'validation' | 'domains' | 'symmetry';

type StructureQualityReportColorThemeParams = typeof StructureQualityReportColorThemeParams;
type StructureQualityReportColorThemeProps = PD.Values<StructureQualityReportColorThemeParams>;

interface AnnotationsComponentControlsState {
    isCollapsed: boolean,
    validationApplied: boolean,
    validationParams?: {
        params: StructureQualityReportColorThemeParams,
        values: StructureQualityReportColorThemeProps,
    },
    domainsApplied: boolean,
    domainsParams?: {
        params: DomainAnnotationsColorThemeParams,
        values: DomainAnnotationsColorThemeProps,
    },
    showSymmetryAnnotation: boolean,
    description?: string,
}

export class AnnotationsComponentControls extends PurePluginUIComponent<{}, AnnotationsComponentControlsState> {
    state: AnnotationsComponentControlsState = {
        isCollapsed: false,
        validationApplied: false,
        validationParams: undefined,
        domainsApplied: false,
        domainsParams: undefined,
        showSymmetryAnnotation: false,
    };

    componentDidMount() {
        const initParams = PluginCustomState(this.plugin).initParams;
        if (!initParams?.validationAnnotation && !initParams?.domainAnnotation && !initParams?.symmetryAnnotation) return;

        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            this.initOptionParams();
            this.setState({ description: StructureHierarchyManager.getSelectedStructuresDescription(this.plugin) });
        });
    }

    initOptionParams = () => {
        const initParams = PluginCustomState(this.plugin).initParams;
        const validationAnnotationCtrl = !!initParams?.validationAnnotation;
        const domainAnnotationCtrl = !!initParams?.domainAnnotation;
        const symmetryAnnotationCtrl = !!initParams?.symmetryAnnotation && isAssemblySymmetryAnnotationApplicable(this.plugin);
        this.setState({ showSymmetryAnnotation: symmetryAnnotationCtrl });

        const structure = this.getStructure()?.data;
        if (!structure) return;

        const themeDataCtx = { structure };

        if (validationAnnotationCtrl) {
            const validationActionsParams = StructureQualityReportColorThemeProvider.getParams(themeDataCtx);
            this.setState(old => ({
                validationParams: {
                    params: validationActionsParams,
                    values: old.validationParams?.values ?? PD.getDefaultValues(validationActionsParams),
                },
            })); // TODO maybe try way to skip render on non-changed params?
        }

        if (domainAnnotationCtrl) {
            const domainActionsParams = DomainAnnotationsColorThemeProvider.getParams(themeDataCtx);
            let updateProps: DomainAnnotationsColorThemeProps; // this is to force props to change once custom property has been loaded and params have changed
            this.setState(old => {
                if (old.domainsParams && old.domainsParams.params.source.defaultValue.name !== domainActionsParams.source.defaultValue.name) {
                    updateProps = PD.getDefaultValues(domainActionsParams);
                }
                return {
                    domainsParams: {
                        params: domainActionsParams,
                        values: old.domainsParams?.values ?? PD.getDefaultValues(domainActionsParams),
                    },
                };
            }, () => { if (updateProps) this.updateDomainParams(updateProps); });
        }
    };

    getStructure = () => {
        const groupRef = StateSelection.findTagInSubtree(this.plugin.state.data.tree, StateTransform.RootRef, 'structure-component-static-polymer');
        return groupRef ? this.plugin.state.data.select(groupRef)[0]?.obj as StateObject<Structure> : undefined;
    };

    toggleCollapsed = () => {
        this.setState({ isCollapsed: !this.state.isCollapsed });
    };

    applyAnnotation = (type: 'validation' | 'domains', visibleState: boolean, params?: StructureQualityReportColorThemeProps | DomainAnnotationsColorThemeProps) => {
        // Defaults
        let themeName = 'chain-id';
        let themePropsToAdd = PDBeStructureQualityReport;
        let themePropsToRemove = this.state.domainsParams ? PDBeDomainAnnotations : undefined;

        // Set Theme Params
        if (type === 'validation') {
            if (visibleState) themeName = StructureQualityReportColorThemeProvider.name;
            this.setState({ validationApplied: visibleState });
            this.setState({ domainsApplied: false });
        } else if (type === 'domains') {
            themePropsToAdd = PDBeDomainAnnotations;
            themePropsToRemove = this.state.validationParams ? PDBeStructureQualityReport : undefined;
            if (visibleState) themeName = DomainAnnotationsColorThemeProvider.name;
            this.setState({ domainsApplied: visibleState });
            this.setState({ validationApplied: false });
        }

        // Update Tooltip
        if (visibleState && themeName !== 'chain-id') {
            const addTooltipUpdate = this.plugin.state.behaviors.build().to(themePropsToAdd.id).update(themePropsToAdd, (old: any) => { old.showTooltip = true; });
            this.plugin.runTask(this.plugin.state.behaviors.updateTree(addTooltipUpdate));

            if (themePropsToRemove) {
                const removeTooltipUpdate = this.plugin.state.behaviors.build().to(themePropsToRemove.id).update(themePropsToRemove, (old: any) => { old.showTooltip = false; });
                this.plugin.runTask(this.plugin.state.behaviors.updateTree(removeTooltipUpdate));
            }
        }

        let polymerGroup: StructureComponentRef[] | undefined;
        const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
        componentGroups.forEach(compGrp => {
            if (compGrp[0].key === 'structure-component-static-polymer') polymerGroup = compGrp;
        });
        if (polymerGroup) {
            this.plugin.managers.structure.component.updateRepresentationsTheme(polymerGroup, { color: themeName as any, colorParams: params });
        }
    };

    toggleAnnotation = (type: AnnotationType) => {
        if (type === 'validation') this.applyAnnotation('validation', !this.state.validationApplied, this.state.validationParams?.values);
        if (type === 'domains') this.applyAnnotation('domains', !this.state.domainsApplied, this.state.domainsParams?.values);
    };

    updateValidationParams = (values: StructureQualityReportColorThemeProps) => {
        if (!this.state.validationParams) return;
        const updatedParams = { ...this.state.validationParams };
        updatedParams.values = values;
        this.setState({ validationParams: updatedParams });
        if (this.state.validationApplied) this.applyAnnotation('validation', this.state.validationApplied, values);
    };
    updateDomainParams = (values?: DomainAnnotationsColorThemeProps) => {
        if (!this.state.domainsParams) return;
        if (values) {
            const updatedParams = { ...this.state.domainsParams, values };
            this.setState({ domainsParams: updatedParams });
        } else {
            values = this.state.domainsParams.values;
        }
        if (this.state.domainsApplied) this.applyAnnotation('domains', this.state.domainsApplied, values);
    };

    render() {
        if (!this.state.validationParams && !this.state.domainsParams && !this.state.showSymmetryAnnotation) return <></>;

        const brand = { accent: 'green', svg: TextsmsOutlinedSvg };

        const wrapClass = this.state.isCollapsed
            ? 'msp-transform-wrapper msp-transform-wrapper-collapsed'
            : 'msp-transform-wrapper';

        const validationDataReady = this.getStructure()?.data.model.customProperties.has(StructureQualityReportProvider.descriptor);
        const domainDataReady = this.getStructure()?.data.model.customProperties.has(DomainAnnotationsProvider.descriptor);

        return <div className={wrapClass}>
            <div className='msp-transform-header'>
                <Button icon={brand ? undefined : this.state.isCollapsed ? ArrowRightSvg : ArrowDropDownSvg} noOverflow onClick={this.toggleCollapsed}
                    className={brand ? `msp-transform-header-brand msp-transform-header-brand-${brand.accent}` : undefined} title={`Click to ${this.state.isCollapsed ? 'expand' : 'collapse'}`}>
                    <Icon svg={brand?.svg} inline />
                    Annotations
                    <small style={{ margin: '0 6px' }}>{this.state.isCollapsed ? '' : this.state.description}</small>
                </Button>
            </div>

            {!this.state.isCollapsed && <>
                {this.state.validationParams &&
                    <AnnotationRowControls title='Validation'
                        params={this.state.validationParams.params} values={this.state.validationParams.values} onChangeValues={this.updateValidationParams}
                        applied={this.state.validationApplied} onChangeApplied={() => this.toggleAnnotation('validation')}
                        errorMessage={validationDataReady ? undefined : 'First activate annotation to show options'} />
                }
                {this.state.domainsParams &&
                    <AnnotationRowControls title='Domain Annotations' shortTitle='Domains'
                        params={this.state.domainsParams.params} values={this.state.domainsParams.values} onChangeValues={this.updateDomainParams}
                        applied={this.state.domainsApplied} onChangeApplied={() => this.toggleAnnotation('domains')}
                        errorMessage={domainDataReady ? undefined : 'First activate annotation to show options'} />
                }
                {this.state.showSymmetryAnnotation &&
                    <SymmetryAnnotationControls />
                }
            </>}
        </div>;
    }
}
