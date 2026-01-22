import { QueryParam } from './helpers';
import type { PDBeMolstarPlugin } from './viewer';


export function subscribeToComponentEvents(wrapperCtx: PDBeMolstarPlugin) {
    document.addEventListener('PDB.interactions.click', function (e: any) {
        if (typeof e.detail !== 'undefined') {
            const data = e.detail.interacting_nodes ? { data: e.detail.interacting_nodes } : { data: [e.detail.selected_node] };
            data.data[0]['focus'] = true;
            wrapperCtx.visual.select(data);
        }
    });

    document.addEventListener('PDB.interactions.mouseover', function (e: any) {
        if (typeof e.detail !== 'undefined') {
            const data = e.detail.interacting_nodes ? { data: e.detail.interacting_nodes } : { data: [e.detail.selected_node] };
            wrapperCtx.visual.highlight(data);
        }
    });

    document.addEventListener('PDB.interactions.mouseout', function (e: any) {
        wrapperCtx.visual.clearHighlight();
    });

    document.addEventListener('PDB.topologyViewer.click', function (e: any) {
        if (typeof e.eventData !== 'undefined') {
            // Call highlightAnnotation
            wrapperCtx.visual.select({
                data: [{
                    label_entity_id: e.eventData.entityId,
                    label_asym_id: e.eventData.structAsymId,
                    beg_label_seq_id: e.eventData.residueNumber,
                    end_label_seq_id: e.eventData.residueNumber,
                    sideChain: true,
                    focus: true,
                }],
            });
        }
    });

    document.addEventListener('PDB.topologyViewer.mouseover', function (e: any) {
        if (typeof e.eventData !== 'undefined') {
            // Call highlightAnnotation
            wrapperCtx.visual.highlight({
                data: [{
                    label_entity_id: e.eventData.entityId,
                    label_asym_id: e.eventData.structAsymId,
                    beg_label_seq_id: e.eventData.residueNumber,
                    end_label_seq_id: e.eventData.residueNumber,
                }],
            });
        }
    });

    document.addEventListener('PDB.topologyViewer.mouseout', function (e: any) {
        wrapperCtx.visual.clearHighlight();
    });

    document.addEventListener('protvista-mouseover', function (e: any) {
        if (e.detail !== undefined) {
            // Create query object from event data
            const query: QueryParam = {};
            if (e.detail.start !== undefined) {
                query.beg_label_seq_id = parseInt(e.detail.start);
            }
            if (e.detail.end !== undefined) {
                query.end_label_seq_id = parseInt(e.detail.end);
            }
            if (e.detail.feature?.entityId !== undefined) {
                query.label_entity_id = `${e.detail.feature.entityId}`;
            }
            if (e.detail.feature?.bestChainId !== undefined) {
                query.label_asym_id = e.detail.feature.bestChainId;
            }
            if (e.detail.feature?.chainId !== undefined) {
                query.label_asym_id = e.detail.feature.chainId;
            }

            if (Object.keys(query).length > 0) {
                wrapperCtx.visual.highlight({ data: [query] });
            }
        }
    });

    document.addEventListener('protvista-mouseout', function (e: any) {
        wrapperCtx.visual.clearHighlight();
    });

    document.addEventListener('protvista-click', function (e: any) {
        if (typeof e.detail !== 'undefined') {

            let showInteraction = false;
            let highlightQuery: any = undefined;

            // Create query object from event data
            if (e.detail.start && e.detail.end) {
                highlightQuery = {
                    beg_label_seq_id: parseInt(e.detail.start),
                    end_label_seq_id: parseInt(e.detail.end),
                };
            }

            if (e.detail.feature && e.detail.feature.entityId) highlightQuery['label_entity_id'] = e.detail.feature.entityId + '';
            if (e.detail.feature && e.detail.feature.bestChainId) highlightQuery['label_asym_id'] = e.detail.feature.bestChainId;
            if (e.detail.feature && e.detail.feature.chainId) highlightQuery['label_asym_id'] = e.detail.feature.chainId;

            if (e.detail.feature && e.detail.feature.accession && e.detail.feature.accession.split(' ')[0] === 'Chain' || e.detail.feature.tooltipContent === 'Ligand binding site') {
                showInteraction = true;
            }

            if (e.detail.start === e.detail.end) showInteraction = true;

            if (highlightQuery) {

                if (showInteraction) {
                    highlightQuery['sideChain'] = true;
                } else {
                    let selColor = undefined;
                    if (e.detail.trackIndex > -1 && e.detail.feature.locations && e.detail.feature.locations[0].fragments[e.detail.trackIndex].color) selColor = e.detail.feature.locations[0].fragments[e.detail.trackIndex].color;
                    if (selColor === undefined && e.detail.feature.color) selColor = e.detail.feature.color;
                    if (selColor === undefined && e.detail.color) selColor = e.detail.color;

                    if (selColor === undefined) {
                        selColor = { r: 65, g: 96, b: 91 };
                    } else {
                        const isRgb = /rgb/g;
                        if (isRgb.test(selColor)) {
                            const rgbArr = selColor.substring(4, selColor.length - 1).split(',');
                            selColor = { r: rgbArr[0], g: rgbArr[1], b: rgbArr[2] };
                        }
                    }

                    highlightQuery['color'] = selColor;
                }
                highlightQuery['focus'] = true;
                wrapperCtx.visual.select({ data: [highlightQuery] });
            }
        }
    });

    const elementTypeArrForRange = ['uniprot', 'pfam', 'cath', 'scop', 'strand', 'helice'];
    const elementTypeArrForSingle = ['chain', 'quality', 'quality_outlier', 'binding site', 'alternate conformer'];
    document.addEventListener('PDB.seqViewer.click', function (e: any) {
        if (typeof e.eventData !== 'undefined') {
            // Abort if entryid and entityid do not match or viewer type is unipdb
            // if(e.eventData.entryId != scope.pdbId) return;

            if (typeof e.eventData.elementData !== 'undefined' && elementTypeArrForSingle.indexOf(e.eventData.elementData.elementType) > -1) {
                // Call highlightAnnotation
                wrapperCtx.visual.select({
                    data: [{
                        label_entity_id: e.eventData.entityId,
                        label_asym_id: e.eventData.elementData.pathData.struct_asym_id,
                        beg_label_seq_id: e.eventData.residueNumber,
                        end_label_seq_id: e.eventData.residueNumber,
                        sideChain: true,
                        focus: true,
                    }],
                });

            } else if (typeof e.eventData.elementData !== 'undefined' && elementTypeArrForRange.indexOf(e.eventData.elementData.elementType) > -1) {

                const seqColorArray = e.eventData.elementData.color;
                wrapperCtx.visual.select({
                    data: [{
                        label_entity_id: e.eventData.entityId,
                        label_asym_id: e.eventData.elementData.pathData.struct_asym_id,
                        beg_label_seq_id: e.eventData.elementData.pathData.start.residue_number,
                        end_label_seq_id: e.eventData.elementData.pathData.end.residue_number,
                        color: { r: seqColorArray[0], g: seqColorArray[1], b: seqColorArray[2] },
                        focus: true,
                    }],
                });
            }

        }
    });

    document.addEventListener('PDB.seqViewer.mouseover', function (e: any) {
        if (typeof e.eventData !== 'undefined') {
            // Abort if entryid and entityid do not match or viewer type is unipdb
            // if(e.eventData.entryId != scope.pdbId) return;

            if (typeof e.eventData.elementData !== 'undefined' && elementTypeArrForSingle.indexOf(e.eventData.elementData.elementType) > -1) {
                wrapperCtx.visual.select({
                    data: [{
                        label_entity_id: e.eventData.entityId,
                        label_asym_id: e.eventData.elementData.pathData.struct_asym_id,
                        beg_label_seq_id: e.eventData.residueNumber,
                        end_label_seq_id: e.eventData.residueNumber,
                        focus: true,
                    }],
                });

            } else if (typeof e.eventData.elementData !== 'undefined' && elementTypeArrForRange.indexOf(e.eventData.elementData.elementType) > -1) {
                // Call highlightAnnotation
                wrapperCtx.visual.highlight({
                    data: [{
                        label_entity_id: e.eventData.entityId,
                        label_asym_id: e.eventData.elementData.pathData.struct_asym_id,
                        beg_label_seq_id: e.eventData.elementData.pathData.start.residue_number,
                        end_label_seq_id: e.eventData.elementData.pathData.end.residue_number,
                    }],
                });
            }
        }
    });

    document.addEventListener('PDB.seqViewer.mouseout', function (e) {
        wrapperCtx.visual.clearHighlight();
    });
}
