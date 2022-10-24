import * as React from 'react';
import { debounceTime, filter } from 'rxjs/operators';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { State} from 'Molstar/mol-state';
import { PluginUIComponent, PurePluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { Button, IconButton, ExpandGroup, SectionHeader } from 'Molstar/mol-plugin-ui/controls/common';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
import { StateSelection, StateObjectRef } from 'Molstar/mol-state';
import { renderSuperposition } from '../superposition';
import { UpdateTransformControl } from 'Molstar/mol-plugin-ui/state/update-transform';
import { ActionMenu } from 'Molstar/mol-plugin-ui/controls/action-menu';
import { VisibilityOutlinedSvg, VisibilityOffOutlinedSvg, ArrowDropDownSvg, ArrowRightSvg, CheckSvg, CloseSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { StructureComponentRef, StructureRepresentationRef } from 'Molstar/mol-plugin-state/manager/structure/hierarchy-state';
import { ColorLists } from 'Molstar/mol-util/color/lists';
import { Color } from 'Molstar/mol-util/color';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { Subject } from 'rxjs';
import { PluginStateObject } from 'Molstar/mol-plugin-state/objects';
import { Mat4 } from 'Molstar/mol-math/linear-algebra';
import { StateTransforms } from 'Molstar/mol-plugin-state/transforms';
import { superposeAf } from '../superposition'

type Cluster = { pdb_id: string, auth_asym_id: string, struct_asym_id: string, entity_id: number, is_representative: boolean };
type Segment = { segment_start: number, segment_end: number, clusters: Cluster[][], isHetView?: boolean, isBinary?: boolean };
const SuperpositionTag = 'SuperpositionTransform';

export class SegmentTree extends PurePluginUIComponent<{ }, { segment?: any, isBusy: boolean }> {

    componentDidMount() {
        this.subscribe((this.plugin.customState as any).events.superpositionInit, () => {
            const customState = this.customState;
            if(customState && !customState.superpositionError) {
                this.getSegmentParams();
            }
            this.forceUpdate();
        });

        this.subscribe((this.plugin.customState as any).events.isBusy, (e: boolean) => {
            this.setState({ isBusy: e });
            if(e){
                PluginCommands.Toast.Show(this.plugin, {
                    title: 'Process',
                    message: 'Loading / computing large dataset!',
                    key: 'is-busy-toast'
                });
            }else{
                PluginCommands.Toast.Hide(this.plugin, { key: 'is-busy-toast' });
            }
        });

        this.subscribe(this.plugin.behaviors.layout.leftPanelTabName, (e: string) => {
            if(e !== 'segments') return;
            this.getSegmentParams();
            this.forceUpdate();
        });
    }

    get customState() {
        return this.plugin.customState as any;
    }

    getSegmentParams = () => {
        const customState = this.customState;
        if(!customState.superpositionState || !customState.superpositionState.segmentData) return;

        const segmentData: Segment[] = customState.superpositionState.segmentData;

        const segmentArr: [string, string][] = segmentData.map((segment, i: number) => {
            const segmentLabel = `${i + 1} ( ${segment.segment_start} - ${segment.segment_end} )`;
            return [segmentLabel, segmentLabel];
        });

        const segmentOptions = {
            segment: PD.Select('', segmentArr, { label: 'Select Segment', description: 'Select segment to view its clusters below' })
        };

        const segmentIndex = customState.superpositionState.activeSegment - 1;
        this.setState({segment: {
            params: segmentOptions,
            value: { segment: segmentArr[segmentIndex][0] }
        }});
        this.setState({ isBusy: false });

    }

    updateSegment = async (val: any) => {
        if(!this.state.segment) return;
        const customState = this.customState;
        customState.events.isBusy.next(true);

        // Hide pervious segement structures
        this.hideStructures(customState.superpositionState.activeSegment - 1);

        // Set current segment params
        const updatedParams = {...this.state.segment as any};
        updatedParams.value = val;
        this.setState({ segment: updatedParams });

        setTimeout(async () => {
            const updatedSegmentIndex = parseInt(val.segment.split(' ')[0]);
            customState.superpositionState.activeSegment = updatedSegmentIndex;

            // Display current segment visible structures
            await this.displayStructures(customState.superpositionState.activeSegment - 1);
            customState.events.isBusy.next(false);

            (this.plugin.customState as any).events.segmentUpdate.next(true);
        }, 100);
        return false;
    }

    hideStructures = (segmentIndex: number) => {
        // clear selections
        this.plugin.managers.interactivity.lociSelects.deselectAll();

        // clear Focus
        this.plugin.managers.structure.focus.clear();

        // remove measurements
        const measurements: any = this.plugin.managers.structure.measurement.state;
        const measureTypes = ['labels', 'distances', 'angles', 'dihedrals'];
        let measurementCell: any = void 0;
        measureTypes.forEach((type: string) => {
            if(measurementCell) return;
            if(measurements[type][0]){
                measurementCell = this.plugin.state.data.cells.get(measurements[type][0].transform.parent)!;
            }
        });
        if(measurementCell){
            PluginCommands.State.RemoveObject(this.plugin, { state: measurementCell.parent!, ref: measurementCell.transform.parent, removeParentGhosts: true });
        }

        // hide structures
        const customState = this.customState;
        customState.superpositionState.visibleRefs[segmentIndex] = [];
        for(const struct of customState.superpositionState.loadedStructs[segmentIndex]) {
            const structRef = this.customState.superpositionState.models[struct];
            if(structRef) {
                const structHierarchy: any = this.plugin.managers.structure.hierarchy.current.refs.get(structRef);
                if(structHierarchy && structHierarchy.components) {
                    for(const c of structHierarchy.components) {
                        if(c && c.cell && !c.cell.state.isHidden){
                            customState.superpositionState.visibleRefs[segmentIndex].push(c.cell.transform.ref);
                            PluginCommands.State.ToggleVisibility(this.plugin, { state: c.cell.parent!, ref: c.cell.transform.ref });
                        }
                    }
                }
            }
        }

        if(customState.superpositionState.alphafold.ref) {
            const afStr: any = this.plugin.managers.structure.hierarchy.current.refs.get(customState.superpositionState.alphafold.ref);
            if(afStr && afStr.components) {
                for(const c of afStr.components) {
                    if(c && c.cell && !c.cell.state.isHidden){
                        PluginCommands.State.ToggleVisibility(this.plugin, { state: c.cell.parent!, ref: c.cell.transform.ref });
                    }
                }
            }
        }

    }

    displayStructures = async (segmentIndex: number) => {
        const customState = this.customState;
        const spState = customState.superpositionState;
        if(customState.superpositionState.visibleRefs[segmentIndex].length === 0){
            let loadStrs: any = [];
            customState.superpositionState.segmentData[segmentIndex].clusters.forEach( (cluster: any) => {

                let entryList = [cluster[0]];
                if(customState.initParams.superpositionParams && customState.initParams.superpositionParams.superposeAll){
                    entryList = cluster;
                }

                entryList.forEach((str: Cluster) => {

                    const structStateId = `${str.pdb_id}_${str.struct_asym_id}`;
                    const structRef = customState.superpositionState.models[structStateId];
                    if(structRef){
                        const cell = this.plugin.state.data.cells.get(structRef)!;
                        const isHidden = cell.state.isHidden ? true : false;
                        if(isHidden) {
                            PluginCommands.State.ToggleVisibility(this.plugin, { state: cell.parent!, ref: structRef });
                            // PluginCommands.State.ToggleVisibility(this.plugin, { state: cell.parent!, ref: cell.transform.parent });
                        }
                    } else {
                        loadStrs.push(str);
                    }
                });
            });
            PluginCommands.Camera.Reset(this.plugin);

            if(loadStrs.length > 0){
                await renderSuperposition(this.plugin, segmentIndex, loadStrs);
                PluginCommands.Camera.Reset(this.plugin);
            }

        } else {
            for(const ref of customState.superpositionState.visibleRefs[segmentIndex]) {
                const cell = this.plugin.state.data.cells.get(ref)!;
                if(cell && cell.state.isHidden) {
                    PluginCommands.State.ToggleVisibility(this.plugin, { state: cell.parent!, ref });
                }
            }
            PluginCommands.Camera.Reset(this.plugin);
        }

        if(spState.alphafold.ref) {
            superposeAf(this.plugin, spState.alphafold.traceOnly);
            PluginCommands.Camera.Reset(this.plugin);
        }

        if(spState.alphafold.ref && spState.alphafold.visibility[segmentIndex]) {
            const afStr: any = this.plugin.managers.structure.hierarchy.current.refs.get(customState.superpositionState.alphafold.ref);
            if(afStr && afStr.components) {
                for(const c of afStr.components) {
                    if(c && c.cell && c.cell.state.isHidden){
                        PluginCommands.State.ToggleVisibility(this.plugin, { state: c.cell.parent!, ref: c.cell.transform.ref });
                    }
                }
            }
        }
    }

    async transform(s: StateObjectRef<PluginStateObject.Molecule.Structure>, matrix: Mat4) {
        const r = StateObjectRef.resolveAndCheck(this.plugin.state.data, s);
        if (!r) return;
        // TODO should find any TransformStructureConformation decorator instance
        const o = StateSelection.findTagInSubtree(this.plugin.state.data.tree, r.transform.ref, SuperpositionTag);

        const params = {
            transform: {
                name: 'matrix' as const,
                params: { data: matrix, transpose: false }
            }
        };
        // TODO add .insertOrUpdate to StateBuilder?
        const b = o
            ? this.plugin.state.data.build().to(o).update(params)
            : this.plugin.state.data.build().to(s)
                .insert(StateTransforms.Model.TransformStructureConformation, params, { tags: SuperpositionTag });
        await this.plugin.runTask(this.plugin.state.data.updateTree(b));
    }

    render() {
        let sectionHeader = <SectionHeader title={`Structure clusters`} />;
        const customState = this.customState;
        if(customState && customState.initParams && !customState.initParams.superposition){
            return <>
                {sectionHeader}
                <div>Functionality unavailable!</div>
            </>;
        }else{
            if(customState && customState.initParams && customState.initParams.superposition){

                sectionHeader = <SectionHeader title={`Structure clusters - ${customState.initParams.moleculeId}`} />;

                if(customState.superpositionError){
                    return <>
                        {sectionHeader}
                        <div style={{ textAlign: 'center' }}>{customState.superpositionError}</div>
                    </>;
                } else if(!customState.superpositionState || !customState.superpositionState.segmentData){
                    return <>
                        {sectionHeader}
                        <div style={{ textAlign: 'center' }}>Loading Segment Data!</div>
                    </>;
                }
            }
        }

        if(this.state){
            const segmentIndex = parseInt(this.state.segment.value.segment.split(' ')[0]) - 1;
            const segmentData: Segment[] = customState.superpositionState.segmentData;
            const fullSegmentRange = `( ${segmentData[0].segment_start} - ${segmentData[segmentData.length - 1].segment_end} )`;
            sectionHeader = <SectionHeader title={`Structure clusters ${customState.initParams.moleculeId}`} desc={fullSegmentRange} />;
            return <>
                {sectionHeader}
                <ParameterControls params={this.state.segment.params} values={this.state.segment.value} onChangeValues={this.updateSegment} isDisabled={this.state.isBusy} />
                { segmentData[segmentIndex].clusters.map((c: any[], i: number) => <ClusterNode cluster={c} totalClusters={segmentData[segmentIndex].clusters.length} segmentIndex={segmentIndex} clusterIndex={i} key={`cluster-${segmentIndex}-${i}`} />) }
            </>;
        }

        return <></>;

    }
}

class ClusterNode extends PluginUIComponent<{ cluster: any[], totalClusters: number, segmentIndex: number, clusterIndex: number }, { isCollapsed: boolean, showAll: boolean, showNone: boolean, showSearch: boolean, isBusy: boolean, searchText: string, cluster: any[] }> {

    state = {
        isCollapsed: false,
        showAll: false,
        showNone: false,
        showSearch: false,
        isBusy: false,
        cluster: this.props.cluster,
        searchText: ''
    }

    private inputStream = new Subject();
    private handleInputStream = (inputStr: string) => {
        this.setState({searchText: inputStr});
        const filteredRes = this.props.cluster.filter((item)=> {
            return item.pdb_id.toLowerCase().indexOf(inputStr.toLowerCase()) >= 0;
        });
        this.setState({ cluster: filteredRes });
    }

    componentDidMount() {
        this.subscribe((this.plugin.customState as any).events.isBusy, (e: boolean) => {
            this.setState({ isBusy: e, showAll: false, showNone: false });
        });
        this.subscribe(this.inputStream.pipe(debounceTime(1000 / 24)), (e: any) => this.handleInputStream(e));
    }

    get customState() {
        return this.plugin.customState as any;
    }

    toggleExpanded = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({ isCollapsed: !this.state.isCollapsed });
        e.currentTarget.blur();
    }

    selectAll = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({ showAll: !this.state.showAll, showNone: false });
        e.currentTarget.blur();
    }

    selectNone = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({ showAll: false, showNone: !this.state.showNone });
        e.currentTarget.blur();
    }

    applyAction = async (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        const customState = this.customState;
        customState.events.isBusy.next(true);
        const currentState = {...this.state};
        this.setState({ showAll: false, showNone: false });
        setTimeout( async() => {
            let loadStrs: any = [];
            for await (const str of this.state.cluster) {
                const structStateId = `${str.pdb_id}_${str.struct_asym_id}`;
                let structRef = undefined;
                if(customState && customState.superpositionState && customState.superpositionState.models[structStateId]) {
                    structRef = this.customState.superpositionState.models[structStateId];
                }

                if(structRef){

                    const cell = this.plugin.state.data.cells.get(structRef)!;
                    if(cell) {
                        const isHidden = cell.state.isHidden ? true : false;
                        if((isHidden && currentState.showAll) || (!isHidden && currentState.showNone)){
                            await PluginCommands.State.ToggleVisibility(this.plugin, { state: cell.parent!, ref: structRef });
                            // await PluginCommands.State.ToggleVisibility(this.plugin, { state: cell.parent!, ref: cell.transform.parent });
                        }
                    }
                } else {
                    if(currentState.showAll) loadStrs.push(str);
                }
            };
            PluginCommands.Camera.Reset(this.plugin);
            if(loadStrs.length > 0){
                await renderSuperposition(this.plugin, this.props.segmentIndex, loadStrs);
            }
            customState.events.isBusy.next(false);
        });
    }

    cancelAction = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({ showAll: false, showNone: false });
        e.currentTarget.blur();
    }

    clearSearch = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({searchText: ''});
        this.inputStream.next('');
        e.currentTarget.blur();
    }

    render() {
        const customState = this.customState;
        if(!customState.superpositionState || !customState.superpositionState.segmentData) return <></>;
        const expand = <IconButton svg={this.state.isCollapsed ? ArrowRightSvg : ArrowDropDownSvg} flex='20px' onClick={this.toggleExpanded} transparent disabled={this.state.isBusy} className='msp-no-hover-outline' />;
        const title = `Segment ${customState.superpositionState.activeSegment} Cluster ${this.props.clusterIndex + 1}`;
        const label = <Button className={`msp-btn-tree-label`} noOverflow title={title} disabled={this.state.isBusy}>
            <span>Cluster {this.props.clusterIndex + 1}</span> <small>{this.state.cluster.length < this.props.cluster.length ? `${this.state.cluster.length} / ` : ''}{this.props.cluster.length} chain{this.props.cluster.length > 1 ? 's' : '' }</small>
        </Button>;

        const selectionControls = <>
            <Button icon={CheckSvg} flex onClick={this.selectAll} style={{ flex: '0 0 50px', textAlign: 'center', fontSize: '80%', color: '#9cacc3', padding: 0 }} disabled={this.state.isBusy} title={`Show all chains`}>
                All
            </Button>
            <Button icon={CloseSvg} flex onClick={this.selectNone} style={{ flex: '0 0 50px', textAlign: 'center', fontSize: '80%', color: '#9cacc3', padding: 0 }} disabled={this.state.isBusy} title={`Hide all chains`}>
                None
            </Button>
        </>;

        const mainRow = <div className={`msp-flex-row msp-tree-row`} style={{ marginTop: '10px' }}>
            {expand}
            {label}
            {this.props.cluster.length > 1 && selectionControls}
        </div>;

        const searchControls = <div className='msp-mapped-parameter-group' style={{fontSize: '90%'}}>
            <div className='msp-control-row msp-transform-header-brand-gray' style={{height: '33px', marginLeft: '30px'}}>
                <span className='msp-control-row-label'>Search PDB ID</span>
                <div className='msp-control-row-ctrl'>
                    <input type='text' placeholder='Enter PDB ID..' disabled={this.state.isBusy} onChange={e => this.inputStream.next(e.target.value)} value={this.state.searchText} maxLength={4} />
                </div>
            </div>
            <IconButton svg={CloseSvg} flex onClick={this.clearSearch} style={{ flex: '0 0 24px', padding: 0 }} disabled={this.state.isBusy || this.state.searchText === ''} toggleState={this.state.searchText !== ''} title='Clear search input'></IconButton>
        </div>;

        return <>
            {mainRow}
            {(this.state.showAll || this.state.showNone) && <div>
                <div className={`msp-control-row msp-transform-header-brand-${this.state.showAll ? 'green' : 'red'}`} style={{ display: 'flex', marginLeft: '20px', height: '35px'}}>
                    <span className='msp-control-row-label' style={{flex: '1 1 auto', textAlign: 'left', fontSize: '85%'}}>{this.state.showAll ? 'Display' : 'Hide'} {this.state.cluster.length < this.props.cluster.length ? `${this.state.cluster.length} / ` : 'all '}{this.props.cluster.length} chains</span>
                    <Button icon={CheckSvg} flex onClick={this.applyAction} style={{ flex: '0 0 60px', textAlign: 'center', fontSize: '78%', color: '#9cacc3', padding: 0, margin: '0 1px' }} title={`Apply action`}>Apply</Button>
                    <Button icon={CloseSvg} flex onClick={this.cancelAction} style={{ flex: '0 0 60px', textAlign: 'center', fontSize: '78%', color: '#9cacc3', padding: 0, margin: '0 1px' }} title={`Cancel action`}>Cancel</Button>
                </div>
            </div>
            }
            {(!this.state.isCollapsed && this.props.cluster.length > 5) && searchControls}
            {!this.state.isCollapsed && <div className='msp-tree-updates-wrapper' style={{ maxHeight: (this.props.totalClusters > 1) ? '330px' : '87%', overflowY: 'auto' }}>
                {this.state.cluster.map((s: any, i: number) => <StructureNode segmentIndex={this.props.segmentIndex} structure={s} isRep={i === 0 ? true : false} key={`str-${s.pdb_id}${s.struct_asym_id}${i}`} />)}
            </div>
            }
        </>;


    }

}

