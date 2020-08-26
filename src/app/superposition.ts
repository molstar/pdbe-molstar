import { Mat4 } from 'Molstar/mol-math/linear-algebra';
import { PluginStateObject as PSO } from 'Molstar/mol-plugin-state/objects';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { StateObjectRef } from 'Molstar/mol-state';
import { BuiltInTrajectoryFormat } from 'Molstar/mol-plugin-state/formats/trajectory';
import { StateTransforms } from 'Molstar/mol-plugin-state/transforms';
import { Asset } from 'Molstar/mol-util/assets';
import { LigandView, ModelInfo } from './helpers';
import { ColorLists } from 'Molstar/mol-util/color/lists';
import { Color } from 'Molstar/mol-util/color/color';
import { State } from 'Molstar/mol-state';

type ClusterRec = {
    pdb_id: string,
    auth_asym_id: string,
    struct_asym_id: string,
    entity_id: string,
    is_representative: boolean
}

export type SuperpositionData = {
    data: ClusterRec[],
    matrix: Mat4[]
};

function getRandomColor(plugin: PluginContext, segmentIndex: number) {
    const clList: any = ColorLists;
    const spState = (plugin.customState as any).superpositionState;
    let palleteIndex = spState.colorState[segmentIndex].palleteIndex;
    let colorIndex = spState.colorState[segmentIndex].colorIndex;
    if(clList[spState.colorPalette[palleteIndex]].list[colorIndex + 1]){
        colorIndex += 1;
    }else{
        colorIndex = 0;
        palleteIndex = spState.colorPalette[palleteIndex + 1] ? palleteIndex + 1 : 0;
    }
    const palleteName = spState.colorPalette[palleteIndex];
    (plugin.customState as any).superpositionState.colorState[segmentIndex].palleteIndex = palleteIndex;
    (plugin.customState as any).superpositionState.colorState[segmentIndex].colorIndex = colorIndex;
    return clList[palleteName].list[colorIndex];
}

export async function initSuperposition(plugin: PluginContext) {

    await plugin.clear();

    const customState = plugin.customState as any;
    const superpositionParams = customState.initParams.superpositionParams;
    (plugin.customState as any).superpositionState = {
        models: {},
        entries: {},
        refMaps: {},
        segmentData: void 0,
        matrixData: {},
        activeSegment: 0,
        loadedStructs: [],
        visibleRefs: [],
        invalidStruct: [],
        noMatrixStruct: [],
        hets: {},
        colorPalette: ['dark-2', 'red-yellow-green', 'paired', 'set-1', 'accent', 'set-2', 'rainbow'],
        colorState: []
    };

    // Get segment and cluster information for the given uniprot accession
    await getSegmentData(plugin);
    const segmentData: any = (plugin.customState as any).superpositionState.segmentData;
    if(!segmentData) return;

    // Load Matrix Data
    await getMatrixData(plugin);
    if(!(plugin.customState as any).superpositionState.segmentData) return;

    segmentData.forEach(() => {
        (plugin.customState as any).superpositionState.loadedStructs.push([]);
        (plugin.customState as any).superpositionState.visibleRefs.push([]);
        (plugin.customState as any).superpositionState.colorState.push({palleteIndex: 0, colorIndex: -1});
    });

    // Set segment and cluster details from superPositionParams
    const segmentIndex = (superpositionParams && superpositionParams.segment) ? superpositionParams.segment - 1 : 0;
    (plugin.customState as any).superpositionState.activeSegment = segmentIndex + 1;
    const clusterIndexs = (superpositionParams && superpositionParams.cluster) ? superpositionParams.cluster : void 0;

    // Emit segment API data load event
    (plugin.customState as any).events.superpositionInit.next(true);

    // Get entry list to load matrix data
    let entryList: ClusterRec[] = [];
    const clusters = segmentData[segmentIndex].clusters;
    clusters.forEach( (cluster: ClusterRec[], clusterIndex: number) => {
        // Validate for cluster index if provided in superPositionParams
        if(clusterIndexs && clusterIndexs.indexOf(clusterIndex) === -1) return;

        // Add respresentative structure to the list
        if(superpositionParams && superpositionParams.superposeAll){
            entryList = entryList.concat(cluster);
        }else{
            entryList.push(cluster[0]);
        }
    });

    await renderSuperposition(plugin, segmentIndex, entryList);
}

