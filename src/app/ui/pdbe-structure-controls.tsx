import * as React from 'react';
import { PluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { StructureComponentControls } from 'Molstar/mol-plugin-ui/structure/components';
import { StructureMeasurementsControls } from 'Molstar/mol-plugin-ui/structure/measurements';
import { StructureSourceControls } from 'Molstar/mol-plugin-ui/structure/source';
import { VolumeStreamingControls, VolumeSourceControls } from 'Molstar/mol-plugin-ui/structure/volume';
import { AnnotationsComponentControls } from './annotation-controls';
import { Icon, BuildSvg } from 'Molstar/mol-plugin-ui/controls/icons';
import { SuperpositionComponentControls } from './superposition-components';
import { AFConfidenceComponentControls } from './af-confidence-controls';

export class PDBeStructureTools extends PluginUIComponent {
    render() {
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>

            <StructureSourceControls />
            <AnnotationsComponentControls />
            <StructureComponentControls />
            <VolumeStreamingControls />
            <VolumeSourceControls />
            <StructureMeasurementsControls />
        </>;
    }
}

export class PDBeLigandViewStructureTools extends PluginUIComponent {
    render() {
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>
            <StructureComponentControls />
            <VolumeStreamingControls />
            <StructureMeasurementsControls />
        </>;
    }
}

export class PDBeSuperpositionStructureTools extends PluginUIComponent {
    render() {
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>
            <SuperpositionComponentControls />
            <StructureMeasurementsControls />
        </>;
    }
}

export class PDBeAfViewStructureTools extends PluginUIComponent {
    render() {
        return <>
            <div className='msp-section-header'><Icon svg={BuildSvg} />Structure Tools</div>
            <StructureComponentControls />
            <AFConfidenceComponentControls />
            <StructureMeasurementsControls />
        </>;
    }
}