class StructureNode extends PluginUIComponent<{ structure: any, isRep: boolean, segmentIndex: number }, { showControls: boolean, isBusy: boolean, isProcessing: boolean, isHidden: boolean }> {

    state = {
        showControls: false,
        isBusy: false,
        isProcessing: false,
        isHidden: true,
    }

    get customState() {
        return this.plugin.customState as any;
    }

    get ref() {
        if(this.customState && this.customState.superpositionState && this.customState.superpositionState.models[`${this.props.structure.pdb_id}_${this.props.structure.struct_asym_id}`]) {
            return this.customState.superpositionState.models[`${this.props.structure.pdb_id}_${this.props.structure.struct_asym_id}`];
        } else {
            return undefined;
        }
    }

    get modelCell() {
        if(this.ref) {
            return this.plugin.state.data.cells.get(this.ref);
        } else {
            return undefined;
        }
    }

    get isAllHidden() {
        let isHidden = true;
        if(this.ref) {
            const structHierarchy: any = this.plugin.managers.structure.hierarchy.current.refs.get(this.ref!);
            if(structHierarchy && structHierarchy.components) {
                for(const c of structHierarchy.components) {
                    if(c && c.cell && !c.cell.state.isHidden){
                        isHidden = false;
                        break;
                    }
                }
            } else {
                isHidden = false;
            }
        }
        return isHidden;
    }

