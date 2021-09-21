import { PluginContext } from 'Molstar/mol-plugin/context';
import { lociDetails, EventDetail } from './loci-details';
import { InteractivityManager } from 'Molstar/mol-plugin-state/manager/interactivity';
import { debounceTime } from 'rxjs/operators';

export namespace CustomEvents {

    function create(eventTypeArr: string[]){
        let eventObj = {} as any;
        for(let ei = 0, el = eventTypeArr.length; ei < el; ei++){
            let eventType = eventTypeArr[ei];
            let event;
            if (typeof MouseEvent == 'function') {
                // current standard
                event = new MouseEvent(eventType, { 'view': window, 'bubbles': true, 'cancelable': true });
            } else if (typeof document.createEvent == 'function') {
                // older standard
                event = document.createEvent('MouseEvents');
                event.initEvent(eventType, true /* bubbles */, true /* cancelable */);

            }
            eventObj[eventType] = event;
        };
        return eventObj;
    }

    function dispatchCustomEvent(event: any, eventData: EventDetail, targetElement: HTMLElement) {
        if(typeof eventData !== 'undefined'){
            (eventData as any)['residueNumber'] = eventData.seq_id;
            event['eventData'] = eventData;
            event.eventData.residueNumber = eventData.seq_id;
            targetElement.dispatchEvent(event);
        }
    }

    export function add(plugin: PluginContext, targetElement: HTMLElement){
        const pdbevents = create(['PDB.molstar.click', 'PDB.molstar.mouseover', 'PDB.molstar.mouseout']);
        plugin.behaviors.interaction.click.subscribe((e: InteractivityManager.ClickEvent) => {
            if(e.button === 1 && e.current && e.current.loci.kind !== 'empty-loci'){
                const evData = lociDetails(e.current.loci);
                if(evData) dispatchCustomEvent(pdbevents['PDB.molstar.click'], evData, targetElement);
            }
        });
        plugin.behaviors.interaction.hover.pipe(debounceTime(100)).subscribe((e: InteractivityManager.HoverEvent) => {
            if(e.current && e.current.loci && e.current.loci.kind !== 'empty-loci'){
                const evData = lociDetails(e.current.loci);
                if(evData) dispatchCustomEvent(pdbevents['PDB.molstar.mouseover'], evData, targetElement);
            }

            if(e.current && e.current.loci && e.current.loci.kind === 'empty-loci'){
                dispatchCustomEvent(pdbevents['PDB.molstar.mouseout'], {}, targetElement);
            }
        });
    }

}