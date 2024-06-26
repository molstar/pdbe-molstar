import { InteractivityManager } from 'Molstar/mol-plugin-state/manager/interactivity';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { debounceTime } from 'rxjs/operators';
import { EventDetail, lociDetails } from './loci-details';


export namespace CustomEvents {
    function createEvent(eventType: string): MouseEvent {
        if (typeof MouseEvent == 'function') {
            // current standard
            return new MouseEvent(eventType, { 'view': window, 'bubbles': true, 'cancelable': true });
        } else if (typeof document.createEvent == 'function') {
            // older standard
            const event = document.createEvent('MouseEvents');
            event.initEvent(eventType, true /* bubbles */, true /* cancelable */);
            return event;
        } else {
            throw new Error('Cannot create event');
        }
    }

    function dispatchCustomEvent(event: UIEvent, eventData: EventDetail, targetElement: HTMLElement) {
        if (eventData !== undefined) {
            if (eventData.seq_id !== undefined) {
                (eventData as any).residueNumber = eventData.seq_id;
            }
            (event as any).eventData = eventData;
            targetElement.dispatchEvent(event);
        }
    }

    export function add(plugin: PluginContext, targetElement: HTMLElement) {
        const PDB_molstar_click = createEvent('PDB.molstar.click');
        const PDB_molstar_mouseover = createEvent('PDB.molstar.mouseover');
        const PDB_molstar_mouseout = createEvent('PDB.molstar.mouseout');

        plugin.behaviors.interaction.click.subscribe((e: InteractivityManager.ClickEvent) => {
            if (e.button === 1 && e.current && e.current.loci.kind !== 'empty-loci') {
                const evData = lociDetails(e.current.loci);
                if (evData) dispatchCustomEvent(PDB_molstar_click, evData, targetElement);
            }
        });
        plugin.behaviors.interaction.hover.pipe(debounceTime(100)).subscribe((e: InteractivityManager.HoverEvent) => {
            if (e.current && e.current.loci && e.current.loci.kind !== 'empty-loci') {
                const evData = lociDetails(e.current.loci);
                if (evData) dispatchCustomEvent(PDB_molstar_mouseover, evData, targetElement);
            }

            if (e.current && e.current.loci && e.current.loci.kind === 'empty-loci') {
                dispatchCustomEvent(PDB_molstar_mouseout, {}, targetElement);
            }
        });
    }
}