    checkRelation(ref: string) {
        let isRelated = false;
        const cell = this.plugin.state.data.cells.get(ref)!;
        if(cell && cell.transform.parent){
            if(cell && cell.transform.parent === this.ref){
                isRelated = true;
            } else {
                const pcell = this.plugin.state.data.cells.get(cell.transform.parent)!;
                if(pcell && pcell.transform.parent === this.ref) isRelated = true;
            }
        } else {
            const currentNodeCell = this.plugin.state.data.cells.get(this.ref!)!;
            if(currentNodeCell && currentNodeCell.transform.parent === cell.transform.parent){
                isRelated = true;
            }
        }
        return isRelated;
    }

    is(e: State.ObjectEvent) {

        if(!this.ref) return false;
        let isRelated = false;
        if(this.ref && e.ref !== this.ref) {
            isRelated = this.checkRelation(e.ref);
        }
        if(e.ref === this.ref || isRelated){
            return true;
        }else{
            const invalidStruct = (this.customState.superpositionState.invalidStruct.indexOf(`${this.props.structure.pdb_id}_${this.props.structure.struct_asym_id}`) > -1) ? true : false;
            return invalidStruct ? true : false;
        }
    }

    componentDidMount() {
        this.setState({ isHidden: this.isAllHidden });
        this.subscribe((this.plugin.customState as any).events.isBusy, (e: boolean) => {
            this.setState({ isBusy: e, showControls: false });
        });
        this.subscribe(this.plugin.state.events.cell.stateUpdated.pipe(filter(e => this.is(e)), debounceTime(33)), e => {
            this.setState({ isHidden: this.isAllHidden });
            // this.forceUpdate();
        });
    }

