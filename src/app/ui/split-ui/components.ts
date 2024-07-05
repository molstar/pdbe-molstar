import { ControlsWrapper, Log } from 'Molstar/mol-plugin-ui/plugin';
import { SequenceView } from 'Molstar/mol-plugin-ui/sequence';
import { JSXElementConstructor } from 'react';
import { PDBeViewport } from '../pdbe-viewport';
import { PDBeLeftPanelControls } from '../pdbe-left-panel';


export const UIComponents = {
    /** Component containing 3D canvas, button in top left and top right corners, and tooltip box (center panel in default layout) */
    PDBeViewport,

    /** Component containing 1D view of the sequences (top panel in default layout) */
    SequenceView,

    /** Component containing log messages (bottom panel in default layout) */
    Log,

    /** Component containing left panel controls (contents depend on PDBeMolstar init params (superposition/ligand/default view)) */
    PDBeLeftPanelControls,

    /** Component containing right panel controls (contents depend on PDBeMolstar init params (superposition/ligand/default view)) */
    ControlsWrapper,
    // PDBeStructureTools,

    // TODO add all meaningful components,
} as const satisfies Record<string, JSXElementConstructor<any>>;
