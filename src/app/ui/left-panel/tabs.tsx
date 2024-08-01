import { Canvas3DParams } from 'molstar/lib/mol-canvas3d/canvas3d';
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { IconButton, SectionHeader } from 'molstar/lib/mol-plugin-ui/controls/common';
import { AccountTreeOutlinedSvg, DeleteOutlinedSvg, HelpOutlineSvg, HomeOutlinedSvg, SaveOutlinedSvg, TuneSvg } from 'molstar/lib/mol-plugin-ui/controls/icons';
import { ParameterControls } from 'molstar/lib/mol-plugin-ui/controls/parameters';
import { StateObjectActions } from 'molstar/lib/mol-plugin-ui/state/actions';
import { RemoteStateSnapshots, StateSnapshots } from 'molstar/lib/mol-plugin-ui/state/snapshots';
import { StateTree } from 'molstar/lib/mol-plugin-ui/state/tree';
import { HelpContent, HelpGroup, HelpText } from 'molstar/lib/mol-plugin-ui/viewport/help';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { StateTransform } from 'molstar/lib/mol-state';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import React from 'react';
import { PluginCustomState } from '../../plugin-custom-state';
import { TabSpec } from './core';
import { SegmentTree } from '../segment-tree';


const _WavesIcon = <svg width='24px' height='24px' viewBox='0 0 24 24'><path d="M17 16.99c-1.35 0-2.2.42-2.95.8-.65.33-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.38-1.57-.8-2.95-.8s-2.2.42-2.95.8c-.65.33-1.17.6-2.05.6v1.95c1.35 0 2.2-.42 2.95-.8.65-.33 1.17-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.42 2.95-.8c.65-.33 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.58.8 2.95.8v-1.95c-.9 0-1.4-.25-2.05-.6-.75-.38-1.6-.8-2.95-.8zm0-4.45c-1.35 0-2.2.43-2.95.8-.65.32-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.38-1.57-.8-2.95-.8s-2.2.43-2.95.8c-.65.32-1.17.6-2.05.6v1.95c1.35 0 2.2-.43 2.95-.8.65-.35 1.15-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.43 2.95-.8c.65-.35 1.15-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.58.8 2.95.8v-1.95c-.9 0-1.4-.25-2.05-.6-.75-.38-1.6-.8-2.95-.8zm2.95-8.08c-.75-.38-1.58-.8-2.95-.8s-2.2.42-2.95.8c-.65.32-1.18.6-2.05.6-.9 0-1.4-.25-2.05-.6-.75-.37-1.57-.8-2.95-.8s-2.2.42-2.95.8c-.65.33-1.17.6-2.05.6v1.93c1.35 0 2.2-.43 2.95-.8.65-.33 1.17-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.43 2.95-.8c.65-.32 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.58.8 2.95.8V5.04c-.9 0-1.4-.25-2.05-.58zM17 8.09c-1.35 0-2.2.43-2.95.8-.65.35-1.15.6-2.05.6s-1.4-.25-2.05-.6c-.75-.38-1.57-.8-2.95-.8s-2.2.43-2.95.8c-.65.35-1.15.6-2.05.6v1.95c1.35 0 2.2-.43 2.95-.8.65-.32 1.18-.6 2.05-.6s1.4.25 2.05.6c.75.38 1.57.8 2.95.8s2.2-.43 2.95-.8c.65-.32 1.18-.6 2.05-.6.9 0 1.4.25 2.05.6.75.38 1.58.8 2.95.8V9.49c-.9 0-1.4-.25-2.05-.6-.75-.38-1.6-.8-2.95-.8z" /></svg>;
function WavesIconSvg() { return _WavesIcon; }


/** Body of 'root' (aka Home) tab in the left panel */
class HomeTabBody extends PluginUIComponent<{}, { tab: string }> {
    render() {
        return <>
            <StateObjectActions state={this.plugin.state.data} nodeRef={StateTransform.RootRef} hideHeader={true} initiallyCollapsed={true} alwaysExpandFirst={true} />
            {this.plugin.spec.components?.remoteState !== 'none' && <RemoteStateSnapshots listOnly />}
        </>;
    }
}

/** Header of 'data' (aka State Tree) tab in the left panel */
class DataTabHeader extends PluginUIComponent<{}, { tab: string }> {
    render() {
        return <SectionHeader icon={AccountTreeOutlinedSvg} title={<><RemoveAllButton /> State Tree</>} />;
    }
}

/** Body of 'data' (aka State Tree) tab in the left panel */
class DataTabBody extends PluginUIComponent<{}, { tab: string }> {
    render() {
        return <StateTree state={this.plugin.state.data} />;
    }
}

