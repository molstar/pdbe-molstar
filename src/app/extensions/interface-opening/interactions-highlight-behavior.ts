

import { Loci } from 'molstar/lib/mol-model/loci';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure';
import { InteractivityManager } from 'molstar/lib/mol-plugin-state/manager/interactivity';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateTransformer } from 'molstar/lib/mol-state/transformer';
import { MarkerAction } from 'molstar/lib/mol-util/marker-action';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { addOrUpdatePluginBehavior, removePluginBehavior } from '../../helpers';


/** PluginBehavior that highlights inter-chain interactions with the currently highlighted selection, i.e. highlights atoms/residues/chains (depending on current granularity) within `radius` of the currently highlighted selection but belonging to a different chain. */
export namespace InterfaceInteractionsHighlight {
    export const Params = {
        /** Radius in Angstroms, used to judge whether two atoms are interacting. */
        radius: PD.Numeric(5, { min: 0 }),
    };
    export type Params = typeof Params;
    export type Props = PD.Values<Params>;

    /** PluginBehavior that highlights inter-chain interactions with the currently highlighted selection, i.e. highlights atoms/residues/chains (depending on current granularity) within `radius` of the currently highlighted selection but belonging to a different chain. */
    export const Behavior: StateTransformer<any, any, Props> = PluginBehavior.create<Props>({
        name: 'interface-interaction-highlight',
        category: 'interaction',
        display: {
            name: 'Interface Interactions Highlight',
            description: 'Highlights inter-chain interactions with the currently highlighted selection, i.e. highlights atoms/residues/chains (depending on current granularity) within `radius` of the currently highlighted selection but belonging to a different chain..',
        },
        ctor: class extends PluginBehavior.Handler<Props> {
            private readonly highlighter = createInterfaceInteractionsHighlighter(this.ctx, this.params.radius);

            register() {
                this.ctx.managers.interactivity.lociHighlights.addProvider(this.highlighter.lociMarkProvider);
            }
            update(p: Props) {
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
        params: () => Params,
    });

    export function addOrUpdateBehavior(plugin: PluginContext, props?: Props): Promise<void> {
        return addOrUpdatePluginBehavior(plugin, Behavior, props);
    }

    export function removeBehavior(plugin: PluginContext) {
        return removePluginBehavior(plugin, Behavior);
    }
}


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
    const granularity = plugin.managers.interactivity.state.props.granularity;
    const equivStructs = getEquivalentStructures(sourceLoci.structure.root, plugin);
    return equivStructs.map(struct => getInteractingLoci(StructureElement.Loci.remap(sourceLoci, struct), radius, granularity));
}

/** Get all structures loaded in `plugin` which are equivalent to `struct`, i.e. they are the same assembly created from the same model. */
function getEquivalentStructures(struct: Structure, plugin: PluginContext): Structure[] {
    return plugin.managers.structure.hierarchy.current.structures
        .map(s => s.cell.obj?.data)
        .filter(s => s !== undefined)
        .filter(s => s.model.id === struct.model.id && s.hashCode === struct.hashCode);
}

/** Get loci with all residues which are within `radius` from `loci` but belong to a different chain */
function getInteractingLoci(loci: StructureElement.Loci, radius: number, granularity?: InteractivityManager.Props['granularity']): StructureElement.Loci {
    let extended = StructureElement.Loci.extendToRadius(loci, radius);
    if (granularity) {
        const granularized = Loci.applyGranularity(extended, granularity);
        if (!StructureElement.Loci.is(granularized)) throw new Error(`AssertionError: Loci.applyGranularity returned different kinf of loci: ${granularized.kind}`);
        extended = granularized;
    }
    return StructureElement.Loci.subtract(extended, StructureElement.Loci.extendToWholeChains(loci));
}
