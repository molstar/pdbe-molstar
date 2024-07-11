import { SymmetryOperator } from 'Molstar/mol-math/geometry';
import { Mat4 } from 'Molstar/mol-math/linear-algebra';
import { ChainIndex, Model, StructureProperties } from 'Molstar/mol-model/structure';
import { BuiltInTrajectoryFormat } from 'Molstar/mol-plugin-state/formats/trajectory';
import { PluginStateObject as PSO, PluginStateObject } from 'Molstar/mol-plugin-state/objects';
import { StateTransforms } from 'Molstar/mol-plugin-state/transforms';
import { PluginContext } from 'Molstar/mol-plugin/context';
import { MolScriptBuilder as MS } from 'Molstar/mol-script/language/builder';
import { Script } from 'Molstar/mol-script/script';
import { StateObjectRef, StateObjectSelector } from 'Molstar/mol-state';
import { Task } from 'Molstar/mol-task';
import { Asset } from 'Molstar/mol-util/assets';
import { Color } from 'Molstar/mol-util/color/color';
import { ColorListName, ColorLists } from 'Molstar/mol-util/color/lists';
import { ColorNames } from 'Molstar/mol-util/color/names';
import { Subject } from 'rxjs';
import { applyAFTransparency } from './alphafold-transparency';
import { ModelInfo, ModelServerRequest, getStructureUrl, normalizeColor } from './helpers';
import { ClusterMember, PluginCustomState } from './plugin-custom-state';
import { alignAndSuperposeWithSIFTSMapping } from './superposition-sifts-mapping';


function combinedColorPalette(palettes: ColorListName[]): Color[] {
    return palettes
        .flatMap(paletteName => ColorLists[paletteName].list)
        .map(entry => (typeof entry === 'number') ? entry : entry[0]);
}
export const SuperpositionColorPalette = combinedColorPalette(['dark-2', 'red-yellow-green', 'paired', 'set-1', 'accent', 'set-2', 'rainbow']);
export const LigandClusterPalette = combinedColorPalette(['set-1', 'set-2']);
const DefaultLigandColor = Color.fromRgb(253, 3, 253);


export function getNextColor(plugin: PluginContext, segmentIndex: number) {
    const spState = PluginCustomState(plugin).superpositionState;
    if (!spState) throw new Error('customState.superpositionState has not been initialized');
    const nextColor = SuperpositionColorPalette[spState.colorCounters[segmentIndex]];
    spState.colorCounters[segmentIndex] = (spState.colorCounters[segmentIndex] + 1) % SuperpositionColorPalette.length;
    return nextColor;
}

export async function initSuperposition(plugin: PluginContext, completeSubject?: Subject<boolean>) {
    let success = false;
    try {
        await plugin.clear();

        const customState = PluginCustomState(plugin);
        customState.superpositionState = {
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
            colorCounters: [],
            alphafold: {
                apiData: {
                    cif: '',
                    pae: '',
                    length: 0
                },
                length: 0,
                ref: '',
                traceOnly: true,
                visibility: [],
                transforms: [],
                rmsds: [],
                coordinateSystems: []
            }
        };

        // Get segment and cluster information for the given uniprot accession
        await getSegmentData(plugin);
        const segmentData = customState.superpositionState.segmentData;
        if (!segmentData) return;

        // Load Matrix Data
        await getMatrixData(plugin);
        if (!customState.superpositionState.segmentData) return;

        if (customState.initParams?.superpositionParams?.ligandView) {
            customState.superpositionState.ligandClusterData = await getLigandClusteringData(plugin);
        }

        if (!customState.initParams!.moleculeId) throw new Error('initParams.moleculeId is not defined');
        const afStrUrls = await getAfUrl(plugin, customState.initParams!.moleculeId);
        if (afStrUrls) customState.superpositionState.alphafold.apiData = afStrUrls;

        segmentData.forEach(() => {
            customState.superpositionState!.loadedStructs.push([]);
            customState.superpositionState!.visibleRefs.push([]);
            customState.superpositionState!.colorCounters.push(0);
        });

        // Set segment and cluster details from superPositionParams
        const superpositionParams = customState.initParams!.superpositionParams;
        const segmentIndex = superpositionParams?.segment ? superpositionParams.segment - 1 : 0;
        customState.superpositionState.activeSegment = segmentIndex + 1;
        const clusterIndexs = superpositionParams?.cluster ? superpositionParams.cluster : void 0;

        // Emit segment API data load event
        customState.events?.superpositionInit.next(true);

        // Get entry list to load matrix data
        const entryList: ClusterMember[] = [];
        const clusters = segmentData[segmentIndex].clusters;
        clusters.forEach((cluster: ClusterMember[], clusterIndex: number) => {
            // Validate for cluster index if provided in superPositionParams
            if (clusterIndexs && clusterIndexs.indexOf(clusterIndex) === -1) return;

            // Add respresentative structure to the list
            if (superpositionParams?.superposeAll) {
                entryList.push(...cluster);
            } else {
                entryList.push(cluster[0]);
            }
        });

        await renderSuperposition(plugin, segmentIndex, entryList);
        success = true;
    } finally {
        completeSubject?.next(success);
    }
}

