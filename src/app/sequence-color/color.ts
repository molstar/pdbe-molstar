import { ElementSet } from 'molstar/lib/extensions/mvs/components/selector';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Color } from 'molstar/lib/mol-util/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { SequenceColorProperty } from './prop';


/** Special color value meaning "no color assigned" */
const NoColor = Color(-1);

export namespace CustomSequenceColorTheme {
    export const Params = {};
    export type Params = typeof Params;
    export type Props = PD.Values<Params>;

    export function Theme(ctx: ThemeDataContext, props: Props): ColorTheme<Props> {
        let color: LocationColor = () => NoColor;
        if (ctx.structure && !ctx.structure.isEmpty) {
            const colorData = SequenceColorProperty.Provider.get(ctx.structure).value;
            if (colorData && colorData.items.length > 0) {
                color = location => StructureElement.Location.is(location) ? sequenceColorForLocation(colorData, location) : NoColor;
            }
        }
        return {
            factory: Theme,
            granularity: 'groupInstance',
            color: color,
            props: props,
            description: 'Assigns colors based on custom structure property `SequenceColorProperty`.',
        };
    }

    /** A thingy that is needed to register color theme "MVS Annotation" */
    export const Provider: ColorTheme.Provider<Params, 'custom-sequence-color'> = {
        name: 'custom-sequence-color',
        label: 'Custom Sequence Color',
        category: 'Miscellaneous',
        factory: Theme,
        getParams: ctx => Params,
        defaultValues: PD.getDefaultValues(Params),
        isApplicable: (ctx: ThemeDataContext) => !!ctx.structure,
    };
}


function sequenceColorForLocation(colorData: SequenceColorProperty.Data, location: StructureElement.Location): Color {
    const unitCache = colorData.colorCache[location.unit.id] ??= {};
    return unitCache[location.element] ??= findSequenceColorForLocation(colorData, location);
}

function findSequenceColorForLocation(colorData: SequenceColorProperty.Data, location: StructureElement.Location): Color {
    for (let i = colorData.items.length - 1; i >= 0; i--) { // last color matters
        const item = colorData.items[i];
        const elements = item.elementSet ??= ElementSet.fromSelector(location.structure, item.selector);
        if (ElementSet.has(elements, location)) {
            return item.color;
        }
    }
    return NoColor;
}