    toggleVisible = async (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        this.setState({ isProcessing: true, showControls: false });
        if(this.ref){

            const structHierarchy: any = this.plugin.managers.structure.hierarchy.current.refs.get(this.ref!);
            if(structHierarchy && structHierarchy.components) {
                for(const c of structHierarchy.components) {
                    const currentHiddenState = c.cell.state.isHidden ? true : false;
                    if (currentHiddenState === this.state.isHidden) {
                        PluginCommands.State.ToggleVisibility(this.plugin, { state: c.cell.parent!, ref: c.cell.transform.ref });
                    }
                }
                this.setState({ isHidden: !this.state.isHidden });
            }

        } else {
            await renderSuperposition(this.plugin, this.props.segmentIndex, [this.props.structure]);
        }
        this.setState({ isProcessing: false });
        PluginCommands.Camera.Reset(this.plugin);
    }

    selectAction: ActionMenu.OnSelect = item => {
        if (!item) return;
        this.setState({ showControls: false });
        (item?.value as any)();
    }

    getTagRefs(tags: string[]) {
        const TagSet: Set<any> = new Set(tags);
        const tree = this.plugin.state.data.tree;
        return StateSelection.findUniqueTagsInSubtree(tree, this.modelCell!.transform.ref, TagSet);
    }

