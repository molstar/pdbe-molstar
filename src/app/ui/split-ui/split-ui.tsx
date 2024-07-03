
import { PluginReactContext } from 'Molstar/mol-plugin-ui/base';
import { PluginUIContext } from 'Molstar/mol-plugin-ui/context';
import { PluginUISpec } from 'Molstar/mol-plugin-ui/spec';
import { ComponentProps, JSXElementConstructor, createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DefaultPluginUISpec } from '../../spec';


export function renderReact18(element: any, target: Element) { // TODO import this from src/mol-plugin-ui/react18.ts once using MolStar 4.x.x
    createRoot(target).render(element);
}

export interface LayoutSpecComponent<T extends JSXElementConstructor<any>> {
    target: string | HTMLElement,
    component: T,
    props?: ComponentProps<T>,
}
export function LayoutSpecComponent<T extends JSXElementConstructor<any>>(target: string | HTMLElement, component: T, props?: ComponentProps<T>): LayoutSpecComponent<T> {
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
    for (const { target, component, props } of layout) {
        let targetElement: HTMLElement | undefined = undefined;
        try {
            targetElement = resolveHTMLElement(target);
        } catch (err) {
            console.warn('Skipping rendering a UI component because its target HTML element was not found.', err);
        }
        if (targetElement) {
            render(<PluginPanelWrapper plugin={ctx} component={component} props={props ?? {}} />, targetElement);
        }
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

type LoadState = { kind: 'initialized' } | { kind: 'pending' } | { kind: 'error', message: string }

function PluginPanelWrapper<P extends {}>({ plugin, component, props }: { plugin: PluginUIContext, component: JSXElementConstructor<P>, props: P }) {
    const [state, setState] = useState<LoadState>({ kind: 'pending' });
    useEffect(() => {
        setState(plugin.isInitialized ? { kind: 'initialized' } : { kind: 'pending' });
        let mounted = true;
        plugin.initialized.then(() => {
            if (mounted) setState({ kind: 'initialized' });
        }).catch(err => {
            if (mounted) setState({ kind: 'error', message: `${err}` });
        });
        return () => { mounted = false; };
    }, [plugin]);

    if (state.kind !== 'initialized') {
        const message = state.kind === 'error' ? `Initialization error: ${state.message}` : 'Waiting for plugin initialization';
        return <div className='msp-plugin' style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div className='msp-plugin-init-error'>{message}</div>
        </div>;
    }

    return <PluginReactContext.Provider value={plugin}>
        <div className='msp-plugin' style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div className='msp-plugin-content msp-layout-standard' style={{ position: 'relative', width: '100%', height: '100%' }}>
                {createElement(component, props)}
            </div>
        </div>
    </PluginReactContext.Provider>;
}
