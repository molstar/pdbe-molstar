/** Entrypoint for the bundler. If you want to import PDBeMolstarPlugin without CSS, import from ./viewer instead. */

export * from './viewer';
import { PDBeMolstarPlugin } from './viewer';

import 'molstar/lib/mol-plugin-ui/skin/dark.scss';
import './styles/index.scss';

(window as any).PDBeMolstarPlugin = PDBeMolstarPlugin;
