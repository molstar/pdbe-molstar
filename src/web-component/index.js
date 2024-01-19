import { LitElement } from 'lit-element';

class PdbeMolstar extends LitElement {
    connectedCallback() {
        super.connectedCallback();
        this.viewerInstance = new PDBeMolstarPlugin();
        this.initParams = PDBeMolstarPlugin.initParamsFromHtmlAttributes(this);
        console.log('PdbeMolstar initParams:', this.initParams);
        this.viewerInstance.render(this, this.initParams);
    }

    createRenderRoot() {
        return this;
    }
}

export default PdbeMolstar;

customElements.define('pdbe-molstar', PdbeMolstar);
