import { LitElement } from "lit-element";

class PdbeMolstar extends LitElement {

  static get properties() {
    return {
      moleculeId: { type: String, attribute: 'molecule-id' },
      assemblyId: { type: String, attribute: 'assembly-id' },
      customDataUrl: { type: String, attribute: 'custom-data-url' },
      customDataFormat: { type: String, attribute: 'custom-data-format' },
      customDataBinary: { type: Boolean, attribute: 'custom-data-binary' },
      ligandLabelCompId: { type: String, attribute: 'ligand-label-comp-id' },
      ligandAuthAsymId: { type: String, attribute: 'ligand-auth-asym-Id' },
      ligandAuthSeqId: { type: String, attribute: 'ligand-auth-seq-id' },
      ligandHydrogens: { type: Boolean, attribute: 'ligand-hydrogens'},
      pdbeUrl: { type: String, attribute: 'pdbe-url' },
      bgColorR: { type: Number, attribute: 'bg-color-r' },
      bgColorG: { type: Number, attribute: 'bg-color-g' },
      bgColorB: { type: Number, attribute: 'bg-color-b' },
      loadMaps: { type: Boolean, attribute: 'load-maps' },
      validationAnnotation: { type: Boolean, attribute: 'validation-annotation' },
      domainAnnotation: { type: Boolean, attribute: 'domain-annotation' },
      lowPrecisionCoords: { type: Boolean, attribute: 'low-precision' },
      expanded: { type: Boolean, attribute: 'expanded' },
      hideControls: { type: Boolean, attribute: 'hide-controls' },
      subscribeEvents: { type: Boolean, attribute: 'subscribe-events' },
      pdbeLink: { type: Boolean, attribute: 'pdbe-link' },
      loadCartoonsOnly: { type: Boolean, attribute: 'load-cartoons-only' },
      selectInteraction: { type: Boolean, attribute: 'select-interaction' },
      landscape: { type: Boolean, attribute: 'landscape' },
      highlightColorR: { type: Number, attribute: 'highlight-color-r' },
      highlightColorG: { type: Number, attribute: 'highlight-color-g' },
      highlightColorB: { type: Number, attribute: 'highlight-color-b' },
      selectColorR: { type: Number, attribute: 'select-color-r' },
      selectColorG: { type: Number, attribute: 'select-color-g' },
      selectColorB: { type: Number, attribute: 'select-color-b' },
      hidePolymer: { type: Boolean, attribute: 'hide-polymer'},
      hideWater: { type: Boolean, attribute: 'hide-water'},
      hideHet: { type: Boolean, attribute: 'hide-het'},
      hideCarbs: { type: Boolean, attribute: 'hide-carbs'},
      hideNonStandard: { type: Boolean, attribute: 'hide-non-standard'},
      hideCoarse: { type: Boolean, attribute: 'hide-coarse'},
      visualStyle: { type: String, attribute: 'visual-style' },
      hideExpandIcon: { type: Boolean, attribute: 'hide-expand-icon'},
      hideSelectionIcon: { type: Boolean, attribute: 'hide-selection-icon'},
      hideAnimationIcon: { type: Boolean, attribute: 'hide-animation-icon'},
      hideControlToggleIcon: { type: Boolean, attribute: 'hide-control-toggle-icon'},
      hideControlInfoIcon: { type: Boolean, attribute: 'hide-control-info-icon'},
      alphafoldView: { type: Boolean, attribute: 'alphafold-view' },
      lighting: { type: String, attribute: 'lighting' },
      defaultPreset: { type: String, attribute: 'default-preset' },
      sequencePanel: { type: Boolean, attribute: 'sequence-panel' }
    };
  }

  validateParams() {
    if(!this.moleculeId && !this.customDataUrl) return false;
    if(this.customDataUrl && !this.customDataFormat) return false;
    return true
  }