function createCarbVisLabel(carbLigNamesAndCount: any) {
    const compList = [];
    for (const carbCompId in carbLigNamesAndCount) {
        compList.push(`${carbCompId} (${carbLigNamesAndCount[carbCompId]})`);
    }

    return compList.join(', ');
}

async function getAfUrl(plugin: PluginContext, accession: string) {
    let apiResponse: any;
    let apiData: any;
    await plugin.runTask(Task.create('Get AlphaFold URL', async ctx => {
        try {
            apiResponse = await plugin.fetch({ url: `https://alphafold.ebi.ac.uk/api/prediction/${accession}`, type: 'json' }).runInContext(ctx);
            if (apiResponse && apiResponse?.[0].bcifUrl) {
                apiData = {
                    cif: apiResponse?.[0].cifUrl,
                    pae: apiResponse?.[0].paeImageUrl,
                    length: apiResponse?.[0].uniprotEnd
                };
            }
        } catch (e) {
            // console.warn(e);
        }
    }));

    return apiData;
}

export async function loadAfStructure(plugin: PluginContext) {
    const customState = PluginCustomState(plugin);
    if (!customState.superpositionState) throw new Error('customState.superpositionState has not been initialized');
    const { structure } = await loadStructure(plugin, customState.superpositionState.alphafold.apiData.cif, 'mmcif', false);
    const strInstance = structure;
    if (!strInstance) return false;

    // Store Refs in state
    const spState = customState.superpositionState;
    spState.alphafold.ref = strInstance?.ref;
    if (!customState.initParams?.moleculeId) throw new Error('initParams.moleculeId is not defined');
    spState.models[`AF-${customState.initParams.moleculeId}`] = strInstance?.ref;

    const chainSel = await plugin.builders.structure.tryCreateComponentStatic(strInstance, 'polymer', { label: `AlphaFold Structure`, tags: [`alphafold-chain`, `superposition-sel`] });

    if (chainSel) {
        await plugin.builders.structure.representation.addRepresentation(chainSel, { type: 'putty', color: 'plddt-confidence' as any, size: 'uniform', sizeParams: { value: 1.5 } }, { tag: `af-superposition-visual` });
        return strInstance?.ref;
    }

    return false;

}