    getRandomColor() {
        const clList: any = ColorLists;
        const spState = (this.plugin.customState as any).superpositionState;
        let palleteIndex = spState.colorState[this.props.segmentIndex].palleteIndex;
        let colorIndex = spState.colorState[this.props.segmentIndex].colorIndex;
        if(clList[spState.colorPalette[palleteIndex]].list[colorIndex + 1]){
            colorIndex += 1;
        }else{
            colorIndex = 0;
            palleteIndex = spState.colorPalette[palleteIndex + 1] ? palleteIndex + 1 : 0;
        }
        const palleteName = spState.colorPalette[palleteIndex];
        (this.plugin.customState as any).superpositionState.colorState[this.props.segmentIndex].palleteIndex = palleteIndex;
        (this.plugin.customState as any).superpositionState.colorState[this.props.segmentIndex].colorIndex = colorIndex;
        return clList[palleteName].list[colorIndex];
    }

    async addChainRepr() {
        const uniformColor1 = this.getRandomColor();
        const strInstance = this.plugin.state.data.select(this.ref)[0];
        const query = MS.struct.generator.atomGroups({
            'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), this.props.structure.struct_asym_id])
        });
        const chainSel = await this.plugin.builders.structure.tryCreateComponentFromExpression(strInstance, query, `Chain-${this.props.segmentIndex}`, { label: `Chain`, tags: [`superposition-sel`]});
        if (chainSel){
            await this.plugin.builders.structure.representation.addRepresentation(chainSel, { type: 'cartoon', color: 'uniform', colorParams: { value: uniformColor1 } }, { tag: `superposition-visual` });
        }
    }

