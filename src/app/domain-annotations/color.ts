import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { Location } from 'molstar/lib/mol-model/location';
import { StructureElement } from 'molstar/lib/mol-model/structure';
import { ColorTheme, LocationColor } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { Color } from 'molstar/lib/mol-util/color';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { DomainAnnotations, DomainAnnotationsProvider } from './prop';


const DomainColors = {
    /** Applied to a part of structure which is not included in the domain */
    outside: Color.fromRgb(170, 170, 170),
    /** Applied to a part of structure which is included in the domain */
    inside: Color.fromRgb(255, 112, 3),
};

function makeDomainAnnotationsColorThemeParams(domainSources: string[], domainNames: string[][]) {
    const map = {} as Record<string, PD.Group<{ domain: string }>>;
    let defaultSource: string | undefined = undefined; // will be assigned to the first source with non-empty list of domains
    const nSources = domainSources.length;
    for (let i = 0; i < nSources; i++) {
        const source = domainSources[i];
        const domains = domainNames[i];
        if (domains.length > 0) {
            defaultSource ??= source;
            map[source] = PD.Group({
                domain: PD.Select(domains[0], PD.arrayToOptions(domains)),
            }, { isFlat: true });
        }
    }
    map['None'] = PD.Group({
        domain: PD.Select('None', [['None', 'None']], { isHidden: true }), // this is to keep the same shape of props but `domain` param will not be displayed in UI
    }, { isFlat: true });
    return {
        source: PD.MappedStatic(defaultSource ?? 'None', map, { options: Object.keys(map).map(source => [source, source]) }) // `options` is to keep case-sensitive database names in UI
    };
}
/** DomainAnnotationsColorThemeParams for when the data are not available (yet or at all) */
const DummyDomainAnnotationsColorThemeParams = makeDomainAnnotationsColorThemeParams([], []);

export type DomainAnnotationsColorThemeParams = typeof DummyDomainAnnotationsColorThemeParams
export type DomainAnnotationsColorThemeProps = PD.Values<DomainAnnotationsColorThemeParams>

export function DomainAnnotationsColorTheme(ctx: ThemeDataContext, props: DomainAnnotationsColorThemeProps): ColorTheme<DomainAnnotationsColorThemeParams> {
    let color: LocationColor;

    if (ctx.structure && !ctx.structure.isEmpty && ctx.structure.models[0].customProperties.has(DomainAnnotationsProvider.descriptor) && props.source.name !== 'None') {
        const domainName = props.source.params.domain;
        color = (location: Location) => {
            if (StructureElement.Location.is(location) && DomainAnnotations.getDomains(location).includes(domainName)) { // TODO check if this works when domain from different sources have the same name
                return DomainColors.inside;
            }
            return DomainColors.outside;
        };
    } else {
        color = () => DomainColors.outside;
    }

    return {
        factory: DomainAnnotationsColorTheme,
        granularity: 'group',
        color: color,
        props: props,
        description: 'Highlights Sequence and Structure Domain Annotations. Data obtained via PDBe.',
    };
}

export const DomainAnnotationsColorThemeProvider: ColorTheme.Provider<DomainAnnotationsColorThemeParams, 'pdbe-domain-annotations'> = {
    name: 'pdbe-domain-annotations',
    label: 'Domain annotations',
    category: ColorTheme.Category.Misc,
    factory: DomainAnnotationsColorTheme,
    getParams: ctx => {
        const domainTypes = DomainAnnotations.getDomainTypes(ctx.structure);
        const domainNames = DomainAnnotations.getDomainNames(ctx.structure);
        return makeDomainAnnotationsColorThemeParams(domainTypes, domainNames);
    },
    defaultValues: PD.getDefaultValues(DummyDomainAnnotationsColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => DomainAnnotations.isApplicable(ctx.structure?.models[0]),
    ensureCustomProperties: {
        attach: (ctx: CustomProperty.Context, data: ThemeDataContext) => {
            return data.structure ? DomainAnnotationsProvider.attach(ctx, data.structure.models[0], undefined, true) : Promise.resolve();
        },
        detach: (data) => data.structure && DomainAnnotationsProvider.ref(data.structure.models[0], false),
    },
};
