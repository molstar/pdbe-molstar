import { Camera } from 'molstar/lib/mol-canvas3d/camera';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginStateSnapshotManager } from 'molstar/lib/mol-plugin-state/manager/snapshots';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { isPlainObject } from 'molstar/lib/mol-util/object';
import { sleep } from 'molstar/lib/mol-util/sleep';
import { BehaviorSubject } from 'rxjs';
import { PreemptiveQueue, PreemptiveQueueResult, combineUrl, createIndex, distinct, nonnegativeModulo } from '../../helpers';
import { StateGalleryCustomState } from './behavior';
import { StateGalleryConfigValues, getStateGalleryConfig } from './config';
import { ImageTitles } from './titles';
import { StringLike } from 'molstar/lib/mol-io/common/string-like';


/** Shape of data coming from `https://www.ebi.ac.uk/pdbe/static/entry/{entryId}.json`[entryId] */
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

/** Categories of images/states */
export const ImageCategory = ['Entry', 'Assemblies', 'Entities', 'Ligands', 'Modified residues', 'Domains', 'Miscellaneous'] as const;
export type ImageCategory = typeof ImageCategory[number];

/** Information about one image (3D state) */
export interface Image {
    /** Image filename without extension (.molj, _image-800x800.png, .caption.json...), used to construct URL */
    filename: string,
    /** Short description of the image */
    alt?: string,
    /** Long description of the image, with HTML markup */
    description?: string,
    /** Long description of the image, plaintext */
    clean_description?: string,
    /** Assignment to a category (does not come from the API) */
    category?: ImageCategory,
    /** Short title for display in the UI (does not come from the API) */
    title?: string,
    /** Additional information (e.g. entity name) for display in the UI as subtitle (does not come from the API) */
    subtitle?: string,
}


/** Current status of a StateGalleryManager ('ready' = last requested image loaded successfully or no image requested yet, 'loading' = last requested image not resolved yet, 'error' = last requested image failed to load) */
export type LoadingStatus = 'ready' | 'loading' | 'error';


/** Provides functionality to get list of images (3D states) for an entry, load individual images, keeps track of the currently loaded image.
 * Use async `StateGalleryManager.create()` to create an instance. */
export class StateGalleryManager {
    /** List of images (3D states) for entry `this.entryId` */
    public readonly images: Image[];
    /** Maps image filename to its index within `this.images` */
    private readonly filenameIndex: Map<string, number>;
    /** BehaviorSubjects for current state of the manager */
    public readonly events = {
        /** Image that has been requested to load most recently. */
        requestedImage: new BehaviorSubject<Image | undefined>(undefined),
        /** Image that has been successfully loaded most recently. Undefined if another state has been requested since. */
        loadedImage: new BehaviorSubject<Image | undefined>(undefined),
        /** Loading status. */
        status: new BehaviorSubject<LoadingStatus>('ready'),
    };
    /** True if at least one image has been loaded (this is to skip animation on the first load) */
    private firstLoaded = false;

    private constructor(
        public readonly plugin: PluginContext,
        /** Entry identifier, i.e. '1cbs' */
        public readonly entryId: string,
        /** Data retrieved from API */
        public readonly data: StateGalleryData | undefined,
        /** Config values */
        public readonly options: StateGalleryConfigValues,
    ) {
        const allImages = listImages(data, true);
        this.images = removeWithSuffixes(allImages, ['_side', '_top']); // removing images in different orientation than 'front'
        this.filenameIndex = createIndex(this.images.map(img => img.filename));
        this.events.status.subscribe(status => {
            const customState = StateGalleryCustomState(this.plugin);
            customState.status?.next(status);
            if (customState.manager?.value !== this) customState.manager?.next(this);
        });
        this.events.requestedImage.subscribe(img => {
            const customState = StateGalleryCustomState(this.plugin);
            customState.requestedImage?.next(img);
            if (customState.manager?.value !== this) customState.manager?.next(this);
        });
    }

    /** Create an instance of `StateGalleryManager` and retrieve list of images from API.
     * Options that are not provided will use values from plugin config. */
    static async create(plugin: PluginContext, entryId: string, options?: Partial<StateGalleryConfigValues>) {
        const fullOptions = { ...getStateGalleryConfig(plugin), ...options };
        const data = await getData(plugin, fullOptions.ServerUrl, entryId);
        if (data === undefined) {
            console.error(`StateGalleryManager failed to get data for entry ${entryId}`);
        }
        return new this(plugin, entryId, data, fullOptions);
    }