    updates() {
        const structHierarchy: any = this.plugin.managers.structure.hierarchy.current.refs.get(this.ref!);
        if(structHierarchy && structHierarchy.components) {
            const representations: any = [];
            let showAddChainBtn = true;
            structHierarchy.components.forEach((comps: any) => {
                const gKeys = comps.key!.split(',');
                const cId1Arr = gKeys[0].split('-');
                if(cId1Arr[2] === 'Chain') showAddChainBtn = false;

                if(comps.representations){
                    comps.representations.forEach((repr: any) => {
                        representations.push(repr);
                    });
                }
            });

            const customState: any = this.plugin.customState;
            if(customState.initParams && customState.initParams.superpositionParams && !customState.initParams.superpositionParams.ligandView) {
                showAddChainBtn = false;
            }

            if(representations.length > 0){
                return <div className='msp-accent-offset' style={{ marginLeft: '40px'}}>
                    {representations.length > 0 && representations.map((r: any, i: number) => <StructureRepresentationEntry group={[structHierarchy]} key={`${r.cell.transform.ref}-${i}`} representation={r} />)}
                    {showAddChainBtn && <div className='msp-control-group-header' style={{ marginTop: '1px' }}>
                        <Button noOverflow className='msp-control-button-label' title={`Click to add chain representaion`} onClick={() => this.addChainRepr() }>&nbsp;&nbsp;Add Chain {this.props.structure.struct_asym_id} Representation</Button>
                    </div>}
                </div>;
            }
        }
        return <></>;
    }

    highlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        if(this.ref){
            const cell = this.plugin.state.data.cells.get(this.ref)!;
            PluginCommands.Interactivity.Object.Highlight(this.plugin, { state: cell.parent!, ref: this.ref });
        }
        e.currentTarget.blur();
    }

    clearHighlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.Interactivity.ClearHighlights(this.plugin);
        e.currentTarget.blur();
    }

    toggleControls = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        this.setState({ showControls: !this.state.showControls });
        e.currentTarget.blur();
    }

    getSubtitle() {
        const customState: any = this.plugin.customState;
        const hetList = customState.superpositionState.hets[`${this.props.structure.pdb_id}_${this.props.structure.struct_asym_id}`];
        let subtitle: string | undefined;
        if(hetList) {
            const hetLimit = this.props.structure.is_representative ? 1 : 4;
            const totalHets = hetList.length;
            let hetStr = hetList.join(', ');
            if(totalHets > hetLimit) {
                hetStr = hetList.slice(0, hetLimit).join(', ');
                hetStr += ` + ${totalHets - hetLimit}`;
            }
            subtitle = ` ( ${hetStr} )`;
            if(this.props.structure.is_representative) subtitle = ` ${subtitle} ( Representative )`;
        } else if(this.props.structure.is_representative) {
            subtitle = ' ( Representative )';
        }
        return subtitle;
    }

    get panelColor() {
        let panelColor = '#808080';
        if(!this.state.isHidden) {
            if(this.modelCell){
                const refs = this.getTagRefs([`superposition-visual`, `superposition-ligand-visual`]);
                const visualRef = refs[`superposition-ligand-visual`] ? refs[`superposition-ligand-visual`] : refs[`superposition-visual`] ? refs[`superposition-visual`] : undefined;
                if(visualRef) {
                    const visualCell = this.plugin.state.data.cells.get(visualRef)!;
                    if(visualCell.params && visualCell.params!.values && visualCell.params!.values.colorTheme){
                        const colorTheme = visualCell.params!.values!.colorTheme;
                        if(colorTheme.params && colorTheme.params.value){
                            panelColor = `${Color.toStyle(colorTheme.params.value)}`;
                        }else if(colorTheme.params && colorTheme.params.palette) {
                            const colorList1 = colorTheme.params.palette.params.list.colors;
                            panelColor = `${Color.toStyle(colorList1[0])}`;
                        }else if(colorTheme.params && colorTheme.params.list) {
                            const colorList2 = colorTheme.params.list.colors;
                            panelColor = `${Color.toStyle(colorList2[0])}`;
                        }
                    }
                }
            }
        }
        return panelColor;
    }

    render() {

        const superpositionParams = this.customState.initParams.superpositionParams;
        const strutStateId = `${this.props.structure.pdb_id}_${this.props.structure.struct_asym_id}`;
        const invalidStruct = (this.customState.superpositionState.invalidStruct.indexOf(strutStateId) > -1) ? true : false;
        const noMatrixStruct = (this.customState.superpositionState.noMatrixStruct.indexOf(strutStateId) > -1) ? true : false;
        const subTitle = invalidStruct ? noMatrixStruct ? ` Matrix not available!` : ` No Ligand found!` : this.getSubtitle();

        let strTitle = `${this.props.structure.pdb_id} chain ${this.props.structure.auth_asym_id}`;
        if(superpositionParams && superpositionParams.ligandView) {
            strTitle = `${this.props.structure.pdb_id} ${this.props.structure.struct_asym_id}`;
        }
        const label = <Button className={`msp-btn-tree-label`} style={{ borderLeftColor: this.panelColor }} noOverflow title={strTitle} disabled={(invalidStruct || this.state.isBusy || this.state.isProcessing) ? true : false}  onMouseEnter={this.highlight} onMouseLeave={this.clearHighlight}>
            <span>{strTitle}</span>
            {subTitle && <small>{subTitle}</small>}
        </Button>;

        const expand = <IconButton svg={!this.state.showControls ? ArrowRightSvg : ArrowDropDownSvg} flex='20px' onClick={this.toggleControls} transparent className='msp-no-hover-outline' disabled={(invalidStruct || this.state.isBusy || this.state.isProcessing) ? true : false} />;
        const visibility = <IconButton
            svg={this.state.isHidden ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg}
            toggleState={false} small onClick={this.toggleVisible} disabled={(invalidStruct || this.state.isBusy || this.state.isProcessing) ? true : false}
            title={this.state.isHidden ? `Show chain` : `Hide chain`}
        />;
        const row = <div className={`msp-flex-row msp-tree-row`} style={{ marginLeft: !this.state.isHidden ? '10px' : '31px' }}>
            {!this.state.isHidden && expand}
            {label}
            {visibility}
        </div>;

        return <div style={{ marginBottom: '1px' }}>
            {row}
            {this.state.showControls && this.updates()}
        </div>;
    }

}

