import { Color } from 'Molstar/mol-util/color';
import { CustomElementProperty } from 'Molstar/mol-model-props/common/custom-element-property';
import { Model, ElementIndex } from 'Molstar/mol-model/structure';

export function createCustomTheme(params: any, domain?: string, propName?: string, defaultColor?:{r:number, g:number, b:number}) {
    
    const customColoring = CustomElementProperty.create<number>({
        isStatic: true,
        name: propName || 'new-custom-theme',
        display: 'Custom theme',
        getData(model: Model) {
            if(!defaultColor) defaultColor = {r:255, g:255, b:255};
            const map = new Map<ElementIndex, any>();
            for (let i = 0, _i = model.atomicHierarchy.atoms._rowCount; i < _i; i++) {
                const m = model;
                const { offsets: residueOffsets } = m.atomicHierarchy.residueAtomSegments;
                const rI = m.atomicHierarchy.residueAtomSegments.index[i];
                const rN = m.atomicHierarchy.residues.label_seq_id.value(rI);
                const chainIndex = m.atomicHierarchy.chainAtomSegments.index;
                const cI = chainIndex[residueOffsets[rI]];
                const structAsymId = m.atomicHierarchy.chains.label_asym_id.value(cI);
                const entityId = m.atomicHierarchy.chains.label_entity_id.value(cI);

                let residueData : {color: {r:number, g:number, b:number}, tooltip?: string } = {
                    color: defaultColor
                };
                params.forEach((selParam: any) => {
                    let residueValidation = false;
                    let chainValidation = false;
                    let entityValidation = false;

                    if((selParam.start_residue_number || (selParam.start && selParam.start.residue_number)) && (selParam.end_residue_number || (selParam.end && selParam.end.residue_number))){
                        const startResNum = (selParam.start_residue_number) ? selParam.start_residue_number : selParam.start.residue_number;
                        const endResNum = (selParam.end_residue_number) ? selParam.end_residue_number : selParam.end.residue_number;
                        if(rN >= startResNum  && rN <= endResNum) residueValidation = true;
                    }else { residueValidation = true }

                    if(selParam.struct_asym_id){ 
                        if(selParam.struct_asym_id == structAsymId) chainValidation = true;
                    }else { chainValidation = true; }

                    if(selParam.entity_id){ 
                        if(selParam.entity_id == entityId) entityValidation = true;
                    }else { entityValidation = true; }
                    
                    
                    // if((rI >= startResNum - 1  && rI <= endResNum - 1) &&
                    if(residueValidation && chainValidation && entityValidation){
                            if(domain){
                                residueData.color = {r:255, g:112, b:3};
                                residueData.tooltip = domain;
                            }else{
                                if(selParam.color) residueData.color = selParam.color;
                                if(selParam.tooltip) residueData.tooltip = selParam.tooltip;
                            }
                        }
                });
                map.set(i as ElementIndex, residueData);

            }
            return map;
        },
        coloring: {
            getColor(e: any) { 
                return Color.fromRgb(e.color.r, e.color.g, e.color.b);
            },
            defaultColor: Color.fromRgb(255, 255, 255)
        },
        format(e: any) {
            if(e.tooltip) return e.tooltip;
            return false;
        }
    });

    return customColoring;
}