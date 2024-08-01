import { CustomModelProperty } from 'molstar/lib/mol-model-props/common/custom-model-property';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { PropertyWrapper } from 'molstar/lib/mol-model-props/common/wrapper';
import { CustomPropertyDescriptor } from 'molstar/lib/mol-model/custom-property';
import { IndexedCustomProperty, Model, ResidueIndex, Unit } from 'molstar/lib/mol-model/structure';
import { ChainIndex } from 'molstar/lib/mol-model/structure/model/indexing';
import { Structure, StructureElement } from 'molstar/lib/mol-model/structure/structure';
import { arraySetAdd } from 'molstar/lib/mol-util/array';
import { Asset } from 'molstar/lib/mol-util/assets';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';


export { DomainAnnotations };
type DomainAnnotations = PropertyWrapper<{
    domains: IndexedCustomProperty.Residue<string[]>,
    domainNames: string[][],
    domainTypes: string[],
} | undefined>

namespace DomainAnnotations {

    export const DefaultServerUrl = 'https://www.ebi.ac.uk/pdbe/api/mappings';
    export function getEntryUrl(pdbId: string, serverUrl: string) {
        return `${serverUrl}/${pdbId.toLowerCase()}`;
    }

    export function isApplicable(model?: Model): boolean {
        return !!model && Model.hasPdbId(model);
    }

    export function fromJson(model: Model, data: any) {
        const info = PropertyWrapper.createInfo();
        const domainMap = createdomainMapFromJson(model, data);
        return { info, data: domainMap };
    }

    export async function fromServer(ctx: CustomProperty.Context, model: Model, props: DomainAnnotationsProps): Promise<CustomProperty.Data<DomainAnnotations>> {
        const url = Asset.getUrlAsset(ctx.assetManager, getEntryUrl(model.entryId, props.serverUrl));
        const json = await ctx.assetManager.resolve(url, 'json').runInContext(ctx.runtime);
        const data = json.data[model.entryId.toLowerCase()];
        if (!data) throw new Error('missing data');
        return { value: fromJson(model, data), assets: [json] };
    }

    const _emptyArray: string[] = [];
    /** Return a list of domainSource:domainName strings for a particular location (e.g. ['CATH:Globin']) */
    export function getDomains(e: StructureElement.Location): string[] {
        if (!Unit.isAtomic(e.unit)) return _emptyArray;
        const prop = DomainAnnotationsProvider.get(e.unit.model).value;
        if (!prop || !prop.data) return _emptyArray;
        const rI = e.unit.residueIndex[e.element];
        return prop.data.domains.has(rI) ? prop.data.domains.get(rI)! : _emptyArray;
    }
    /** Decide whether a structure location belongs to a domain */
    export function isInDomain(e: StructureElement.Location, domainSource: string, domainName: string): boolean {
        return getDomains(e).includes(domainKey(domainSource, domainName));
    }

    export function getDomainTypes(structure?: Structure): string[] {
        if (!structure) return _emptyArray;
        const prop = DomainAnnotationsProvider.get(structure.models[0]).value;
        if (!prop || !prop.data) return _emptyArray;
        return prop.data.domainTypes;
    }

    export function getDomainNames(structure?: Structure): string[][] {
        if (!structure) return [];
        const prop = DomainAnnotationsProvider.get(structure.models[0]).value;
        if (!prop || !prop.data) return [];
        return prop.data.domainNames;
    }
}

export const DomainAnnotationsParams = {
    serverUrl: PD.Text(DomainAnnotations.DefaultServerUrl, { description: 'JSON API Server URL' })
};
export type DomainAnnotationsParams = typeof DomainAnnotationsParams
export type DomainAnnotationsProps = PD.Values<DomainAnnotationsParams>

export const DomainAnnotationsProvider: CustomModelProperty.Provider<DomainAnnotationsParams, DomainAnnotations> = CustomModelProperty.createProvider({
    label: 'Domain annotations',
    descriptor: CustomPropertyDescriptor({
        name: 'domain_annotations'
    }),
    type: 'static',
    defaultParams: DomainAnnotationsParams,
    getParams: (data: Model) => DomainAnnotationsParams,
    isApplicable: (data: Model) => DomainAnnotations.isApplicable(data),
    obtain: async (ctx: CustomProperty.Context, data: Model, props: Partial<DomainAnnotationsProps>) => {
        const p = { ...PD.getDefaultValues(DomainAnnotationsParams), ...props };
        return await DomainAnnotations.fromServer(ctx, data, p);
    }
});

function findChainLabel(map: any, label_entity_id: string, label_asym_id: string): ChainIndex {
    const entityIndex = map.entities.getEntityIndex;
    const eI = entityIndex(label_entity_id);
    if (eI < 0 || !map.entity_index_label_asym_id.has(eI)) return -1 as ChainIndex;
    const cm = map.entity_index_label_asym_id.get(eI);
    if (!cm) return -1 as ChainIndex;
    return cm.has(label_asym_id) ? cm.get(label_asym_id)! : -1 as ChainIndex;
}

function findResidue(modelData: Model, map: any, label_entity_id: string, label_asym_id: string, label_seq_id: number) {
    const cI = findChainLabel(map, label_entity_id, label_asym_id);
    if (cI < 0) return -1 as ResidueIndex;
    const rm = map.chain_index_auth_seq_id.get(cI)!;
    return rm.has(label_seq_id) ? rm.get(label_seq_id)! : -1 as ResidueIndex;
}

function createdomainMapFromJson(modelData: Model, data: any): DomainAnnotations['data'] | undefined {
    const domainTypes: string[] = [];
    const domainNames: string[][] = [];
    const ret = new Map<ResidueIndex, string[]>();
    const defaultDomains = ['Pfam', 'InterPro', 'CATH', 'SCOP'];

    for (const db_name in data) {
        if (!defaultDomains.includes(db_name)) continue;
        const tempDomains: string[] = [];
        const db = data[db_name];
        for (const db_code in db) {
            const domain = db[db_code];
            for (const mapping of domain.mappings) {
                arraySetAdd(tempDomains, domain.identifier);

                const indexData = modelData.atomicHierarchy.index as any;
                const indexMap = indexData.map;
                for (let seq_id = mapping.start.residue_number; seq_id <= mapping.end.residue_number; seq_id++) {
                    const idx = findResidue(modelData, indexMap, `${mapping.entity_id}`, mapping.chain_id, seq_id);
                    const key = domainKey(db_name, domain.identifier);
                    const prevVal = ret.get(idx);
                    if (prevVal) {
                        prevVal.push(key);
                    } else {
                        ret.set(idx, [key]);
                    }
                }

            }
        }
        domainTypes.push(db_name);
        domainNames.push(tempDomains);
    }

    return {
        domains: IndexedCustomProperty.fromResidueMap(ret),
        domainNames,
        domainTypes
    };
}

/** Return string used for indexing domains (e.g. `domainKey('CATH', 'Globin') -> 'CATH:Globin'`) */
function domainKey(domainSource: string, domainName: string) {
    return `${domainSource}:${domainName}`;
}
