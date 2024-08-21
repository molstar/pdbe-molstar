import { CollapsableControls, CollapsableState, PluginReactContext } from 'molstar/lib/mol-plugin-ui/base';
import { Button, ExpandGroup } from 'molstar/lib/mol-plugin-ui/controls/common';
import { CheckSvg, ErrorSvg, Icon } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { ParameterControls } from 'molstar/lib/mol-plugin-ui/controls/parameters';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import React, { useRef } from 'react';
import { groupElements } from '../../helpers';
import { ChevronLeftSvg, ChevronRightSvg, CollectionsOutlinedSvg, EmptyIconSvg, HourglassBottomSvg } from '../../ui/icons';
import { StateGalleryCustomState } from './behavior';
import { Image, LoadingStatus, StateGalleryManager } from './manager';


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
        const existingManager = StateGalleryCustomState(this.plugin).manager?.value;
        return {
            // CollapsableControls state
            header: '3D State Gallery',
            brand: { accent: 'green', svg: CollectionsOutlinedSvg },
            isCollapsed: false,
            // Own state
            entryId: existingManager?.entryId ?? '',
            manager: existingManager,
            isLoading: false,
            isBusy: false,
            description: existingManager?.entryId.toUpperCase(),
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, sel => {
            if (this.state.entryId === '' && sel.structures.length > 0) {
                const id = sel.structures[0].cell.obj?.data.model.entryId;
                if (id) {
                    this.setEntryId(id.toLowerCase());
                }
            }
        });
        this.subscribe(this.plugin.behaviors.state.isBusy, isBusy => this.setState({ isBusy }));
    }

    private get values(): Values {
        return {
            entryId: this.state.entryId,
        };
    }
    private setEntryId = (entryId: string) => {
        this.setState(old => ({
            entryId,
        }));
    };
    private load = async () => {
        if (this.loadDisabled()) return;
        this.setState({ isLoading: true, description: undefined });
        const manager = await StateGalleryManager.create(this.plugin, this.state.entryId);
        this.setState({ manager, isLoading: false, description: this.state.entryId.toUpperCase() });
    };
    private onChangeValues = (values: Values) => {
        this.setEntryId(values.entryId);
    };
    private loadDisabled = () => !this.state.entryId || this.state.entryId === this.state.manager?.entryId || this.state.isBusy || this.state.isLoading;

    protected renderControls(): React.JSX.Element | null {
        return <>
            <ParameterControls params={Params} values={this.values} onChangeValues={this.onChangeValues} onEnter={this.load} />
            {(!this.state.manager || this.state.manager.entryId !== this.state.entryId) &&
                <Button icon={this.state.isLoading ? undefined : CheckSvg} title='Load'
                    disabled={this.loadDisabled()} onClick={this.load} className='msp-btn-block'>
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
    const categories = React.useMemo(() => groupElements(images, img => img.category ?? 'Miscellaneous'), [images]);
    const [selected, setSelected] = React.useState<Image | undefined>(undefined);
    const [status, setStatus] = React.useState<LoadingStatus>('ready');

    const keyDownTargetRef = React.useRef<HTMLDivElement>(null);
    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.code === 'ArrowLeft') await props.manager.loadPrevious();
        if (e.code === 'ArrowRight') await props.manager.loadNext();
    };

    React.useEffect(() => {
        if (images.length > 0 && props.manager.events.requestedImage.value === undefined) {
            props.manager.load(images[0]);
        }
        keyDownTargetRef.current?.focus();
        const subs = [
            props.manager.events.status.subscribe(status => setStatus(status)),
            props.manager.events.requestedImage.subscribe(img => setSelected(img)),
        ];
        return () => subs.forEach(sub => sub.unsubscribe());
    }, [props.manager]);

    if (nImages === 0) {
        return <div style={{ margin: 8 }}>No data available for {props.manager.entryId}.</div>;
    }

    return <div className='pdbemolstar-state-gallery-controls' onKeyDown={handleKeyDown} tabIndex={-1} ref={keyDownTargetRef} >
        <ExpandGroup header='States' initiallyExpanded={true} key='states'>
            <div style={{ marginBottom: 8 }}>
                {categories.groups.map(cat =>
                    <ExpandGroup header={cat} key={cat} initiallyExpanded={true} >
                        {categories.members.get(cat)?.map(img =>
                            <StateButton key={img.filename} img={img} isSelected={img === selected} status={status} onClick={() => props.manager.load(img)} />
                        )}
                    </ExpandGroup>
                )}
            </div>
        </ExpandGroup>
        <ExpandGroup header='Description' initiallyExpanded={true} key='description'>
            <div className='pdbemolstar-state-gallery-legend' style={{ marginBlock: 6 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                    {selected?.alt}
                </div>
                <div dangerouslySetInnerHTML={{ __html: selected?.description ?? '' }} />
            </div>
        </ExpandGroup>
    </div>;
}


function StateButton(props: { img: Image, isSelected: boolean, status: LoadingStatus, onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
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


export function StateGalleryTitleBox() {
    const plugin = React.useContext(PluginReactContext);
    const [title, setTitle] = React.useState<string | undefined>(undefined);
    const [manager, setManager] = React.useState<StateGalleryManager | undefined>(undefined);
    const [status, setStatus] = React.useState<LoadingStatus>('ready');
    const loadingCounter = useRef<number>(0);
    React.useEffect(() => {
        const customState = StateGalleryCustomState(plugin);
        const subs = [
            customState.title?.subscribe(x => setTitle(x)),
            customState.manager?.subscribe(x => setManager(x)),
            customState.status?.subscribe(status => {
                const counter = ++loadingCounter.current;
                if (status === 'loading') {
                    setTimeout(() => { if (loadingCounter.current === counter) setStatus('loading'); }, 250);
                } else {
                    setStatus(status);
                }
            }),
        ];
        return () => subs.forEach(sub => sub?.unsubscribe());
    }, [plugin]);

    const IconWidth = '1.2em'; // width of msp-material-icon

    if (title === undefined) return null;

    return <div className='pdbemolstar-state-gallery-title-box'>
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch' }}>
            {manager &&
                <div>
                    <Button className='msp-btn-icon' style={{ backgroundColor: 'transparent', height: '100%' }}
                        title='Previous state' icon={ChevronLeftSvg}
                        onClick={() => manager.loadPrevious()} />
                </div>
            }
            <div style={{ padding: 5, textAlign: 'center', fontWeight: 'bold', display: 'flex', flexDirection: 'row' }}
                title={status === 'error' ? `${title} (failed to load)` : status === 'loading' ? `${title} (loading)` : title} >
                <div style={{ width: IconWidth }}>
                    <Icon svg={status === 'error' ? ErrorSvg : status === 'loading' ? HourglassBottomSvg : EmptyIconSvg} />
                </div>
                <div style={{ marginRight: IconWidth, paddingInline: 4 }}>
                    {title}
                </div>
            </div>
            {manager &&
                <div>
                    <Button className='msp-btn-icon' style={{ backgroundColor: 'transparent', height: '100%' }}
                        title='Next state' icon={ChevronRightSvg}
                        onClick={() => manager?.loadNext()} />
                </div>
            }
        </div>
    </div >;
}