/** Button for clearing state tree ("delete" icon) */
class RemoveAllButton extends PluginUIComponent<{}> {
    componentDidMount() {
        this.subscribe(this.plugin.state.events.cell.created, e => {
            if (e.cell.transform.parent === StateTransform.RootRef) this.forceUpdate();
        });

        this.subscribe(this.plugin.state.events.cell.removed, e => {
            if (e.parent === StateTransform.RootRef) this.forceUpdate();
        });
    }

    remove = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.State.RemoveObject(this.plugin, { state: this.plugin.state.data, ref: StateTransform.RootRef });
    };

    render() {
        const count = this.plugin.state.data.tree.children.get(StateTransform.RootRef).size;
        if (count === 0) return null;
        return <IconButton svg={DeleteOutlinedSvg} onClick={this.remove} title={'Remove All'} style={{ display: 'inline-block' }} small className='msp-no-hover-outline' transparent />;
    }
}

function HelpSection(props: { header: string }) { // copypaste of private HelpSection from molstar/lib/mol-plugin-ui/viewport/help.tsx
    return <div className='msp-simple-help-section'>{props.header}</div>;
}

/** Help section about superposition functionality for the left panel */
class SuperpositionHelpSection extends PluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
    }
    render() {
        return <div>
            <HelpSection header='Superposition' />
            <HelpGroup header='Segment'>
                <HelpText>
                    <p>Discrete UniProt sequence range mapped to the structure</p>
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Cluster'>
                <HelpText>
                    <p>Structural chains that possess significantly close superposition Q-score</p>
                </HelpText>
            </HelpGroup>
            <HelpGroup header='Representative chain'>
                <HelpText>
                    <p>The best-ranked chain within a cluster chosen based on the model quality, resolution, observed residues ratio and UniProt sequence coverage</p>
                </HelpText>
            </HelpGroup>
        </div>;
    }
}

/** Body of 'help' tab in the left panel (core help + PDBe-specific help) */
class PDBeHelpContent extends PluginUIComponent<{}, { tab: string }> {
    render() {
        return <>
            <HelpContent />
            <SuperpositionHelpSection />
        </>;
    }
}

/** Body of 'setting' tab in the left panel (excluding Behaviors) */
class FullSettings extends PluginUIComponent { // modification of private FullSettings from molstar/lib/mol-plugin-ui/left-panel.tsx
    private setSettings = (p: { param: PD.Base<any>, name: string, value: any }) => {
        PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: { [p.name]: p.value } });
    };

    componentDidMount() {
        this.subscribe(this.plugin.events.canvas3d.settingsUpdated, () => this.forceUpdate());
        this.subscribe(this.plugin.layout.events.updated, () => this.forceUpdate());

        this.subscribe(this.plugin.canvas3d!.camera.stateChanged, state => {
            if (state.radiusMax !== undefined || state.radius !== undefined) {
                this.forceUpdate();
            }
        });
    }

    render() {
        return <>
            {this.plugin.canvas3d && <>
                <SectionHeader title='Viewport' />
                <ParameterControls params={Canvas3DParams} values={this.plugin.canvas3d.props} onChange={this.setSettings} />
            </>}
            {/* <SectionHeader title='Behavior' />
            <StateTree state={this.plugin.state.behaviors} /> */}
        </>;
    }
}


/** Left panel tabs in core Molstar */
export const CoreLeftPanelTabs = {
    root: {
        id: 'root',
        title: 'Home',
        icon: HomeOutlinedSvg,
        body: HomeTabBody,
    },
    data: {
        id: 'data',
        title: 'State Tree',
        icon: AccountTreeOutlinedSvg,
        header: DataTabHeader,
        body: DataTabBody,
        dirtyOn: plugin => plugin.state.data.events.changed,
    },
    states: {
        id: 'states',
        title: 'Plugin State',
        icon: SaveOutlinedSvg,
        header: () => <></>,
        body: StateSnapshots,
    },
    help: {
        id: 'help',
        title: 'Help',
        icon: HelpOutlineSvg,
        body: PDBeHelpContent,
    },
    settings: {
        id: 'settings',
        title: 'Plugin Settings',
        icon: TuneSvg,
        body: FullSettings,
    },
} as const satisfies Record<string, TabSpec>;


/** Additional PDBe-specific left panel tabs */
export const PDBeLeftPanelTabs = {
    segments: {
        id: 'segments',
        title: 'Superpose Segments',
        icon: WavesIconSvg,
        header: () => <></>,
        body: SegmentTree,
        showWhen: plugin => !!PluginCustomState(plugin).initParams?.superposition,
    },
} as const satisfies Record<string, TabSpec>;
