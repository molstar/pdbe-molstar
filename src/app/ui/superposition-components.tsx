import { StructureComponentRef, StructureRepresentationRef } from 'Molstar/mol-plugin-state/manager/structure/hierarchy-state';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { State, StateTransformer } from 'Molstar/mol-state';
import { ParamDefinition } from 'Molstar/mol-util/param-definition';
import { CollapsableControls, CollapsableState, PurePluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { Button, IconButton } from 'Molstar/mol-plugin-ui/controls/common';
import { CubeOutlineSvg, VisibilityOffOutlinedSvg, VisibilityOutlinedSvg, MoreHorizSvg, CheckSvg, CloseSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
import { StructureRepresentation3D } from 'Molstar/mol-plugin-state/transforms/representation';
import { debounceTime } from 'rxjs/operators';
import { Subject } from 'rxjs';

interface StructureComponentControlState extends CollapsableState {
    isDisabled: boolean
}

export class SuperpositionComponentControls extends CollapsableControls<{}, StructureComponentControlState> {
    protected defaultState(): StructureComponentControlState {
        return {
            header: 'Components',
            isCollapsed: false,
            isDisabled: false,
            brand: { accent: 'blue', svg: CubeOutlineSvg }
        };
    }

    renderControls() {
        return <>
            <ComponentListControls />
        </>;
    }
}

interface ComponentGroups { nonLigGroups: StructureComponentRef[][], ligGroups: StructureComponentRef[][], carbGroups: StructureComponentRef[][] }

interface ComponentListControlsState {
    segmentWatch: boolean,
    ligSearchText: string,
    carbSearchText: string,
    componentGroups: ComponentGroups,
    ligGroups: StructureComponentRef[][],
    isLigCollapsed: boolean,
    carbGroups: StructureComponentRef[][],
    isCarbCollapsed: boolean,
    isBusy: boolean
};

class ComponentListControls extends PurePluginUIComponent<{}, ComponentListControlsState> {

    state = {
        segmentWatch: false,
        ligSearchText: '',
        carbSearchText: '',
        componentGroups: { nonLigGroups: [], ligGroups: [], carbGroups: [] },
        ligGroups: [],
        isLigCollapsed: false,
        carbGroups: [],
        isCarbCollapsed: false,
        isBusy: false
    }

    private ligInputStream = new Subject();
    private handleLigInputStream = (inputStr: string) => {
        this.setState({ligSearchText: inputStr});
        const filteredRes = this.state.componentGroups.ligGroups.filter( (g: StructureComponentRef[]) => {
            const gKeys = g[0].key!.split(',');
            const cId1Arr = gKeys[0].split('-');
            return cId1Arr[2].toLowerCase().indexOf(inputStr.toLowerCase()) >= 0;
        });
        this.setState({ ligGroups: filteredRes });
    }

    private carbInputStream = new Subject();
    private handleCarbInputStream = (inputStr: string) => {
        this.setState({carbSearchText: inputStr});
        const filteredRes = this.state.componentGroups.carbGroups.filter( (g: StructureComponentRef[]) => {
            const gKeys = g[0].key!.split(',');
            const cId1Arr = gKeys[0].split('-');
            cId1Arr.splice(0, 2);
            cId1Arr.pop();
            return cId1Arr.join('-').toLowerCase().indexOf(inputStr.toLowerCase()) >= 0;
        });
        this.setState({ carbGroups: filteredRes });
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, () => {
            this.categoriseGroups();
            this.forceUpdate();
        });
        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v });
        });
    }

    componentDidUpdate() {
        const customState: any = this.plugin.customState;
        if(customState.events && !this.state.segmentWatch) {
            this.setState({ segmentWatch: true });
            this.subscribe(customState.events.segmentUpdate, () => {
                this.categoriseGroups();
                this.forceUpdate();
            });
        }
        this.subscribe(this.ligInputStream.pipe(debounceTime(1000 / 24)), (e: any) => this.handleLigInputStream(e));
        this.subscribe(this.carbInputStream.pipe(debounceTime(1000 / 24)), (e: any) => this.handleCarbInputStream(e));
    }

    categoriseGroups() {
        let componentGroupsVal: ComponentGroups = { nonLigGroups: [], ligGroups: [], carbGroups: []};
        const componentGroups = this.plugin.managers.structure.hierarchy.currentComponentGroups;
        const customState: any = this.plugin.customState;
        componentGroups.forEach( (g: StructureComponentRef[]) => {
            let isLigandView = false;
            if(customState.initParams && customState.initParams.superpositionParams &&  customState.initParams.superpositionParams.ligandView) {
                isLigandView = true;
            }

            if(isLigandView) {
                const gKeys = g[0].key!.split(',');
                const cId1Arr = gKeys[0].split('-');
                if(gKeys.indexOf('superposition-focus-surr-sel') === -1) {
                    if(cId1Arr[cId1Arr.length - 1] !== (customState.superpositionState.activeSegment - 1) + '') return;
                    if(gKeys.indexOf('superposition-ligand-sel') >= 0) {
                        componentGroupsVal.ligGroups.push(g);
                    } else if(gKeys.indexOf('superposition-carb-sel') >= 0) {
                        componentGroupsVal.carbGroups.push(g);
                    } else {
                        componentGroupsVal.nonLigGroups.push(g);
                    }
                } else {
                    componentGroupsVal.nonLigGroups.push(g);
                }
            }else{
                const gKeys = g[0].key!.split(',');
                if(gKeys.indexOf('superposition-focus-surr-sel') >= 0 || gKeys.indexOf(`Chain-${customState.superpositionState.activeSegment - 1}`) >= 0) {
                    componentGroupsVal.nonLigGroups.push(g);
                }
            }
        });
        this.setState({ componentGroups: componentGroupsVal, ligGroups: componentGroupsVal.ligGroups, carbGroups: componentGroupsVal.carbGroups, ligSearchText: '', carbSearchText: '' });
    }

    toggleVisible = (e: React.MouseEvent<HTMLElement>, action: 'hide'|'show', type: 'ligands'|'carbohydrates') => {
        e.preventDefault();
        e.currentTarget.blur();

        const customState: any = this.plugin.customState;
        customState.events.isBusy.next(true);

        const visualEntites = (type === 'ligands') ? this.state.ligGroups : this.state.carbGroups;

        setTimeout( async() => {
            for await (const visualEntity of visualEntites) {
                this.plugin.managers.structure.hierarchy.toggleVisibility(visualEntity, action);
            };
            customState.events.isBusy.next(false);
        });

    }

    showHideAllControls = (type: 'ligands'|'carbohydrates') => {
        return <>
            <Button icon={CheckSvg} flex onClick={(e) => this.toggleVisible(e, 'show', type)} style={{ flex: '0 0 50px', textAlign: 'center', fontSize: '80%', color: '#9cacc3', padding: 0 }} title={`Show all ${type}`} disabled={false}>
                All
            </Button>
            <Button icon={CloseSvg} flex onClick={(e) => this.toggleVisible(e, 'hide', type)} style={{ flex: '0 0 50px', textAlign: 'center', fontSize: '80%', color: '#9cacc3', padding: 0 }} title={`Hide all ${type}`} disabled={false}>
                None
            </Button>
        </>
    }

    clearLigSearch = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({ligSearchText: ''});
        this.ligInputStream.next('');
        e.currentTarget.blur();
    }

    clearCarbSearch = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({carbSearchText: ''});
        this.carbInputStream.next('');
        e.currentTarget.blur();
    }

    collapseSection = (e: React.MouseEvent<HTMLElement>, type: 'ligands'|'carbohydrates') => {
        e.preventDefault();
        e.currentTarget.blur();
        if(type === 'ligands') {
            this.setState({ isLigCollapsed: !this.state.isLigCollapsed });
        } else {
            this.setState({ isCarbCollapsed: !this.state.isCarbCollapsed });
        }
    }

    sectionHeader = (type: 'ligands'|'carbohydrates') => {
        const showHideAllControls = (type === 'ligands') ? this.showHideAllControls('ligands') : this.showHideAllControls('carbohydrates');
        const title = (type === 'ligands') ? 'Ligand' : 'Carbohydrates';
        const visibleVisuals = (type === 'ligands') ? this.state.ligGroups.length : this.state.carbGroups.length;
        const totalVisuals = (type === 'ligands') ? this.state.componentGroups.ligGroups.length : this.state.componentGroups.carbGroups.length;
        return <div className='msp-flex-row'style={{ marginTop: '6px' }}>
            <button className='msp-form-control msp-control-button-label msp-transform-header-brand-gray' style={{ textAlign: 'left' }} onClick={(e) => this.collapseSection(e, type)}>
                <span><strong>{title}</strong></span>
                <small style={{ color: '#7d91b0' }}> ( {visibleVisuals}{visibleVisuals < totalVisuals ? ` / ${totalVisuals}` : ''} )</small>
            </button>
            { visibleVisuals > 1 && showHideAllControls }
        </div>
    }

    

    render() {

        const ligSearchControls = <div className='msp-mapped-parameter-group' style={{fontSize: '90%'}}>
            <div className='msp-control-row msp-transform-header-brand-gray' style={{height: '33px'}}>
                <span className='msp-control-row-label'>Search Ligand</span>
                <div className='msp-control-row-ctrl'>
                    <input type='text' placeholder='Enter HET code' disabled={this.state.isBusy} onChange={e => this.ligInputStream.next(e.target.value)} value={this.state.ligSearchText} maxLength={3} />
                </div>
            </div>
            <IconButton svg={CloseSvg} flex onClick={this.clearLigSearch} style={{ flex: '0 0 24px', padding: 0 }} disabled={this.state.ligSearchText === '' || this.state.isBusy} toggleState={this.state.ligSearchText !== ''} title='Clear search input'></IconButton>
        </div>;

        const carbSearchControls = <div className='msp-mapped-parameter-group' style={{fontSize: '90%'}}>
        <div className='msp-control-row msp-transform-header-brand-gray' style={{height: '33px'}}>
            <span className='msp-control-row-label'>Search Carbohydrate</span>
            <div className='msp-control-row-ctrl'>
                <input type='text' placeholder='Enter HET code' disabled={this.state.isBusy} onChange={e => this.carbInputStream.next(e.target.value)} value={this.state.carbSearchText} maxLength={3} />
            </div>
        </div>
        <IconButton svg={CloseSvg} flex onClick={this.clearCarbSearch} style={{ flex: '0 0 24px', padding: 0 }} disabled={this.state.carbSearchText === '' || this.state.isBusy} toggleState={this.state.carbSearchText !== ''} title='Clear search input'></IconButton>
        </div>;

        const ligSectionHeader = this.sectionHeader('ligands');
        const carbSectionHeader = this.sectionHeader('carbohydrates');

        return <>
            {(this.state.componentGroups.nonLigGroups.length > 0 ) && <div>
                {this.state.componentGroups.nonLigGroups.map((g: any) => <StructureComponentGroup key={g[0].cell.transform.ref} group={g} boldHeader={true} />)}
            </div>}
            {(this.state.componentGroups.ligGroups.length > 0 ) && ligSectionHeader }
            {(!this.state.isLigCollapsed && this.state.componentGroups.ligGroups.length > 5) && ligSearchControls}
            {(this.state.componentGroups.ligGroups.length > 0 ) && <div className='msp-control-offset' style={{ maxHeight: '800px', overflowY: 'auto' }}>
                {!this.state.isLigCollapsed && this.state.ligGroups.map((g: any) => <StructureComponentGroup key={g[0].cell.transform.ref} group={g} boldHeader={false} />)}
            </div>}
            {(this.state.componentGroups.carbGroups.length > 0 ) && carbSectionHeader }
            {(!this.state.isCarbCollapsed && this.state.componentGroups.carbGroups.length > 5) && carbSearchControls}
            {(this.state.componentGroups.carbGroups.length > 0 ) && <div className='msp-control-offset' style={{ maxHeight: '800px', overflowY: 'auto' }}>
                {!this.state.isCarbCollapsed && this.state.carbGroups.map((g: any) => <StructureComponentGroup key={g[0].cell.transform.ref} group={g} boldHeader={false} />)}
            </div>}
        </>;
    }
}

