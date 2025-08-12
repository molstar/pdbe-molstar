import { ControlsWrapper, Log } from 'molstar/lib/mol-plugin-ui/plugin';
import { SequenceView } from 'molstar/lib/mol-plugin-ui/sequence';
import { JSXElementConstructor } from 'react';
import { DefaultLeftPanelControls, PDBeLeftPanelControls } from '../left-panel/pdbe-left-panel';
import { PDBeViewport } from '../pdbe-viewport';


export const UIComponents = {
    /** Component containing 3D canvas, button in top left and top right corners, and tooltip box (center panel in default layout). Changes to fullscreen view by "Toggle Expanded Viewport" button, or "expanded" option. */
    PDBeViewport,

    /** Component containing 1D view of the sequences (top panel in default layout) */
    SequenceView,

    /** Component containing log messages (bottom panel in default layout) */
    Log,

    /** Component containing left panel controls (contents depend on PDBeMolstar init params (superposition/ligand/default view)) */
    PDBeLeftPanelControls,

    /** Component containing left panel controls as in core Molstar, plus PDBeMolstar-specific tabs */
    DefaultLeftPanelControls,

    /** Component containing right panel controls (contents depend on PDBeMolstar init params (superposition/ligand/default view)) */
    DefaultRightPanelControls: ControlsWrapper,

    // TODO add all meaningful components,
} as const satisfies Record<string, JSXElementConstructor<any>>;
