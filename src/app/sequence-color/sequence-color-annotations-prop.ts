import { ElementSet, Selector, SelectorParams } from 'molstar/lib/extensions/mvs/components/selector';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { CustomStructureProperty } from 'molstar/lib/mol-model-props/common/custom-structure-property';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { ElementIndex, Structure } from 'molstar/lib/mol-model/structure';
import { Color } from 'molstar/lib/mol-util/color';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';


export namespace SequenceColorAnnotationsProperty {
    /** Provider name (key) for this custom property */
    export const Name = 'sequence-color-annotations';

    /** Parameter definition for this custom property */
    export type Params = typeof Params;
    export const Params = {
        colors: PD.ObjectList(
            {
                color: PD.Color(ColorNames.grey, { description: 'Color to apply to a substructure' }),
                selector: SelectorParams,
            },
            obj => Color.toHexStyle(obj.color),
            { description: 'List of substructure-color assignments' }
        ),
    };

    /** Type of parameter values for this custom property */
    export type Props = PD.Values<Params>;

    /** Type of values of this custom property */
    export interface Data {
        items: {
            selector: Selector,
            color: Color,
            elementSet?: ElementSet,
        }[],
        colorCache: {
            [unitId: number]: {
                [elemIdx: ElementIndex]: Color,
            },
        },
    }

    /** Provider for this custom property */
    export const Provider: CustomStructureProperty.Provider<Params, Data> = CustomStructureProperty.createProvider({
        label: 'Sequence Color Annotations',
        descriptor: CustomPropertyDescriptor<any, any>({
            name: Name,
        }),
        type: 'root',
        defaultParams: Params,
        getParams: (data: Structure) => Params,
        isApplicable: (data: Structure) => data.root === data,
        obtain: async (ctx: CustomProperty.Context, data: Structure, props: Partial<Props>) => {
            const fullProps = { ...PD.getDefaultValues(Params), ...props };
            const items = fullProps.colors.map(t => ({
                // creating a copy, so we don't polute props later
                selector: t.selector,
                color: t.color,
            } satisfies Data['items'][number]));
            return { value: { items, colorCache: {} } } satisfies CustomProperty.Data<Data>;
        },
    });
}
