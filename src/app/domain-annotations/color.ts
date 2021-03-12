import { DomainAnnotations, DomainAnnotationsProvider } from './prop';
import { Location } from 'Molstar/mol-model/location';
import { StructureElement } from 'Molstar/mol-model/structure';
import { ColorTheme, LocationColor } from 'Molstar/mol-theme/color';
import { ThemeDataContext } from 'Molstar/mol-theme/theme';
import { Color } from 'Molstar/mol-util/color';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { CustomProperty } from 'Molstar/mol-model-props/common/custom-property';

const DomainColors = [
    Color.fromRgb(170, 170, 170), // not applicable
    Color.fromRgb(255, 112, 3)
];

export const DomainAnnotationsColorThemeParams = {
    type: PD.MappedStatic('', {
        '': PD.EmptyGroup()
    })
};

type Params = any; // typeof DomainAnnotationsColorThemeParams

export function DomainAnnotationsColorTheme(ctx: ThemeDataContext, props: PD.Values<Params>): ColorTheme<Params> {
    let color: LocationColor;

    if (ctx.structure && !ctx.structure.isEmpty && ctx.structure.models[0].customProperties.has(DomainAnnotationsProvider.descriptor)) {
        const getDomains = DomainAnnotations.getDomains;

        const issue = props.type.params.kind;
        color = (location: Location) => {
            if (StructureElement.Location.is(location) && getDomains(location).indexOf(issue) >= 0) {
                return DomainColors[1];
            }
            return DomainColors[0];
        };
    } else {
        color = () => DomainColors[0];
    }

    return {
        factory: DomainAnnotationsColorTheme,
        granularity: 'group',
        color: color,
        props: props,
        description: 'Highlights Sequnece and Structure Domain Annotations. Data obtained via PDBe.',
    };
}

export const DomainAnnotationsColorThemeProvider: ColorTheme.Provider<Params, 'pdbe-domain-annotations'> =  {
    name: 'pdbe-domain-annotations',
    label: 'Domain annotations',
    category: ColorTheme.Category.Misc,
    factory: DomainAnnotationsColorTheme,
    getParams: ctx => {

        const domainNames = DomainAnnotations.getDomainNames(ctx.structure);
        const domainTypes = DomainAnnotations.getDomainTypes(ctx.structure);

        const optionObj: any = {};
        domainTypes.forEach((tp, index) => {
            if(domainNames[index].length > 0) {
                optionObj[tp as string] = PD.Group({
                    kind: PD.Select(domainNames[index][0] as string, PD.arrayToOptions(domainNames[index] as string[]))
                }, { isFlat: true });
            }
        });

        if (Object.keys(optionObj).length > 0) {
            return {
                type: PD.MappedStatic(optionObj[0], optionObj)
            };

        }else{
            return {
                type: PD.MappedStatic('', {
                    '': PD.EmptyGroup()
                })
            };
        }

    },
    defaultValues: PD.getDefaultValues(DomainAnnotationsColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => DomainAnnotations.isApplicable(ctx.structure?.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => {
            return data.structure ? DomainAnnotationsProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve();
        },
        detach: (data) => data.structure && data.structure.models[0].customProperties.reference(DomainAnnotationsProvider.descriptor, false)
    }
};