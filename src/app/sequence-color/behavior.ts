import { ColorTypeLocation } from 'molstar/lib/mol-geo/geometry/color-data';
import { CustomStructureProperties } from 'molstar/lib/mol-plugin-state/transforms/model';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { BehaviorSubject, Unsubscribable } from 'rxjs';
import { CustomSequenceColorTheme } from './color';
import { SequenceColorProperty } from './prop';


interface ColorThemeSpec<P extends PD.Params = any> {
    provider: ColorTheme.Provider<P, string, ColorTypeLocation>,
    getProps?: (ctx: ThemeDataContext) => PD.Values<P>,
}

/** Allows coloring residues in sequence panel */
export const SequenceColor = PluginBehavior.create<{ autoAttach: boolean }>({
    name: 'sequence-color',
    category: 'misc',
    display: {
        name: 'Sequence Color',
        description: 'Sequence Color extension, allows assigning custom residue colors to be shown in the sequence panel, based on a custom structure property',
    },
    ctor: class extends PluginBehavior.Handler<{ autoAttach: boolean }> {
        sub?: Unsubscribable;

        register(): void {
            this.ctx.customStructureProperties.register(SequenceColorProperty.Provider, this.params.autoAttach);
            if (this.ctx instanceof PluginUIContext) {
                const customUIState = (this.ctx as any).customUIState ?? {}; // TODO remove this hack once `customUIState` is available in core Molstar
                const theme: BehaviorSubject<ColorThemeSpec | undefined> = customUIState.experimentalSequenceColorTheme ??= new BehaviorSubject<ColorThemeSpec | undefined>(undefined);
                this.sub = this.ctx.state.events.cell.stateUpdated.subscribe(s => {
                    if (s.cell.transform.transformer === CustomStructureProperties) {
                        theme.next({ provider: CustomSequenceColorTheme.Provider });
                    }
                });
            }
        }
        update(p: { autoAttach: boolean }) {
            const updated = this.params.autoAttach !== p.autoAttach;
            this.params.autoAttach = p.autoAttach;
            this.ctx.customStructureProperties.setDefaultAutoAttach(SequenceColorProperty.Provider.descriptor.name, this.params.autoAttach);
            return updated;
        }
        unregister() {
            this.ctx.customStructureProperties.unregister(SequenceColorProperty.Provider.descriptor.name);
            this.sub?.unsubscribe();
            this.sub = undefined;
            if (this.ctx instanceof PluginUIContext) {
                const customUIState = (this.ctx as any).customUIState ?? {}; // TODO remove this hack once `customUIState` is available in core Molstar
                const theme: BehaviorSubject<ColorThemeSpec | undefined> | undefined = customUIState.experimentalSequenceColorTheme;
                theme?.next(undefined);
            }
        }
    },
    params: () => ({
        autoAttach: PD.Boolean(true),
    }),
});
