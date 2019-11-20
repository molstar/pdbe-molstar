import { PluginContext } from 'Molstar/mol-plugin/context';
import { StateTransforms } from 'Molstar/mol-plugin/state/transforms';
import { StructureRepresentation3DHelpers } from 'Molstar/mol-plugin/state/transforms/representation';
import { PluginStateObject } from 'Molstar/mol-plugin/state/objects';
import { StateBuilder, State } from 'Molstar/mol-state';
import { StructureComplexElementTypes } from 'Molstar/mol-plugin/state/transforms/model';
import { BuiltInStructureRepresentationsName } from 'Molstar/mol-repr/structure/registry';
import { StateElements } from './helpers';
import { Color } from 'Molstar/mol-util/color';
import { BuiltInStructureRepresentations } from 'Molstar/mol-repr/structure/registry';
import { BuiltInColorThemeName } from 'Molstar/mol-theme/color';
import { BuiltInSizeThemes } from 'Molstar/mol-theme/size';

function getStrSettings(ctx: PluginContext){
    const visibleSettings:any = {
        polymer: true,
        het: true,
        water: true,
        carbs: true
    }
    const customState = ctx.customState as any;
    if(customState && customState.initParams && customState.initParams.hideStructure){
        customState.initParams.hideStructure.forEach((type:string) => {
            visibleSettings[type] = false;
        })
    }

    return visibleSettings;
}

function getDefaultThemeParams(ctx: PluginContext, name: BuiltInStructureRepresentationsName, strParams: any = void 0, themeOption?:BuiltInColorThemeName){
    // let strParams: any = void 0;
    const customState = ctx.customState as any;
    if(customState && customState.initParams && customState.initParams.highlightColor){
        const hColorObj = customState.initParams.highlightColor;
        const hcolor = Color.fromRgb(hColorObj.r, hColorObj.g, hColorObj.b);
        if(strParams) {
            strParams['selectColor'] = hcolor;
        }else{
            strParams = {
                highlightColor: hcolor
            }
        }
    }
    if(customState && customState.initParams && customState.initParams.selectColor){
        const sColorObj = customState.initParams.selectColor;
        const scolor = Color.fromRgb(sColorObj.r, sColorObj.g, sColorObj.b);
        if(strParams) {
            strParams['selectColor'] = scolor;
        }else{
            strParams = {
                selectColor: scolor
            }
        }
    }

    if(customState && customState.initParams && customState.initParams.visualStyle){
        name = customState.initParams.visualStyle;
    }

//StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, 'ball-and-stick', void 0, 'polymer-id'));
    if(themeOption){
        return StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, name, strParams, themeOption);
    }else{
        return StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, name, strParams);
    }
}


export function createStructureComplex(ctx: PluginContext, root: StateBuilder.To<PluginStateObject.Molecule.Structure>) {

    const visibleSettings = getStrSettings(ctx);
    
    if(visibleSettings.polymer){
        root.apply(StateTransforms.Model.StructureComplexElement, { type: 'protein-and-nucleic' }, { tags: StructureComplexElementTypes['protein-and-nucleic'], ref: StateElements.Sequence })
            .apply(StateTransforms.Representation.StructureRepresentation3D,
                getDefaultThemeParams(ctx, 'cartoon'), {ref: StateElements.SequenceVisual});
    }

    if(visibleSettings.het){
        root.apply(StateTransforms.Model.StructureComplexElement, { type: 'ligand' }, { tags: StructureComplexElementTypes.ligand })
            .apply(StateTransforms.Representation.StructureRepresentation3D,
                getDefaultThemeParams(ctx, 'ball-and-stick'), {ref: StateElements.HetVisual});

        root.apply(StateTransforms.Model.StructureComplexElement, { type: 'modified' }, { tags: StructureComplexElementTypes.modified })
            .apply(StateTransforms.Representation.StructureRepresentation3D,
                getDefaultThemeParams(ctx, 'ball-and-stick', void 0, 'polymer-id'));
    }

    if(visibleSettings.carbs){
        const branched = root.apply(StateTransforms.Model.StructureComplexElement, { type: 'branched' }, { tags: StructureComplexElementTypes.branched })

        branched.apply(StateTransforms.Representation.StructureRepresentation3D,
            getDefaultThemeParams(ctx, 'ball-and-stick', { alpha: 0.15 }), {ref: StateElements.CarbsVisual});
        branched.apply(StateTransforms.Representation.StructureRepresentation3D,
            StructureRepresentation3DHelpers.getDefaultParamsStatic(ctx, 'carbohydrate'), {ref: StateElements.Carbs3DVisual});
    }

    if(visibleSettings.water){
        root.apply(StateTransforms.Model.StructureComplexElement, { type: 'water' }, { tags: StructureComplexElementTypes.water })
            .apply(StateTransforms.Representation.StructureRepresentation3D,
                getDefaultThemeParams(ctx, 'ball-and-stick', { alpha: 0.51 }), {ref: StateElements.WaterVisual});

        root.apply(StateTransforms.Model.StructureComplexElement, { type: 'coarse' }, { tags: StructureComplexElementTypes.coarse })
            .apply(StateTransforms.Representation.StructureRepresentation3D,
                getDefaultThemeParams(ctx, 'spacefill', {}, 'polymer-id'));
    }

    return root;
}

export function createSurVisualParams(state: State, plugin: PluginContext) {
    const asm = state.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure;
    return StructureRepresentation3DHelpers.createParams(plugin, asm.data, {
        repr: BuiltInStructureRepresentations['ball-and-stick'],
        // color: [BuiltInColorThemes.uniform, () => ({ value: Color.fromRgb(204, 127, 0) })],
        size: [BuiltInSizeThemes.uniform, () => ({ value: 0.5 } )]
    });
}

export function createCoreVisualParams(state: State, plugin: PluginContext, cartoon?:boolean) {
    const defaultRep = cartoon ? 'cartoon' : 'ball-and-stick';
    const asm = state.select(StateElements.Assembly)[0].obj as PluginStateObject.Molecule.Structure;
    return StructureRepresentation3DHelpers.createParams(plugin, asm.data, {
        repr: BuiltInStructureRepresentations[defaultRep],
        // color: [BuiltInColorThemes.uniform, () => ({ value: ColorNames.gray })],
        // size: [BuiltInSizeThemes.uniform, () => ({ value: 0.33 } )]
    });
}