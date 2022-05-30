import { PluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { StructureComponentControls } from 'Molstar/mol-plugin-ui/structure/components';
import { StructureMeasurementsControls } from 'Molstar/mol-plugin-ui/structure/measurements';
import { StructureSourceControls } from 'Molstar/mol-plugin-ui/structure/source';
import { VolumeStreamingControls, VolumeSourceControls } from 'Molstar/mol-plugin-ui/structure/volume';
import { AnnotationsComponentControls } from './annotation-controls';
import { Icon, BuildSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { SuperpositionComponentControls } from './superposition-components';
import { StructureQuickStylesControls } from 'Molstar/mol-plugin-ui/structure/quick-styles';

export class PDBeStructureTools extends PluginUIComponent {
    render() {
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>

            <StructureSourceControls />
            <AnnotationsComponentControls />
            <StructureQuickStylesControls />
            <StructureComponentControls />
            <VolumeStreamingControls />
            <VolumeSourceControls />
            <StructureMeasurementsControls />
            <CustomStructureControls />
        </>;
    }
}

export class CustomStructureControls extends PluginUIComponent<{ initiallyCollapsed?: boolean }> {
    componentDidMount() {
        this.subscribe(this.plugin.state.behaviors.events.changed, () => this.forceUpdate());
    }

    render() {
        const controls: JSX.Element[] = [];
        this.plugin.customStructureControls.forEach((Controls, key) => {
            controls.push(<Controls initiallyCollapsed={this.props.initiallyCollapsed} key={key} />);
        });
        return controls.length > 0 ? <>{controls}</> : null;
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
            <StructureMeasurementsControls />
            <CustomStructureControls />
        </>;
    }
}