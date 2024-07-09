import { Canvas3DParams } from 'Molstar/mol-canvas3d/canvas3d';
import { PluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { IconButton, SectionHeader } from 'Molstar/mol-plugin-ui/controls/common';
import { AccountTreeOutlinedSvg, DeleteOutlinedSvg, HelpOutlineSvg, HomeOutlinedSvg, SaveOutlinedSvg, TuneSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
import { StateObjectActions } from 'Molstar/mol-plugin-ui/state/actions';
import { RemoteStateSnapshots, StateSnapshots } from 'Molstar/mol-plugin-ui/state/snapshots';
import { StateTree } from 'Molstar/mol-plugin-ui/state/tree';
import { HelpContent, HelpGroup, HelpText } from 'Molstar/mol-plugin-ui/viewport/help';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { StateTransform } from 'Molstar/mol-state';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { sleep } from 'Molstar/mol-util/sleep';
import * as React from 'react';
import { BehaviorSubject, Subject } from 'rxjs';
import { PluginCustomState } from '../plugin-custom-state';
import { SegmentTree } from './segment-tree';


const _WavesIcon = <svg width='24px' height='24px' viewBox='0 0 24 24'><path d="M17 16.99c-1.35 0-2.2.42-2.95.8-.65.33-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.38-1.57-.8-2.95-.8s-2.2.42-2.95.8c-.65.33-1.17.6-2.05.6v1.95c1.35 0 2.2-.42 2.95-.8.65-.33 1.17-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.42 2.95-.8c.65-.33 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.58.8 2.95.8v-1.95c-.9 0-1.4-.25-2.05-.6-.75-.38-1.6-.8-2.95-.8zm0-4.45c-1.35 0-2.2.43-2.95.8-.65.32-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.38-1.57-.8-2.95-.8s-2.2.43-2.95.8c-.65.32-1.17.6-2.05.6v1.95c1.35 0 2.2-.43 2.95-.8.65-.35 1.15-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.43 2.95-.8c.65-.35 1.15-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.58.8 2.95.8v-1.95c-.9 0-1.4-.25-2.05-.6-.75-.38-1.6-.8-2.95-.8zm2.95-8.08c-.75-.38-1.58-.8-2.95-.8s-2.2.42-2.95.8c-.65.32-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.37-1.57-.8-2.95-.8s-2.2.42-2.95.8c-.65.33-1.17.6-2.05.6v1.93c1.35 0 2.2-.43 2.95-.8.65-.33 1.17-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.43 2.95-.8c.65-.32 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.58.8 2.95.8V5.04c-.9 0-1.4-.25-2.05-.58zM17 8.09c-1.35 0-2.2.43-2.95.8-.65.35-1.15.6-2.05.6s-1.4-.25-2.05-.6c-.75-.38-1.57-.8-2.95-.8s-2.2.43-2.95.8c-.65.35-1.15.6-2.05.6v1.95c1.35 0 2.2-.43 2.95-.8.65-.32 1.18-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.43 2.95-.8c.65-.32 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.58.8 2.95.8V9.49c-.9 0-1.4-.25-2.05-.6-.75-.38-1.6-.8-2.95-.8z" /></svg>;
export function WavesIconSvg() { return _WavesIcon; }

type PDBeLeftPanelTabName = 'none' | 'root' | 'data' | 'states' | 'settings' | 'help' | 'segments'

export class PDBeLeftPanelControls extends PluginUIComponent<{}, { tab: PDBeLeftPanelTabName }> {
    readonly state = { tab: this.plugin.behaviors.layout.leftPanelTabName.value as PDBeLeftPanelTabName };

    componentDidMount() {
        this.subscribe(this.plugin.behaviors.layout.leftPanelTabName, tab => {
            if (this.state.tab !== tab) this.setState({ tab });

            // Collapse panel if no active tab, expand if active tab (don't apply if panel hidden!)
            if (tab === 'none' && this.plugin.layout.state.regionState.left === 'full') {
                PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...this.plugin.layout.state.regionState, left: 'collapsed' } } });
            }
            if (tab !== 'none' && this.plugin.layout.state.regionState.left === 'collapsed') {
                PluginCommands.Layout.Update(this.plugin, { state: { regionState: { ...this.plugin.layout.state.regionState, left: 'full' } } });
            }
        });

        this.subscribe(this.plugin.state.data.events.changed, ({ state }) => {
            if (this.state.tab !== 'data') return;
            if (state.cells.size === 1) this.set('root');
        });
    }

    set = (tab: PDBeLeftPanelTabName) => {
        if (tab === this.state.tab) {
            tab = 'none'; // clicking on active tab should collapse panel
        }
        this.plugin.behaviors.layout.leftPanelTabName.next(tab as any); // will update state via subscription
    };

    tabs: { [K in PDBeLeftPanelTabName]: JSX.Element } = {
        'none': <></>,
        'root': <>
            <SectionHeader icon={HomeOutlinedSvg} title='Home' />
            <StateObjectActions state={this.plugin.state.data} nodeRef={StateTransform.RootRef} hideHeader={true} initiallyCollapsed={true} alwaysExpandFirst={true} />
            {this.plugin.spec.components?.remoteState !== 'none' && <RemoteStateSnapshots listOnly />}
        </>,
        'data': <>
            <SectionHeader icon={AccountTreeOutlinedSvg} title={<><RemoveAllButton /> State Tree</>} />
            <StateTree state={this.plugin.state.data} />
        </>,
        'segments': <>
            {/* <SectionHeader icon={WavesIconSvg} title='Superpose clusters' /> */}
            <SegmentTree />
        </>,
        'states': <StateSnapshots />,
        'settings': <>
            <SectionHeader icon={TuneSvg} title='Plugin Settings' />
            <FullSettings />
        </>,
        'help': <>
            <SectionHeader icon={HelpOutlineSvg} title='Help' />
            <HelpContent />
            <SuperpositionHelpContent />
        </>
    };

    render() {
        const tab = this.state.tab;
        const customState = PluginCustomState(this.plugin);
        return <div className='msp-left-panel-controls'>
            <div className='msp-left-panel-controls-buttons'>
                <IconButton svg={HomeOutlinedSvg} toggleState={tab === 'root'} transparent onClick={() => this.set('root')} title='Home' />
                {/* <DataIcon set={this.set} /> */}
                {/* <IconButton svg={SaveOutlined} toggleState={tab === 'states'} transparent onClick={() => this.set('states')} title='Plugin State' /> */}
                <IconButton svg={HelpOutlineSvg} toggleState={tab === 'help'} transparent onClick={() => this.set('help')} title='Help' />
                {customState && customState.initParams && customState.initParams.superposition && <IconButton svg={WavesIconSvg} toggleState={tab === 'segments'} transparent onClick={() => this.set('segments')} title='Superpose segments' />}
                <div className='msp-left-panel-controls-buttons-bottom'>
                    <IconButton svg={TuneSvg} toggleState={tab === 'settings'} transparent onClick={() => this.set('settings')} title='Settings' />
                </div>
            </div>
            <div className='msp-scrollable-container'>
                {this.tabs[tab]}
            </div>
        </div>;
    }
}


