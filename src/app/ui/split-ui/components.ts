import { SequenceView } from 'Molstar/mol-plugin-ui/sequence';
import { JSXElementConstructor } from 'react';
import { PDBeViewport } from '../pdbe-viewport';


export const UIComponents = {
    /** Component containing 3D canvas, button in top left and top right corners, and tooltip box (center panel in default layout) */
    PDBeViewport,
    /** Component containing 1D view of the sequences (top panel in default layout) */
    SequenceView,
    // TODO add all meaningful components
    // TODO test events
} as const satisfies Record<string, JSXElementConstructor<any>>;
