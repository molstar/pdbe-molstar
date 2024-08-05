import { Camera } from 'molstar/lib/mol-canvas3d/camera';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginStateSnapshotManager } from 'molstar/lib/mol-plugin-state/manager/snapshots';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { isPlainObject } from 'molstar/lib/mol-util/object';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { BehaviorSubject } from 'rxjs';
import { PreemptiveQueue, PreemptiveQueueResult, combineUrl, createIndex, distinct } from '../../helpers';
import { StateGalleryConfigValues, getStateGalleryConfig } from './config';


export interface StateGalleryData {
    entity?: {
        [entityId: string]: {
            image: Image[],
            database?: {
                [databaseName: string]: {
                    [domainId: string]: {
                        image: Image[],
                    },
                },
            },
        },
    },
    assembly?: {
        [assemblyId: string]: {
            image: Image[],
            preferred?: boolean,
        },
    },
    entry?: {
        all?: {
            image: Image[],
        },
        bfactor?: {
            image: Image[],
        },
        ligands?: {
            [compId: string]: {
                image: Image[],
                entity?: string,
                number_of_instances?: number,
            },
        },
        mod_res?: {
            [compId: string]: {
                image: Image[],
            },
        },
    },
    validation?: {
        geometry?: {
            deposited?: {
                image: Image[],
            },
        },
    },
    image_suffix?: string[],
    last_modification?: string,
}
const ImageCategory = ['Entry', 'Assemblies', 'Entities', 'Ligands', 'Modified residues', 'Domains', 'Miscellaneous'] as const;
type ImageCategory = typeof ImageCategory[number]

export interface Image {
    filename: string,
    alt: string,
    description: string,
    clean_description: string,
    category?: ImageCategory,
    simple_title?: string,
}


export class StateGalleryManager {
    public readonly images: Image[]; // TODO Rename to states, add docstring
    /** Maps filename to its index within `this.images` */
    private readonly filenameIndex: Map<string, number>;
    public readonly requestedStateName = new BehaviorSubject<string | undefined>(undefined); // TODO remove if not needed
    public readonly loadedStateName = new BehaviorSubject<string | undefined>(undefined); // TODO remove if not needed
    /** True if at least one state has been loaded (this is to skip animation on the first load) */
    private firstLoaded = false;

    private constructor(
        public readonly plugin: PluginContext,
        public readonly entryId: string,
        public readonly data: StateGalleryData | undefined,
        public readonly options: StateGalleryConfigValues,
    ) {
        const allImages = listImages(data, true);
        this.images = removeWithSuffixes(allImages, ['_side', '_top']); // removing images in different orientation than 'front'
        this.filenameIndex = createIndex(this.images.map(img => img.filename));
    }

    static async create(plugin: PluginContext, entryId: string, options?: Partial<StateGalleryConfigValues>) {
        const fullOptions = { ...getStateGalleryConfig(plugin), ...options };
        const data = await getData(plugin, fullOptions.ServerUrl, entryId);
        if (data === undefined) {
            console.error(`StateGalleryManager failed to get data for entry ${entryId}`);
        }
        return new this(plugin, entryId, data, fullOptions);
    }

    private async _load(filename: string): Promise<void> {
        if (!this.plugin.canvas3d) throw new Error('plugin.canvas3d is not defined');

        const state = this.getImageByFilename(filename);
        let snapshot = await this.getSnapshot(filename);
        const oldCamera = getCurrentCamera(this.plugin);
        const incomingCamera = getCameraFromSnapshot(snapshot); // Camera position from the MOLJ file, which may be incorrectly zoomed if viewport width < height
        const newCamera: Camera.Snapshot = { ...oldCamera, ...refocusCameraSnapshot(this.plugin.canvas3d.camera, incomingCamera) };
        snapshot = modifySnapshot(snapshot, {
            removeCanvasProps: !this.options.LoadCanvasProps,
            replaceCamera: {
                camera: (this.options.LoadCameraOrientation && !this.firstLoaded) ? newCamera : oldCamera,
                transitionDurationInMs: 0,
            },
            description: state?.simple_title,
        });
        await this.plugin.managers.snapshot.setStateSnapshot(JSON.parse(snapshot));
        await sleep(this.firstLoaded ? this.options.CameraPreTransitionMs : 0); // it is necessary to sleep even for 0 ms here, to get animation
        await PluginCommands.Camera.Reset(this.plugin, {
            snapshot: this.options.LoadCameraOrientation ? newCamera : undefined,
            durationMs: this.firstLoaded ? this.options.CameraTransitionMs : 0,
        });

        this.firstLoaded = true;
    }
    private readonly loader = new PreemptiveQueue((filename: string) => this._load(filename));
    async load(filename: string): Promise<PreemptiveQueueResult<void>> {
        this.requestedStateName.next(filename);
        this.loadedStateName.next(undefined);
        const result = await this.loader.requestRun(filename);
        if (result.status === 'completed') {
            this.loadedStateName.next(filename);
        }
        return result;
    }

    private readonly cache: { [filename: string]: string } = {};
    private async fetchSnapshot(filename: string): Promise<string> {
        const url = combineUrl(this.options.ServerUrl, `${filename}.molj`);
        const data = await this.plugin.runTask(this.plugin.fetch({ url, type: 'string' }));
        return data;
    }
    async getSnapshot(filename: string): Promise<string> {
        return this.cache[filename] ??= await this.fetchSnapshot(filename);
    }
    private getImageByFilename(filename: string): Image | undefined {
        const index = this.filenameIndex.get(filename);
        if (index === undefined) return undefined;
        return this.images[index];
    }
}