class HomeTabBody extends PluginUIComponent<{}, { tab: PDBeLeftPanelTabName }> {
    render() {
        return <>
            <StateObjectActions state={this.plugin.state.data} nodeRef={StateTransform.RootRef} hideHeader={true} initiallyCollapsed={true} alwaysExpandFirst={true} />
            {this.plugin.spec.components?.remoteState !== 'none' && <RemoteStateSnapshots listOnly />}
        </>;
    }
}

class DataTabHeader extends PluginUIComponent<{}, { tab: PDBeLeftPanelTabName }> {
    render() {
        return <SectionHeader icon={AccountTreeOutlinedSvg} title={<><RemoveAllButton /> State Tree</>} />;
    }
}
class DataTabBody extends PluginUIComponent<{}, { tab: PDBeLeftPanelTabName }> {
    render() {
        return <StateTree state={this.plugin.state.data} />;
    }
}

class HelpTabBody extends PluginUIComponent<{}, { tab: PDBeLeftPanelTabName }> {
    render() {
        return <>
            <HelpContent />
            <SuperpositionHelpContent />
        </>;
    }
}


class FullSettings extends PluginUIComponent {
    private setSettings = (p: { param: PD.Base<any>, name: string, value: any }) => {
        PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { [p.name]: p.value } });
    };

    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
        this.subscribe(this.plugin.layout.events.updated, () => this.forceUpdate());

        this.subscribe(this.plugin.canvas3d!.camera.stateChanged, state => {
            if (state.radiusMax !== undefined || state.radius !== undefined) {
                this.forceUpdate();
            }
        });
    }

    render() {
        return <>
            {this.plugin.canvas3d && <>
                <SectionHeader title='Viewport' />
                <ParameterControls params={Canvas3DParams} values={this.plugin.canvas3d.props} onChange={this.setSettings} />
            </>}
            {/* <SectionHeader title='Behavior' />
            <StateTree state={this.plugin.state.behaviors} /> */}
        </>;
    }
}

