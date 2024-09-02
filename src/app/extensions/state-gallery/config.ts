import { PluginConfigItem } from 'molstar/lib/mol-plugin/config';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { PluginConfigUtils } from '../../helpers';


/** Default values of plugin config items for the `StateGallery` extension */
export const StateGalleryConfigDefaults = {
    /** Base URL of the state API (list of states will be downloaded from `{ServerUrl}/{entryId}.json`, states from `{ServerUrl}/{stateName}.molj`) */
    ServerUrl: 'https://www.ebi.ac.uk/pdbe/static/entry',
    /** Load canvas properties, such as background, axes indicator, fog, outline (if false, keep current canvas properties) */
    LoadCanvasProps: false,
    /** Load camera orientation when loading state (if false, keep current orientation) */
    LoadCameraOrientation: true,
    /** Time in miliseconds between loading state and starting camera transition */
    CameraPreTransitionMs: 100,
    /** Duration of the camera transition in miliseconds */
    CameraTransitionMs: 400,
};
/** Values of plugin config items for the `StateGallery` extension */
export type StateGalleryConfigValues = typeof StateGalleryConfigDefaults;

/** Definition of plugin config items for the `StateGallery` extension */
export const StateGalleryConfig: PluginConfigUtils.ConfigFor<StateGalleryConfigValues> = {
    ServerUrl: new PluginConfigItem<string>('pdbe-state-gallery.server-url', StateGalleryConfigDefaults.ServerUrl),
    LoadCanvasProps: new PluginConfigItem<boolean>('pdbe-state-gallery.load-canvas-props', StateGalleryConfigDefaults.LoadCanvasProps),
    LoadCameraOrientation: new PluginConfigItem<boolean>('pdbe-state-gallery.load-camera-orientation', StateGalleryConfigDefaults.LoadCameraOrientation),
    CameraPreTransitionMs: new PluginConfigItem<number>('pdbe-state-gallery.camera-pre-transition-ms', StateGalleryConfigDefaults.CameraPreTransitionMs),
    CameraTransitionMs: new PluginConfigItem<number>('pdbe-state-gallery.camera-transition-ms', StateGalleryConfigDefaults.CameraTransitionMs),
};

/** Retrieve config values the `StateGallery` extension from the current plugin config */
export function getStateGalleryConfig(plugin: PluginContext): StateGalleryConfigValues {
    return PluginConfigUtils.getConfigValues(plugin, StateGalleryConfig, StateGalleryConfigDefaults);
}
