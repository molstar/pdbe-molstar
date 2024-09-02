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


/** React state for `StateGalleryControls` */
interface StateGalleryControlsState {
    /** Content of "Entry ID" text field */
    entryId: string,
    manager: StateGalleryManager | undefined,
    /** `true` when initializing manager (fetching list of images) */
    isLoading: boolean,
    /** Mirrors `this.plugin.behaviors.state.isBusy` (`true` when loading a specific image) */
    isBusy: boolean,
}

/** Parameter definition for ParameterControls part of "3D State Gallery" section */
const Params = {
    entryId: PD.Text(undefined, { label: 'Entry ID' }),
};
/** Parameter values for ParameterControls part of "3D State Gallery" section */
type Values = PD.ValuesFor<typeof Params>;


/** "3D State Gallery" section in Structure Tools (right panel) */
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
                    this.setState({ entryId: id.toLowerCase() });
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
    private onChangeValues = (values: Values) => {
        this.setState({ entryId: values.entryId });
    };

    /** Load entry given by `this.state.entryId` */
    private load = async () => {
        if (this.loadDisabled()) return;
        this.setState({ isLoading: true, description: undefined });
        const manager = await StateGalleryManager.create(this.plugin, this.state.entryId);
        this.setState({ manager, isLoading: false, description: this.state.entryId.toUpperCase() });
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
                <StateGalleryManagerControls manager={this.state.manager} />
            }
        </>;
    }
}


/** Part of "3D State Gallery" section related to a specific entry */
export function StateGalleryManagerControls(props: { manager: StateGalleryManager }) {
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
                            <ImageButton key={img.filename} img={img} isSelected={img === selected} status={status} onClick={() => props.manager.load(img)} />
                        )}
                    </ExpandGroup>
                )}
            </div>
        </ExpandGroup>
        <ExpandGroup header='Description' initiallyExpanded={true} key='description'>
            <div className='pdbemolstar-state-gallery-legend'>
                {/* <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{selected?.alt}</div> */}
                <div dangerouslySetInnerHTML={{ __html: selected?.description ?? '' }} />
            </div>
        </ExpandGroup>
    </div>;
}


/** Button with image title */
function ImageButton(props: { img: Image, isSelected: boolean, status: LoadingStatus, onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
    const { img, isSelected, status, onClick } = props;
    const icon = !isSelected ? EmptyIconSvg : (status === 'loading') ? HourglassBottomSvg : (status === 'error') ? ErrorSvg : CheckSvg;
    const tooltip = imageTooltip(img, isSelected ? status : 'ready');
    return <Button className='msp-action-menu-button pdbemolstar-state-gallery-state-button'
        icon={icon} onClick={onClick} title={tooltip}
        style={{ fontWeight: isSelected ? 'bold' : undefined }}>
        {img.title ?? img.filename}
        {img.subtitle && <small>&ensp; {img.subtitle}</small>}
    </Button>;
}

/** Box in viewport with image title and arrows to move between images (3D states) */
export function StateGalleryTitleBox() {
    const plugin = React.useContext(PluginReactContext);
    const [image, setImage] = React.useState<Image | undefined>(undefined);
    const [manager, setManager] = React.useState<StateGalleryManager | undefined>(undefined);
    const [status, setStatus] = React.useState<LoadingStatus>('ready');
    const loadingCounter = useRef<number>(0);
    React.useEffect(() => {
        const customState = StateGalleryCustomState(plugin);
        const subs = [
            customState.requestedImage?.subscribe(img => setImage(img)),
            customState.manager?.subscribe(mgr => setManager(mgr)),
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

    if (image === undefined) return null;

    return <div className='pdbemolstar-state-gallery-title-box'>
        {manager &&
            <div>
                <Button className='msp-btn-icon' title='Previous state' icon={ChevronLeftSvg} onClick={() => manager.loadPrevious()} />
            </div>
        }
        <div className='pdbemolstar-state-gallery-title' title={imageTooltip(image, status)} >
            <div className='pdbemolstar-state-gallery-title-icon'>
                <Icon svg={status === 'error' ? ErrorSvg : status === 'loading' ? HourglassBottomSvg : EmptyIconSvg} />
            </div>
            <div className='pdbemolstar-state-gallery-title-text'>
                {image.title ?? image.filename}
                <br />
                <small>{image.subtitle}</small>
            </div>
        </div>
        {manager &&
            <div>
                <Button className='msp-btn-icon' title='Next state' icon={ChevronRightSvg} onClick={() => manager?.loadNext()} />
            </div>
        }
    </div >;
}

/** Return tooltip text for an image */
function imageTooltip(img: Image, status: LoadingStatus): string {
    const tooltip =
        (status === 'error' ? '[Failed to load] \n' : status === 'loading' ? '[Loading] \n' : '')
        + (img.title ?? img.filename)
        + (img.subtitle ? `: ${img.subtitle}` : '');
    return tooltip;
}