class RemoveAllButton extends PluginUIComponent<{}> {
    componentDidMount() {
        this.subscribe(this.plugin.state.events.cell.created, e => {
            if (e.cell.transform.parent === StateTransform.RootRef) this.forceUpdate();
        });

        this.subscribe(this.plugin.state.events.cell.removed, e => {
            if (e.parent === StateTransform.RootRef) this.forceUpdate();
        });
    }

    remove = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: StateTransform.RootRef });
    };

    render() {
        const count = this.plugin.state.data.tree.children.get(StateTransform.RootRef).size;
        if (count === 0) return null;
        return <IconButton svg={DeleteOutlinedSvg} onClick={this.remove} title={'Remove All'} style={{ display: 'inline-block' }} small className='msp-no-hover-outline' transparent />;
    }
}

function HelpSection(props: { header: string }) {
    return <div className='msp-simple-help-section'>{props.header}</div>;
}

class SuperpositionHelpContent extends PluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
    }
    render() {
        return <div>
            <HelpSection header='Superposition' />
            <HelpGroup header='Segment'>
                <HelpText>
                    <p>Discrete UniProt sequence range mapped to the structure</p>
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Cluster'>
                <HelpText>
                    <p>Structural chains that possess significantly close superposition Q-score</p>
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Representative chain'>
                <HelpText>
                    <p>The best-ranked chain within a cluster chosen based on the model quality, resolution, observed residues ratio and UniProt sequence coverage</p>
                </HelpText>
            </HelpGroup>
        </div>;
    }
}


export interface TabSpec {
    /** Unique identifier of the tab */
    id: string,
    /** Tab title (shown in header and as tooltip on the icon) */
    title: string,
    /** Tab icon (shown in icon bar and in tab header), either a React component or a string with icon path (in 24x24 viewBox) */
    icon: React.JSXElementConstructor<{}> | string,
    /** Custom tab header (default is icon + title) */
    header?: React.JSXElementConstructor<{}>,
    /** Tab body (main content in the tab) */
    body: React.JSXElementConstructor<{}>,
    /** Position of the tab icon in the icon bar */
    position?: 'top' | 'bottom',
    /** Limit tab visibility to when `showWhen` returns true (default: always visible) */
    showWhen?: (plugin: PluginContext) => boolean,
    /** The tab icon will show a marker whenever `dirtyOn` Subject fires a truthy value and the tab is not currently open.
     * The marker will disappear when the tab is opened or when `dirtyOn` fires a falsey value. */
    dirtyOn?: (plugin: PluginContext) => Subject<any> | undefined,
}

function resolveIcon(Icon: React.JSXElementConstructor<{}> | string): React.FC {
    if (typeof Icon === 'string') {
        return function _Icon() { return <svg width='24px' height='24px' viewBox='0 0 24 24'><path d={Icon}></path></svg>; };
    } else {
        return function _Icon() { return <Icon />; };
    }
}

const NO_TAB = 'none';

