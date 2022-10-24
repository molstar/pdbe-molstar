import { CollapsableControls } from 'Molstar/mol-plugin-ui/base';
import { SuperpositionSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
import { applyAFTransparency, clearStructureTransparency } from '../alphafold-transparency';


const TransparencyParams = {
    score: PD.Numeric(70, { min: 0, max: 100, step: 1 }, { label: 'pLDDT less than', description: 'pLDDT score value in the range of 0 to 100' }),
    opacity: PD.Numeric(0.2, { min: 0, max: 1, step: 0.01 }, { description: 'Opacity value in the range 0 to 1' })
};
type TransparencyParams = PD.Values<typeof TransparencyParams>

export class AlphafoldTransparencyControls extends CollapsableControls<{}, { transpareny: any }> {
    defaultState() {
        return {
            isCollapsed: false,
            header: 'AlphaFold Structure Opacity',
            brand: { accent: 'gray' as const, svg: SuperpositionSvg },
            isHidden: true,
            transpareny: {
                score: 70,
                opacity: 0.2
            }
        };
    }

    componentDidMount() {
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, sel => {
            const superpositionState: any = (this.plugin.customState as any).superpositionState;
            if (superpositionState && superpositionState.alphafold.ref && superpositionState.alphafold.ref !== '') {
                this.setState({ isHidden: false });
            }
        });
    }

    updateTransparency = async (val: any) => {
        this.setState({transpareny: val});
        const superpositionState: any = (this.plugin.customState as any).superpositionState;
        const afStr: any = this.plugin.managers.structure.hierarchy.current.refs.get(superpositionState.alphafold.ref!);
        await clearStructureTransparency(this.plugin, afStr.components);
        await applyAFTransparency(this.plugin, afStr, 1 - val.opacity, val.score);
    }

    renderControls() {
        return <>
            <ParameterControls params={TransparencyParams} values={this.state.transpareny} onChangeValues={this.updateTransparency} />
        </>;
    }
}