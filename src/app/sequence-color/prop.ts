import { ElementSet, Selector, SelectorParams } from 'molstar/lib/extensions/mvs/components/selector';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { CustomStructureProperty } from 'molstar/lib/mol-model-props/common/custom-structure-property';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { ElementIndex, Structure } from 'molstar/lib/mol-model/structure';
import { Color } from 'molstar/lib/mol-util/color';
import { ColorNames } from 'molstar/lib/mol-util/color/names';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';


export namespace SequenceColorProperty {
    /** Parameter definition for custom structure property `SequenceColorProperty` */
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

    /** Parameter values of custom structure property `SequenceColorProperty` */
    export type Props = PD.Values<Params>;

    /** Values of custom structure property `SequenceColorProperty` */
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

    /** Provider for custom structure property `SequenceColorProperty` */
    export const Provider: CustomStructureProperty.Provider<Params, Data> = CustomStructureProperty.createProvider({
        label: 'Sequence Color',
        descriptor: CustomPropertyDescriptor<any, any>({
            name: 'sequence-color',
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
