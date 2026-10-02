

import { type Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import type { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateTransformer } from 'molstar/lib/mol-state/transformer';
import { MarkerAction } from 'molstar/lib/mol-util/marker-action';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';


const InterfaceInteractionsHighlightParams = {
    radius: PD.Numeric(5, { min: 0, max: 20, step: 1 }),
};
type InterfaceInteractionsHighlightProps = PD.Values<typeof InterfaceInteractionsHighlightParams>;


const RADIUS = 5;

export const InterfaceInteractionsHighlight = PluginBehavior.create<InterfaceInteractionsHighlightProps>({
    name: 'interface-interaction-highlight',
    category: 'interaction',
    ctor: class extends PluginBehavior.Handler<InterfaceInteractionsHighlightProps> {
        private readonly provider = interfaceInteractionsHighlightProvider(this.ctx, RADIUS);
        register() {
            console.log('registering InterfaceInteractionsHighlight', this.params);
            this.ctx.managers.interactivity.lociHighlights.addProvider(this.provider);
        }
        unregister() {
            console.log('unregistering InterfaceInteractionsHighlight');
            this.ctx.managers.interactivity.lociHighlights.removeProvider(this.provider);
        }
    },
    params: () => InterfaceInteractionsHighlightParams,
    display: { name: 'Highlight Interface Interactions' },
});


/** Add behavior to `plugin` */
export async function addBehavior(plugin: PluginContext, behavior: StateTransformer) {
    if (plugin.state.hasBehavior(behavior)) return;
    await plugin.state.updateBehavior(behavior, p => p);
}
/** Remove behavior from `plugin`, if present */
export async function removeBehavior(plugin: PluginContext, behavior: StateTransformer) {
    if (!plugin.state.hasBehavior(behavior)) return;
    const tree = plugin.state.behaviors.build();
    tree.delete(behavior.id);
    await plugin.runTask(plugin.state.behaviors.updateTree(tree));
}

export function addInterfaceInteractionsHighlightBehavior(plugin: PluginContext) {
    return addBehavior(plugin, InterfaceInteractionsHighlight);
}
export function removeInterfaceInteractionsHighlightBehavior(plugin: PluginContext) {
    return removeBehavior(plugin, InterfaceInteractionsHighlight);
}



export function interfaceInteractionsHighlightProvider(plugin: PluginContext, radius: number): InteractivityManager.LociMarkProvider {
    let previous: StructureElement.Loci[] | undefined = undefined;

    return async (loci, action) => {
        if ((action === MarkerAction.Highlight || action === MarkerAction.RemoveHighlight) && previous) {
            for (const l of previous) {
                plugin.canvas3d?.mark({ loci: l }, MarkerAction.Clear);
            }
            previous = undefined;
        }
        if (action === MarkerAction.Highlight && StructureElement.Loci.is(loci.loci)) {
            const interactingLoci = getInteractingLociInAllStructures(plugin, loci.loci, radius);
            for (const l of interactingLoci) {
                plugin.canvas3d?.mark({ loci: l }, MarkerAction.Highlight);
            }
            previous = interactingLoci;
        }
    };
}

/** Get loci with all residues which are within `radius` from `sourceLoci` but belong to a different chain, in all structures in `plugin` which are equivalent to the structure of `sourceLoci`. */
function getInteractingLociInAllStructures(plugin: PluginContext, sourceLoci: StructureElement.Loci, radius: number): StructureElement.Loci[] {
    const equivStructs = getEquivalentStructures(sourceLoci.structure.root, plugin);
    return equivStructs.map(struct => getInteractingLoci(StructureElement.Loci.remap(sourceLoci, struct), radius));
}

/** Get all structures loaded in `plugin` which are equivalent to `struct`, i.e. they are the same assembly created from the same model. */
function getEquivalentStructures(struct: Structure, plugin: PluginContext): Structure[] {
    return plugin.managers.structure.hierarchy.current.structures
        .map(s => s.cell.obj?.data)
        .filter(s => s !== undefined)
        .filter(s => s.model.id === struct.model.id && s.hashCode === struct.hashCode);
}

/** Get loci with all residues which are within `radius` from `loci` but belong to a different chain */
function getInteractingLoci(loci: StructureElement.Loci, radius: number): StructureElement.Loci {
    const residues = StructureElement.Loci.extendToWholeResidues(loci);
    const extended = StructureElement.Loci.extendToWholeResidues(StructureElement.Loci.extendToRadius(residues, radius));
    return StructureElement.Loci.subtract(extended, StructureElement.Loci.extendToWholeChains(loci));
}