class StructureRepresentationEntry extends PurePluginUIComponent<{ group: StructureComponentRef[], representation: StructureRepresentationRef }> {
    componentDidMount() {
        this.subscribe(this.plugin.state.events.cell.stateUpdated, e => {
            if (State.ObjectEvent.isCell(e, this.props.representation.cell)) this.forceUpdate();
        });
    }

    toggleVisible = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        const cell = this.props.representation.cell;
        PluginCommands.State.ToggleVisibility(this.plugin, { state: cell.parent!, ref: cell.transform.parent });
    }

    render() {
        const repr = this.props.representation.cell;
        let label = repr.obj?.label;
        if(repr.obj?.data.repr && repr.obj?.data.repr.label){
            let sourceLabel = (repr.obj?.data.repr.label.indexOf('[Focus]') >= 0) ? '[Focus]' : repr.obj?.data.repr.label;
            const isLargeLabel = sourceLabel.length > 10 ? true : false;
            sourceLabel = `${isLargeLabel ? `${sourceLabel.substring(0,28)}...` : sourceLabel}`;
            if(isLargeLabel) {
                label = sourceLabel;
            } else {
                label = `${sourceLabel} ${(label && label.length < 21) ? ' - ' + label : ''}`;
            }
        }
        if(repr.obj?.data.repr && repr.obj?.data.repr.label === 'Custom Selection') label = 'Custom Selection';
        return <div className='msp-representation-entry'>
            {repr.parent && <ExpandGroup header={`${label || 'Representation'}`} noOffset headerStyle={{ overflow: 'hidden' }} >
                <UpdateTransformControl state={repr.parent} transform={repr.transform} customHeader='none' noMargin />
            </ExpandGroup>}
            <IconButton
                svg={this.props.representation.cell.state.isHidden ? VisibilityOffOutlinedSvg : VisibilityOutlinedSvg}
                toggleState={false} onClick={this.toggleVisible}
                title={this.props.representation.cell.state.isHidden ? `Show representation` : `Hide representation`} small
                className='msp-default-bg'
                style={{ position: 'absolute', top: 0, right: 0, lineHeight: '24px', height: '24px', textAlign: 'right', width: '32px', paddingRight: '6px', background: 'none'}}
            />
        </div>;
    }
}