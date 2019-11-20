import { StateAction } from 'Molstar/mol-state';
import { StateTransforms } from 'Molstar/mol-plugin/state/transforms';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginStateObject } from 'Molstar/mol-plugin/state/objects';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { StateElements } from './helpers';

export const CreateSourceVisual = StateAction.build({
    display: { name: 'Source' },
    params(a, ctx: PluginContext) {
        let parmaObj: any = undefined;

        const customState = (ctx.customState as any)
        
        let defaultSource : 'deposited' | 'symmetry' | 'assembly' = 'deposited';
        let sourceArr: ['deposited' | 'symmetry' | 'assembly', string][] = [['deposited', 'Deposited file']];
        if(customState.initParams){
            if(customState.initParams.assemblyId === 'Symmetry'){
                defaultSource = 'symmetry';
            }else if(customState.initParams.assemblyId === 'preferred'){
                defaultSource = 'assembly';
            }else{
                if(customState.info && customState.info.assemblies){
                    customState.info.assemblies.forEach((infoRec:any) => {
                        if(infoRec.id === customState.initParams.assemblyId) defaultSource = 'assembly';
                    });
                }
            }
        }

        let asmArr: [string,string][] = [];
        let defaultAsm = '';
        if(customState.info && customState.info.assemblies){
            sourceArr = [['deposited', 'Deposited file'], ['assembly', 'Assembly']]; //, ['symmetry', 'Symmetry']
            customState.info.assemblies.forEach((infoRec:any) => {
                const asmVal = infoRec.isPreferred ? infoRec.id+' (Preferred)' : infoRec.id;
                asmArr.push([infoRec.id, asmVal]);
                if(customState.initParams.assemblyId && (infoRec.id === customState.initParams.assemblyId || (customState.initParams.assemblyId === 'preferred' && infoRec.isPreferred))){
                    defaultAsm = infoRec.id;
                }
            });
            if(defaultAsm == '' && asmArr.length > 0) defaultAsm = asmArr[0][0];
        }

        if(defaultAsm == ''){
            sourceArr.pop();
            defaultSource = 'deposited'
        }

        parmaObj = {
            source: PD.MappedStatic(defaultSource, {
                'deposited': PD.Group({}),
                'assembly': (defaultAsm == '') ? PD.Group({}) : PD.Select(defaultAsm, asmArr, { label: 'Asm. Id' }),
                'symmetry': (defaultAsm == '') ? PD.Group({}) : PD.Group({
                    type: PD.Select('mates', [['mates', 'Mates'], ['interaction', 'Interaction']]),
                    radius: PD.Numeric(5, { min: 0, max: 25, step: 1 })
                }, {isFlat: true})
            }, { options: sourceArr })
        }

        if(customState.info && customState.info.modelCount && customState.info.modelCount > 1){
            parmaObj['model'] = PD.Numeric(1, { min: 1, max: customState.info.modelCount, step: 1 })
        }

        return parmaObj;
    },
    from: PluginStateObject.Molecule.Model
})(async ({ ref, state, params }, plugin: PluginContext) => {
    try {

        const selectedParams = params as any;

        //update model index
        if(selectedParams.model){
            const modelTree = state.build();
            modelTree.to(StateElements.Model)
                .update(StateTransforms.Model.ModelFromTrajectory, p => ({ ...p, modelIndex: (selectedParams.model - 1) }))
            await PluginCommands.State.Update.dispatch(plugin, { state, tree: modelTree });
        }

        //update assembly
        const tree = state.build();
        tree.to(StateElements.Assembly).update(StateTransforms.Model.StructureAssemblyFromModel, p => ({ ...p, id: (selectedParams.source.name == 'deposited') ? 'deposited' : selectedParams.source.params as string }));
        await PluginCommands.State.Update.dispatch(plugin, { state, tree });
        await PluginCommands.Camera.Reset.dispatch(plugin, { });
        
    } catch (e) {
        plugin.log.error(`Source rendering Failed: ${e}`);
    }
});