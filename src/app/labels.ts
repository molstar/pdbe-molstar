import { PluginContext } from 'Molstar/mol-plugin/context';
import { PluginBehavior } from 'Molstar/mol-plugin/behavior';
import { Loci } from 'Molstar/mol-model/loci';
import { StructureElement, StructureProperties } from 'Molstar/mol-model/structure';
import { lociLabel } from 'Molstar/mol-theme/label';
import { LociLabel } from 'Molstar/mol-plugin-state/manager/loci-label';

export const PDBeLociLabelProvider = PluginBehavior.create({
    name: 'pdbe-loci-label-provider',
    category: 'interaction',
    ctor: class implements PluginBehavior<undefined> {
        private f = {
            label: (loci: Loci) => {
                
                const customState = (this.ctx.customState) as any;
                const superpositionView = (customState && customState.initParams.superposition) ? true : false;

                const label: string[] = [];
                if (!superpositionView && StructureElement.Loci.is(loci) && loci.elements.length === 1) {
                    const entityNames = new Set<string>();
                    for (const { unit: u } of loci.elements) {
                        const l = StructureElement.Location.create(loci.structure, u, u.elements[0]);
                        const name = StructureProperties.entity.pdbx_description(l).join(', ');
                        entityNames.add(name);
                    }
                    if (entityNames.size === 1) entityNames.forEach(name => label.push(name));
                }
                label.push(lociLabel(loci));
                return label.filter(l => !!l).join('</br>');
            },
            group: (label: LociLabel) => label.toString().replace(/Model [0-9]+/g, 'Models'),
            priority: 100
        };
        register() { this.ctx.managers.lociLabels.addProvider(this.f); }
        unregister() { this.ctx.managers.lociLabels.removeProvider(this.f); }
        constructor(protected ctx: PluginContext) { }
    },
    display: { name: 'Provide PDBe Loci Label' }
});