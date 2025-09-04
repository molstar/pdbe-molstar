import { ElementSet } from 'molstar/lib/extensions/mvs/components/selector';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Color } from 'molstar/lib/mol-util/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { SequenceColorAnnotationsProperty } from './sequence-color-annotations-prop';
import { SequenceColorThemeProperty } from './sequence-color-theme-prop';


/** Special color value meaning "no color assigned" */
const NoColor = Color(-1);


export namespace CustomSequenceColorTheme {
    /** Provider name (key) for this color theme */
    export const Name = 'custom-sequence-color';

    /** Parameter definition for this color theme */
    export const Params = {};
    export type Params = typeof Params;

    /** Type of parameter values for this color theme */
    export type Props = PD.Values<Params>;

    export function Theme(ctx: ThemeDataContext, props: Props, colorThemeRegistry: ColorTheme.Registry | undefined): ColorTheme<Props> {
        return {
            factory: (ctx_, props_) => Theme(ctx_, props_, colorThemeRegistry),
            granularity: 'groupInstance',
            color: colorFn(ctx, colorThemeRegistry),
            props: props,
            description: 'Assigns colors based on custom structure property `SequenceColorProperty` and `SequenceColorBackgroundProperty`.',
        };
    }

    /** Create a provider for this color theme */
    export function makeProvider(colorThemeRegistry: ColorTheme.Registry | undefined): ColorTheme.Provider<Params, typeof Name> {
        return {
            name: Name,
            label: 'Custom Sequence Color',
            category: 'Miscellaneous',
            factory: (ctx, props) => Theme(ctx, props, colorThemeRegistry),
            getParams: ctx => Params,
            defaultValues: PD.getDefaultValues(Params),
            isApplicable: (ctx: ThemeDataContext) => !!ctx.structure,
        };
    }
}


/** Create color function based on `SequenceColorAnnotationsProperty` and `SequenceColorThemeProperty` */
function colorFn(ctx: ThemeDataContext, colorThemeRegistry: ColorTheme.Registry | undefined): LocationColor {
    const background = themeColorFn(ctx, colorThemeRegistry);
    const foreground = annotColorFn(ctx);
    if (foreground && background) {
        return (location, isSecondary) => {
            const fgColor = foreground(location, isSecondary);
            if (fgColor >= 0) return fgColor;
            else return background(location, isSecondary);
        };
    }
    if (foreground) return foreground;
    if (background) return background;
    return () => NoColor;
}
/** Create color function based on `SequenceColorThemeProperty` */
function themeColorFn(ctx: ThemeDataContext, colorThemeRegistry: ColorTheme.Registry | undefined): LocationColor | undefined {
    if (!colorThemeRegistry) return undefined;
    if (!ctx.structure || ctx.structure.isEmpty) return undefined;
    const data = SequenceColorThemeProperty.Provider.get(ctx.structure).value;
    if (!data?.useTheme) return undefined;
    const theme = colorThemeRegistry.get(data.theme.name)?.factory(ctx, data.theme.params);
    if (!theme || !('color' in theme)) return undefined;
    if (data.themeStrength === 1) return theme.color;
    if (data.themeStrength === 0) return () => data.dilutionColor;
    return (location, isSecondary) => Color.interpolate(data.dilutionColor, theme.color(location, isSecondary), data.themeStrength);
}
/** Create color function based on `SequenceColorAnnotationsProperty` */
function annotColorFn(ctx: ThemeDataContext): LocationColor | undefined {
    if (!ctx.structure || ctx.structure.isEmpty) return undefined;
    const colorData = SequenceColorAnnotationsProperty.Provider.get(ctx.structure).value;
    if (!colorData || colorData.items.length === 0) return undefined;
    return location => StructureElement.Location.is(location) ? sequenceColorForLocation(colorData, location) : NoColor;
}

function sequenceColorForLocation(colorData: SequenceColorAnnotationsProperty.Data, location: StructureElement.Location): Color {
    const unitCache = colorData.colorCache[location.unit.id] ??= {};
    return unitCache[location.element] ??= findSequenceColorForLocation(colorData, location);
}

function findSequenceColorForLocation(colorData: SequenceColorAnnotationsProperty.Data, location: StructureElement.Location): Color {
    for (let i = colorData.items.length - 1; i >= 0; i--) { // last color matters
        const item = colorData.items[i];
        const elements = item.elementSet ??= ElementSet.fromSelector(location.structure, item.selector);
        if (ElementSet.has(elements, location)) {
            return item.color;
        }
    }
    return NoColor;
}
