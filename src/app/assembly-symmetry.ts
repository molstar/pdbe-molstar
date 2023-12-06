import { AssemblySymmetryClusterColorThemeProvider } from 'Molstar/extensions/rcsb/assembly-symmetry/color';
import { AssemblySymmetry, AssemblySymmetryDataProps, AssemblySymmetryDataValue } from 'Molstar/extensions/rcsb/assembly-symmetry/prop';
import { CustomProperty } from 'Molstar/mol-model-props/common/custom-property';
import { Structure } from 'Molstar/mol-model/structure';
import { Asset } from 'Molstar/mol-util/assets';


/** Perform "hacks" necessary to use RCSBAssemblySymmetry with PDBe symmetry API.
 * This is just a temporary solution.
 * TODO update Mol* version and set these plugin config items:
 * `RCSBAssemblySymmetryConfig.DefaultServerType='pdbe'`,
 * `RCSBAssemblySymmetryConfig.DefaultServerUrl='https://www.ebi.ac.uk/pdbe/aggregated-api/pdb/symmetry'`,
 * `RCSBAssemblySymmetryConfig.ApplyColors=false`,
 * and remove the hack!
 */
export function hackRCSBAssemblySymmetry() {
    AssemblySymmetry.fetch = fetch_PDBe;
    AssemblySymmetry.isApplicable = struct => struct?.units[0].conformation.operator.assembly !== undefined; // this disables hiding Assembly Symmetry controls (e.g. 1smv assembly 3), instead hides them for non-assembly structures
    (AssemblySymmetryClusterColorThemeProvider.isApplicable as any) = () => false;
}

/** Replacement for AssemblySymmetry.DefaultServerUrl */
export const hackedServerUrl = 'https://www.ebi.ac.uk/pdbe/aggregated-api/pdb/symmetry';

/** Replacement for AssemblySymmetry.fetch */
async function fetch_PDBe(ctx: CustomProperty.Context, structure: Structure, props: AssemblySymmetryDataProps): Promise<CustomProperty.Data<AssemblySymmetryDataValue>> {
    if (!AssemblySymmetry.isApplicable(structure)) return { value: [] };

    const assembly_id = structure.units[0].conformation.operator.assembly?.id || '-1'; // should use '' instead of '-1' but the API does not support non-number assembly_id
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
