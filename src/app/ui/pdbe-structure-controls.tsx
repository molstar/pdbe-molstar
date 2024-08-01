import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { StructureComponentControls } from 'molstar/lib/mol-plugin-ui/structure/components';
import { StructureMeasurementsControls } from 'molstar/lib/mol-plugin-ui/structure/measurements';
import { StructureSourceControls } from 'molstar/lib/mol-plugin-ui/structure/source';
import { VolumeStreamingControls, VolumeSourceControls } from 'molstar/lib/mol-plugin-ui/structure/volume';
import { AnnotationsComponentControls } from './annotation-controls';
import { Icon, BuildSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { SuperpositionComponentControls } from './superposition-components';
import { StructureQuickStylesControls } from 'molstar/lib/mol-plugin-ui/structure/quick-styles';
import { AlphafoldPaeControls, AlphafoldSuperpositionControls } from './alphafold-superposition';
import { SuperpositionModelExportUI } from './export-superposition';
import { AlphafoldTransparencyControls } from './alphafold-tranparency';
import { AssemblySymmetry } from 'molstar/lib/extensions/rcsb/assembly-symmetry/prop';


export class PDBeStructureTools extends PluginUIComponent {
    render() {
        const AssemblySymmetryKey = AssemblySymmetry.Tag.Representation;
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>

            <StructureSourceControls />
            <AnnotationsComponentControls />
            <StructureQuickStylesControls />
            <StructureComponentControls />
            <VolumeStreamingControls />
            <VolumeSourceControls />
            <StructureMeasurementsControls />
            <CustomStructureControls skipKeys={[AssemblySymmetryKey]} />
        </>;
    }
}

export class CustomStructureControls extends PluginUIComponent<{ initiallyCollapsed?: boolean, takeKeys?: string[], skipKeys?: string[] }> {
    componentDidMount() {
        this.subscribe(this.plugin.state.behaviors.events.changed, () => this.forceUpdate());
    }

    render() {
        const takeKeys = this.props.takeKeys ?? Array.from(this.plugin.customStructureControls.keys());
        const result: JSX.Element[] = [];
        for (const key of takeKeys) {
            if (this.props.skipKeys?.includes(key)) continue;
            const Controls = this.plugin.customStructureControls.get(key);
            if (!Controls) continue;
            result.push(<Controls initiallyCollapsed={this.props.initiallyCollapsed} key={key} />);
        }
        return result.length > 0 ? <>{result}</> : null;
    }
}

export class PDBeLigandViewStructureTools extends PluginUIComponent {
    render() {
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>
            <StructureComponentControls />
            <VolumeStreamingControls />
            <StructureMeasurementsControls />
            <CustomStructureControls />
        </>;
    }
}

export class PDBeSuperpositionStructureTools extends PluginUIComponent {
    render() {
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>
            <SuperpositionComponentControls />
            <AlphafoldTransparencyControls />
            <AlphafoldPaeControls />
            <AlphafoldSuperpositionControls />
            <StructureMeasurementsControls />
            <SuperpositionModelExportUI />
            <CustomStructureControls />
        </>;
    }
}