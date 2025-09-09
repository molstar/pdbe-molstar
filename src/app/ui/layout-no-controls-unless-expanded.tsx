import { Layout } from './_layout';


export class FullLayoutNoControlsUnlessExpanded extends Layout {
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
