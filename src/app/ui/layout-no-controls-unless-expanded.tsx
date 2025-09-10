import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { PluginCustomState } from '../plugin-custom-state';
import { Layout } from './_layout';


export class FullLayoutNoControlsUnlessExpanded extends Layout {
    override componentDidMount(): void {
        super.componentDidMount();
        // Hide Toggle Controls button unless expanded:
        this.subscribe(this.plugin.layout.events.updated, () => {
            const isExpanded = this.plugin.layout.state.isExpanded;
            const hideControlToggle = PluginCustomState(this.plugin).initParams?.hideCanvasControls.includes('controlToggle') ?? false;
            this.plugin.config.set(PluginConfig.Viewport.ShowControls, isExpanded && !hideControlToggle);
        });
    }

    override get layoutVisibilityClassName(): string {
        const classes = super.layoutVisibilityClassName.split(' ');
        const state = this.plugin.layout.state;
        if (!state.isExpanded) {
            if (!classes.includes('msp-layout-hide-top')) classes.push('msp-layout-hide-top');
            if (!classes.includes('msp-layout-hide-bottom')) classes.push('msp-layout-hide-bottom');
            if (!classes.includes('msp-layout-hide-left')) classes.push('msp-layout-hide-left');
            if (!classes.includes('msp-layout-hide-right')) classes.push('msp-layout-hide-right');
        }
        return classes.join(' ');
    }
}