export async function superposeAf(plugin: PluginContext, traceOnly: boolean, segmentIndex?: number) {
    const customState = PluginCustomState(plugin);
    const spState = customState.superpositionState;
    if (!spState?.segmentData) return;

    // Load AF structure
    const afStrRef = spState.alphafold.ref || await loadAfStructure(plugin);
    if (!afStrRef) return;
    const afStr: any = plugin.managers.structure.hierarchy.current.refs.get(afStrRef!);

    const segmentNum = segmentIndex ? segmentIndex : spState.activeSegment - 1;
    if (!spState.alphafold.transforms[segmentNum]) {

        // Create representative list
        const mappingResult: any = [];
        const coordinateSystems: any = [];
        const failedPairsResult: any = [];
        const zeroOverlapPairsResult: any = [];

        let minRmsd = 0;
        let minIndex = 0;
        const rmsdList: string[] = [];
        const segmentClusters = spState.segmentData[segmentNum].clusters;
        segmentClusters.forEach((cluster: any) => {

            const modelRef = spState.models[`${cluster[0].pdb_id}_${cluster[0].struct_asym_id}`];
            if (modelRef) {
                const structHierarchy: any = plugin.managers.structure.hierarchy.current.refs.get(modelRef!);
                if (structHierarchy) {
                    const input = [structHierarchy.components[0], afStr];
                    const structures = input.map(s => s.cell.obj?.data!);
                    let { entries, failedPairs, zeroOverlapPairs } = alignAndSuperposeWithSIFTSMapping(structures, {
                        traceOnly,
                        includeResidueTest: loc => StructureProperties.atom.B_iso_or_equiv(loc) > 70,
                        applyTestIndex: [1]
                    });

                    if (entries.length === 0 || (entries && entries[0] && entries[0].transform.rmsd.toFixed(1) === '0.0')) {
                        const alignWithoutPlddt = alignAndSuperposeWithSIFTSMapping(structures, { traceOnly });
                        entries = alignWithoutPlddt.entries;
                    }

                    if (entries && entries[0]) {
                        mappingResult.push(entries[0]);
                        coordinateSystems.push(input[0]?.transform?.cell.obj?.data.coordinateSystem);
                        const totalMappings = mappingResult.length;
                        if (totalMappings === 1 || entries[0].transform.rmsd < minRmsd) {
                            minRmsd = entries[0].transform.rmsd;
                            minIndex = totalMappings === 1 ? 0 : mappingResult.length - 1;
                        }

                        rmsdList.push(`${cluster[0].pdb_id} chain ${cluster[0].struct_asym_id}:${entries[0].transform.rmsd.toFixed(2)}`);

                    } else {
                        if (failedPairs.length > 0) failedPairsResult.push(failedPairs);
                        if (zeroOverlapPairs.length > 0) zeroOverlapPairsResult.push(zeroOverlapPairs);
                        // rmsdList.push(`${cluster[0].pdb_id} ${cluster[0].struct_asym_id}:-`)
                    }


                }
            }
        });

        // console.log(failedPairsResult);
        // console.log(zeroOverlapPairsResult);
        if (mappingResult.length > 0) {
            spState.alphafold.visibility[segmentNum] = true;
            spState.alphafold.transforms[segmentNum] = mappingResult[minIndex].transform.bTransform;
            spState.alphafold.coordinateSystems[segmentNum] = coordinateSystems[minIndex];
            spState.alphafold.rmsds[segmentNum] = rmsdList.sort((a: string, b: string) => parseFloat(a.split(':')[1]) - parseFloat(b.split(':')[1]));
        }

    }

    await afTransform(plugin, afStr.cell, spState.alphafold.transforms[segmentNum], spState.alphafold.coordinateSystems[segmentNum]);
    applyAFTransparency(plugin, afStr, 0.8, 70);

    return true;

}

