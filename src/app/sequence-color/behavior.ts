import { ColorTypeLocation } from 'molstar/lib/mol-geo/geometry/color-data';
import { CustomStructureProperties } from 'molstar/lib/mol-plugin-state/transforms/model';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import { ColorTheme } from 'molstar/lib/mol-theme/color';
import { ThemeDataContext } from 'molstar/lib/mol-theme/theme';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { BehaviorSubject, Unsubscribable } from 'rxjs';
import { CustomSequenceColorTheme } from './color';
import { SequenceColorAnnotationsProperty } from './sequence-color-annotations-prop';
import { SequenceColorThemeProperty } from './sequence-color-theme-prop';


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
            const colorThemeRegistry = this.ctx.representation.structure.themes.colorThemeRegistry;
            this.ctx.customStructureProperties.register(SequenceColorThemeProperty.makeProvider(colorThemeRegistry), this.params.autoAttach);
            this.ctx.customStructureProperties.register(SequenceColorAnnotationsProperty.Provider, this.params.autoAttach);
            const customColorThemeProvider = CustomSequenceColorTheme.makeProvider(colorThemeRegistry);
            if (this.ctx instanceof PluginUIContext) {
                const theme: BehaviorSubject<ColorThemeSpec | undefined> = this.ctx.customUIState.experimentalSequenceColorTheme ??= new BehaviorSubject<ColorThemeSpec | undefined>(undefined);
                this.sub = this.ctx.state.events.cell.stateUpdated.subscribe(s => {
                    if (s.cell.transform.transformer === CustomStructureProperties) {
                        theme.next({ provider: customColorThemeProvider });
                    }
                });
            }
        }
        update(p: { autoAttach: boolean }) {
            const updated = this.params.autoAttach !== p.autoAttach;
            this.params.autoAttach = p.autoAttach;
            this.ctx.customStructureProperties.setDefaultAutoAttach(SequenceColorThemeProperty.Name, this.params.autoAttach);
            this.ctx.customStructureProperties.setDefaultAutoAttach(SequenceColorAnnotationsProperty.Name, this.params.autoAttach);
            return updated;
        }
        unregister() {
            this.ctx.customStructureProperties.unregister(SequenceColorThemeProperty.Name);
            this.ctx.customStructureProperties.unregister(SequenceColorAnnotationsProperty.Name);
            this.sub?.unsubscribe();
            this.sub = undefined;
            if (this.ctx instanceof PluginUIContext) {
                const theme: BehaviorSubject<ColorThemeSpec | undefined> | undefined = this.ctx.customUIState.experimentalSequenceColorTheme;
                theme?.next(undefined);
            }
        }
    },
    params: () => ({
        autoAttach: PD.Boolean(true),
    }),
});
