import { AssemblySymmetryClusterColorThemeProvider } from 'molstar/lib/extensions/rcsb/assembly-symmetry/color';
import { AssemblySymmetry, AssemblySymmetryDataProps, AssemblySymmetryDataValue } from 'molstar/lib/extensions/rcsb/assembly-symmetry/prop';
import { CustomProperty } from 'molstar/lib/mol-model-props/common/custom-property';
import { Structure } from 'molstar/lib/mol-model/structure';
import { Asset } from 'molstar/lib/mol-util/assets';


/** Perform "hacks" necessary to use RCSBAssemblySymmetry with PDBe symmetry API.
 * This is just a temporary solution.
 * TODO merge this https://github.com/midlik/molstar/tree/symmetry-api into core Mol*,
 * set these plugin config items:
 * `RCSBAssemblySymmetryConfig.DefaultServerType='pdbe'`,
 * `RCSBAssemblySymmetryConfig.DefaultServerUrl='https://www.ebi.ac.uk/pdbe/aggregated-api/pdb/symmetry'`,
 * `RCSBAssemblySymmetryConfig.ApplyColors=false`,
 * and remove the hack!
 */
export function hackRCSBAssemblySymmetry() {
    AssemblySymmetry.fetch = fetch_PDBe;
    (AssemblySymmetryClusterColorThemeProvider.isApplicable as any) = () => false;
}

/** Replacement for AssemblySymmetry.DefaultServerUrl */
const hackedServerUrl = 'https://www.ebi.ac.uk/pdbe/aggregated-api/pdb/symmetry';

/** Replacement for AssemblySymmetry.fetch */
async function fetch_PDBe(ctx: CustomProperty.Context, structure: Structure, props: AssemblySymmetryDataProps): Promise<CustomProperty.Data<AssemblySymmetryDataValue>> {
    if (!AssemblySymmetry.isApplicable(structure)) return { value: [] };

    const assembly_id = structure.units[0].conformation.operator.assembly?.id || '-1';
    const entry_id = structure.units[0].model.entryId.toLowerCase();
    const url = `${hackedServerUrl}/${entry_id}?assembly_id=${assembly_id}`;
    const asset = Asset.getUrlAsset(ctx.assetManager, url);
    let dataWrapper: Asset.Wrapper<'json'>;
    try {
        dataWrapper = await ctx.assetManager.resolve(asset, 'json').runInContext(ctx.runtime);
    } catch (err) {
        // PDBe API returns 404 when there are no symmetries -> treat as success with empty json in body
        if (`${err}`.includes('404')) { // dirrrty
            dataWrapper = Asset.Wrapper({}, asset, ctx.assetManager);
        } else {
            throw err;
        }
    }
    const data = dataWrapper.data;

    const value: AssemblySymmetryDataValue = (data[entry_id] ?? []).map((v: any) => ({
        kind: 'Global Symmetry',
        oligomeric_state: v.oligomeric_state,
        stoichiometry: [v.stoichiometry],
        symbol: v.symbol,
        type: v.type,
        clusters: [],
        rotation_axes: v.rotation_axes,
    }));

    return { value, assets: [dataWrapper] };
}
