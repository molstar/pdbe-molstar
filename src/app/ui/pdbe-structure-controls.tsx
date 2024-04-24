import { PluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { StructureComponentControls } from 'Molstar/mol-plugin-ui/structure/components';
import { StructureMeasurementsControls } from 'Molstar/mol-plugin-ui/structure/measurements';
import { StructureSourceControls } from 'Molstar/mol-plugin-ui/structure/source';
import { VolumeStreamingControls, VolumeSourceControls } from 'Molstar/mol-plugin-ui/structure/volume';
import { AnnotationsComponentControls } from './annotation-controls';
import { Icon, BuildSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { SuperpositionComponentControls } from './superposition-components';
import { StructureQuickStylesControls } from 'Molstar/mol-plugin-ui/structure/quick-styles';
import { AlphafoldPaeControls, AlphafoldSuperpositionControls } from './alphafold-superposition';
import { SuperpositionModelExportUI } from './export-superposition';
import { AlphafoldTransparencyControls } from './alphafold-tranparency';
import { AssemblySymmetry } from 'Molstar/extensions/rcsb/assembly-symmetry/prop';


type PDBeStructureToolsState = { isCollapsed: boolean }

export class PDBeStructureTools extends PluginUIComponent<{}, PDBeStructureToolsState>{
    state = { isCollapsed: true };
    toggleCollapse() {
        console.log('toggleCollapse');
        this.setState(old => ({ isCollapsed: !old.isCollapsed }));
    }
    render() {
        const AssemblySymmetryKey = AssemblySymmetry.Tag.Representation;
        if (this.state.isCollapsed) {
            return <div style={{ position: 'absolute', right: 0, width: 20, height: '100%' }} onClick={()=>this.toggleCollapse()}>&lt;</div>;
        }
        else {
            return <div style={{ position: 'absolute', left: 0, width: 20, height: '100%' }} onClick={()=>this.toggleCollapse()}>&gt;</div>;
        }
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