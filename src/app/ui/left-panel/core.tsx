import { PluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { IconButton, SectionHeader } from 'Molstar/mol-plugin-ui/controls/common';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { sleep } from 'Molstar/mol-util/sleep';
import { BehaviorSubject, Subject } from 'rxjs';


/** Specification of one tab in a tabbed panel */
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
    /** Limit tab visibility to when `showWhen` returns true (default: always visible) */
    showWhen?: (plugin: PluginContext) => boolean,
    /** The tab icon will show a marker whenever `dirtyOn` Subject fires a truthy value and the tab is not currently open.
     * The marker will disappear when the tab is opened or when `dirtyOn` fires a falsey value. */
    dirtyOn?: (plugin: PluginContext) => Subject<any> | undefined,
}

/** Convert `Icon` to a React functional element. `Icon` can be either React element (class or functional) or a string with icon path (in 24x24 viewBox) */
function resolveIcon(Icon: React.JSXElementConstructor<{}> | string): React.FC {
    if (typeof Icon === 'string') {
        return function _Icon() { return <svg width='24px' height='24px' viewBox='0 0 24 24'><path d={Icon}></path></svg>; };
    } else {
        return function _Icon() { return <Icon />; };
    }
}

/** Special tab id value, meaning no tab is open */
const NO_TAB = 'none';

/** Return a React component showing a panel with tab icons on the left and tab content of the open tab on the right */
export function VerticalTabbedPanel(options: { tabsTop?: TabSpec[], tabsBottom?: TabSpec[], defaultTab?: string, boundBehavior?: (plugin: PluginContext) => BehaviorSubject<string>, onTabChange?: (plugin: PluginContext, tab: string) => any }): React.ComponentClass<{}> {
    const tabs = [...options.tabsTop ?? [], ...options.tabsBottom ?? []];
    if (tabs.some(tab => tab.id === NO_TAB)) throw new Error(`Cannot use '${NO_TAB}' as tab id because it is reserved.`);

    return class _GenericLeftPanelControls extends PluginUIComponent<{}, { tab: string, dirtyTabs: string[] }> {
        readonly boundBehavior = options.boundBehavior?.(this.plugin);
        readonly state = {
            tab: options.defaultTab ?? this.boundBehavior?.value ?? NO_TAB,
            dirtyTabs: [] as string[],
        };

        setTab = async (tab: string) => {
            if (tab === this.state.tab) return; // important to avoid infinite loop when state is bound to `boundBehavior`
            this.setDirtyTab(tab, false);
            this.setState({ tab }, () => {
                this.boundBehavior?.next(tab);
                options.onTabChange?.(this.plugin, tab);
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
            options.onTabChange?.(this.plugin, this.state.tab);
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
                    {options.tabsTop?.map(iconForTab)}
                    <div className='msp-left-panel-controls-buttons-bottom'>
                        {options.tabsBottom?.map(iconForTab)}
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

/** Set left panel state in Molstar layout to 'full' (if expanded) or 'collapsed' (if not expanded).
 * Do not change the state if it is 'hidden'. */
async function adjustLeftPanelState(plugin: PluginContext, expanded: boolean) {
    await sleep(0); // this ensures PluginCommands.Layout.Update runs after componentDidMount, without this the panel will not collapse when defaultTab is none (not sure why)
    if (expanded && plugin.layout.state.regionState.left === 'collapsed') {
        await PluginCommands.Layout.Update(plugin, { state: { regionState: { ...plugin.layout.state.regionState, left: 'full' } } });
    }
    if (!expanded && plugin.layout.state.regionState.left === 'full') {
        await PluginCommands.Layout.Update(plugin, { state: { regionState: { ...plugin.layout.state.regionState, left: 'collapsed' } } });
    }
}

/** Like `VerticalTabbedPanel` but is bound to plugin.behaviors.layout.leftPanelTabName and plugin.layout.state.regionState (ensures left panel collapsing/expanding) */
export function LeftPanel(options: { tabsTop?: TabSpec[], tabsBottom?: TabSpec[], defaultTab?: string, onTabChange?: (plugin: PluginContext, tab: string) => any }): React.ComponentClass<{}> {
    return VerticalTabbedPanel({
        ...options,
        boundBehavior: plugin => plugin.behaviors.layout.leftPanelTabName as BehaviorSubject<string>,
        onTabChange: (plugin, tab) => {
            const tabPresent = !!(options.tabsTop?.some(t => t.id === tab) || options.tabsBottom?.some(t => t.id === tab));
            adjustLeftPanelState(plugin, tabPresent);
            options.onTabChange?.(plugin, tab);
        },
    });
}
