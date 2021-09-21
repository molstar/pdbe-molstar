import { AfConfidence, AfConfidenceProvider } from './prop';
import { Location } from 'Molstar/mol-model/location';
import { StructureElement } from 'Molstar/mol-model/structure';
import { ColorTheme, LocationColor } from 'Molstar/mol-theme/color';
import { ThemeDataContext } from 'Molstar/mol-theme/theme';
import { Color } from 'Molstar/mol-util/color';
// import { TableLegend } from 'Molstar/mol-util/legend';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { CustomProperty } from 'Molstar/mol-model-props/common/custom-property';

const ConfidenceColors: any = {
    'No Score': Color.fromRgb(170, 170, 170), // not applicable
    'Very low': Color.fromRgb(255, 125, 69), // VL
    'Low': Color.fromRgb(255, 219, 19), // L
    'Confident': Color.fromRgb(101, 203, 243), // M
    'Very high': Color.fromRgb(0, 83, 214), // H
}

export const AfConfidenceColorThemeParams = {
    type: PD.MappedStatic('score', {
        'score': PD.Group({}),
        'category': PD.Group({
            kind: PD.Text()
        })
    })
};

type Params = typeof AfConfidenceColorThemeParams

export function AfConfidenceColorTheme(ctx: ThemeDataContext, props: PD.Values<Params>): ColorTheme<Params> {
    let color: LocationColor;

    if (ctx.structure && !ctx.structure.isEmpty && ctx.structure.models[0].customProperties.has(AfConfidenceProvider.descriptor)) {
        const getConfidenceScore = AfConfidence.getConfidenceScore;
        
        if (props.type.name === 'score') {
            color = (location: Location) => {
                if (StructureElement.Location.is(location)) {
                    const confidenceScore = getConfidenceScore(location);
                    return ConfidenceColors[confidenceScore[1]];
                }
                return ConfidenceColors['No Score'];
            };
        } else {
            const categoryProp = props.type.params.kind;
            color = (location: Location) => {
                if (StructureElement.Location.is(location)) {
                    const confidenceScore = getConfidenceScore(location);
                    if(confidenceScore[1] === categoryProp) return ConfidenceColors[confidenceScore[1]];
                    return ConfidenceColors['No Score'];
                }
                return ConfidenceColors['No Score'];
            };
        }
        
    } else {
        color = () => ConfidenceColors['No Score'];
    }

    return {
        factory: AfConfidenceColorTheme,
        granularity: 'group',
        color: color,
        props: props,
        description: 'Assigns residue colors according to the AF Confidence score'
    };
}

export const AfConfidenceColorThemeProvider: ColorTheme.Provider<Params, 'af-confidence'> =  {
    name: 'af-confidence',
    label: 'AF Confidence',
    category: ColorTheme.Category.Validation,
    factory: AfConfidenceColorTheme,
    getParams: ctx => {
        const categories = AfConfidence.getCategories(ctx.structure);
        if (categories.length === 0) {
            return {
                type: PD.MappedStatic('score', {
                    'score': PD.Group({})
                })
            };
        }

        return {
            type: PD.MappedStatic('score', {
                'score': PD.Group({}),
                'category': PD.Group({
                    kind: PD.Select(categories[0], PD.arrayToOptions(categories))
                }, { isFlat: true })
            })
        };
    },
    defaultValues: PD.getDefaultValues(AfConfidenceColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => AfConfidence.isApplicable(ctx.structure?.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => data.structure ? AfConfidenceProvider.attach(ctx, data.structure.models[0], void 0, true) : Promise.resolve(),
        detach: (data) => data.structure && data.structure.models[0].customProperties.reference(AfConfidenceProvider.descriptor, false)
    }
};