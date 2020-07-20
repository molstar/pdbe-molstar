import { PluginContext } from 'Molstar/mol-plugin/context';
import { StateTransforms } from 'Molstar/mol-plugin/state/transforms';
import { PluginStateObject } from 'Molstar/mol-plugin/state/objects';
import { StateElements, QueryHelper } from './helpers';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { createCoreVisualParams, createSurVisualParams } from './complex';
import { toggleMap } from './maps';
import { ButtonsType, ModifiersKeys } from 'Molstar/mol-util/input/input-observer';
import { State } from 'Molstar/mol-state';
import Expression from 'Molstar/mol-script/language/expression';

export async function createBranchedStructure (plugin: PluginContext, state: State, params: any, loadMaps?: boolean) {

    let entityObjArray: any = [];

    params.atom_site.forEach((param: any) => {
            let qEntities: any = {
                'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()]),
                // 'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), param.auth_asym_id+'-1_555']),
                'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), param.auth_seq_id])
            };
            entityObjArray.push(qEntities);
    });

    const atmGroupsQueries: Expression[] = [];

    entityObjArray.forEach((entityObj:any) => {
        atmGroupsQueries.push(MS.struct.generator.atomGroups(entityObj));
    });

    const core =  MS.struct.modifier.union([
        atmGroupsQueries.length === 1
            ? atmGroupsQueries[0]
            // Need to union before merge for fast performance
            : MS.struct.combinator.merge(atmGroupsQueries.map(q => MS.struct.modifier.union([ q ])))
    ]);

    if (!state.transforms.has(StateElements.Assembly)) return;
    await PluginCommands.Camera.Reset.dispatch(plugin, { });

    const update = state.build();

    update.delete(StateElements.HetGroupFocusGroup);

    const surroundings = MS.struct.modifier.includeSurroundings({ 0: core, radius: 5, 'as-whole-residues': true });

    const group = update.to(StateElements.Assembly).group(StateTransforms.Misc.CreateGroup, { label: 'Branched' }, { ref: StateElements.HetGroupFocusGroup });

    group.apply(StateTransforms.Model.StructureSelectionFromExpression, { label: 'Core', expression: core }, { ref: StateElements.HetGroupFocus })
        .apply(StateTransforms.Representation.StructureRepresentation3D, createCoreVisualParams(state, plugin), {ref: StateElements.HetVisual});
    group.apply(StateTransforms.Model.StructureSelectionFromExpression, { label: 'Surroundings', expression: surroundings })
        .apply(StateTransforms.Representation.StructureRepresentation3D, createSurVisualParams(state, plugin), {ref: StateElements.HetSurroundingVisual});
   
    await PluginCommands.State.Update.dispatch(plugin, { state: plugin.state.dataState, tree: update });

    if(loadMaps) await toggleMap(true, plugin, state, true);

    const focusData = (state.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure).data;
    const hetLoci = QueryHelper.getHetLoci(core, focusData);
    const buttons = 1 as ButtonsType;
    const modifiers =  ModifiersKeys.create();
    const ev = { current: {loci: hetLoci}, buttons, modifiers }
    plugin.behaviors.interaction.click.next(ev);
    

}