    /** Load an image (3D state). Do not call directly; use `load` instead, which handles concurrent requests. */
    private async _load(filename: string): Promise<void> {
        if (!this.plugin.canvas3d) throw new Error('plugin.canvas3d is not defined');

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

    /** Request to load an image (3D state). When there are multiple concurrent requests, some requests may be skipped (will resolve to `{ status: 'cancelled' }` or `{ status: 'skipped' }`) as only the last request is really important. */
    async load(img: Image | string): Promise<PreemptiveQueueResult<void>> {
        if (typeof img === 'string') {
            img = this.getImageByFilename(img) ?? { filename: img };
        }
        this.events.requestedImage.next(img);
        this.events.loadedImage.next(undefined);
        this.events.status.next('loading');
        let result;
        try {
            result = await this.loader.requestRun(img.filename);
            return result;
        } finally {
            if (result?.status === 'completed') {
                this.events.loadedImage.next(img);
                this.events.status.next('ready');
            }
            // if resolves with result.status 'cancelled' or 'skipped', keep current state
            if (!result) {
                this.events.status.next('error');
            }
        }
    }
    /** Move to next/previous image in the list. */
    private async shift(shift: number) {
        const current = this.events.requestedImage.value;
        const iCurrent = (current !== undefined) ? this.filenameIndex.get(current.filename) : undefined;
        let iNew = (iCurrent !== undefined) ? (iCurrent + shift) : (shift > 0) ? (shift - 1) : shift;
        iNew = nonnegativeModulo(iNew, this.images.length);
        return await this.load(this.images[iNew]);
    }
    /** Request to load the previous image in the list */
    async loadPrevious() {
        return await this.shift(-1);
    }
    /** Request to load the next image in the list */
    async loadNext() {
        return await this.shift(1);
    }

    /** Cache for MOLJ states from API */
    private readonly cache: { [filename: string]: string } = {};
    /** Fetch a MOLJ state from API */
    private async fetchSnapshot(filename: string): Promise<string> {
        const url = combineUrl(this.options.ServerUrl, `${filename}.molj`);
        const data = await this.plugin.runTask(this.plugin.fetch({ url, type: 'string' }));
        return StringLike.toString(data);
    }
    /** Get MOLJ state for the image (get from cache or fetch from API) */
    async getSnapshot(filename: string): Promise<string> {
        return this.cache[filename] ??= await this.fetchSnapshot(filename);
    }
    /** Get full image information based on filename. Return `undefined` if image with given filename is not in the list. */
    private getImageByFilename(filename: string): Image | undefined {
        const index = this.filenameIndex.get(filename);
        if (index === undefined) return undefined;
        return this.images[index];
    }
}


/** Get the list of images, captions etc. for an entry from API */
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
            out.push({ ...img, category: 'Entry', ...ImageTitles.entry(img) });
        }
        // Validation
        for (const img of data?.validation?.geometry?.deposited?.image ?? []) {
            out.push({ ...img, category: 'Entry', ...ImageTitles.validation(img) });
        }
        // Bfactor
        for (const img of data?.entry?.bfactor?.image ?? []) {
            out.push({ ...img, category: 'Entry', ...ImageTitles.bfactor(img) });
        }
        // Assembly
        const assemblies = data?.assembly;
        for (const assemblyId in assemblies) {
            for (const img of assemblies[assemblyId].image ?? []) {
                out.push({ ...img, category: 'Assemblies', ...ImageTitles.assembly(img, { assemblyId }) });
            }
        }
        // Entity
        const entities = data?.entity;
        for (const entityId in entities) {
            for (const img of entities[entityId].image ?? []) {
                out.push({ ...img, category: 'Entities', ...ImageTitles.entity(img, { entityId }) });
            }
        }
        // Ligand
        const ligands = data?.entry?.ligands;
        for (const compId in ligands) {
            for (const img of ligands[compId].image ?? []) {
                out.push({ ...img, category: 'Ligands', ...ImageTitles.ligand(img, { compId }) });
            }
        }
        // Modres
        const modres = data?.entry?.mod_res;
        for (const compId in modres) {
            for (const img of modres[compId].image ?? []) {
                out.push({ ...img, category: 'Modified residues', ...ImageTitles.modres(img, { compId }) });
            }
        }
        // Domain
        for (const entityId in entities) {
            const dbs = entities[entityId].database;
            for (const db in dbs) {
                const domains = dbs[db];
                for (const familyId in domains) {
                    for (const img of domains[familyId].image ?? []) {
                        out.push({ ...img, category: 'Domains', ...ImageTitles.domain(img, { db, familyId, entityId }) });
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

/** Return a filtered list of images, removing all images with filename ending in one of `suffixes` */
function removeWithSuffixes(images: Image[], suffixes: string[]): Image[] {
    return images.filter(img => !suffixes.some(suffix => img.filename.endsWith(suffix)));
}

function modifySnapshot(snapshot: string, options: { removeCanvasProps?: boolean, replaceCamera?: { camera: Camera.Snapshot, transitionDurationInMs: number } }) {
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
        }
    }
    return JSON.stringify(json);
}

function getCameraFromSnapshot(snapshot: string): Camera.Snapshot | undefined {
    const json = JSON.parse(snapshot);
    return json?.entries?.[0]?.snapshot?.camera?.current;
}

/** Recalculate camera distance from target in `snapshot` based on `snapshot.radius`,
 * keeping target, direction, and up from snapshot but using camera mode and FOV from `camera`. */
function refocusCameraSnapshot(camera: Camera, snapshot: Camera.Snapshot | undefined) {
    if (snapshot === undefined) return undefined;
    const dir = Vec3.sub(Vec3(), snapshot.target, snapshot.position);
    return camera.getInvariantFocus(snapshot.target, snapshot.radius, snapshot.up, dir);
}

/** Get current camera positioning */
function getCurrentCamera(plugin: PluginContext): Camera.Snapshot {
    if (!plugin.canvas3d) return Camera.createDefaultSnapshot();
    plugin.canvas3d.commit();
    return plugin.canvas3d.camera.getSnapshot();
}