export async function renderSuperposition(plugin: PluginContext, segmentIndex: number, entryList: ClusterMember[]) {
    const customState = PluginCustomState(plugin);
    const superpositionParams = customState.initParams!.superpositionParams;
    let busyFlagOn = false;
    if (entryList.length > 1) {
        busyFlagOn = true;
        customState.events?.isBusy.next(true);
    }

    // Load Coordinates and render respresentations
    return plugin.dataTransaction(async () => {
        if (!customState.initParams) throw new Error('customState.initParams has not been initialized');
        if (!customState.superpositionState) throw new Error('customState.superpositionState has not been initialized');
        const spState = customState.superpositionState;

        for (const s of entryList) {
            // validate matrix availability
            if (!spState.matrixData[`${s.pdb_id}_${s.auth_asym_id}`]) {
                spState.noMatrixStruct.push(`${s.pdb_id}_${s.struct_asym_id}`);
                spState.invalidStruct.push(`${s.pdb_id}_${s.struct_asym_id}`);
                continue;
            }
            spState.loadedStructs[segmentIndex].push(`${s.pdb_id}_${s.struct_asym_id}`);

            // Set Coordinate server url
            const request: ModelServerRequest = (superpositionParams && superpositionParams.ligandView) ?
                { pdbId: s.pdb_id, queryType: 'full' }
                : { pdbId: s.pdb_id, queryType: 'atoms', queryParams: { auth_asym_id: s.auth_asym_id } };
            const strUrl = getStructureUrl(customState.initParams, request);

            // Load Data
            let strInstance: any;
            let modelRef: any;
            let clearOnFail = true;
            if (superpositionParams && superpositionParams.ligandView && spState.entries[s.pdb_id]) {
                const polymerInstance = plugin.state.data.select(spState.entries[s.pdb_id])[0];
                modelRef = polymerInstance.transform.parent;
                const modelInstance = plugin.state.data.select(modelRef)[0];
                strInstance = await plugin.builders.structure.createStructure(modelInstance, { name: 'model', params: {} });
                clearOnFail = false;
            } else {
                const isBinary = customState.initParams.encoding === 'bcif' ? true : false;
                const { model, structure } = await loadStructure(plugin, strUrl, 'mmcif', isBinary);
                strInstance = structure;
                modelRef = model!.ref;
            }

            if (!strInstance) continue;

            // Store Refs in state
            if (!spState.models[`${s.pdb_id}_${s.struct_asym_id}`]) spState.models[`${s.pdb_id}_${s.struct_asym_id}`] = strInstance?.ref;
            if (superpositionParams && superpositionParams.ligandView && !spState.entries[s.pdb_id]) spState.entries[s.pdb_id] = strInstance?.ref;

            // Apply tranform matrix
            const matrix = Mat4.ofRows(customState.superpositionState.matrixData[`${s.pdb_id}_${s.auth_asym_id}`].matrix);
            await transform(plugin, strInstance, matrix);

            // Create representations
            let chainSel: StateObjectSelector | undefined;
            if ((superpositionParams && superpositionParams.ligandView) && s.is_representative) {
                const uniformColor1 = getNextColor(plugin, segmentIndex); // random color
                chainSel = await plugin.builders.structure.tryCreateComponentFromExpression(strInstance, chainSelection(s.struct_asym_id), `Chain-${segmentIndex}`, { label: `Chain`, tags: [`superposition-sel`] });
                if (chainSel) {
                    await plugin.builders.structure.representation.addRepresentation(chainSel, { type: 'putty', color: 'uniform', colorParams: { value: uniformColor1 }, size: 'uniform' }, { tag: `superposition-visual` });
                    spState.refMaps[chainSel.ref] = `${s.pdb_id}_${s.struct_asym_id}`;
                }

            } else if ((superpositionParams && superpositionParams.ligandView) && !s.is_representative) {
                // Do nothing
            } else {
                const uniformColor2 = getNextColor(plugin, segmentIndex); // random color
                chainSel = await plugin.builders.structure.tryCreateComponentStatic(strInstance, 'polymer', { label: `Chain`, tags: [`Chain-${segmentIndex}`, `superposition-sel`] });
                if (chainSel) {
                    await plugin.builders.structure.representation.addRepresentation(chainSel, { type: 'putty', color: 'uniform', colorParams: { value: uniformColor2 }, size: 'uniform' }, { tag: `superposition-visual` });
                    spState.refMaps[chainSel.ref] = `${s.pdb_id}_${s.struct_asym_id}`;
                }
            }

            let invalidStruct = chainSel ? false : true;
            if (superpositionParams?.ligandView) {
                const model = getModelFromModelRef(plugin, modelRef);
                const ligandInfo = model ? getLigandInfo(model) : {};
                const ligandsInChain = ligandInfo[s.auth_asym_id] ?? [];
                ligandsInChain.sort((a, b) => `${a.label_comp_id}-${a.label_asym_id}` > `${b.label_comp_id}-${b.label_asym_id}` ? 1 : -1);
                for (const ligand of ligandsInChain) {
                    const ligandExpression = MS.struct.generator.atomGroups({
                        'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), ligand.label_asym_id]),
                    });
                    const labelTagParams = { label: ligand.label_comp_id, tags: [`superposition-ligand-sel`] };
                    const hetColor = assignLigandClusterColor(plugin, s.pdb_id, ligand.label_asym_id) ?? normalizeColor(superpositionParams.ligandColor, DefaultLigandColor);
                    if (hetColor === 'hide') continue;

                    const ligandObj = await plugin.builders.structure.tryCreateComponentFromExpression(strInstance, ligandExpression, `${ligand.label_comp_id}-${ligand.label_asym_id}-${segmentIndex}`, labelTagParams);
                    if (ligandObj) {
                        await plugin.builders.structure.representation.addRepresentation(ligandObj, { type: 'ball-and-stick', color: 'uniform', colorParams: { value: hetColor } }, { tag: `superposition-ligand-visual` });
                        spState.refMaps[ligandObj.ref] = `${s.pdb_id}_${s.struct_asym_id}`;
                        invalidStruct = false;
                    }
                }

                const hetInfo = await getLigandNamesFromModelData(plugin, modelRef);
                const carbEntityCount = hetInfo ? hetInfo.carbEntityCount : 0;
                if (carbEntityCount > 0) {

                    // Get Carbohydrate Polymers details from PDBe API
                    const allCarbPolymers = await getCarbPolymerDetailsFromApi(plugin, s.pdb_id);

                    // Polymer chain + surroundings query
                    const polymerChainWithSurroundings = MS.struct.modifier.includeSurroundings({
                        0: MS.struct.generator.atomGroups({
                            'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'polymer']),
                            'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), s.auth_asym_id]),
                            'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()])
                        }),
                        radius: 5,
                        'as-whole-residues': true
                    });

                    let i = 0;
                    for (const carbEntityChainId of allCarbPolymers.branchedChains) {

                        const carbEntityChain = MS.struct.generator.atomGroups({
                            'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'branched']),
                            'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), carbEntityChainId]),
                            'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()])
                        });

                        const carbEntityChainInVicinity = MS.struct.filter.intersectedBy({
                            0: polymerChainWithSurroundings,
                            by: carbEntityChain
                        });

                        const data = (plugin.state.data.select(strInstance.ref)[0].obj).data;
                        const carbChainSel = Script.getStructureSelection(carbEntityChainInVicinity, data);
                        if (carbChainSel && carbChainSel.kind === 'sequence') {
                            // console.log(carbEntityChainId + ' chain present in 5 A radius');
                            const carbLigands = [];
                            const carbLigNamesAndCount: any = {};
                            const carbLigList = [];

                            for (const carbLigs of allCarbPolymers.branchedLigands[i]) {
                                const ligResDetails = carbLigs.split('-');
                                carbLigands.push(MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(), +ligResDetails[1]]));

                                if (carbLigNamesAndCount[ligResDetails[0]]) {
                                    carbLigNamesAndCount[ligResDetails[0]]++;
                                } else {
                                    carbLigNamesAndCount[ligResDetails[0]] = 1;
                                }

                                carbLigList.push(ligResDetails[0]);
                            }

                            const carbVisLabel = createCarbVisLabel(carbLigNamesAndCount);

                            const branchedEntity = MS.struct.generator.atomGroups({
                                'entity-test': MS.core.rel.eq([MS.ammp('entityType'), 'branched']),
                                'group-by': MS.core.str.concat([MS.struct.atomProperty.core.operatorName(), MS.struct.atomProperty.macromolecular.residueKey()]),
                                'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(), carbEntityChainId]),
                                'residue-test': MS.core.logic.or(carbLigands)
                            });

                            const labelTagParams = { label: `${carbVisLabel}`, tags: [`superposition-carb-sel`] };
                            const ligandExp = await plugin.builders.structure.tryCreateComponentFromExpression(strInstance, branchedEntity, `${carbLigList.join('-')}-${segmentIndex}`, labelTagParams);
                            if (ligandExp) {
                                await plugin.builders.structure.representation.addRepresentation(ligandExp, { type: 'carbohydrate' }, { tag: `superposition-carb-visual` });
                                spState.refMaps[ligandExp.ref] = `${s.pdb_id}_${s.struct_asym_id}`;
                                invalidStruct = false;
                            }

                        }

                        i++;
                    }

                }

                if (invalidStruct) {
                    spState.invalidStruct.push(`${s.pdb_id}_${s.struct_asym_id}`);
                    const loadedStructIndex = spState.loadedStructs[segmentIndex].indexOf(`${s.pdb_id}_${s.struct_asym_id}`);
                    if (loadedStructIndex > -1) spState.loadedStructs[segmentIndex].splice(loadedStructIndex, 1);

                    // remove downloaded data
                    if (clearOnFail) {
                        // const m = plugin.state.data.select(modelRef)[0];
                        // const t = plugin.state.data.select(m.transform.parent)[0];
                        // const d = plugin.state.data.select(t.transform.parent)[0];
                        // PluginCommands.State.RemoveObject(plugin, { state: d.parent!, ref: d.transform.parent, removeParentGhosts: true });
                    }
                } else {
                    // if(interactingHets.length > 0) spState.hets[`${s.pdb_id}_${s.struct_asym_id}`] = interactingHets;
                }

            }
        }
        if (busyFlagOn) {
            busyFlagOn = false;
            customState.events?.isBusy.next(false);
        }
    });
}

