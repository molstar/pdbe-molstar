import { CollapsableControls, CollapsableState } from 'molstar/lib/mol-plugin-ui/base';
import { Button, ExpandGroup } from 'molstar/lib/mol-plugin-ui/controls/common';
import { CheckSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { ParameterControls } from 'molstar/lib/mol-plugin-ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import React from 'react';
import { ChevronLeftSvg, ChevronRightSvg, CollectionsOutlinedSvg, EmptyIconSvg } from '../../ui/icons';
import { StateGalleryManager } from './manager';


interface StateGalleryControlsState {
    entryId: string,
    manager: StateGalleryManager | undefined,
    isLoading: boolean,
    isBusy: boolean,
}

const Params = {
    entryId: PD.Text(),
};
type Values = PD.ValuesFor<typeof Params>


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
        const manager = await StateGalleryManager.create(this.plugin, 'https://www.ebi.ac.uk/pdbe/static/entry', this.state.entryId);
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
    const [selected, setSelected] = React.useState<number>(0);
    React.useEffect(() => {
        props.manager.load(images[selected].filename);
    }, [selected]);

    const selectPrevious = () => setSelected(old => (old - 1 + nImages) % nImages);
    const selectNext = () => setSelected(old => (old + 1) % nImages);
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.code === 'ArrowLeft') selectPrevious();
        if (e.code === 'ArrowRight') selectNext();
    }
    const keyDownTargetRef = React.useRef<HTMLDivElement>(null); // Dummy div to get focus and allow keyboard control
    React.useEffect(() => keyDownTargetRef.current?.focus(), []);

    if (nImages === 0) {
        return <div style={{ margin: 8 }}>No data available for {props.manager.entryId}.</div>;
    }

    return <div onKeyDown={handleKeyDown}>
        <div ref={keyDownTargetRef} tabIndex={0} />
        <ExpandGroup header='States' initiallyExpanded={true}>
            {images.map((img, i) =>
                <Button key={i} className='msp-action-menu-button' onClick={() => setSelected(i)} title={img.filename}
                    icon={i === selected ? CheckSvg : EmptyIconSvg}
                    style={{ height: 24, lineHeight: '24px', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: i === selected ? 'bold' : undefined }}>
                    {img.filename}
                </Button>
            )}
        </ExpandGroup>
        {selected !== undefined &&
            <ExpandGroup header='Description' initiallyExpanded={true}>
                <div className='state-gallery-legend' style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                        {images[selected].alt}
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: images[selected].description }} />
                </div>
            </ExpandGroup>
        }
        <div className='msp-flex-row' >
            <Button icon={ChevronLeftSvg} title='Previous state' onClick={selectPrevious}></Button>
            <Button icon={ChevronRightSvg} title='Next state' onClick={selectNext} ></Button>
        </div >
    </div>;
}