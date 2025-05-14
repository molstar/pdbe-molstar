/** Helper functions to allow showing custom atom interactions */

import { MVSBuildPrimitiveShape, MVSInlinePrimitiveData } from 'molstar/lib/extensions/mvs/components/primitives';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { MolstarSubtree } from 'molstar/lib/extensions/mvs/tree/molstar/molstar-tree';
import { ColorT } from 'molstar/lib/extensions/mvs/tree/mvs/param-types';
import { ShapeRepresentation3D } from 'molstar/lib/mol-plugin-state/transforms/representation';
import { AnyColor } from 'src/app/spec';
import { PDBeMolstarPlugin } from '../..';
import { QueryParam, queryParamsToMvsComponentExpressions } from '../../helpers';


export interface Interaction {
    start: QueryParam,
    end: QueryParam,
    color?: AnyColor,
    tooltip?: string,
}

const dummyData: Interaction[] = [
    {
        start: { auth_asym_id: 'A', auth_seq_id: 45, atoms: ['CA'] },
        end: { auth_asym_id: 'A', auth_seq_id: 50, atoms: ['CA'] },
        color: 'yellow',
        tooltip: '<b>Hydrophobic interaction</b><br/> GLN 45 | CA — PHE 50 | CA',
    },
    {
        start: { auth_asym_id: 'A', auth_seq_id: 50, atoms: ['CA'] },
        end: { auth_asym_id: 'A', auth_seq_id: 65, atoms: ['CA'] },
        color: 'red',
        tooltip: '<b>Ion interaction</b><br/> PHE 50 | CA — PHE 65 | CA',
    },
];

export function foo(viewer: PDBeMolstarPlugin) {
    return loadInteractions(viewer, { interactions: dummyData });
}

/** Show custom atom interactions */
export async function loadInteractions(viewer: PDBeMolstarPlugin, params: { interactions: Interaction[], structureId?: string }) {
    const structureId = params.structureId ?? PDBeMolstarPlugin.MAIN_STRUCTURE_ID;
    const struct = viewer.getStructure(structureId);
    if (!struct) throw new Error(`Did not find structure with ID "${structureId}"`);

    const primitivesMvsNode = interactionsToMvsPrimitiveData(params.interactions);

    const update = viewer.plugin.build();
    const data = update.to(struct.cell).apply(MVSInlinePrimitiveData, { node: primitivesMvsNode as any }); // TODO tags
    data.apply(MVSBuildPrimitiveShape, { kind: 'mesh' }).apply(ShapeRepresentation3D);
    data.apply(MVSBuildPrimitiveShape, { kind: 'lines' }).apply(ShapeRepresentation3D);
    data.apply(MVSBuildPrimitiveShape, { kind: 'labels' }).apply(ShapeRepresentation3D); // TODO tags
    await update.commit();

    return {
        ref: data.ref,
        delete(): Promise<void> {
            return viewer.plugin.build().delete(data.ref).commit();
        },
    };
}

function interactionsToMvsPrimitiveData(interactions: Interaction[]): MolstarSubtree<'primitives'> {
    const builder = MVSData.createBuilder();
    const primitives = builder.primitives({ opacity: 1, tooltip: 'Custom interactions', color: 'white' });

    for (const interaction of interactions) {
        primitives.tube({
            start: { expressions: queryParamsToMvsComponentExpressions([interaction.start]) },
            end: { expressions: queryParamsToMvsComponentExpressions([interaction.end]) },
            radius: 0.1,
            dash_length: 0.1,
            color: interaction.color as ColorT,
            tooltip: interaction.tooltip,
        });
    }
    // use primitives.distance to add labels to tubes
    // primitives.distance({
    //     start: { auth_asym_id: 'A', auth_seq_id: 50, auth_atom_id: 'CA' },
    //     end: { auth_asym_id: 'A', auth_seq_id: 65, auth_atom_id: 'CA' },
    //     radius: 0.1,
    //     dash_length: 0.1,
    //     color: 'yellow',
    //     label_template: 'hydrophobic',
    //     label_color: 'yellow',
    //     label_size: 0.5,
    // });
    const state = builder.getState();
    const primitivesNode = state.root.children?.find(child => child.kind === 'primitives') as MolstarSubtree<'primitives'> | undefined;
    if (!primitivesNode) throw new Error('AssertionError: Failed to create MVS "primitives" subtree.');
    return primitivesNode;
}
