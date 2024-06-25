import { DefaultViewport } from 'Molstar/mol-plugin-ui/plugin';
import { SequenceView } from 'Molstar/mol-plugin-ui/sequence';
import { JSXElementConstructor } from 'react';
import { WithOverlay } from '../overlay';


export const UIComponents = {
    /** Component containing 3D canvas, button in top left and top right corners, and tooltip box (center panel in default layout) */
    DefaultViewport: WithOverlay(DefaultViewport),
    /** Component containing 1D view of the sequences (top panel in default layout) */
    SequenceView,
    // TODO add all meaningful components
    // TODO fix overlay
    // TODO test events
} as const satisfies Record<string, JSXElementConstructor<any>>;
