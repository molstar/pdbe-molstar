import { utf8ByteCount, utf8Write } from 'Molstar/mol-io/common/utf8';
import { to_mmCIF, Unit } from 'Molstar/mol-model/structure';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { Task } from 'Molstar/mol-task';
import { getFormattedTime } from 'Molstar/mol-util/date';
import { download } from 'Molstar/mol-util/download';
import { zip } from 'Molstar/mol-util/zip/zip';
import { PluginCommands } from 'Molstar/mol-plugin/commands';

export async function superpositionExportHierarchy(plugin: PluginContext, options?: { format?: 'cif' | 'bcif' }) {
    try {
        await plugin.runTask(_superpositionExportHierarchy(plugin, options), { useOverlay: true });
    } catch (e) {
        console.error(e);
        plugin.log.error(`Model export failed. See console for details.`);
    }
}
 
function _superpositionExportHierarchy(plugin: PluginContext, options?: { format?: 'cif' | 'bcif' }) {
    return Task.create('Export', async ctx => {
        await ctx.update({ message: 'Exporting...', isIndeterminate: true, canAbort: false });
 
        const format = options?.format ?? 'cif';
        //  const { structures } = plugin.managers.structure.hierarchy.current;
        const customState = plugin.customState as any;
        const superpositionState = customState.superpositionState;

        const segmentIndex = superpositionState.activeSegment - 1;
        const files: [name: string, data: string | Uint8Array][] = [];
        const entryMap = new Map<string, number>();
        const structures = superpositionState.loadedStructs[segmentIndex].slice();
        if(superpositionState.alphafold.ref) structures.push(`AF-${customState.initParams.moleculeId}`);
        for(const molId of structures) {
            const modelRef = superpositionState.models[molId];
            if(!modelRef) continue;
            let isStrHidden = false;
            const _s: any = plugin.managers.structure.hierarchy.current.refs.get(modelRef!);
            if(_s.cell.state.isHidden) isStrHidden = true;
                for(const strComp of _s.components) {
                    if(strComp.cell.state.isHidden) isStrHidden = true;
                }
            if(isStrHidden) continue;
        
            const s = _s.transform?.cell.obj?.data ?? _s.cell.obj?.data;
            if (!s) continue;
            if (s.models.length > 1) {
                plugin.log.warn(`[Export] Skipping ${_s.cell.obj?.label}: Multimodel exports not supported.`);
                continue;
            }
            if (s.units.some((u: any) => !Unit.isAtomic(u))) {
                plugin.log.warn(`[Export] Skipping ${_s.cell.obj?.label}: Non-atomic model exports not supported.`);
                continue;
            }
 
            const name = entryMap.has(s.model.entryId)
                ? `${s.model.entryId}_${entryMap.get(s.model.entryId)! + 1}.${format}`
                : `${s.model.entryId}.${format}`;
            entryMap.set(s.model.entryId, (entryMap.get(s.model.entryId) ?? 0) + 1);

            await ctx.update({ message: `Exporting ${s.model.entryId}...`, isIndeterminate: true, canAbort: false });
            if (s.elementCount > 100000) {
                // Give UI chance to update, only needed for larger structures.
                await new Promise(res => setTimeout(res, 50));
            }

            try {
                files.push([name, to_mmCIF(s.model.entryId, s, format === 'bcif', { copyAllCategories: true })]);
            } catch (e) {
                if (format === 'cif' && s.elementCount > 2000000) {
                    plugin.log.warn(`[Export] The structure might be too big to be exported as Text CIF, consider using the BinaryCIF format instead.`);
                }
                throw e;
            }
        }

        if(files.length === 0) {
            PluginCommands.Toast.Show(plugin, {
                title: 'Export Models',
                message: 'No visible structure in the 3D view to export!',
                key: 'superposition-toast-1',
                timeoutMs: 7000
            });
            return;
        }
 
        if (files.length === 1) {
            download(new Blob([files[0][1]]), files[0][0]);
        } else if (files.length > 1) {
            const zipData: Record<string, Uint8Array> = {};
            for (const [fn, data] of files) {
                if (data instanceof Uint8Array) {
                    zipData[fn] = data;
                } else {
                    const bytes = new Uint8Array(utf8ByteCount(data));
                    utf8Write(bytes, 0, data);
                    zipData[fn] = bytes;
                }
            }
            await ctx.update({ message: `Compressing Data...`, isIndeterminate: true, canAbort: false });
            const buffer = await zip(ctx, zipData);
            download(new Blob([new Uint8Array(buffer, 0, buffer.byteLength)]), `structures_${getFormattedTime()}.zip`);
        }
 
        plugin.log.info(`[Export] Done.`);
    });
}