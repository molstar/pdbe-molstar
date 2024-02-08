import { LitElement } from 'lit-element';

class EMDBMolstar extends LitElement {
    connectedCallback() {
        super.connectedCallback();
        this.viewerInstance = new EMDBMolstarPlugin();
        this.initParams = EMDBMolstarPlugin.initParamsFromHtmlAttributes(this);
        this.viewerInstance.render(this, this.initParams);
    }

    createRenderRoot() {
        return this;
    }
}

export default EMDBMolstar;

customElements.define('emdb-molstar', EMDBMolstar);
