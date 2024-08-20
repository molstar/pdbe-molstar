import { QualityAssessment } from 'molstar/lib/extensions/model-archive/quality-assessment/prop';
import { Loci, isEmptyLoci } from 'molstar/lib/mol-model/loci';
import { QueryContext, Structure, StructureElement, StructureSelection } from 'molstar/lib/mol-model/structure';
import { StructureComponentRef, StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PluginStateObject } from 'molstar/lib/mol-plugin-state/objects';
import { StateTransforms } from 'molstar/lib/mol-plugin-state/transforms';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder';
import { compile } from 'molstar/lib/mol-script/runtime/query/compiler';
import { StateBuilder, StateObjectCell, StateSelection, StateTransform } from 'molstar/lib/mol-state';
import { Transparency } from 'molstar/lib/mol-theme/transparency';


type TransparencyEachReprCallback = (update: StateBuilder.Root, repr: StateObjectCell<PluginStateObject.Molecule.Structure.Representation3D, StateTransform<typeof StateTransforms.Representation.StructureRepresentation3D>>, transparency?: StateObjectCell<any, StateTransform<typeof StateTransforms.Representation.TransparencyStructureRepresentation3DFromBundle>>) => Promise<void>;
const TransparencyManagerTag = 'transparency-controls';

function getLociByPLDDT(score: number, contextData: Structure) {
    const queryExp = MS.struct.modifier.union([
        MS.struct.modifier.wholeResidues([
            MS.struct.modifier.union([
                MS.struct.generator.atomGroups({
                    'chain-test': MS.core.rel.eq([MS.ammp('objectPrimitive'), 'atomistic']),
                    'residue-test': MS.core.rel.lte([QualityAssessment.symbols.pLDDT.symbol(), score]),
                }),
            ]),
        ]),
    ]);

    const query = compile<StructureSelection>(queryExp);
    const sel = query(new QueryContext(contextData));
    return StructureSelection.toLociWithSourceUnits(sel);

}

export async function applyAFTransparency(plugin: PluginContext, structure: Readonly<StructureRef>, transparency: number, pLDDT = 70) {
    return plugin.dataTransaction(async ctx => {
        const loci = getLociByPLDDT(pLDDT, structure.cell.obj!.data);
        await setStructureTransparency(plugin, structure.components, transparency, loci);
    }, { canUndo: 'Apply Transparency' });
}

export async function setStructureTransparency(plugin: PluginContext, components: StructureComponentRef[], value: number, loci: StructureElement.Loci, types?: string[]) {
    await eachRepr(plugin, components, async (update, repr, transparencyCell) => {
        if (types && types.length > 0 && !types.includes(repr.params!.values.type.name)) return;

        const structure = repr.obj!.data.sourceData;
        if (Loci.isEmpty(loci) || isEmptyLoci(loci)) return;

        const layer = {
            bundle: StructureElement.Bundle.fromLoci(loci),
            value,
        };

        if (transparencyCell) {
            const bundleLayers = [...transparencyCell.params!.values.layers, layer];
            const filtered = getFilteredBundle(bundleLayers, structure);
            update.to(transparencyCell).update(Transparency.toBundle(filtered));
        } else {
            const filtered = getFilteredBundle([layer], structure);
            update.to(repr.transform.ref)
                .apply(StateTransforms.Representation.TransparencyStructureRepresentation3DFromBundle, Transparency.toBundle(filtered), { tags: TransparencyManagerTag });
        }
    });
}

export async function clearStructureTransparency(plugin: PluginContext, components: StructureComponentRef[], types?: string[]) {
    await eachRepr(plugin, components, async (update, repr, transparencyCell) => {
        if (types && types.length > 0 && !types.includes(repr.params!.values.type.name)) return;
        if (transparencyCell) {
            update.delete(transparencyCell.transform.ref);
        }
    });
}

async function eachRepr(plugin: PluginContext, components: StructureComponentRef[], callback: TransparencyEachReprCallback) {
    const state = plugin.state.data;
    const update = state.build();
    for (const c of components) {
        for (const r of c.representations) {
            const transparency = state.select(StateSelection.Generators.ofTransformer(StateTransforms.Representation.TransparencyStructureRepresentation3DFromBundle, r.cell.transform.ref).withTag(TransparencyManagerTag));
            await callback(update, r.cell, transparency[0]);
        }
    }

    return update.commit({ doNotUpdateCurrent: true });
}

/** filter transparency layers for given structure */
function getFilteredBundle(layers: Transparency.BundleLayer[], structure: Structure) {
    const transparency = Transparency.ofBundle(layers, structure.root);
    const merged = Transparency.merge(transparency);
    return Transparency.filter(merged, structure) as Transparency<StructureElement.Loci>;
}
