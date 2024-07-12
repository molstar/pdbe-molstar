import { AssemblySymmetry3D, getRCSBAssemblySymmetryConfig, tryCreateAssemblySymmetry } from 'molstar/lib/extensions/rcsb/assembly-symmetry/behavior';
import { AssemblySymmetry, AssemblySymmetryDataProps, AssemblySymmetryDataProvider, AssemblySymmetryParams, AssemblySymmetryProps, AssemblySymmetryProvider } from 'molstar/lib/extensions/rcsb/assembly-symmetry/prop';
import { StructureRef } from 'molstar/lib/mol-plugin-state/manager/structure/hierarchy-state';
import { PurePluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { StateSelection } from 'molstar/lib/mol-state';
import { Task } from 'molstar/lib/mol-task';
import { UUID } from 'molstar/lib/mol-util';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { AnnotationRowControls } from './annotation-row-controls';


type SymmetryParams = {
    /** State of the visibility button */
    on: PD.BooleanParam,
    /** Index of the currently selected symmetry (in case there a more symmetries for an assembly), regardless of whether visibility is on of off */
    symmetryIndex: PD.Select<number>,
    /** `true` if symmetry data have been retrieved but do not contain any non-trivial symmetry */
    noSymmetries: PD.BooleanParam,
}

type SymmetryParamValues = PD.ValuesFor<SymmetryParams>

interface SymmetryControlsState {
    params: SymmetryParams,
    values: SymmetryParamValues,
}

const DefaultSymmetryControlsState: SymmetryControlsState = {
    params: {
        on: PD.Boolean(false, { isHidden: true }),
        symmetryIndex: PD.Select(0, [[0, 'Auto']]),
        noSymmetries: PD.Boolean(false, { isHidden: true }),
    },
    values: {
        on: false,
        symmetryIndex: 0,
        noSymmetries: false,
    },
};


/** UI controls for showing Assembly Symmetry annotations (a row within Annotations section) */
export class SymmetryAnnotationControls extends PurePluginUIComponent<{}, SymmetryControlsState> {
    state = DefaultSymmetryControlsState;

    currentStructureId: UUID | undefined = undefined;

    componentDidMount() {
        // Reset state when the pivot structure changes
        this.subscribe(this.plugin.managers.structure.hierarchy.behaviors.selection, c => {
            const structureObj = c.structures[0]?.cell.obj;
            const structureId = structureObj?.id;
            if (structureId !== this.currentStructureId) {
                this.currentStructureId = structureId;
                this.syncParams();
            }
        });
        // Synchronize params when AssemblySymmetry3D changes
        this.subscribe(this.plugin.state.events.cell.stateUpdated, e => {
            if (e.cell.transform.transformer === AssemblySymmetry3D) {
                this.syncParams();
            }
        });
        // Synchronize params when AssemblySymmetry3D is removed
        this.subscribe(this.plugin.state.events.cell.removed, e => {
            this.syncParams();
        });
    }

    /** Synchronize parameters and values in UI with real parameters currently applied in `AssemblySymmetryProvider` */
    syncParams() {
        if (this.hasAssemblySymmetry3D()) {
            const noSymmetries = this.noSymmetriesAvailable();
            const realParams = this.getRealParams();
            const realValues = this.getRealValues();
            const options = noSymmetries ?
                [[0, 'None']] as const
                : realParams.symmetryIndex.options.filter(([index, label]) => index >= 0); // Removing the 'off' option (having index -1)
            const params = {
                ...this.state.params,
                symmetryIndex: PD.Select(0, options),
            };
            const values = (realValues.symmetryIndex >= 0) ? {
                on: true,
                symmetryIndex: realValues.symmetryIndex,
                noSymmetries: noSymmetries,
            } : {
                on: false,
                symmetryIndex: this.state.values.symmetryIndex,
                noSymmetries: noSymmetries,
            };
            this.setState({ params, values });
        } else {
            this.setState({
                params: DefaultSymmetryControlsState.params,
                values: DefaultSymmetryControlsState.values,
            });
        }
    }

    /** Return `true` if symmetry data have been retrieved and do not contain any non-trivial symmetry. */
    noSymmetriesAvailable() {
        const structure = this.getPivotStructure()?.cell.obj?.data;
        const symmetryData = structure && AssemblySymmetryDataProvider.get(structure).value;
        return symmetryData !== undefined && symmetryData.filter(sym => sym.symbol !== 'C1').length === 0;
    }

    /** Get the first loaded structure, if any. */
    getPivotStructure(): StructureRef | undefined {
        return getPivotStructure(this.plugin);
    }

    /** Get parameters currently applied in `AssemblySymmetryProvider` */
    getRealParams(): AssemblySymmetryParams {
        const structure = this.getPivotStructure()?.cell.obj?.data;
        let params: AssemblySymmetryParams;
        if (structure) {
            params = AssemblySymmetryProvider.getParams(structure);
        } else {
            params = AssemblySymmetryProvider.defaultParams;
        }
        return params;
    }

    /** Get parameter values currently applied in `AssemblySymmetryProvider` */
    getRealValues(): AssemblySymmetryProps {
        const structure = this.getPivotStructure()?.cell.obj?.data;
        if (structure) {
            return AssemblySymmetryProvider.props(structure);
        } else {
            return { ...PD.getDefaultValues(AssemblySymmetryProvider.defaultParams), symmetryIndex: -1 };
        }
    }

    /** Return `true` if an `AssemblySymmetry3D` node existing in the   */
    hasAssemblySymmetry3D(): boolean {
        const struct = this.getPivotStructure();
        const state = struct?.cell.parent;
        return state !== undefined && !!StateSelection.findTagInSubtree(state.tree, struct!.cell.transform.ref, AssemblySymmetry.Tag.Representation);
    }

    /** Run changes needed to set visibility on or off, and set UI accordingly */
    async apply(applied: boolean) {
        if (applied) {
            if (this.hasAssemblySymmetry3D()) {
                await this.changeParamValues({ ...this.state.values, on: true });
            } else {
                await this.initSymmetry();
            }
            this.setState(old => ({ values: { ...old.values, on: true } }));
        } else {
            if (this.hasAssemblySymmetry3D()) {
                await this.changeParamValues({ ...this.state.values, on: false });
            } else {
                // no action needed
            }
            this.setState(old => ({ values: { ...old.values, on: false } }));
        }
    }

    /** Run changes needed to change parameter values, and set UI accordingly*/
    async changeParamValues(values: SymmetryParamValues) {
        const struct = this.getPivotStructure();
        if (!struct) return;
        const currValues = this.getRealValues();
        const newValues = { ...currValues, symmetryIndex: values.on ? values.symmetryIndex : -1 };

        if (struct.properties) {
            const b = this.plugin.state.data.build();
            b.to(struct.properties.cell).update(old => {
                old.properties[AssemblySymmetryProvider.descriptor.name] = newValues;
            });
            await b.commit();
        } else {
            const pd = this.plugin.customStructureProperties.getParams(struct.cell.obj?.data);
            const params = PD.getDefaultValues(pd);
            params.properties[AssemblySymmetryProvider.descriptor.name] = newValues;
            await this.plugin.builders.structure.insertStructureProperties(struct.cell, params);
        }
        if (!values.on) { // if values.on, parameters will be updated via subscription
            this.setState({ values });
        }
    }

    /** Try to retrieve symmetry data and create `AssemblySymmetry3D` representation */
    async initSymmetry(initialSymmetryIndex?: number) {
        await Task.create('Initialize Assembly Symmetry', async ctx => {
            const struct = this.getPivotStructure();
            const data = struct?.cell.obj?.data;
            if (!data) return;
            try {
                const propCtx = { runtime: ctx, assetManager: this.plugin.managers.asset };

                const config = getRCSBAssemblySymmetryConfig(this.plugin);
                const symmetryDataProps: AssemblySymmetryDataProps = {
                    serverType: config.DefaultServerType,
                    serverUrl: config.DefaultServerUrl,
                };
                await AssemblySymmetryDataProvider.attach(propCtx, data, symmetryDataProps);

                const assemblySymmetryData = AssemblySymmetryDataProvider.get(data).value;
                const symmetryIndex = initialSymmetryIndex ?? (assemblySymmetryData ? AssemblySymmetry.firstNonC1(assemblySymmetryData) : -1);
                const symmetryProps: AssemblySymmetryProps = { ...symmetryDataProps, symmetryIndex };
                await AssemblySymmetryProvider.attach(propCtx, data, symmetryProps);
            } catch (e) {
                this.plugin.log.error(`Assembly Symmetry: ${e}`);
                return;
            }
            await tryCreateAssemblySymmetry(this.plugin, struct.cell);
        }).run();
    }

    render() {
        const shortTitle = 'Assembly Symmetry' + (this.state.values.noSymmetries ? ' [Not Available]' : '');
        const title = 'Assembly Symmetry' + (this.state.values.noSymmetries ? ' [Not Available]\nSymmetry information for this assembly is not available' : '');
        return <>
            <SymmetryAnnotationRowControls shortTitle={shortTitle} title={title}
                applied={this.state.values.on} onChangeApplied={applied => this.apply(applied)}
                params={this.state.params} values={this.state.values} onChangeValues={v => this.changeParamValues(v)} />
        </>;
    }
}


class SymmetryAnnotationRowControls extends AnnotationRowControls<SymmetryParams> {
    renderOptions() {
        if (this.props.values.noSymmetries) {
            return <div className='msp-row-text'>
                <div title='Symmetry information for this assembly is not available'>Symmetry information not available</div>
            </div>;
        }
        return super.renderOptions();
    }
}

/** Get the first loaded structure, if any. */
function getPivotStructure(plugin: PluginContext): StructureRef | undefined {
    return plugin.managers.structure.hierarchy.selection.structures[0];
}

export function isAssemblySymmetryAnnotationApplicable(plugin: PluginContext) {
    const struct = getPivotStructure(plugin);
    const isAssembly = struct?.cell.obj?.data?.units[0].conformation.operator.assembly !== undefined;
    return isAssembly && AssemblySymmetry.isApplicable(struct?.cell.obj?.data);
    // It would be nice to disable the default `AssemblySymmetry.isApplicable` behavior
    // (i.e. hiding Assembly Symmetry controls for non-biological assemblies, e.g. 1smv assembly 3)
    // by `AssemblySymmetry.isApplicable = struct => struct?.units[0].conformation.operator.assembly !== undefined;`
    // But we cannot easily override the `fetch` function which calls the original `isApplicable`.
}
