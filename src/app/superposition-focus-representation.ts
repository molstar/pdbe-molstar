import { StructureElement } from 'Molstar/mol-model/structure';
import { createStructureRepresentationParams } from 'Molstar/mol-plugin-state/helpers/structure-representation-params';
import { PluginStateObject } from 'Molstar/mol-plugin-state/objects';
import { StateTransforms } from 'Molstar/mol-plugin-state/transforms';
import { PluginBehavior } from 'Molstar/mol-plugin/behavior';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { StateObjectCell, StateSelection, StateTransform } from 'Molstar/mol-state';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { PluginCommands } from 'Molstar/mol-plugin/commands';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { lociDetails } from './loci-details';

const SuperpositionFocusRepresentationParams = (plugin: PluginContext) => {
    const reprParams = StateTransforms.Representation.StructureRepresentation3D.definition.params!(void 0, plugin) as PD.Params;
    return {
        expandRadius: PD.Numeric(5, { min: 1, max: 10, step: 1 }),
        surroundingsParams: PD.Group(reprParams, {
            label: 'Surroundings',
            customDefault: createStructureRepresentationParams(plugin, void 0, { type: 'ball-and-stick', size: 'physical', typeParams: { sizeFactor: 0.16 }, sizeParams: { scale: 0.3 } })
        })
    };
};

type SuperpositionFocusRepresentationProps = PD.ValuesFor<ReturnType<typeof SuperpositionFocusRepresentationParams>>

export enum SuperpositionFocusRepresentationTags {
    SurrSel = 'superposition-focus-surr-sel',
    SurrRepr = 'superposition-focus-surr-repr'
}

const TagSet: Set<SuperpositionFocusRepresentationTags> = new Set([SuperpositionFocusRepresentationTags.SurrSel, SuperpositionFocusRepresentationTags.SurrRepr]);

class SuperpositionFocusRepresentationBehavior extends PluginBehavior.WithSubscribers<SuperpositionFocusRepresentationProps> {
    private get surrLabel() { return `[Focus] Surroundings (${this.params.expandRadius} Å)`; }

    private ensureShape(cell: StateObjectCell<PluginStateObject.Molecule.Structure>) {
        const state = this.plugin.state.data, tree = state.tree;
        const builder = state.build();
        const refs = StateSelection.findUniqueTagsInSubtree(tree, cell.transform.ref, TagSet);

        // Selections
        if (!refs[SuperpositionFocusRepresentationTags.SurrSel]) {
            refs[SuperpositionFocusRepresentationTags.SurrSel] = builder
                .to(cell)
                .apply(StateTransforms.Model.StructureSelectionFromExpression,
                    { expression: MS.struct.generator.empty(), label: this.surrLabel }, { tags: SuperpositionFocusRepresentationTags.SurrSel }).ref;
        }

        // Representations
        if (!refs[SuperpositionFocusRepresentationTags.SurrRepr]) {
            refs[SuperpositionFocusRepresentationTags.SurrRepr] = builder
                .to(refs[SuperpositionFocusRepresentationTags.SurrSel]!)
                .apply(StateTransforms.Representation.StructureRepresentation3D, this.params.surroundingsParams, { tags: SuperpositionFocusRepresentationTags.SurrRepr }).ref;
        }

        return { state, builder, refs };
    }

    private clear(root: StateTransform.Ref) {
        const state = this.plugin.state.data;

        const surrs = state.select(StateSelection.Generators.byRef(root).subtree().withTag(SuperpositionFocusRepresentationTags.SurrSel));
        if (surrs.length === 0) return;

        const update = state.build();
        const expression = MS.struct.generator.empty();
        for (const s of surrs) {
            update.to(s).update(StateTransforms.Model.StructureSelectionFromExpression, old => ({ ...old, expression }));
        }

        return PluginCommands.State.Update(this.plugin, { state, tree: update, options: { doNotLogTiming: true, doNotUpdateCurrent: true } });
    }

    private async focus(sourceLoci: StructureElement.Loci) {
        const parent = this.plugin.helpers.substructureParent.get(sourceLoci.structure);
        if (!parent || !parent.obj) return;

        const loci = StructureElement.Loci.remap(sourceLoci, parent.obj!.data);

        const residueLoci = StructureElement.Loci.extendToWholeResidues(loci);
        const residueBundle = StructureElement.Bundle.fromLoci(residueLoci);
        const target = StructureElement.Bundle.toExpression(residueBundle);

        let surroundings = MS.struct.modifier.includeSurroundings({
            0: target,
            radius: this.params.expandRadius,
            'as-whole-residues': true
        });

        const lociDeatils = lociDetails(sourceLoci);
        if (!lociDeatils) {
            surroundings = MS.struct.modifier.exceptBy({
                0: surroundings,
                by: target
            });
        }

        const { state, builder, refs } = this.ensureShape(parent);

        builder.to(refs[SuperpositionFocusRepresentationTags.SurrSel]!).update(StateTransforms.Model.StructureSelectionFromExpression, old => ({ ...old, expression: surroundings, label: this.surrLabel }));

        await PluginCommands.State.Update(this.plugin, { state, tree: builder, options: { doNotLogTiming: true, doNotUpdateCurrent: true } });
    }

    register(ref: string): void {
        this.subscribeObservable(this.plugin.managers.structure.focus.behaviors.current, (entry) => {
            // if (entry) this.focus(entry.loci);
            // else this.clear(StateTransform.RootRef);
            this.clear(StateTransform.RootRef);
            if (entry) this.focus(entry.loci);
        });
    }

    async update(params: SuperpositionFocusRepresentationProps) {
        const old = this.params;
        this.params = params;

        const state = this.plugin.state.data;
        const builder = state.build();

        const all = StateSelection.Generators.root.subtree();

        for (const repr of state.select(all.withTag(SuperpositionFocusRepresentationTags.SurrRepr))) {
            builder.to(repr).update(this.params.surroundingsParams);
        }

        await PluginCommands.State.Update(this.plugin, { state, tree: builder, options: { doNotLogTiming: true, doNotUpdateCurrent: true } });

        if (params.expandRadius !== old.expandRadius) await this.clear(StateTransform.RootRef);

        return true;
    }
}

export const SuperpositionFocusRepresentation = PluginBehavior.create({
    name: 'create-superposition-focus-representation',
    display: { name: 'Superposition Focus Representation' },
    category: 'interaction',
    ctor: SuperpositionFocusRepresentationBehavior,
    params: (_, plugin) => SuperpositionFocusRepresentationParams(plugin)
});