
import { PluginReactContext, PluginUIComponent, PurePluginUIComponent } from 'Molstar/mol-plugin-ui/base';
import { PluginUIContext } from 'Molstar/mol-plugin-ui/context';
import { PluginUISpec } from 'Molstar/mol-plugin-ui/spec';
import { createElement, ComponentClass, ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { DefaultPluginUISpec } from '../../spec';
import { DefaultViewport } from 'molstar/lib/mol-plugin-ui/plugin';
import { SequenceView } from 'molstar/lib/mol-plugin-ui/sequence';


export function renderReact18(element: any, target: Element) { // TODO import this from src/mol-plugin-ui/react18.ts once using MolStar 4.x.x
    createRoot(target).render(element);
}

export interface LayoutSpecComponent<T extends PluginUIComponentClass<any>> {
    target: string | HTMLElement,
    component: T,
    props?: PropsForPluginUIComponentClass<T>,
}
export function LayoutSpecComponent<T extends PluginUIComponentClass<any>>(target: string | HTMLElement, component: T, props?: PropsForPluginUIComponentClass<T>): LayoutSpecComponent<T> {
    return { target, component, props };
}
export type LayoutSpec = LayoutSpecComponent<any>[]


export async function createPluginSplitUI(options: {
    layout: LayoutSpec,
    spec?: PluginUISpec,
    render?: (component: any, container: Element) => any,
    onBeforeUIRender?: (ctx: PluginUIContext) => (Promise<void> | void),
}) {
    const { spec, layout, onBeforeUIRender } = options;
    const render = options.render ?? renderReact18;
    const ctx = new PluginUIContext(spec || DefaultPluginUISpec());
    await ctx.init();
    if (onBeforeUIRender) {
        await onBeforeUIRender(ctx);
    }
    if (!ctx.isInitialized) {
        throw new Error('NotImplementedError: React-rendering before PluginContext is initialized'); // TODO implement a la src/mol-plugin-ui/plugin.tsx
    }
    for (const { target: element, component, props } of layout) {
        render(<PluginPanelWrapper plugin={ctx} component={component} props={props ?? {}} />, resolveHTMLElement(element));
        // TODO in future: consider adding a listener that re-renders the React component when the div is removed and re-added to DOM
    }
    try {
        await ctx.canvas3dInitialized;
    } catch {
        // Error reported in UI/console elsewhere.
    }
    return ctx;
}

export function resolveHTMLElement(element: HTMLElement | string): HTMLElement {
    if (typeof element === 'string') {
        const result = document.getElementById(element);
        if (!result) throw new Error(`Element #${element} not found in DOM`);
        return result;
    } else {
        return element;
    }
}

// export type PluginUIComponentClass<P extends {}> = { new(props: P, context?: any): PluginUIComponent<P> | PurePluginUIComponent<P> }
export type PluginUIComponentClass<P extends {}> = React.ComponentClass<P>
type PropsForPluginUIComponentClass<C extends PluginUIComponentClass<any>> = C extends PluginUIComponentClass<infer P> ? P : never
// TODO: relax to React.ComponentClass, ComponentProps

type x = ComponentProps<typeof SequenceView>

function PluginPanelWrapper<P extends {}>({ plugin, component, props }: { plugin: PluginUIContext, component: PluginUIComponentClass<P>, props: P }) {
    return <PluginReactContext.Provider value={plugin}>
        <div className='msp-plugin' style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div className='msp-plugin-content msp-layout-standard' style={{ position: 'relative', width: '100%', height: '100%' }}>
                {createElement(component, props)}
            </div>
        </div>
    </PluginReactContext.Provider>;
}
