import { CollapsableControls, CollapsableState } from 'molstar/lib/mol-plugin-ui/base';
import { Button, ExpandGroup } from 'molstar/lib/mol-plugin-ui/controls/common';
import { CheckSvg, ErrorSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { ParameterControls } from 'molstar/lib/mol-plugin-ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import React from 'react';
import { createIndex, groupElements, nonnegativeModulo } from '../../helpers';
import { ChevronLeftSvg, ChevronRightSvg, CollectionsOutlinedSvg, EmptyIconSvg, HourglassBottomSvg } from '../../ui/icons';
import { Image, StateGalleryManager } from './manager';


interface StateGalleryControlsState {
    entryId: string,
    manager: StateGalleryManager | undefined,
    isLoading: boolean,
    isBusy: boolean,
}

const Params = {
    entryId: PD.Text(),
};
type Values = PD.ValuesFor<typeof Params>;


export class StateGalleryControls extends CollapsableControls<{}, StateGalleryControlsState> {
    protected defaultState(): StateGalleryControlsState & CollapsableState {
        return {
            // CollapsableControls state
            header: '3D State Gallery',
            brand: { accent: 'green', svg: CollectionsOutlinedSvg },
            isCollapsed: false,
            // Own state
            entryId: '',
            manager: undefined,
            isLoading: false,
            isBusy: false,
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, sel => {
            if (this.state.entryId === '' && sel.structures.length > 0) {
                const id = sel.structures[0].cell.obj?.data.model.entryId;
                if (id) this.setEntryId(id.toLowerCase());
            }
            // this.setState({
            //     isHidden: !this.canEnable(),
            //     description: StructureHierarchyManager.getSelectedStructuresDescription(this.plugin),
            //     description: this.state.entryId,
            // });
        });
        // this.subscribe(this.plugin.state.events.cell.stateUpdated, e => {
        //     if (e.cell.transform.transformer === AssemblySymmetry3D) this.forceUpdate();
        // });
        this.subscribe(this.plugin.behaviors.state.isBusy, isBusy => this.setState({ isBusy }));
    }

    // private get pivot() {
    //     const structures = this.plugin.managers.structure.hierarchy.selection.structures;
    //     if (structures.length === 1) {
    //         return this.plugin.managers.structure.hierarchy.selection.structures[0];
    //     } else {
    //         return undefined;
    //     }
    // }
    // private canEnable() {
    //     return isApplicable(this.pivot?.cell.obj?.data);
    // }
    private get values(): Values {
        return {
            entryId: this.state.entryId,
        };
    }
    private setEntryId = (entryId: string) => {
        this.setState(old => ({
            entryId,
            manager: (entryId === old.manager?.entryId) ? old.manager : undefined,
        }));
    };
    private load = async () => {
        this.setState({ isLoading: true, description: undefined });
        const manager = await StateGalleryManager.create(this.plugin, this.state.entryId);
        this.setState({ manager, isLoading: false, description: this.state.entryId.toUpperCase() });
    };
    private onChangeValues = (values: Values) => {
        this.setEntryId(values.entryId);
    };

    protected renderControls(): React.JSX.Element | null {
        return <>
            <ParameterControls params={Params} values={this.values} onChangeValues={this.onChangeValues} onEnter={this.load} />
            {!this.state.manager &&
                <Button icon={this.state.isLoading ? undefined : CheckSvg} title='Load'
                    disabled={!this.state.entryId || this.state.isBusy || this.state.isLoading} onClick={this.load} className='msp-btn-block'>
                    {this.state.isLoading ? 'Loading...' : 'Load'}
                </Button>
            }
            {this.state.manager &&
                <ManagerControls manager={this.state.manager} />
            }
        </>;
    }
}

function ManagerControls(props: { manager: StateGalleryManager }) {
    const images = props.manager.images;
    const nImages = images.length;

    if (nImages === 0) {
        return <div style={{ margin: 8 }}>No data available for {props.manager.entryId}.</div>;
    }

    const imageIndex = React.useMemo(() => createIndex(images), [images]);
    const categories = React.useMemo(() => groupElements(images, img => img.category ?? 'Miscellaneous'), [images]);
    const [selected, setSelected] = React.useState<Image>(images[0]);
    const [status, setStatus] = React.useState<'ready' | 'loading' | 'error'>('ready');

    React.useEffect(() => {
        setStatus('loading');
        props.manager.load(selected.filename)
            .then(r => { if (r.status === 'completed') setStatus('ready'); })
            .catch(() => setStatus('error'));
    }, [selected]);

    const keyDownTargetRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => keyDownTargetRef.current?.focus(), []);

    const shift = (x: number) => setSelected(old => {
        const oldIndex = imageIndex.get(old) ?? 0;
        const newIndex = nonnegativeModulo(oldIndex + x, nImages);
        return images[newIndex];
    });
    const selectPrevious = () => shift(-1);
    const selectNext = () => shift(1);
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.code === 'ArrowLeft') selectPrevious();
        if (e.code === 'ArrowRight') selectNext();
    };

    return <div className='pdbemolstar-state-gallery-controls' onKeyDown={handleKeyDown} tabIndex={-1} ref={keyDownTargetRef} >
        <ExpandGroup header='States' initiallyExpanded={true} key='states'>
            {categories.groups.map(cat =>
                <ExpandGroup header={cat} key={cat} initiallyExpanded={true} >
                    {categories.members.get(cat)?.map(img =>
                        <StateButton key={img.filename} img={img} isSelected={img === selected} status={status} onClick={() => setSelected(img)} />,
                    )}
                </ExpandGroup>,
            )}
        </ExpandGroup>
        <ExpandGroup header='Description' initiallyExpanded={true} key='description'>
            <div className='pdbemolstar-state-gallery-legend' style={{ marginBlock: 6 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                    {selected.alt}
                </div>
                <div dangerouslySetInnerHTML={{ __html: selected.description }} />
            </div>
        </ExpandGroup>
        <div className='msp-flex-row' >
            <Button icon={ChevronLeftSvg} title='Previous state' onClick={selectPrevious}></Button>
            <Button icon={ChevronRightSvg} title='Next state' onClick={selectNext} ></Button>
        </div >
    </div>;
}

function StateButton(props: { img: Image, isSelected: boolean, status: 'ready' | 'loading' | 'error', onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
    const { img, isSelected, status, onClick } = props;
    const icon = !isSelected ? EmptyIconSvg : (status === 'loading') ? HourglassBottomSvg : (status === 'error') ? ErrorSvg : CheckSvg;
    const title = img.simple_title ?? img.filename;
    const errorMsg = (isSelected && status === 'error') ? '[Failed to load] ' : '';
    return <Button className='msp-action-menu-button'
        icon={icon}
        onClick={onClick}
        title={`${errorMsg}${title}`}
        style={{ height: 24, lineHeight: '24px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: isSelected ? 'bold' : undefined }}>
        {title}
    </Button>;
}
