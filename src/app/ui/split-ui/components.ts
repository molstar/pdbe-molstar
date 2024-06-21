import { DefaultViewport } from 'molstar/lib/mol-plugin-ui/plugin';
import { SequenceView } from 'molstar/lib/mol-plugin-ui/sequence';
import { PluginUIComponentClass } from './split-ui';


export const UIComponents = {
    /** Component containing 3D canvas, button in top left and top right corners, and tooltip box (center panel in default layout) */
    DefaultViewport,
    /** Component containing 1D view of the sequences (top panel in default layout) */
    SequenceView,
    // TODO add all meaningful components
    // TODO fix overlay
    // TODO test events
} as const satisfies Record<string, PluginUIComponentClass<any>>;
