import { Subject, Subscription } from 'rxjs';


const PdbeAnimatedLogoSvg = '<svg class="pdbe-animated-logo" viewBox="0 0 300 300"><path class="path-bg" fill="transparent" stroke="#E13D3D" stroke-width="30" d="M 150 200 L 150 100 A 50 50 0 1 0 100 150 L 200 150 A 50 50 0 1 0 150 100 L 150 200 A 50 50 0 1 0 200 150 L 100 150 A 50 50 0 1 0 150 200 "></path><path class="path-cross" fill="transparent" stroke="#72B260" stroke-width="30" d="M 150 100 L 150 200 M 100 150 L 200 150"></path><path class="path-fg" fill="transparent" stroke="#72B260" stroke-width="30" d="M 100 150 A 50 50 0 1 1 150 100 L 150 170 L 150 100 L 150 170 L 150 100 L 150 100 A 50 50 0 1 1 200 150 L 130 150 L 200 150 L 130 150 L 200 150 L 200 150 A 50 50 0 1 1 150 200 L 150 130 L 150 200 L 150 130 L 150 200 L 150 200 A 50 50 0 1 1 100 150 L 170 150 L 100 150 L 170 150 L 100 150"></path></svg>';
const OverlayBox = `<div class="pdbemolstar-overlay-box">${PdbeAnimatedLogoSvg}</div>`;

type OverlayEvents = 'resize' | 'hide';

/** Shows overlay layer with animated PDBe logo */
export class LoadingOverlay {
    private readonly subscriptions: { [key in OverlayEvents]?: Subscription } = {};

    constructor(
        private readonly target: HTMLElement,
        private readonly subjects: { readonly [key in OverlayEvents]?: Subject<any> } = {},
        private readonly overlayHtml: string = OverlayBox,
    ) { }

    private getOverlayParent() {
        return this.target.parentElement ?? document.body;
    }

    show() {
        this.hide();

        const overlayParent = this.getOverlayParent();
        const divOverlay = document.createElement('div');
        divOverlay.classList.add('pdbemolstar-overlay');
        // divOverlay.setAttribute('title', 'Loading...');
        divOverlay.innerHTML = this.overlayHtml;
        overlayParent.appendChild(divOverlay);

        const resize = () => {
            const viewerRect = this.target.getElementsByClassName('msp-layout-main').item(0)?.getBoundingClientRect();
            if (viewerRect) {
                const { left, top, width, height } = viewerRect;
                const origin = this.target.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
                divOverlay.setAttribute('style', `position: absolute; left: ${left - origin?.left}px; top: ${top - origin.top}px; width: ${width}px; height: ${height}px;`);
            } else {
                divOverlay.setAttribute('style', `position: fixed; top: 0px; bottom: 0px; left: 0px; right: 0px;`);
            }
        };

        resize();
        this.subscriptions.resize = this.subjects.resize?.subscribe(() => resize());
        this.subscriptions.hide = this.subjects.hide?.subscribe(() => this.hide());
    }

    hide() {
        const existingOverlays = this.getOverlayParent().getElementsByClassName('pdbemolstar-overlay');
        for (let i = 0; i < existingOverlays.length; i++) {
            existingOverlays.item(i)?.remove();
        }
        this.subscriptions.resize?.unsubscribe();
        this.subscriptions.resize = undefined;
        this.subscriptions.hide?.unsubscribe();
        this.subscriptions.hide = undefined;
    }
}