async function getData(plugin: PluginContext, serverUrl: string, entryId: string): Promise<StateGalleryData | undefined> {
    const url = combineUrl(serverUrl, entryId + '.json');
    try {
        const text = await plugin.runTask(plugin.fetch(url));
        const data = JSON.parse(text);
        return data[entryId];
    } catch {
        return undefined;
    }
}

function listImages(data: StateGalleryData | undefined, byCategory: boolean = false): Image[] {
    if (byCategory) {
        const out: Image[] = [];

        // Entry
        for (const img of data?.entry?.all?.image ?? []) {
            const title = img.filename.includes('_chemically_distinct_molecules')
                ? 'Deposited model (color by entity)'
                : img.filename.includes('_chain')
                    ? 'Deposited model (color by chain)'
                    : undefined;
            out.push({ ...img, category: 'Entry', simple_title: title });
        }
        // Validation
        for (const img of data?.validation?.geometry?.deposited?.image ?? []) {
            out.push({ ...img, category: 'Entry', simple_title: 'Geometry validation' });
        }
        // Bfactor
        for (const img of data?.entry?.bfactor?.image ?? []) {
            out.push({ ...img, category: 'Entry', simple_title: 'B-factor' });
        }
        // Assembly
        const assemblies = data?.assembly;
        for (const ass in assemblies) {
            for (const img of assemblies[ass].image ?? []) {
                const title = img.filename.includes('_chemically_distinct_molecules')
                    ? `Assembly ${ass} (color by entity)`
                    : img.filename.includes('_chain')
                        ? `Assembly ${ass} (color by chain)`
                        : undefined;
                out.push({ ...img, category: 'Assemblies', simple_title: title });
            }
        }
        // Entity
        const entities = data?.entity;
        for (const entity in entities) {
            for (const img of entities[entity].image ?? []) {
                out.push({ ...img, category: 'Entities', simple_title: `Entity ${entity}` });
            }
        }
        // Ligand
        const ligands = data?.entry?.ligands;
        for (const ligand in ligands) {
            for (const img of ligands[ligand].image ?? []) {
                out.push({ ...img, category: 'Ligands', simple_title: `Ligand environment for ${ligand}` });
            }
        }
        // Modres
        const modres = data?.entry?.mod_res;
        for (const res in modres) {
            for (const img of modres[res].image ?? []) {
                out.push({ ...img, category: 'Modified residues', simple_title: `Modified residue ${res}` });
            }
        }
        // Domain
        for (const entity in entities) {
            const dbs = entities[entity].database;
            for (const db in dbs) {
                const domains = dbs[db];
                for (const domain in domains) {
                    for (const img of domains[domain].image ?? []) {
                        out.push({ ...img, category: 'Domains', simple_title: `${db} ${domain} (entity ${entity})` });
                    }
                }
            }
        }

        // Any other potential images not caught in categories above
        pushImages(out, data);
        return distinct(out, img => img.filename);
    } else {
        return pushImages([], data);
    }
}

function pushImages(out: Image[], data: any): Image[] {
    if (isPlainObject(data)) {
        for (const key in data) {
            const value = data[key];
            if (key === 'image' && Array.isArray(value)) {
                out.push(...value);
            } else {
                pushImages(out, value);
            }
        }
    }
    return out;
}

function removeWithSuffixes(images: Image[], suffixes: string[]): Image[] {
    return images.filter(img => !suffixes.some(suffix => img.filename.endsWith(suffix)));
}

function modifySnapshot(snapshot: string, options: { removeCanvasProps?: boolean, replaceCamera?: { camera: Camera.Snapshot, transitionDurationInMs: number }, description?: string | null }) {
    const json = JSON.parse(snapshot) as PluginStateSnapshotManager.StateSnapshot;
    for (const entry of json.entries ?? []) {
        if (entry.snapshot) {
            if (options.removeCanvasProps && entry.snapshot.canvas3d) {
                delete entry.snapshot.canvas3d.props;
            }
            if (options.replaceCamera) {
                const { camera, transitionDurationInMs } = options.replaceCamera;
                entry.snapshot.camera = {
                    current: camera,
                    transitionStyle: transitionDurationInMs > 0 ? 'animate' : 'instant',
                    transitionDurationInMs: transitionDurationInMs > 0 ? transitionDurationInMs : undefined,
                };
            }
            if (typeof options.description === 'string') {
                entry.description = options.description;
            } else if (options.description === null) {
                delete entry.description;
            }
        }
    }
    return JSON.stringify(json);
}

function getCameraFromSnapshot(snapshot: string): Camera.Snapshot | undefined {
    const json = JSON.parse(snapshot);
    return json?.entries?.[0]?.snapshot?.camera?.current;
}

function refocusCameraSnapshot(camera: Camera, snapshot: Camera.Snapshot | undefined) {
    if (snapshot === undefined) return undefined;
    const dir = Vec3.sub(Vec3(), snapshot.target, snapshot.position);
    return camera.getInvariantFocus(snapshot.target, snapshot.radius, snapshot.up, dir);
}

function getCurrentCamera(plugin: PluginContext): Camera.Snapshot {
    if (!plugin.canvas3d) return Camera.createDefaultSnapshot();
    plugin.canvas3d.commit();
    return plugin.canvas3d.camera.getSnapshot();
}
