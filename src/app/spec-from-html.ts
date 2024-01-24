import { ColorParams, Encoding, InitParams, Lighting, Preset, VisualStyle, validateInitParams } from './spec';


/** Extract InitParams from attributes of an HTML element */
export function initParamsFromHtmlAttributes(element: HTMLElement): Partial<InitParams> {
    const params = loadHtmlAttributes(element, InitParamsLoadingActions, {});
    const validationIssues = validateInitParams(params);
    if (validationIssues) console.error('Invalid PDBeMolstarPlugin options:', params);
    return params;
}


/** Actions for loading individual HTML attributes into InitParams object */
const InitParamsLoadingActions: AttributeLoadingActions<Partial<InitParams>> = {
    'molecule-id': setString('moleculeId'),
    'custom-data-url': (value, params) => { (params.customData ??= defaultCustomData()).url = value; },
    'custom-data-format': (value, params) => { (params.customData ??= defaultCustomData()).format = value; },
    'custom-data-binary': (value, params) => { (params.customData ??= defaultCustomData()).binary = parseBool(value); },
    'assembly-id': setString('assemblyId'),
    'default-preset': setLiteral(Preset, 'defaultPreset'),
    'ligand-label-comp-id': (value, params) => { (params.ligandView ??= {}).label_comp_id = value; },
    'ligand-auth-asym-id': (value, params) => { (params.ligandView ??= {}).auth_asym_id = value; },
    'ligand-struct-asym-id': (value, params) => { (params.ligandView ??= {}).struct_asym_id = value; },
    'ligand-auth-seq-id': (value, params) => { (params.ligandView ??= {}).auth_seq_id = Number(value); },
    'ligand-show-all': (value, params) => { (params.ligandView ??= {}).show_all = parseBool(value); },
    'alphafold-view': setBool('alphafoldView'),

    'visual-style': setLiteral(VisualStyle, 'visualStyle'),
    'hide-polymer': pushItem('hideStructure', 'polymer'),
    'hide-water': pushItem('hideStructure', 'water'),
    'hide-het': pushItem('hideStructure', 'het'),
    'hide-carbs': pushItem('hideStructure', 'carbs'),
    'hide-non-standard': pushItem('hideStructure', 'nonStandard'),
    'hide-coarse': pushItem('hideStructure', 'coarse'),
    'load-maps': setBool('loadMaps'),
    'bg-color-r': setColorComponent('bgColor', 'r'),
    'bg-color-g': setColorComponent('bgColor', 'g'),
    'bg-color-b': setColorComponent('bgColor', 'b'),
    'highlight-color-r': setColorComponent('highlightColor', 'r'),
    'highlight-color-g': setColorComponent('highlightColor', 'g'),
    'highlight-color-b': setColorComponent('highlightColor', 'b'),
    'select-color-r': setColorComponent('selectColor', 'r'),
    'select-color-g': setColorComponent('selectColor', 'g'),
    'select-color-b': setColorComponent('selectColor', 'b'),
    'lighting': setLiteral(Lighting, 'lighting'),

    'validation-annotation': setBool('validationAnnotation'),
    'domain-annotation': setBool('domainAnnotation'),
    'symmetry-annotation': setBool('symmetryAnnotation'),
    'pdbe-url': setString('pdbeUrl'),
    'encoding': setLiteral(Encoding, 'encoding'),
    'low-precision': setBool('lowPrecisionCoords'),
    'select-interaction': setBool('selectInteraction'),
    'subscribe-events': setBool('subscribeEvents'),

    'hide-controls': setBool('hideControls'),
    'hide-expand-icon': pushItem('hideCanvasControls', 'expand'),
    'hide-selection-icon': pushItem('hideCanvasControls', 'selection'),
    'hide-animation-icon': pushItem('hideCanvasControls', 'animation'),
    'hide-control-toggle-icon': pushItem('hideCanvasControls', 'controlToggle'),
    'hide-control-info-icon': pushItem('hideCanvasControls', 'controlInfo'),
    'sequence-panel': setBool('sequencePanel'),
    'pdbe-link': setBool('pdbeLink'),
    'loading-overlay': setBool('loadingOverlay'),
    'expanded': setBool('expanded'),
    'landscape': setBool('landscape'),
    'reactive': setBool('reactive'),
};


/** Actions for loading individual HTML attributes into a context */
type AttributeLoadingActions<TContext> = { [attribute: string]: (value: string, context: TContext) => any }

/** Load attributes of an HTML element into a context */
function loadHtmlAttributes<TContext>(element: HTMLElement, actions: AttributeLoadingActions<TContext>, context: TContext): TContext {
    for (const attribute in actions) {
        const value = element.getAttribute(attribute);
        if (typeof value === 'string') {
            actions[attribute](value, context);
        }
    }
    return context;
}


/** Select keys of an object type `T` which except type `V` as value */
type KeyWith<T, V> = Exclude<{ [key in keyof T]: V extends T[key] ? key : never }[keyof T], undefined>

function setString<T>(key: KeyWith<T, string>) {
    return (value: string, obj: T) => { obj[key] = value as any; };
}
function setLiteral<T, E extends string>(allowedValues: readonly E[], key: KeyWith<T, E>) {
    return (value: string, ctx: T) => {
        if (!allowedValues.includes(value as E)) console.error(`Value "${value}" is not valid for type ${allowedValues.map(s => `"${s}"`).join(' | ')}`);
        ctx[key] = value as any;
    };
}
function setBool<T>(key: KeyWith<T, boolean>) {
    return (value: string, obj: T) => { obj[key] = parseBool(value) as any; };
}
function setColorComponent<T>(key: KeyWith<T, ColorParams>, component: 'r' | 'g' | 'b') {
    return (value: string, obj: T) => {
        const color = obj[key] ??= { r: 0, g: 0, b: 0 } as any;
        color[component] = Number(value);
    };
}
function pushItem<T>(key: KeyWith<T, any[]>, item: any) {
    return (value: string, obj: T) => {
        if (parseBool(value)) {
            const array = obj[key] ??= [] as any;
            array.push(item);
        }
    };
}

/** Parse a string into a boolean.
 * Consider strings like 'false', 'OFF', '0' as false; others as true.
 * Empty string is parsed as true, because HTML attribute without value must be treated as truthy. */
function parseBool(value: string): boolean {
    const FalseyStrings = ['false', 'off', '0'];
    return !FalseyStrings.includes(value.toLowerCase());
}
function defaultCustomData(): Exclude<InitParams['customData'], undefined> {
    return { url: '', format: '', binary: false };
}