function assignLigandClusterColor(plugin: PluginContext, pdbId: string, labelAsymId: string): Color | 'hide' | undefined {
    const customState = PluginCustomState(plugin);
    if (!customState?.superpositionState?.ligandClusterData) {
        return undefined;
    }
    const ligandData = customState.superpositionState.ligandClusterData[pdbId] ?? [];
    const record = ligandData.find(x => x.label_asym_id === labelAsymId);
    if (record) {
        if (record.cluster_id !== null && record.cluster_id !== undefined && record.cluster_id >= 0) {
            // clustered
            return LigandClusterPalette[record.cluster_id % LigandClusterPalette.length];
        } else {
            // noise
            if (customState.initParams?.superpositionParams?.ligandClustering?.noiseColor === 'hide') {
                return 'hide';
            } else {
                return normalizeColor(customState.initParams?.superpositionParams?.ligandClustering?.noiseColor, DefaultLigandColor);
            }
        }
    } else {
        // missing
        if (customState.initParams?.superpositionParams?.ligandClustering?.missingColor === 'hide') {
            return 'hide';
        } else {
            return normalizeColor(customState.initParams?.superpositionParams?.ligandClustering?.missingColor, ColorNames.white);
        }
    }
}

async function getLigandNamesFromModelData(plugin: PluginContext, modelRef: string) {
    const model = getModelFromModelRef(plugin, modelRef);
    if (!model) return;

    const structures: any[] = [];
    for (const s of plugin.managers.structure.hierarchy.selection.structures) {
        const structure = s.cell.obj?.data;
        if (structure) structures.push(structure);
    }

    const info = await ModelInfo.get(model, structures);
    return info;
}

