import { LeftPanel } from './core';
import { CoreLeftPanelTabs, PDBeLeftPanelTabs } from './tabs';


export const DefaultLeftPanelControls = LeftPanel([
    CoreLeftPanelTabs.root,
    CoreLeftPanelTabs.data,
    CoreLeftPanelTabs.states,
    CoreLeftPanelTabs.help,
    PDBeLeftPanelTabs.segments,
    CoreLeftPanelTabs.settings,
], { defaultTab: 'none' });


// TODO: export const PDBeLeftPanelControls = LeftPanel([...]);

// TODO: create tab registry and allow only using tab names