export function GenericLeftPanelControls(tabs: TabSpec[], options?: { defaultTab?: string, boundBehavior?: (plugin: PluginContext) => BehaviorSubject<string>, onTabChange?: (plugin: PluginContext, tab: string) => any }): React.ComponentClass<{}> {
    if (tabs.some(tab => tab.id === NO_TAB)) throw new Error(`Cannot use '${NO_TAB}' as tab id because it is reserved.`);

    return class _GenericLeftPanelControls extends PluginUIComponent<{}, { tab: string, dirtyTabs: string[] }> {
        readonly boundBehavior = options?.boundBehavior?.(this.plugin);
        readonly state = {
            tab: options?.defaultTab ?? this.boundBehavior?.value ?? NO_TAB,
            dirtyTabs: [] as string[],
        };

        setTab = async (tab: string) => {
            if (tab === this.state.tab) return; // important to avoid infinite loop when state is bound to `boundBehavior`
            this.setDirtyTab(tab, false);
            this.setState({ tab }, () => {
                this.boundBehavior?.next(tab);
                options?.onTabChange?.(this.plugin, tab);
            });
        };
        toggleTab = (tab: string) => {
            if (tab === this.state.tab) {
                this.setTab(NO_TAB);
            } else {
                this.setTab(tab);
            }
        };
        setDirtyTab = (tab: string, dirty: boolean) => {
            if (dirty && !this.state.dirtyTabs.includes(tab)) {
                this.setState({ dirtyTabs: [...this.state.dirtyTabs, tab] }); // Add to dirty tabs
            } else if (!dirty && this.state.dirtyTabs.includes(tab)) {
                this.setState({ dirtyTabs: this.state.dirtyTabs.filter(t => t !== tab) }); // Remove from dirty tabs
            }
        };
        componentDidMount(): void {
            if (this.boundBehavior) {
                if (this.boundBehavior.value !== this.state.tab) {
                    this.boundBehavior.next(this.state.tab);
                }
                this.subscribe(this.boundBehavior, tab => this.setTab(tab));
            }
            for (const tab of tabs) {
                const dirtySubject = tab.dirtyOn?.(this.plugin);
                if (dirtySubject) {
                    this.subscribe(dirtySubject, isDirty => {
                        this.setDirtyTab(tab.id, !!isDirty && this.state.tab !== tab.id);
                    });
                }
            }
            options?.onTabChange?.(this.plugin, this.state.tab);
        }

        render() {
            const currentTabId = this.state.tab;
            const currentTab = currentTabId ? tabs.find(t => t.id === currentTabId) : undefined;
            const CurrentTabHeader = currentTab?.header;
            const CurrentTabBody = currentTab?.body;

            const iconForTab = (tab: TabSpec) => {
                if (tab.showWhen && !tab.showWhen(this.plugin)) return null;
                return <IconButton key={tab.id} title={tab.title} svg={resolveIcon(tab.icon)} toggleState={tab.id === currentTabId}
                    onClick={() => this.toggleTab(tab.id)} transparent style={{ position: 'relative' }}
                    extraContent={this.state.dirtyTabs.includes(tab.id) ? <div className='msp-left-panel-controls-button-data-dirty' /> : undefined} />;
            };

            return <div className='msp-left-panel-controls'>
                {/* Icon bar */}
                <div className='msp-left-panel-controls-buttons'>
                    {tabs.filter(tab => tab.position !== 'bottom').map(iconForTab)}
                    <div className='msp-left-panel-controls-buttons-bottom'>
                        {tabs.filter(tab => tab.position === 'bottom').map(iconForTab)}
                    </div>
                </div>
                {/* Tab content */}
                {currentTab &&
                    <div className='msp-scrollable-container'>
                        {CurrentTabHeader && <CurrentTabHeader /> || <SectionHeader icon={resolveIcon(currentTab.icon)} title={currentTab.title} />}
                        {CurrentTabBody && <CurrentTabBody />}
                    </div>
                }
            </div>;
        }
    };
}

async function adjustLeftPanelState(plugin: PluginContext, expanded: boolean) {
    await sleep(0); // this ensures PluginCommands.Layout.Update runs after componentDidMount, without this the panel will not collapse when defaultTab is none (not sure why)
    if (expanded && plugin.layout.state.regionState.left === 'collapsed') {
        await PluginCommands.Layout.Update(plugin, { state: { regionState: { ...plugin.layout.state.regionState, left: 'full' } } });
    }
    if (!expanded && plugin.layout.state.regionState.left === 'full') {
        await PluginCommands.Layout.Update(plugin, { state: { regionState: { ...plugin.layout.state.regionState, left: 'collapsed' } } });
    }
}

export const PDBeLeftPanelControls2 = GenericLeftPanelControls([
    {
        id: 'root',
        title: 'Home',
        icon: HomeOutlinedSvg,
        body: HomeTabBody,
    },
    {
        id: 'data',
        title: 'State Tree',
        icon: AccountTreeOutlinedSvg,
        header: DataTabHeader,
        body: DataTabBody,
        dirtyOn: plugin => plugin.state.data.events.changed,
    },
    {
        id: 'states',
        title: 'Plugin State',
        icon: SaveOutlinedSvg,
        header: () => <></>,
        body: StateSnapshots,
    },
    {
        id: 'help',
        title: 'Help',
        icon: HelpOutlineSvg,
        body: HelpTabBody,
    },
    {
        id: 'segments',
        title: 'Superpose Segments',
        icon: WavesIconSvg,
        header: () => <></>,
        body: SegmentTree,
        showWhen: plugin => !!PluginCustomState(plugin).initParams?.superposition,
    },
    {
        id: 'settings',
        title: 'Plugin Settings',
        icon: TuneSvg,
        body: FullSettings,
        position: 'bottom',
    },
], { defaultTab: 'none', boundBehavior: plugin => plugin.behaviors.layout.leftPanelTabName as BehaviorSubject<string>, onTabChange: (plugin, tab) => adjustLeftPanelState(plugin, tab !== NO_TAB) });

// TODO: binding with collapsed state - collapsed when tab not found, create tab registry and allow only using tab names