interface LigandRecord {
    label_asym_id: string,
    auth_asym_id: string,
    label_comp_id: string,
}

function getModelFromModelRef(plugin: PluginContext, modelRef: string): Model | undefined {
    const cell = plugin.state.data.select(modelRef)[0];
    const model = cell?.obj?.data as Model | undefined;
    return model;
}
function getLigandInfo(model: Model) {
    const h = model.atomicHierarchy;
    const nChains = h.chains._rowCount;
    const result: { [auth_asym_id: string]: LigandRecord[] } = {};
    for (let iChain = 0 as ChainIndex; iChain < nChains; iChain++) {
        const auth_asym_id = h.chains.auth_asym_id.value(iChain);
        const label_asym_id = h.chains.label_asym_id.value(iChain);
        const iEntity = h.index.getEntityFromChain(iChain);
        const entityType = model.entities.data.type.value(iEntity);
        if (entityType === 'non-polymer') {
            const iFirstAtom = h.chainAtomSegments.offsets[iChain];
            const label_comp_id = h.atoms.label_comp_id.value(iFirstAtom);
            (result[auth_asym_id] ??= []).push({ label_asym_id, auth_asym_id, label_comp_id });
        }
    }
    return result;
}


async function loadStructure(plugin: PluginContext, url: string, format: BuiltInTrajectoryFormat, isBinary?: boolean) {
    try {
        const data = await plugin.builders.data.download({ url: Asset.Url(url), isBinary: isBinary });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, format);
        const model = await plugin.builders.structure.createModel(trajectory);
        const modelProperties = await plugin.builders.structure.insertModelProperties(model);
        const structure = await plugin.builders.structure.createStructure(modelProperties || model, { name: 'model', params: {} });
        await plugin.builders.structure.insertStructureProperties(structure);

        return { data, trajectory, model, structure };
    } catch (e) {
        return { structure: void 0 };
    }
}

