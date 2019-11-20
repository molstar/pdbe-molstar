import { StateSelection } from 'Molstar/mol-state';
import { PluginCommands } from 'Molstar/mol-plugin/command';
import { StateElements } from './helpers';
import { InitVolumeStreaming, CreateVolumeStreamingInfo } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { Binding } from 'Molstar/mol-util/binding';
import { ButtonsType, ModifiersKeys } from 'Molstar/mol-util/input/input-observer';
import { ModelInfo } from './helpers';

export async function toggleMap (applyMap: boolean, plugin: any, state: any, isLigandView?: boolean){
     
        const nodeRef = StateElements.Assembly;
        const streamingState = state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0];

        if(applyMap){

            if(streamingState){
                PluginCommands.State.ToggleVisibility.dispatch(plugin, { state: state, ref: streamingState.transform.ref });
                return;
            }

            const node = state.select(nodeRef)[0].obj!;
            const params = InitVolumeStreaming.createDefaultParams(node, plugin);
            params.options.behaviorRef = StateElements.VolumeStreaming;
            params.options.emContourProvider = 'pdbe';
            params.defaultView = 'selection-box';
            //const exptMethod = getStreamingMethod(node.data);
            const exptMethod = ModelInfo.getStreamingMethod(node.data);
           
            if(exptMethod == 'nmr') return;
            if(exptMethod == 'em' && !isLigandView){
                params.defaultView = 'cell';
            }
            params.options.serverUrl = 'https://www.ebi.ac.uk/pdbe/densities';
            params.options.channelParams['em'] = {opacity: 0.49}
            params.options.channelParams['2fo-fc'] = {opacity: 0.49};
            params.options.channelParams['fo-fc(+ve)'] = { wireframe: true };
            params.options.channelParams['fo-fc(-ve)'] = { wireframe: true };
            if(isLigandView) params.options.channelParams['2fo-fc'] = {opacity: 0.15};
            params.options.bindings = {
                clickVolumeAroundOnly: Binding([Binding.Trigger(ButtonsType.Flag.Primary, ModifiersKeys.create())], 'Show the volume around only the clicked element using ${trigger}.'),
            }
            await plugin.runTask(state.applyAction(InitVolumeStreaming, params, StateElements.Assembly));

            if(exptMethod !== 'em' && !isLigandView){
                PluginCommands.Toast.Show.dispatch(plugin, {
                    title: 'Map',
                    message: 'Streaming enabled, click on a residue or an atom to view the data.',
                    key: 'toast-1',
                    timeoutMs: 7000
                });
            }

        }else {
            //const r = state.select(StateSelection.Generators.ofTransformer(CreateVolumeStreamingInfo))[0];
            if (!streamingState) return;
            // PluginCommands.State.RemoveObject.dispatch(plugin, { state: state, ref: r.transform.ref });

            PluginCommands.State.ToggleVisibility.dispatch(plugin, { state: state, ref: streamingState.transform.ref });
        }

    }