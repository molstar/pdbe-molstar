import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { PluginCustomControlRegion, PluginCustomControls } from '../plugin-custom-state';


/** Render all registered custom UI controls for the specified region */
export class CustomControls extends PluginUIComponent<{ region: PluginCustomControlRegion }> {
    componentDidMount() {
        this.subscribe(this.plugin.state.behaviors.events.changed, () => this.forceUpdate());
    }
    render() {
        const customControls = Array.from(PluginCustomControls.get(this.plugin, this.props.region).entries());
        return <>
            {customControls.map(([name, Control]) =>
                <div className={`pdbemolstar-custom-control-${this.props.region}`} key={name}>
                    <Control />
                </div>
            )}
        </>;
    }
}
