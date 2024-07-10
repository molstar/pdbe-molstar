import { LeftPanel } from './core';
import { CoreLeftPanelTabs, PDBeLeftPanelTabs } from './tabs';


/** Left panel in core Molstar */
export const DefaultLeftPanelControls = LeftPanel({
    tabsTop: [
        CoreLeftPanelTabs.root,
        CoreLeftPanelTabs.data,
        CoreLeftPanelTabs.states,
        CoreLeftPanelTabs.help,
        PDBeLeftPanelTabs.segments,
    ],
    tabsBottom: [
        CoreLeftPanelTabs.settings,
    ],
    defaultTab: 'none',
});


/** Left panel in PDBe Molstar */
export const PDBeLeftPanelControls = LeftPanel({
    tabsTop: [
        CoreLeftPanelTabs.help,
        PDBeLeftPanelTabs.segments,
    ],
    tabsBottom: [
        CoreLeftPanelTabs.settings,
    ],
    defaultTab: 'none',
});