type StructureComponentEntryActions = 'action' | 'label'

class StructureComponentGroup extends PurePluginUIComponent<{ group: StructureComponentRef[], boldHeader?: boolean }, { action?: StructureComponentEntryActions, isHidden: boolean, isBusy: boolean }> {
    state = {
        action: void 0 as StructureComponentEntryActions | undefined,
        isHidden: false,
        isBusy: false
    }

    get pivot() {
        return this.props.group[0];
    }

    checkAllHidden = async () => {
        let allHidden = true;
        for (const c of this.props.group) {
            if (!c.cell.state.isHidden) {
                allHidden = false;
                break;
            }
        }
        if(allHidden) this.setState({ isHidden: true });
    }

    componentDidMount() {
        this.checkAllHidden();
        this.subscribe(this.plugin.state.events.cell.stateUpdated, e => {
            // if (State.ObjectEvent.isCell(e, this.pivot.cell)) this.forceUpdate();
            if(this.pivot.cell.obj?.label === e.cell.obj?.label) {
                if(!e.cell.state.isHidden) {
                    this.setState({ isHidden: false });
                } else {
                    this.checkAllHidden();
                }
            }
        });

        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v });
        });

        this.subscribe((this.plugin.customState as any).events.isBusy, (e: boolean) => {
            this.setState({ isBusy: e });
        });
    }

    toggleVisible = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        this.plugin.managers.structure.component.toggleVisibility(this.props.group);
        this.setState({ isHidden: !this.state.isHidden });
    }

    toggleAction = () => this.setState({ action: this.state.action === 'action' ? void 0 : 'action' });

    highlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        if (!this.props.group[0].cell.parent) return;
        PluginCommands.Interactivity.Object.Highlight(this.plugin, { state: this.props.group[0].cell.parent!, ref: this.props.group.map(c => c.cell.transform.ref) });
    }

    clearHighlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.Interactivity.ClearHighlights(this.plugin);
    }

    focus = () => {
        let allHidden = true;
        for (const c of this.props.group) {
            if (!c.cell.state.isHidden) {
                allHidden = false;
                break;
            }
        }

        if (allHidden) {
            this.plugin.managers.structure.hierarchy.toggleVisibility(this.props.group, 'show');
        }

        this.plugin.managers.camera.focusSpheres(this.props.group, e => {
            if (e.cell.state.isHidden) return;
            return e.cell.obj?.data.boundary.sphere;
        });
    }

    render() {
        const component = this.pivot;
        const cell = component.cell;
        const label = cell.obj?.label;
        const labelEle = this.props.boldHeader ? <strong>{label}</strong> : label;

        return <>
            <div className='msp-flex-row'>
                <Button noOverflow className='msp-control-button-label' title={`${label} - Click to focus.`} onClick={this.focus} style={{ textAlign: 'left' }} disabled={this.state.isBusy}>
                    {labelEle}
                    {/* <small className='msp-25-lower-contrast-text'> ( {this.props.group.length} )</small> */}
                </Button>
                <IconButton disabled={this.state.isBusy} svg={this.state.isHidden ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg} toggleState={false} onClick={this.toggleVisible} title={`${this.state.isHidden ? 'Show' : 'Hide'} component`} small className='msp-form-control' flex />
                <IconButton disabled={this.state.isBusy} svg={MoreHorizSvg} onClick={this.toggleAction} title='Actions' toggleState={this.state.action === 'action'} className='msp-form-control' flex />
            </div>
            {this.state.action === 'action' && <div className='msp-accent-offset'>
                <div style={{ marginBottom: '6px' }}>
                    {component.representations.map(r => <StructureRepresentationEntry group={this.props.group} key={r.cell.transform.ref} representation={r} />)}
                </div>
            </div>}
        </>;
    }
}