export async function renderSuperposition(plugin: PluginContext, segmentIndex: number, entryList: ClusterRec[]) {
    const customState = plugin.customState as any;
    const superpositionParams = customState.initParams.superpositionParams;
    let busyFlagOn = false;
    if(entryList.length > 1){
        busyFlagOn = true;
        customState.events.isBusy.next(true);
    }

    // Load Coordinates and render respresentations
    return plugin.dataTransaction(async () => {
        const spState = (plugin.customState as any).superpositionState;

        for await (const s of entryList) {
            // validate matrix availability
            if(!spState.matrixData[`${s.pdb_id}_${s.auth_asym_id}`]) {
                spState.noMatrixStruct.push(`${s.pdb_id}_${s.struct_asym_id}`);
                spState.invalidStruct.push(`${s.pdb_id}_${s.struct_asym_id}`);
                continue;
            }
            spState.loadedStructs[segmentIndex].push(`${s.pdb_id}_${s.struct_asym_id}`);

            // Set Coordinate server url
            let strUrl = `${customState.initParams.pdbeUrl}model-server/v1/${s.pdb_id}/atoms?auth_asym_id=${s.auth_asym_id}&encoding=${customState.initParams.encoding}`;
            if(superpositionParams && superpositionParams.ligandView) strUrl = `https://www.ebi.ac.uk/pdbe/entry-files/download/${s.pdb_id}.bcif`;

            // Load Data
            let strInstance: any;
            let modelRef: any;
            let clearOnFail = true;
            if(superpositionParams && superpositionParams.ligandView && spState.entries[s.pdb_id]) {
                const polymerInstance = plugin.state.data.select(spState.entries[s.pdb_id])[0];
                modelRef = polymerInstance.transform.parent;
                const modelInstance = plugin.state.data.select(modelRef)[0];
                strInstance = await plugin.builders.structure.createStructure(modelInstance, { name: 'model', params: { } });
                clearOnFail = false;
            } else {
                const isBinary = customState.initParams.encoding === 'bcif' ? true : false;
                const { model, structure } = await loadStructure(plugin, strUrl, 'mmcif', isBinary);
                strInstance = structure;
                modelRef = model!.ref;
            }

            if(!strInstance) continue;

            // Store Refs in state
            if(!spState.models[`${s.pdb_id}_${s.struct_asym_id}`]) spState.models[`${s.pdb_id}_${s.struct_asym_id}`] = strInstance?.ref;
            if(superpositionParams && superpositionParams.ligandView && !spState.entries[s.pdb_id]) spState.entries[s.pdb_id] = strInstance?.ref;

            // Apply tranform matrix
            const matrix = Mat4.ofRows((plugin.customState as any).superpositionState.matrixData[`${s.pdb_id}_${s.auth_asym_id}`].matrix);
            await transform(plugin, strInstance, matrix);

            // Create representations
            let chainSel: any;
            if((superpositionParams && superpositionParams.ligandView) && s.is_representative){
                const uniformColor1 = getRandomColor(plugin, segmentIndex); // random color
                chainSel = await plugin.builders.structure.tryCreateComponentFromExpression(strInstance, chainSelection(s.struct_asym_id), `Chain-${segmentIndex}`, { label: `Chain`, tags: [`superposition-sel`]});
                if (chainSel){
                    await plugin.builders.structure.representation.addRepresentation(chainSel, { type: 'putty', color: 'uniform', colorParams: { value: uniformColor1 }, size: 'uniform' }, { tag: `superposition-visual` });
                    spState.refMaps[chainSel.ref] = `${s.pdb_id}_${s.struct_asym_id}`;
                }

            } else if((superpositionParams && superpositionParams.ligandView) && !s.is_representative){
                // Do nothing
            } else {
                const uniformColor2 = getRandomColor(plugin, segmentIndex); // random color
                chainSel = await plugin.builders.structure.tryCreateComponentStatic(strInstance, 'polymer', { label: `Chain`, tags: [`Chain-${segmentIndex}`, `superposition-sel`]});
                if (chainSel){
                    await plugin.builders.structure.representation.addRepresentation(chainSel, { type: 'putty', color: 'uniform', colorParams: { value: uniformColor2 }, size: 'uniform' }, { tag: `superposition-visual` });
                    spState.refMaps[chainSel.ref] = `${s.pdb_id}_${s.struct_asym_id}`;
                }
            }

            let invalidStruct = chainSel ? false : true;
            if(superpositionParams && superpositionParams.ligandView) {
                const state = plugin.state.data;
                const hets = await getHetNames(state, modelRef);
                const interactingHets = [];
                if(hets && hets.length > 0){
                    for await (const het of hets) {
                        const ligParam = {
                            label_comp_id: het,
                            auth_asym_id: s.auth_asym_id
                        };
                        const ligandQuery = LigandView.query(ligParam);
                        let labelTagParams = { label: `${het}`, tags: [`superposition-ligand-sel`]};
                        let hetColor = Color.fromRgb(253, 3, 253);
                        if(superpositionParams && superpositionParams.ligandColor){
                            const { r, g, b} = superpositionParams.ligandColor;
                            hetColor = Color.fromRgb(r, g, b);
                        }
                        const ligandExp = await plugin.builders.structure.tryCreateComponentFromExpression(strInstance, ligandQuery.core, `${het}-${segmentIndex}`, labelTagParams);
                        if(ligandExp){
                            await plugin.builders.structure.representation.addRepresentation(ligandExp, { type: 'ball-and-stick', color: 'uniform', colorParams: { value: hetColor } }, { tag: `superposition-ligand-visual`});
                            spState.refMaps[ligandExp.ref] = `${s.pdb_id}_${s.struct_asym_id}`;
                        }

                        if(ligandExp) {
                            invalidStruct = false;
                            interactingHets.push(het);
                        }
                    }
                }
                if(invalidStruct) {
                    spState.invalidStruct.push(`${s.pdb_id}_${s.struct_asym_id}`);
                    const loadedStructIndex = spState.loadedStructs[segmentIndex].indexOf(`${s.pdb_id}_${s.struct_asym_id}`);
                    if(loadedStructIndex > -1) spState.loadedStructs[segmentIndex].splice(loadedStructIndex, 1);

                    // remove downloaded data
                    if(clearOnFail) {
                        // const m = plugin.state.data.select(modelRef)[0];
                        // const t = plugin.state.data.select(m.transform.parent)[0];
                        // const d = plugin.state.data.select(t.transform.parent)[0];
                        // PluginCommands.State.RemoveObject(plugin, { state: d.parent!, ref: d.transform.parent, removeParentGhosts: true });
                    }
                }else{
                    if(interactingHets.length > 0) spState.hets[`${s.pdb_id}_${s.struct_asym_id}`] = interactingHets;
                }

            }
        }
        if(busyFlagOn){
            busyFlagOn = false;
            customState.events.isBusy.next(false);
        }
    });
}

