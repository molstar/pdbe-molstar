/** Entrypoint for the bundler. If you want to import PDBeMolstarPlugin without CSS, import from ./viewer instead. */

export * from './viewer';
import { PDBeMolstarPlugin } from './viewer';

import './styles/pdbe-molstar-dark.scss';

(window as any).PDBeMolstarPlugin = PDBeMolstarPlugin;
