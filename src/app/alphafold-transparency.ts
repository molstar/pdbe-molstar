 import { Structure, StructureElement } from 'Molstar/mol-model/structure';
 import { PluginStateObject } from 'Molstar/mol-plugin-state/objects';
 import { StateTransforms } from 'Molstar/mol-plugin-state/transforms';
 import { PluginContext } from 'Molstar/mol-plugin/context';
 import { StateBuilder, StateObjectCell, StateSelection, StateTransform } from 'Molstar/mol-state';
 import { StructureComponentRef, StructureRef } from 'Molstar/mol-plugin-state/manager/structure/hierarchy-state';
 import { isEmptyLoci, Loci } from 'Molstar/mol-model/loci';
 import { Transparency } from 'Molstar/mol-theme/transparency';
 import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
 import { QualityAssessment } from 'Molstar/extensions/model-archive/quality-assessment/prop';
 import { compile } from 'Molstar/mol-script/runtime/query/compiler';
 import { StructureSelection, QueryContext } from 'Molstar/mol-model/structure';

 type TransparencyEachReprCallback = (update: StateBuilder.Root, repr: StateObjectCell<PluginStateObject.Molecule.Structure.Representation3D, StateTransform<typeof StateTransforms.Representation.StructureRepresentation3D>>, transparency?: StateObjectCell<any, StateTransform<typeof StateTransforms.Representation.TransparencyStructureRepresentation3DFromBundle>>) => Promise<void>
 const TransparencyManagerTag = 'transparency-controls';

function getLociByPLDDT(score: number, contextData: any) {
    const queryExp = MS.struct.modifier.union([
        MS.struct.modifier.wholeResidues([
            MS.struct.modifier.union([
                MS.struct.generator.atomGroups({
                    'chain-test': MS.core.rel.eq([MS.ammp('objectPrimitive'), 'atomistic']),
                    'residue-test': MS.core.rel.lte([QualityAssessment.symbols.pLDDT.symbol(), score]),
                })
            ])
        ])
    ])

    const query = compile<StructureSelection>(queryExp);
    const sel = query(new QueryContext(contextData));
    return StructureSelection.toLociWithSourceUnits(sel);

}

export async function applyAFTransparency(plugin: PluginContext, structure: Readonly<StructureRef>, transparency: number, pLDDT = 70) {
    return plugin.dataTransaction(async ctx => {
        const loci = getLociByPLDDT(pLDDT, structure.cell.obj?.data);
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