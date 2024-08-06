import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import { BehaviorSubject } from 'rxjs';
import { clearExtensionCustomState, extensionCustomStateGetter } from '../../plugin-custom-state';
import { StateGalleryManager } from './manager';
import { StateGalleryControls } from './ui';


export const StateGalleryExtensionName = 'pdbe-state-gallery';

/** All public functions provided by the StateGallery extension  */
export const StateGalleryExtensionFunctions = {
    StateGalleryManager,
};

export type StateGalleryCustomState = {
    title: BehaviorSubject<string | undefined>,
}
export const StateGalleryCustomState = extensionCustomStateGetter<StateGalleryCustomState>(StateGalleryExtensionName);


export const StateGallery = PluginBehavior.create<{ autoAttach: boolean }>({
    name: StateGalleryExtensionName,
    category: 'misc',
    display: {
        name: '3D State Gallery',
        description: 'Browse pre-computed 3D states for a PDB entry',
    },
    ctor: class extends PluginBehavior.Handler<{ autoAttach: boolean }> {
        register(): void {
            // this.ctx.state.data.actions.add(InitAssemblySymmetry3D);
            // this.ctx.customStructureProperties.register(this.provider, this.params.autoAttach);
            // this.ctx.representation.structure.themes.colorThemeRegistry.add(AssemblySymmetryClusterColorThemeProvider);

            // this.ctx.genericRepresentationControls.set(Tag.Representation, selection => {
            //     const refs: GenericRepresentationRef[] = [];
            //     selection.structures.forEach(structure => {
            //         const symmRepr = structure.genericRepresentations?.filter(r => r.cell.transform.transformer.id === AssemblySymmetry3D.id)[0];
            //         if (symmRepr) refs.push(symmRepr);
            //     });
            //     return [refs, 'Symmetries'];
            // });
            StateGalleryCustomState(this.ctx).title = new BehaviorSubject<string | undefined>(undefined);
            this.ctx.customStructureControls.set(StateGalleryExtensionName, StateGalleryControls as any);
            // this.ctx.builders.structure.representation.registerPreset(AssemblySymmetryPreset);
        }

        // update(p: { autoAttach: boolean }) {
        //     const updated = this.params.autoAttach !== p.autoAttach;
        //     this.params.autoAttach = p.autoAttach;
        //     this.ctx.customStructureProperties.setDefaultAutoAttach(this.provider.descriptor.name, this.params.autoAttach);
        //     return updated;
        // }

        unregister() {
            // this.ctx.state.data.actions.remove(InitAssemblySymmetry3D);
            // this.ctx.customStructureProperties.unregister(this.provider.descriptor.name);
            // this.ctx.representation.structure.themes.colorThemeRegistry.remove(AssemblySymmetryClusterColorThemeProvider);

            // this.ctx.genericRepresentationControls.delete(Tag.Representation);
            // this.ctx.customStructureControls.delete(Tag.Representation);
            // this.ctx.builders.structure.representation.unregisterPreset(AssemblySymmetryPreset);
            this.ctx.customStructureControls.delete(StateGalleryExtensionName);
            clearExtensionCustomState(this.ctx, StateGalleryExtensionName);
        }
    },
    // params: () => ({
    //     autoAttach: PD.Boolean(false),
    //     serverUrl: PD.Text(AssemblySymmetryData.DefaultServerUrl)
    // })
});