  formatParam(propName){
    //ligand params mapping
    const ligandParamsMap = {
      'ligandLabelCompId': 'label_comp_id', 
      'ligandAuthAsymId': 'auth_asym_id', 
      'ligandAuthSeqId': 'auth_seq_id', 
      'ligandHydrogens': 'hydrogens'
    };
    const ligandParams = Object.keys(ligandParamsMap);

    //hidestructure params
    const hideStructParamsMap = {
      'hidePolymer': 'polymer', 
      'hideWater': 'water', 
      'hideHet': 'het', 
      'hideCarbs': 'carbs',
      'hideNonStandard': 'nonStandard',
      'hideCoarse': 'coarse'
    };
    const hideStructParams = Object.keys(hideStructParamsMap);

    //hideCanvasControls params
    const hideIconsParamsMap = {
      'hideExpandIcon': 'expand', 
      'hideSelectionIcon': 'selection', 
      'hideAnimationIcon': 'animation',
      'hideControlToggleIcon': 'controlToggle',
      'hideControlInfoIcon': 'controlInfo'
    };
    const hideIconsParams = Object.keys(hideIconsParamsMap);

    
    if(propName == 'customDataUrl' || propName == 'customDataFormat'){
      if(this.initParams.customData) return;
      this.initParams.customData = {url: this.customDataUrl, format: this.customDataFormat};
    }else if(ligandParams.indexOf(propName) > -1){
      if(this.initParams.ligandView) return;
      this.initParams.ligandView = Object.assign({},{});
      ligandParams.forEach((ligandParam) => {
        if(this[ligandParam]){ 
          this.initParams.ligandView[ligandParamsMap[ligandParam]] = this[ligandParam];
        }
      });
    }else if((['highlightColorR', 'highlightColorG', 'highlightColorB'].indexOf(propName) > -1) && 
      this.highlightColorR && this.highlightColorG && this.highlightColorB){
      this.initParams.highlightColor = {r:this.highlightColorR, g:this.highlightColorG, b: this.highlightColorB};
    }else if((['selectColorR', 'selectColorG', 'selectColorB'].indexOf(propName) > -1) && 
      this.selectColorR && this.selectColorG && this.selectColorB){
      this.initParams.selectColor = {r:this.selectColorR, g:this.selectColorG, b: this.selectColorB};
    }else if((['bgColorR', 'bgColorG', 'bgColorB'].indexOf(propName) > -1) && 
      this.bgColorR && this.bgColorG && this.bgColorB){
      this.initParams.bgColor = {r:this.bgColorR, g:this.bgColorG, b: this.bgColorB};
    }else if((hideStructParams.indexOf(propName) > -1)){
      if(this.initParams.hideStructure)return;
      this.initParams.hideStructure = [];
      hideStructParams.forEach((hideStructParam) => {
        if(this[hideStructParam]){ 
          this.initParams.hideStructure.push(hideStructParamsMap[hideStructParam]);
        }
      });

    }else if((hideIconsParams.indexOf(propName) > -1)){
      if(this.initParams.hideCanvasControls)return;
      this.initParams.hideCanvasControls = [];
      hideIconsParams.forEach((hideIconsParam) => {
        if(this[hideIconsParam]){ 
          this.initParams.hideCanvasControls.push(hideIconsParamsMap[hideIconsParam]);
        }
      });

    }

  }

  createParamModel(){
    
    const specialProps = ['customDataUrl', 'customDataFormat', 'ligandLabelCompId', 'bgColorR', 'bgColorG', 'bgColorB',
    'ligandAuthAsymId', 'ligandAuthSeqId', 'ligandHydrogens', 'highlightColorR', 'highlightColorG', 'highlightColorB',
    'selectColorR', 'selectColorG', 'selectColorB', 'hidePolymer', 'hideWater', 'hideHet', 'hideCarbs', 'hideNonStandard', 'hideCoarse',
    'hideExpandIcon', 'hideSelectionIcon', 'hideAnimationIcon', 'hideControlToggleIcon', 'hideControlInfoIcon'];
    const componentProps = this.constructor['properties'];
    if(componentProps){
      for(let propName in componentProps){
        if(this[propName]){
          if(!this.initParams) this.initParams = Object.assign({},{});
          if(specialProps.indexOf(propName) == -1){
            this.initParams[propName] = this[propName];
          }else{
            this.formatParam(propName);
          }
        }
      }
    }
  }

  connectedCallback() {
    super.connectedCallback();

    this.createParamModel();

    // create an instance of the plugin
    this.viewerInstance = new PDBeMolstarPlugin();

    let paramValidatity = this.validateParams();
    if(!paramValidatity) return
    
    if(this.initParams) this.viewerInstance.render(this, this.initParams);
  }

  // render() {
  //   return html`
  //       <div>Loading!</div>
  //     `}

  createRenderRoot() {
    return this;
  }

}

export default PdbeMolstar;

customElements.define('pdbe-molstar', PdbeMolstar);