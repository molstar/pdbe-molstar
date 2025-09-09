import { OpenFiles } from 'molstar/lib/mol-plugin-state/actions/file';
import { PluginUIComponent } from 'molstar/lib/mol-plugin-ui/base';
import { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { useBehavior } from 'molstar/lib/mol-plugin-ui/hooks/use-behavior';
import { LeftPanelControls } from 'molstar/lib/mol-plugin-ui/left-panel';
import { ControlsWrapper, DefaultViewport, Log } from 'molstar/lib/mol-plugin-ui/plugin';
import { SequenceView } from 'molstar/lib/mol-plugin-ui/sequence';
import { OverlayTaskProgress } from 'molstar/lib/mol-plugin-ui/task';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { Asset } from 'molstar/lib/mol-util/assets';
import { BehaviorSubject } from 'rxjs';


type RegionKind = 'top' | 'left' | 'right' | 'bottom' | 'main';

/** Copy of `Layout` in molstar/src/mol-plugin-ui/plugin.tsx, TODO export from core Molstar and remove here */
export class Layout extends PluginUIComponent {
    componentDidMount() {
        this.subscribe(this.plugin.layout.events.updated, () => this.forceUpdate());
    }

    region(kind: RegionKind, Element?: React.ComponentClass | React.FC) {
        return <div className={`msp-layout-region msp-layout-${kind}`}>
            <div className='msp-layout-static'>
                {Element ? <Element /> : null}
            </div>
        </div>;
    }

    get layoutVisibilityClassName() {
        const layout = this.plugin.layout.state;
        const controls = this.plugin.spec.components?.controls ?? {};

        const classList: string[] = [];
        if (controls.top === 'none' || !layout.showControls || layout.regionState.top === 'hidden') {
            classList.push('msp-layout-hide-top');
        }

        if (controls.left === 'none' || !layout.showControls || layout.regionState.left === 'hidden') {
            classList.push('msp-layout-hide-left');
        } else if (layout.regionState.left === 'collapsed') {
            classList.push('msp-layout-collapse-left');
        }

        if (controls.right === 'none' || !layout.showControls || layout.regionState.right === 'hidden') {
            classList.push('msp-layout-hide-right');
        }

        if (controls.bottom === 'none' || !layout.showControls || layout.regionState.bottom === 'hidden') {
            classList.push('msp-layout-hide-bottom');
        }

        return classList.join(' ');
    }

    get layoutClassName() {
        const layout = this.plugin.layout.state;

        const classList: string[] = ['msp-plugin-content'];
        if (layout.isExpanded) {
            classList.push('msp-layout-expanded');
        } else {
            classList.push('msp-layout-standard', `msp-layout-standard-${layout.controlsDisplay}`);
        }

        return classList.join(' ');
    }

    onDrop = (ev: React.DragEvent<HTMLDivElement>) => {
        ev.preventDefault();

        const files: File[] = [];
        if (ev.dataTransfer.items) {
            // Use DataTransferItemList interface to access the file(s)
            for (let i = 0; i < ev.dataTransfer.items.length; i++) { // eslint-disable-line @typescript-eslint/prefer-for-of
                if (ev.dataTransfer.items[i].kind !== 'file') continue;
                const file = ev.dataTransfer.items[i].getAsFile();
                if (file) files.push(file);
            }
        } else {
            for (let i = 0; i < ev.dataTransfer.files.length; i++) { // eslint-disable-line @typescript-eslint/prefer-for-of
                const file = ev.dataTransfer.files[i];
                if (file) files.push(file);
            }
        }

        const sessions = files.filter(f => {
            const fn = f.name.toLowerCase();
            return fn.endsWith('.molx') || fn.endsWith('.molj');
        });

        if (sessions.length > 0) {
            PluginCommands.State.Snapshots.OpenFile(this.plugin, { file: sessions[0] });
        } else {
            this.plugin.runTask(this.plugin.state.data.applyAction(OpenFiles, {
                files: files.map(f => Asset.File(f)),
                format: { name: 'auto', params: {} },
                visuals: true,
            }));
        }
    };

    onDragOver = (ev: React.DragEvent<HTMLDivElement>) => {
        ev.preventDefault();
    };

    private showDragOverlay = new BehaviorSubject(false);
    onDragEnter = (ev: React.DragEvent<HTMLDivElement>) => {
        let hasFile = false;
        if (ev.dataTransfer.items && ev.dataTransfer.items.length > 0) {
            for (let i = 0; i < ev.dataTransfer.items.length; i++) { // eslint-disable-line @typescript-eslint/prefer-for-of
                if (ev.dataTransfer.items[i].kind !== 'file') continue;
                hasFile = true;
                break;
            }
        } else {
            for (let i = 0; i < ev.dataTransfer.types.length; i++) { // eslint-disable-line @typescript-eslint/prefer-for-of
                if (ev.dataTransfer.types[i] !== 'Files') continue;
                hasFile = true;
                break;
            }
        }

        if (hasFile) {
            this.showDragOverlay.next(true);
        }
    };

    render() {
        const layout = this.plugin.layout.state;
        const controls = this.plugin.spec.components?.controls || {};
        const viewport = this.plugin.spec.components?.viewport?.view || DefaultViewport;
        const sequenceView = this.plugin.spec.components?.sequenceViewer?.view || SequenceView;

        return <div className='msp-plugin'>
            <div className={this.layoutClassName} onDragEnter={this.onDragEnter}>
                <div className={this.layoutVisibilityClassName}>
                    {this.region('main', viewport)}
                    {layout.showControls && controls.top !== 'none' && this.region('top', controls.top || sequenceView)}
                    {layout.showControls && controls.left !== 'none' && this.region('left', controls.left || LeftPanelControls)}
                    {layout.showControls && controls.right !== 'none' && this.region('right', controls.right || ControlsWrapper)}
                    {layout.showControls && controls.bottom !== 'none' && this.region('bottom', controls.bottom || Log)}
                </div>
                {!this.plugin.spec.components?.hideTaskOverlay && <OverlayTaskProgress />}
                {!this.plugin.spec.components?.disableDragOverlay && <DragOverlay plugin={this.plugin} showDragOverlay={this.showDragOverlay} />}
            </div>
        </div>;
    }
}

function dropFiles(ev: React.DragEvent<HTMLDivElement>, plugin: PluginUIContext, showDragOverlay: BehaviorSubject<boolean>) {
    ev.preventDefault();
    ev.stopPropagation();
    showDragOverlay.next(false);

    const files: File[] = [];
    if (ev.dataTransfer.items) {
        // Use DataTransferItemList interface to access the file(s)
        for (let i = 0; i < ev.dataTransfer.items.length; i++) { // eslint-disable-line @typescript-eslint/prefer-for-of
            if (ev.dataTransfer.items[i].kind !== 'file') continue;
            const file = ev.dataTransfer.items[i].getAsFile();
            if (file) files.push(file);
        }
    } else {
        for (let i = 0; i < ev.dataTransfer.files.length; i++) { // eslint-disable-line @typescript-eslint/prefer-for-of
            const file = ev.dataTransfer.files[i];
            if (file) files.push(file);
        }
    }

    plugin.managers.dragAndDrop.handle(files);
}

function DragOverlay({ plugin, showDragOverlay }: { plugin: PluginUIContext, showDragOverlay: BehaviorSubject<boolean> }) {
    const show = useBehavior(showDragOverlay);

    const preventDrag = (e: React.DragEvent) => {
        e.dataTransfer.dropEffect = 'copy';
        e.preventDefault();
        e.stopPropagation();
    };

    return <div
        className='msp-drag-drop-overlay'
        style={{ display: show ? 'flex' : 'none' }}
        onDragEnter={preventDrag}
        onDragOver={preventDrag}
        onDragLeave={() => showDragOverlay.next(false)}
        onDrop={e => dropFiles(e, plugin, showDragOverlay)}
    >
        Load File(s)
    </div>;
}
