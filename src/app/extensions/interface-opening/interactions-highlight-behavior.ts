

import { type Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import type { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateTransformer } from 'molstar/lib/mol-state/transformer';
import { MarkerAction } from 'molstar/lib/mol-util/marker-action';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';


const InterfaceInteractionsHighlightParams = {
    radius: PD.Numeric(5, { min: 0 }),
};
type InterfaceInteractionsHighlightProps = PD.Values<typeof InterfaceInteractionsHighlightParams>;


export const InterfaceInteractionsHighlight: StateTransformer<any, any, InterfaceInteractionsHighlightProps> = PluginBehavior.create<InterfaceInteractionsHighlightProps>({
    name: 'interface-interaction-highlight',
    category: 'interaction',
    ctor: class extends PluginBehavior.Handler<InterfaceInteractionsHighlightProps> {
        private readonly highlighter = createInterfaceInteractionsHighlighter(this.ctx, this.params.radius);

        register() {
            this.ctx.managers.interactivity.lociHighlights.addProvider(this.highlighter.lociMarkProvider);
        }
        update(p: InterfaceInteractionsHighlightProps) {
            let updated = false;
            if (this.params.radius !== p.radius) {
                this.params.radius = p.radius;
                this.highlighter.radius = p.radius;
                updated = true;
            }
            return updated;
        }
        unregister() {
            this.highlighter.dispose();
            this.ctx.managers.interactivity.lociHighlights.removeProvider(this.highlighter.lociMarkProvider);
        }
    },
    params: () => InterfaceInteractionsHighlightParams,
    display: { name: 'Highlight Interface Interactions' },
});


function createInterfaceInteractionsHighlighter(plugin: PluginContext, initialRadius: number) {
    let radius = initialRadius;
    let previous: StructureElement.Loci[] | undefined = undefined;

    const clearPrevious = () => {
        if (!previous) return;
        for (const loci of previous) {
            plugin.canvas3d?.mark({ loci }, MarkerAction.Clear);
        }
        previous = undefined;
    };

    const lociMarkProvider: InteractivityManager.LociMarkProvider = async (loci, action) => {
        if (action === MarkerAction.Highlight || action === MarkerAction.RemoveHighlight) {
            clearPrevious();
        }
        if (action === MarkerAction.Highlight && StructureElement.Loci.is(loci.loci)) {
            const interactingLoci = getInteractingLociInAllStructures(plugin, loci.loci, radius);
            for (const l of interactingLoci) {
                plugin.canvas3d?.mark({ loci: l }, MarkerAction.Highlight);
            }
            previous = interactingLoci;
        }
    };

    return {
        lociMarkProvider,
        get radius() { return radius; },
        set radius(value: number) { radius = value; },
        dispose() {
            clearPrevious();
        },
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