async function getHetNames(state: State, modelRef: string) {
    const cell = state.select(modelRef)[0];
    if (!cell || !cell.obj) return void 0;
    const model = cell.obj.data;
    if (!model) return;
    const info = await ModelInfo.get(model);
    if(info && info.hetNames.length > 0) return info.hetNames;
    return void 0;
}

async function loadStructure(plugin: PluginContext, url: string, format: BuiltInTrajectoryFormat, isBinary?: boolean) {
    try {
        const data = await plugin.builders.data.download({ url: Asset.Url(url), isBinary: isBinary });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, format);
        const model = await plugin.builders.structure.createModel(trajectory);
        const structure = await plugin.builders.structure.createStructure(model, { name: 'model', params: { } });

        return { data, trajectory, model, structure };
    }catch(e) {
        return { structure: void 0 };
    }
}

function chainSelection(struct_asym_id: string) {
    return MS.struct.generator.atomGroups({
        'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), struct_asym_id])
    });
}

function transform(plugin: PluginContext, s: StateObjectRef<PSO.Molecule.Structure>, matrix: Mat4) {
    const b = plugin.state.data.build().to(s)
        .insert(StateTransforms.Model.TransformStructureConformation, { transform: { name: 'matrix', params: { data: matrix, transpose: false } } });
    return plugin.runTask(plugin.state.data.updateTree(b));
}

async function getMatrixData(plugin: PluginContext) {
    const customState = plugin.customState as any;
    const matrixAccession = customState.initParams.superpositionParams.matrixAccession ? customState.initParams.superpositionParams.matrixAccession : customState.initParams.moleculeId;
    const clusterRecUrlStr = `${customState.initParams.pdbeUrl}graph-api/uniprot/superposition_matrices/${matrixAccession}`;
    const assetManager = plugin.managers.asset;
    const clusterRecUrl = Asset.getUrlAsset(assetManager, clusterRecUrlStr);
    try {
        const clusterRecData = await plugin.runTask(assetManager.resolve(clusterRecUrl, 'json', false));
        if(clusterRecData && clusterRecData.data) {
            (plugin.customState as any).superpositionState.matrixData = clusterRecData.data;
        }
    } catch (e) {
        customState['superpositionError'] = `Matrix data not available for ${matrixAccession}`;
        (plugin.customState as any).events.superpositionInit.next(true); // Emit segment API data load event
    }
}

async function getSegmentData(plugin: PluginContext) {

    const customState = plugin.customState as any;

    // Get Data
    const segmentsUrl = `${customState.initParams.pdbeUrl}graph-api/uniprot/superposition/${customState.initParams.moleculeId}`;
    const assetManager = plugin.managers.asset;
    const url = Asset.getUrlAsset(assetManager, segmentsUrl);
    try {
        const result = await plugin.runTask(assetManager.resolve(url, 'json', false));
        if(result && result.data) {
            customState.superpositionState.segmentData = result.data[customState.initParams.moleculeId!];
        }
    } catch (e) {
        customState['superpositionError'] = `Superposition data not available for ${customState.initParams.moleculeId}`;
        (plugin.customState as any).events.superpositionInit.next(true); // Emit segment API data load event
    }
}