 import { useState } from 'react';
 import { CollapsableControls, CollapsableState } from 'Molstar/mol-plugin-ui/base';
 import { Button } from 'Molstar/mol-plugin-ui/controls/common';
 import { GetAppSvg } from 'Molstar/mol-plugin-ui/controls/icons';
 import { ParameterControls } from 'Molstar/mol-plugin-ui/controls/parameters';
 import { useBehavior } from 'Molstar/mol-plugin-ui/hooks/use-behavior';
 import { PluginContext } from 'Molstar/mol-plugin/context';
 import { ParamDefinition as PD } from 'Molstar/mol-util/param-definition';
 import { superpositionExportHierarchy } from '../superposition-export';
 
 export class SuperpositionModelExportUI extends CollapsableControls<{}, {}> {
     protected defaultState(): CollapsableState {
         return {
             header: 'Export Models',
             isCollapsed: true,
             brand: { accent: 'cyan', svg: GetAppSvg }
         };
     }
     protected renderControls(): JSX.Element | null {
         return <SuperpositionExportControls plugin={this.plugin} />;
     }
 }
 
 const Params = {
     format: PD.Select<'cif' | 'bcif'>('cif', [['cif', 'mmCIF'], ['bcif', 'Binary mmCIF']])
 };
 const DefaultParams = PD.getDefaultValues(Params);
 
 function SuperpositionExportControls({ plugin }: { plugin: PluginContext }) {
     const [params, setParams] = useState(DefaultParams);
     const [exporting, setExporting] = useState(false);
     useBehavior(plugin.managers.structure.hierarchy.behaviors.selection); // triggers UI update
     const isBusy = useBehavior(plugin.behaviors.state.isBusy);
     const hierarchy = plugin.managers.structure.hierarchy.current;
 
     let label: string = 'Nothing to Export';
     if (hierarchy.structures.length === 1) {
         label = 'Export';
     } if (hierarchy.structures.length > 1) {
         label = 'Export (as ZIP)';
     }
 
     const onExport = async () => {
         setExporting(true);
         try {
             await superpositionExportHierarchy(plugin, { format: params.format });
         } finally {
             setExporting(false);
         }
     };
 
     return <>
         <ParameterControls params={Params} values={params} onChangeValues={setParams} isDisabled={isBusy || exporting} />
         <Button
             onClick={onExport}
             style={{ marginTop: 1 }}
             disabled={isBusy || hierarchy.structures.length === 0 || exporting}
             commit={hierarchy.structures.length ? 'on' : 'off'}
         >
             {label}
         </Button>
     </>;
 }