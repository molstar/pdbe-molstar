export function createNewEvent(eventTypeArr: string[]){
    let eventObj = {} as any;
    for(let ei=0, el=eventTypeArr.length; ei < el; ei++){
        let eventType = eventTypeArr[ei];
        let event; 
        if (typeof MouseEvent == 'function') {
            // current standard
            event = new MouseEvent(eventType, { 'view': window, 'bubbles': true, 'cancelable': true });
        
        } else if (typeof document.createEvent == 'function') {
            // older standard
            event = document.createEvent('MouseEvents');
            event.initEvent(eventType, true /*bubbles*/, true /*cancelable*/);
        
        } /*else if (typeof document.createEventObject == 'function') {
            // IE 8- 
            event = document.createEventObject();
        }*/
        
        eventObj[eventType] = event;
    };
    
    return eventObj;
}