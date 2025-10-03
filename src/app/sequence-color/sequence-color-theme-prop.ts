import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { CustomStructureProperty } from 'molstar/lib/mol-model-props/common/custom-structure-property';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { Structure } from 'molstar/lib/mol-model/structure';
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { deepClone } from 'molstar/lib/mol-util/object';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';


const AnyParams = PD.Value<any>({}, { description: 'Parameter description not available' });

export namespace SequenceColorThemeProperty {
    /** Provider name (key) for this custom property */
    export const Name = 'sequence-color-theme';

    /** Parameter definition for this custom property */
    export type Params = ReturnType<typeof makeParams>;
    /** Create parameter definition for this custom property, using information from a color theme registry.
     * If `colorThemeRegistry` is undefined, the `theme` parameter will be typed as `any` (i.e. no UI support). */
    export function makeParams(colorThemeRegistry: ColorTheme.Registry | undefined) {
        return {
            useTheme: PD.Boolean(false, { description: 'Turn on/off background sequence color theme' }),
            theme: colorThemeRegistry ?
                PD.Mapped(
                    'uniform',
                    colorThemeRegistry.types,
                    name => {
                        try {
                            return PD.Group(colorThemeRegistry.get(name).getParams({ structure: Structure.Empty }));
                        } catch (err) {
                            console.warn(`Failed to obtain parameter definition for theme "${name}"`);
                            return AnyParams;
                        }
                    },
                    { hideIf: p => !p.useTheme })
                : PD.Group({ name: PD.Text(), params: AnyParams }, { hideIf: p => !p.useTheme }),
            themeStrength: PD.Numeric(1, { min: 0, max: 1, step: 0.01 }, { hideIf: p => !p.useTheme, description: 'Allows to "dilute" color coming from background sequence color theme' }),
            dilutionColor: PD.Color(ColorNames.white, { hideIf: p => !p.useTheme || p.themeStrength === 1, description: 'Color used for "diluting" background sequence color theme' }),
        };
    }

    /** Type of parameter values for this custom property */
    export type Props = PD.Values<Params>;

    /** Type of values of this custom property */
    export type Data = Props;

    /** Create a provider for this custom property, using information from a color theme registry.
     * If `colorThemeRegistry` is undefined, the provider will work, but parameter definitions will not be inferred (i.e. limited UI support). */
    export function makeProvider(colorThemeRegistry: ColorTheme.Registry | undefined): CustomStructureProperty.Provider<Params, Data> {
        const params = makeParams(colorThemeRegistry);
        return CustomStructureProperty.createProvider<Params, Data>({
            label: 'Sequence Color Theme',
            descriptor: CustomPropertyDescriptor<any, any>({
                name: Name,
            }),
            type: 'root',
            defaultParams: params,
            getParams: (data: Structure) => params,
            isApplicable: (data: Structure) => data.root === data,
            obtain: async (ctx: CustomProperty.Context, data: Structure, props: Partial<Props>) => {
                const fullProps = { ...PD.getDefaultValues(params), ...props };
                return { value: deepClone(fullProps) } satisfies CustomProperty.Data<Data>;
            },
        });
    }

    /** Default provider for this custom property, without type information from a color theme registry (i.e. limited UI support).
     * Use `makeProvider` to get a provider with full UI support. */
    export const Provider = makeProvider(undefined);
}