class StructureRepresentationEntry extends PurePluginUIComponent<{ group: StructureComponentRef[], representation: StructureRepresentationRef }, { isBusy: boolean, clusterVal?: any }> {

    state = {
        isBusy: false,
        clusterVal: { cluster: 'All' }
    }

    remove = () => this.plugin.managers.structure.component.removeRepresentations(this.props.group, this.props.representation);
    toggleVisible = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        this.plugin.managers.structure.component.toggleVisibility(this.props.group, this.props.representation);
    }

    componentDidMount() {
        this.subscribe(this.plugin.state.events.cell.stateUpdated, e => {
            if (State.ObjectEvent.isCell(e, this.props.representation.cell)) this.forceUpdate();
        });
        this.subscribe(this.plugin.behaviors.state.isBusy, v => {
            this.setState({ isBusy: v });
        });
        this.subscribe((this.plugin.customState as any).events.isBusy, (e: boolean) => {
            this.setState({ isBusy: e });
        });
    }

    updateRepresentations(components: ReadonlyArray<StructureComponentRef>, pivot: StructureRepresentationRef, params: StateTransformer.Params<StructureRepresentation3D>) {

        if (components.length === 0) return Promise.resolve();
        const index = components[0].representations.indexOf(pivot);
        if (index < 0) return Promise.resolve();

        const superpositionState: any = (this.plugin.customState as any).superpositionState;
        let filteredComps: any = [];
        if(this.state.clusterVal.cluster !== 'All') {
            const clusterData = superpositionState.segmentData[superpositionState.activeSegment - 1].clusters[parseInt(this.state.clusterVal.cluster) - 1];

            filteredComps = clusterData.map((s: any) => {
                return `${s.pdb_id}_${s.struct_asym_id}`;
            });

            if(filteredComps.length === 0) return;

        }

        const update = this.plugin.state.data.build();

        for (const c of components) {
            // TODO: is it ok to use just the index here? Could possible lead to ugly edge cases, but perhaps not worth the trouble to "fix".
            const repr = c.representations[index];
            if (!repr) continue;
            if (repr.cell.transform.transformer !== pivot.cell.transform.transformer) continue;

            if(this.state.clusterVal.cluster !== 'All') {
                const rmIndex = filteredComps.indexOf(superpositionState.refMaps[repr.cell.transform.parent]);
                if(rmIndex === -1) continue;
            }

            const updatedParams = {
                type: params.type ? params.type : repr.cell.params?.values.type,
                colorTheme: params.colorTheme ? params.colorTheme : repr.cell.params?.values.colorTheme,
                sizeTheme: params.sizeTheme ? params.sizeTheme : repr.cell.params?.values.sizeTheme
            };

            update.to(repr.cell).update(updatedParams);
        }

        return update.commit({ canUndo: 'Update Representation' });
    }

    update = (params: any) => {
        return this.updateRepresentations(this.props.group, this.props.representation, params);
    }

    selectCluster = (params: any) => {
        this.setState({ clusterVal: { cluster: params.cluster }});
    }

    render() {
        const repr = this.props.representation.cell;

        const superpositionState: any = (this.plugin.customState as any).superpositionState;
        let clusterSelectArr: any = [['All', 'All']];
        superpositionState.segmentData[superpositionState.activeSegment - 1].clusters.forEach((c: any, i: number) => {
            clusterSelectArr.push([(i + 1 ) + '', (i + 1 ) + '']);
        });
        const clusterOptions = {
            cluster: ParamDefinition.Select('All', clusterSelectArr, { label: 'Select Cluster'})
        };

        let isSurrVisual = false;
        if(repr && repr.obj) {
            const reprObj: any = repr.obj;
            if(reprObj.tags && reprObj.tags.indexOf('superposition-focus-surr-repr') >= 0) isSurrVisual = true;
        }

        return <div className='msp-representation-entry'>
            { repr.parent && <div>
                { (clusterSelectArr.length > 2 && !isSurrVisual) && <div className='msp-representation-entry'>
                    <ParameterControls params={clusterOptions} values={this.state.clusterVal} onChangeValues={this.selectCluster} isDisabled={this.state.isBusy} />
                </div>}
                <div className='msp-representation-entry'>
                    <ParameterControls params={{ type: repr.params?.definition.type } as any} values={{ type: repr.params?.values.type }} onChangeValues={this.update} isDisabled={this.state.isBusy} />
                </div>
                <div className='msp-representation-entry'>
                    <ParameterControls params={{ colorTheme: repr.params?.definition.colorTheme } as any} values={{ colorTheme: repr.params?.values.colorTheme }} onChangeValues={this.update} isDisabled={this.state.isBusy} />
                </div>
                <div className='msp-representation-entry'>
                    <ParameterControls params={{sizeTheme: repr.params?.definition.sizeTheme} as any} values={{ sizeTheme: repr.params?.values.sizeTheme }} onChangeValues={this.update} isDisabled={this.state.isBusy} />
                </div>
            </div>}
        </div>;
    }
}