function chainSelection(struct_asym_id: string) {
    return MS.struct.generator.atomGroups({
        'chain-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_asym_id(), struct_asym_id])
    });
}

/** Apply tranformation to a structure. Only use once per structure, combining multiple transformations is not implemented. */
export function transform(plugin: PluginContext, s: StateObjectRef<PSO.Molecule.Structure>, matrix: Mat4) {
    const b = plugin.state.data.build().to(s)
        .insert(StateTransforms.Model.TransformStructureConformation, { transform: { name: 'matrix', params: { data: matrix, transpose: false } } });
    return plugin.runTask(plugin.state.data.updateTree(b));
}

async function afTransform(plugin: PluginContext, s: StateObjectRef<PluginStateObject.Molecule.Structure>, matrix: Mat4, coordinateSystem?: SymmetryOperator) {
    const r = StateObjectRef.resolveAndCheck(plugin.state.data, s);
    if (!r) return;
    const o = plugin.state.data.selectQ(q => q.byRef(r.transform.ref).subtree().withTransformer(StateTransforms.Model.TransformStructureConformation))[0];

    const transform = coordinateSystem && !Mat4.isIdentity(coordinateSystem.matrix)
        ? Mat4.mul(Mat4(), coordinateSystem.matrix, matrix)
        : matrix;

    const params = {
        transform: {
            name: 'matrix' as const,
            params: { data: transform, transpose: false }
        }
    };
    const b = o
        ? plugin.state.data.build().to(o).update(params)
        : plugin.state.data.build().to(s)
            .insert(StateTransforms.Model.TransformStructureConformation, params, { tags: 'SuperpositionTransform' });
    await plugin.runTask(plugin.state.data.updateTree(b));
}

async function getMatrixData(plugin: PluginContext) {
    const customState = PluginCustomState(plugin);
    if (!customState.initParams) throw new Error('customState.initParams has not been initialized');
    if (!customState.superpositionState) throw new Error('customState.superpositionState has not been initialized');

    const matrixAccession = customState.initParams.superpositionParams?.matrixAccession ?? customState.initParams.moleculeId;
    const clusterRecUrlStr = `${customState.initParams.pdbeUrl}static/superpose/matrices/${matrixAccession}`;
    const assetManager = plugin.managers.asset;
    const clusterRecUrl = Asset.getUrlAsset(assetManager, clusterRecUrlStr);
    try {
        const clusterRecData = await plugin.runTask(assetManager.resolve(clusterRecUrl, 'json', false));
        if (clusterRecData?.data) {
            customState.superpositionState.matrixData = clusterRecData.data;
        }
    } catch (e) {
        customState.superpositionError = `Matrix data not available for ${matrixAccession}`;
        customState.events?.superpositionInit.next(true); // Emit segment API data load event
    }
}

