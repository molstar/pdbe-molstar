import { PluginContext } from 'Molstar/mol-plugin/context';
import { StateTransforms } from 'Molstar/mol-plugin/state/transforms';
import { PluginStateObject } from 'Molstar/mol-plugin/state/objects';
import { StateElements, QueryHelper } from './helpers';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { createCoreVisualParams, createSurVisualParams } from './complex';
import { toggleMap } from './maps';
import { ButtonsType, ModifiersKeys } from 'Molstar/mol-util/input/input-observer';
import { State } from 'molstar/src/mol-state';

export async function createLigandStructure (plugin: PluginContext, state: State, params?: {label_comp_id?: string, auth_asym_Id?: string, auth_seq_id?: string}) {

    const customState = plugin.customState as any;
    const initParams = customState.initParams;

    const compId = params ? params.label_comp_id : initParams.ligandView.label_comp_id;
    let authAsymId: string|undefined;
    const authSeqId: number = (params && params.auth_seq_id) ? parseInt(params.auth_seq_id) : parseInt(initParams.ligandView.auth_seq_id);
    if(params && params.auth_asym_Id){ 
        authAsymId = params.auth_asym_Id;
    }else if(initParams.ligandView.auth_asym_Id){
        authAsymId = initParams.ligandView.auth_asym_Id;
    }

    if (!state.transforms.has(StateElements.Assembly)) return;
    await PluginCommands.Camera.Reset.dispatch(plugin, { });

    const update = state.build();

    update.delete(StateElements.HetGroupFocusGroup);

    let queryObject : any = {
        'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()])
    }

    if(compId) queryObject['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_comp_id(), compId]);

    if(authAsymId){
        queryObject['chain-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), authAsymId])
    }

    if(authSeqId){
        queryObject['residue-test'] = MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), authSeqId])
    }

    const core = MS.struct.filter.first([
        MS.struct.generator.atomGroups(queryObject)
    ]);
    const surroundings = MS.struct.modifier.includeSurroundings({ 0: core, radius: 5, 'as-whole-residues': true });

    const group = update.to(StateElements.Assembly).group(StateTransforms.Misc.CreateGroup, { label: compId }, { ref: StateElements.HetGroupFocusGroup });

    group.apply(StateTransforms.Model.StructureSelectionFromExpression, { label: 'Core', expression: core }, { ref: StateElements.HetGroupFocus })
        .apply(StateTransforms.Representation.StructureRepresentation3D, createCoreVisualParams(state, plugin), {ref: StateElements.HetVisual});
    group.apply(StateTransforms.Model.StructureSelectionFromExpression, { label: 'Surroundings', expression: surroundings })
        .apply(StateTransforms.Representation.StructureRepresentation3D, createSurVisualParams(state, plugin), {ref: StateElements.HetSurroundingVisual});
   
    await PluginCommands.State.Update.dispatch(plugin, { state: plugin.state.dataState, tree: update });

    if(initParams.loadMaps && !params) await toggleMap(true, plugin, state, true);

    const focusData = (state.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure).data;
    const hetLoci = QueryHelper.getHetLoci(core, focusData);
    const buttons = 1 as ButtonsType;
    const modifiers =  ModifiersKeys.create();
    const ev = { current: {loci: hetLoci}, buttons, modifiers }
    await plugin.behaviors.interaction.click.next(ev);
    

    // const focus = (this.state.select(StateElements.HetGroupFocus)[0].obj as PluginStateObject.Molecule.Structure).data;
    // const sphere = focus.boundary.sphere;
    // const snapshot = this.plugin.canvas3d.camera.getFocus(sphere.center, Math.max(sphere.radius, 5));
    // await PluginCommands.Camera.SetSnapshot.dispatch(this.plugin, { snapshot, durationMs: 250 });
  
}