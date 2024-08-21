import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { BehaviorSubject } from 'rxjs';
import { CustomControls, clearExtensionCustomState, extensionCustomStateGetter } from '../../plugin-custom-state';
import { LoadingStatus, StateGalleryManager } from './manager';
import { StateGalleryControls, StateGalleryTitleBox } from './ui';


export const StateGalleryExtensionName = 'pdbe-state-gallery';

export interface StateGalleryCustomState {
    title: BehaviorSubject<string | undefined>,
    manager: BehaviorSubject<StateGalleryManager | undefined>,
    status: BehaviorSubject<LoadingStatus>,
}
export const StateGalleryCustomState = extensionCustomStateGetter<StateGalleryCustomState>(StateGalleryExtensionName);

export interface StateGalleryParams {
    showStructureControls: boolean,
    showTitleBox: boolean,
}


export const StateGallery = PluginBehavior.create<StateGalleryParams>({
    name: StateGalleryExtensionName,
    category: 'misc',
    display: {
        name: '3D State Gallery',
        description: 'Browse pre-computed 3D states for a PDB entry',
    },
    ctor: class extends PluginBehavior.Handler<StateGalleryParams> {
        register(): void {
            StateGalleryCustomState(this.ctx).title = new BehaviorSubject<string | undefined>(undefined);
            StateGalleryCustomState(this.ctx).manager = new BehaviorSubject<StateGalleryManager | undefined>(undefined);
            StateGalleryCustomState(this.ctx).status = new BehaviorSubject<LoadingStatus>('ready');
            this.toggleStructureControls(this.params.showStructureControls);
            this.toggleTitleBox(this.params.showTitleBox);
        }

        update(p: StateGalleryParams): boolean {
            // TODO implement this properly
            throw new Error('NotImplementedError: StateGallery.update');
        }

        unregister() {
            this.toggleStructureControls(false);
            this.toggleTitleBox(false);
            clearExtensionCustomState(this.ctx, StateGalleryExtensionName);
        }

        /** Register/unregister custom structure controls */
        private toggleStructureControls(show: boolean) {
            const registry = this.ctx.customStructureControls;
            if (show) {
                if (!registry.has(StateGalleryExtensionName)) {
                    registry.set(StateGalleryExtensionName, StateGalleryControls as any);
                }
            } else {
                registry.delete(StateGalleryExtensionName);
            }
        }

        /** Register/unregister title box */
        private toggleTitleBox(show: boolean) {
            const registry = CustomControls(this.ctx, 'viewportTopCenter');
            if (show) {
                if (!registry.has(StateGalleryExtensionName)) {
                    registry.set(StateGalleryExtensionName, StateGalleryTitleBox);
                }
            } else {
                registry.delete(StateGalleryExtensionName);
            }
        }
    },
    params: () => ({
        showStructureControls: PD.Boolean(true),
        showTitleBox: PD.Boolean(true),
    }),
});


/** All public functions provided by the StateGallery extension  */
export const StateGalleryExtensionFunctions = {
    StateGalleryManager,
    StateGalleryCustomState,
};
