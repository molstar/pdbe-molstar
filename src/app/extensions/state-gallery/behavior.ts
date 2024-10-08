import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import { shallowEqual } from 'molstar/lib/mol-util';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { BehaviorSubject } from 'rxjs';
import { ExtensionCustomState, PluginCustomControls } from '../../plugin-custom-state';
import { Image, LoadingStatus, StateGalleryManager } from './manager';
import { StateGalleryControls, StateGalleryTitleBox } from './ui';


/** Name used when registering extension, custom controls, etc. */
export const StateGalleryExtensionName = 'pdbe-state-gallery';

/** Plugin-bound state for StateGallery extension */
export interface StateGalleryCustomState {
    requestedImage: BehaviorSubject<Image | undefined>,
    manager: BehaviorSubject<StateGalleryManager | undefined>,
    status: BehaviorSubject<LoadingStatus>,
}
export const StateGalleryCustomState = ExtensionCustomState.getter<StateGalleryCustomState>(StateGalleryExtensionName);

/** Parameters for StateGallery extension */
export interface StateGalleryParams {
    /** Show "3D State Gallery" section in Structure Tools controls */
    showControls: boolean,
    /** Show a box in viewport with state title and arrows to move between states */
    showTitleBox: boolean,
}


/** `StateGallery` extension allows browsing pre-computed 3D states for a PDB entry */
export const StateGallery = PluginBehavior.create<StateGalleryParams>({
    name: StateGalleryExtensionName,
    category: 'misc',
    display: {
        name: '3D State Gallery',
        description: 'Browse pre-computed 3D states for a PDB entry',
    },
    ctor: class extends PluginBehavior.Handler<StateGalleryParams> {
        register(): void {
            StateGalleryCustomState(this.ctx).requestedImage = new BehaviorSubject<Image | undefined>(undefined);
            StateGalleryCustomState(this.ctx).manager = new BehaviorSubject<StateGalleryManager | undefined>(undefined);
            StateGalleryCustomState(this.ctx).status = new BehaviorSubject<LoadingStatus>('ready');
            this.toggleStructureControls(this.params.showControls);
            this.toggleTitleBox(this.params.showTitleBox);
        }

        update(p: StateGalleryParams): boolean {
            if (shallowEqual(p, this.params)) return false;
            this.toggleStructureControls(p.showControls);
            this.toggleTitleBox(p.showTitleBox);
            this.params = p;
            return true;
        }

        unregister() {
            this.toggleStructureControls(false);
            this.toggleTitleBox(false);
            ExtensionCustomState.clear(this.ctx, StateGalleryExtensionName);
        }

        /** Register/unregister custom structure controls */
        private toggleStructureControls(show: boolean) {
            PluginCustomControls.toggle(this.ctx, 'structure-tools', StateGalleryExtensionName, StateGalleryControls, show);
        }
        /** Register/unregister title box */
        private toggleTitleBox(show: boolean) {
            PluginCustomControls.toggle(this.ctx, 'viewport-top-center', StateGalleryExtensionName, StateGalleryTitleBox, show);
        }
    },
    params: () => ({
        showControls: PD.Boolean(true, { description: 'Show "3D State Gallery" section in Structure Tools controls' }),
        showTitleBox: PD.Boolean(true, { description: 'Show a box in viewport with state title and arrows to move between states' }),
    }),
});


/** Public functions provided by the `StateGallery` extension  */
export const StateGalleryExtensionFunctions = {
    StateGalleryManager,
    StateGalleryCustomState,
    UI: {
        StateGalleryControls,
    },
};