/** Download data about segment clustering and save in plugin custom state */
async function getSegmentData(plugin: PluginContext) {
    const customState = PluginCustomState(plugin);
    if (!customState.initParams) throw new Error('customState.initParams has not been initialized');
    if (!customState.superpositionState) throw new Error('customState.superpositionState has not been initialized');

    // Get Data
    const segmentsUrl = `${customState.initParams.pdbeUrl}graph-api/uniprot/superposition/${customState.initParams.moleculeId}`;
    const assetManager = plugin.managers.asset;
    const url = Asset.getUrlAsset(assetManager, segmentsUrl);
    try {
        const result = await plugin.runTask(assetManager.resolve(url, 'json', false));
        if (result?.data) {
            customState.superpositionState.segmentData = result.data[customState.initParams.moleculeId!];
        }
    } catch (e) {
        customState.superpositionError = `Superposition data not available for ${customState.initParams.moleculeId}`;
        customState.events?.superpositionInit.next(true); // Emit segment API data load event
    }
}

interface LigandClusteringRecord {
    label_comp_id?: string | null,
    label_asym_id: string,
    auth_asym_id: string,
    auth_seq_id?: number,
    cluster_id?: number | null,
    cluster_color?: string,
}
export interface LigandClusteringData {
    [pdbId: string]: LigandClusteringRecord[],
}

async function getLigandClusteringData(plugin: PluginContext): Promise<LigandClusteringData | undefined> {
    const customState = PluginCustomState(plugin);
    if (!customState.initParams) throw new Error('customState.initParams has not been initialized');
    if (!customState.superpositionState) throw new Error('customState.superpositionState has not been initialized');
    const serverUrl = customState.initParams.superpositionParams?.ligandClustering?.url;
    if (!serverUrl) return undefined;
    if (!customState.initParams.moleculeId) return undefined;

    const url = `${serverUrl.replace(/\/$/, '')}/${customState.initParams.moleculeId}`;
    const assetManager = plugin.managers.asset;
    const urlAsset = Asset.getUrlAsset(assetManager, url);
    try {
        const result = await plugin.runTask(assetManager.resolve(urlAsset, 'json', false));
        if (result.data) {
            return result.data[customState.initParams.moleculeId];
        } else {
            return undefined;
        }
    } catch (e) {
        customState.superpositionError = `Ligand clustering data not available for ${customState.initParams.moleculeId}`;
        customState.events?.superpositionInit.next(true); // Emit segment API data load event
    }

}

function getChainLigands(carbEntity: any) {
    const ligandChain: string[] = [];
    const ligandLabels: string[] = [];
    const ligands: string[][] = [];

    const labelValueArr = [];
    let ligNameStr = '';
    for (const chemComp of carbEntity.chem_comp_list) {
        labelValueArr.push(`${chemComp.chem_comp_id} (${chemComp.count})`);
    }
    ligNameStr = labelValueArr.join(', ');

    for (const chain of carbEntity.chains) {
        ligandChain.push(chain.chain_id);
        ligandLabels.push(ligNameStr);
        const chainLigands = [];
        for (const residue of chain.residues) {
            chainLigands.push(residue.chem_comp_id + '-' + residue.residue_number);
        }
        ligands.push(chainLigands);
    }

    return {
        ligands,
        ligandChain,
        ligandLabels
    };
}

async function getCarbPolymerDetailsFromApi(plugin: PluginContext, pdb_id: string) {
    const customState = PluginCustomState(plugin);
    if (!customState.initParams) throw new Error('customState.initParams has not been initialized');

    // Get Data
    const apiUrl = `${customState.initParams.pdbeUrl}api/pdb/entry/carbohydrate_polymer/${pdb_id}`;
    const assetManager = plugin.managers.asset;
    const url = Asset.getUrlAsset(assetManager, apiUrl);
    let branchedLigands: string[][] = [];
    let branchedChains: string[] = [];
    let branchedlabels: string[] = [];
    try {
        const result = await plugin.runTask(assetManager.resolve(url, 'json', false));
        if (result && result.data) {
            const carbEntities = result.data[pdb_id];
            for (const carbEntity of carbEntities) {
                const carbLigData = getChainLigands(carbEntity);
                branchedLigands = branchedLigands.concat(carbLigData.ligands);
                branchedChains = branchedChains.concat(carbLigData.ligandChain);
                branchedlabels = branchedlabels.concat(carbLigData.ligandLabels);
            }
        }
    } catch (e) { }

    return {
        branchedChains,
        branchedLigands,
        branchedlabels
    };
}