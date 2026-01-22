/** Helper functions to allow showing custom atom interactions */

import { MVSBuildPrimitiveShape, MVSInlinePrimitiveData } from 'molstar/lib/extensions/mvs/components/primitives';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { MolstarSubtree } from 'molstar/lib/extensions/mvs/tree/molstar/molstar-tree';
import { ColorT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { ShapeRepresentation3D } from 'molstar/lib/mol-plugin-state/transforms/representation';
import { setSubtreeVisibility } from 'molstar/lib/mol-plugin/behavior/static/state';
import { PDBeMolstarPlugin } from '../..';
import { QueryParam, queryParamsToMvsComponentExpressions } from '../../helpers';
import { ExtensionCustomState } from '../../plugin-custom-state';


/** Name used when registering extension, custom state, etc. */
const InteractionsExtensionName = 'pdbe-custom-interactions';
const getExtensionCustomState = ExtensionCustomState.getter<{ visuals: StateObjectHandle[] }>(InteractionsExtensionName);


export interface Interaction {
    start: QueryParam,
    end: QueryParam,
    color?: string,
    radius?: number,
    dash_length?: number,
    tooltip?: string,
}

const DEFAULT_COLOR = 'white';
const DEFAULT_RADIUS = 0.075;
const DEFAULT_DASH_LENGTH = 0.1;
const DEFAULT_OPACITY = 1;

export interface StateObjectHandle {
    /** State transform reference */
    ref: string,
    /** Set state object visibility on/off */
    setVisibility(visible: boolean): void,
    /** Remove state object from state hierarchy */
    delete: () => Promise<void>,
}

export function loadInteractions_example(viewer: PDBeMolstarPlugin, params?: { opacity?: number, color?: string, radius?: number, dash_length?: number }): Promise<StateObjectHandle> {
    return loadInteractions(viewer, { ...params, interactions: exampleData });
}

/** Show custom atom interactions */
export async function loadInteractions(viewer: PDBeMolstarPlugin, params: { interactions: Interaction[], structureId?: string, opacity?: number, color?: string, radius?: number, dash_length?: number }): Promise<StateObjectHandle> {
    const structureId = params.structureId ?? PDBeMolstarPlugin.MAIN_STRUCTURE_ID;
    const struct = viewer.getStructure(structureId);
    if (!struct) throw new Error(`Did not find structure with ID "${structureId}"`);

    const primitivesMvsNode = interactionsToMvsPrimitiveData(params);

    const update = viewer.plugin.build();
    const data = update.to(struct.cell).apply(MVSInlinePrimitiveData, { node: primitivesMvsNode as any }, { tags: ['custom-interactions-data'] });
    data.apply(MVSBuildPrimitiveShape, { kind: 'mesh' }).apply(ShapeRepresentation3D, {}, { tags: ['custom-interactions-mesh'] });
    data.apply(MVSBuildPrimitiveShape, { kind: 'lines' }).apply(ShapeRepresentation3D, {}, { tags: ['custom-interactions-lines'] });
    data.apply(MVSBuildPrimitiveShape, { kind: 'labels' }).apply(ShapeRepresentation3D, {}, { tags: ['custom-interactions-labels'] });
    await update.commit();

    const visual: StateObjectHandle = {
        ref: data.ref,
        setVisibility: (visible: boolean) => setSubtreeVisibility(viewer.plugin.state.data, data.ref, !visible /* true means hidden */),
        delete: () => viewer.plugin.build().delete(data.ref).commit(),
    };
    const visualsList = getExtensionCustomState(viewer.plugin).visuals ??= [];
    visualsList.push(visual);
    return visual;
}

/** Remove any previously added interactions */
export async function clearInteractions(viewer: PDBeMolstarPlugin): Promise<void> {
    const visuals = getExtensionCustomState(viewer.plugin).visuals;
    if (!visuals) return;
    for (const visual of visuals) {
        await visual.delete();
    }
    visuals.length = 0;
}

function interactionsToMvsPrimitiveData(params: { interactions: Interaction[], opacity?: number, color?: string, radius?: number, dash_length?: number }): MolstarSubtree<'primitives'> {
    const builder = MVSData.createBuilder();
    const primitives = builder.primitives({
        opacity: params.opacity ?? DEFAULT_OPACITY,
        color: params.color as ColorT ?? DEFAULT_COLOR,
    });

    for (const interaction of params.interactions) {
        primitives.tube({
            start: { expressions: queryParamsToMvsComponentExpressions([interaction.start]) },
            end: { expressions: queryParamsToMvsComponentExpressions([interaction.end]) },
            radius: interaction.radius ?? params.radius ?? DEFAULT_RADIUS,
            dash_length: interaction.dash_length ?? params.dash_length ?? DEFAULT_DASH_LENGTH,
            color: interaction.color as ColorT | undefined,
            tooltip: interaction.tooltip,
        });
    }
    const state = builder.getState();
    const primitivesNode = state.root.children?.find(child => child.kind === 'primitives') as MolstarSubtree<'primitives'> | undefined;
    if (!primitivesNode) throw new Error('AssertionError: Failed to create MVS "primitives" subtree.');
    return primitivesNode;
}

/** Selected interactions from https://www.ebi.ac.uk/pdbe/graph-api/pdb/bound_ligand_interactions/1hda/C/143 */
const exampleData: Interaction[] = [
    {
        'start': { 'auth_asym_id': 'C', 'auth_seq_id': 143, 'label_atom_id': 'CBC' },
        'end': { 'auth_asym_id': 'C', 'auth_seq_id': 32, 'label_atom_id': 'CE' },
        'color': 'yellow',
        'tooltip': '<strong>Hydrophobic interaction</strong><br>HEM 143 | CBC — MET 32 | CE',
    },
    {
        'start': { 'auth_asym_id': 'C', 'auth_seq_id': 143, 'label_atom_id': 'CBC' },
        'end': { 'auth_asym_id': 'C', 'auth_seq_id': 32, 'label_atom_id': 'SD' },
        'color': 'yellow',
        'tooltip': '<strong>Hydrophobic interaction</strong><br>HEM 143 | CBC — MET 32 | SD',
    },
    {
        'start': { 'auth_asym_id': 'C', 'auth_seq_id': 143, 'label_atom_id': 'CMD' },
        'end': { 'auth_asym_id': 'C', 'auth_seq_id': 42, 'label_atom_id': 'O' },
        'color': 'gray',
        'tooltip': '<strong>Mixed interaction</strong><br>Vdw, Weak polar<br>HEM 143 | CMD — TYR 42 | O',
    },
    {
        'start': { 'auth_asym_id': 'C', 'auth_seq_id': 143, 'label_atom_id': ['C1B', 'C2B', 'C3B', 'C4B', 'NB'] },
        'end': { 'auth_asym_id': 'C', 'auth_seq_id': 136, 'label_atom_id': 'CD1' },
        'color': 'magenta',
        'tooltip': '<strong>CARBONPI interaction</strong><br>HEM 143 | C1B, C2B, C3B, C4B, NB — LEU 136 | CD1',
    },
];
