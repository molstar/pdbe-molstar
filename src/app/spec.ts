import { PluginContext } from 'Molstar/mol-plugin/context';
import { Plugin } from 'Molstar/mol-plugin/ui/plugin'
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { PluginSpec } from 'Molstar/mol-plugin/spec';
import { PluginBehaviors } from 'Molstar/mol-plugin/behavior';
import { CreateVolumeStreamingBehavior } from 'Molstar/mol-plugin/behavior/dynamic/volume-streaming/transformers';
import { VolumeStreamingCustomControls } from 'Molstar/mol-plugin/ui/custom/volume';
import { CreateSourceVisual } from './state-actions';

export const DefaultPluginSpec: PluginSpec = {
    actions: [
        PluginSpec.Action(CreateSourceVisual)
    ],
    behaviors: [
        PluginSpec.Behavior(PluginBehaviors.Representation.HighlightLoci),
        PluginSpec.Behavior(PluginBehaviors.Representation.SelectLoci),
        PluginSpec.Behavior(PluginBehaviors.Representation.DefaultLociLabelProvider),
        PluginSpec.Behavior(PluginBehaviors.Camera.FocusLoci),
        PluginSpec.Behavior(PluginBehaviors.CustomProps.MolstarSecondaryStructure, { autoAttach: true }),
        PluginSpec.Behavior(PluginBehaviors.CustomProps.PDBeStructureQualityReport, { autoAttach: false, showTooltip: true }),
    ],
    customParamEditors: [
        [CreateVolumeStreamingBehavior, VolumeStreamingCustomControls]
    ]
}

export function createPlugin(target: HTMLElement, spec?: PluginSpec): PluginContext {
    const ctx = new PluginContext(spec || DefaultPluginSpec);
    ReactDOM.render(React.createElement(Plugin, { plugin: ctx }), target);
    return ctx;
}

export type InitParams = { 
    moleculeId?: string, pdbeUrl?: string, loadMaps?: boolean, validationAnnotation?: boolean, domainAnnotation?: boolean, 
    lowPrecisionCoords?: boolean, landscape?: boolean, expanded?: boolean, hideControls?: boolean, hideQuickControls?: ['help', 'settings', 'camera', 'controls', 'expand', 'reset'], 
    subscribeEvents?: boolean, pdbeLink?: boolean, assemblyId?: string, selectInteraction?: boolean, 
    ligandView?: { label_comp_id_list?: string[], label_comp_id?: string, auth_seq_id?: number, auth_asym_id?: string, hydrogens?: boolean },
    bgColor?:{r:number, g:number, b:number}, customData? : {url: string, format: string}, loadCartoonsOnly? : boolean, 
    selectColor?: {r:number, g:number, b:number}, highlightColor?: {r:number, g:number, b:number}, 
    hideStructure?: ['polymer', 'het', 'water','carbs'], visualStyle?: 'cartoon' | 'ball-and-stick', [key: string]: any;
}

export const DefaultParams : InitParams = {
    moleculeId: undefined,
    customData: undefined,
    ligandView: undefined,
    assemblyId: undefined,
    visualStyle: undefined,
    highlightColor: undefined,
    selectColor: undefined,
    hideStructure: undefined,
    hideQuickControls: undefined,
    pdbeUrl: 'https://www.ebi.ac.uk/pdbe/',
    bgColor:{r:0, g:0, b:0},
    selectInteraction: true,
    loadMaps: false,
    validationAnnotation: false,
    domainAnnotation: false,
    lowPrecisionCoords: false,
    expanded: false,
    hideControls: false,
    pdbeLink: true,
    loadCartoonsOnly: false,
    landscape: false,
    subscribeEvents: true
}