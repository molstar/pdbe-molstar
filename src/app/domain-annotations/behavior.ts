import { Loci } from 'molstar/lib/mol-model/loci';
import { PluginBehavior } from 'molstar/lib/mol-plugin/behavior';
import { ParamDefinition as PD } from 'molstar/lib/mol-util/param-definition';
import { DomainAnnotationsColorThemeProvider } from './color';
import { DomainAnnotationsProvider } from './prop';


export const PDBeDomainAnnotations = PluginBehavior.create<{ autoAttach: boolean, showTooltip: boolean }>({
    name: 'pdbe-domain-annotations-prop',
    category: 'custom-props',
    display: {
        name: 'Domain annotations',
        description: 'Data for domain annotations, obtained via PDBe.'
    },
    ctor: class extends PluginBehavior.Handler<{ autoAttach: boolean, showTooltip: boolean }> {

        private provider = DomainAnnotationsProvider;

        private labelDomainAnnotations = {
            label: (loci: Loci): string | undefined => undefined
        };

        register(): void {
            this.ctx.customModelProperties.register(this.provider, this.params.autoAttach);
            this.ctx.managers.lociLabels.addProvider(this.labelDomainAnnotations);
            this.ctx.representation.structure.themes.colorThemeRegistry.add(DomainAnnotationsColorThemeProvider);
        }

        update(p: { autoAttach: boolean, showTooltip: boolean }) {
            const updated = this.params.autoAttach !== p.autoAttach;
            this.params.autoAttach = p.autoAttach;
            this.params.showTooltip = p.showTooltip;
            this.ctx.customModelProperties.setDefaultAutoAttach(this.provider.descriptor.name, this.params.autoAttach);
            return updated;
        }

        unregister() {
            this.ctx.customModelProperties.unregister(DomainAnnotationsProvider.descriptor.name);
            this.ctx.managers.lociLabels.removeProvider(this.labelDomainAnnotations);
            this.ctx.representation.structure.themes.colorThemeRegistry.remove(DomainAnnotationsColorThemeProvider);
        }
    },
    params: () => ({
        autoAttach: PD.Boolean(false),
        showTooltip: PD.Boolean(true),
    })
});
