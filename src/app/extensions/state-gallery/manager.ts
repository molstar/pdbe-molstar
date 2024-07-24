import { Sphere3D } from 'molstar/lib/mol-math/geometry';
import { Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { PluginCommands } from 'molstar/lib/mol-plugin/commands';
import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { arrayDistinct } from 'molstar/lib/mol-util/array';
import { isPlainObject } from 'molstar/lib/mol-util/object';
import { BehaviorSubject } from 'rxjs';
import { PreemptiveQueue, combineUrl } from '../../helpers';


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

interface Image {
    filename: string,
    alt: string,
    description: string,
    clean_description: string,
}


const SPHERE_TOLERANCE = 0.02;

export class StateGalleryManager {
    public readonly images: Image[];
    public readonly requestedStateName = new BehaviorSubject<string | undefined>(undefined);
    public readonly loadedStateName = new BehaviorSubject<string | undefined>(undefined);

    private constructor(
        public readonly plugin: PluginContext,
        public readonly serverUrl: string,
        public readonly entryId: string,
        public readonly data: StateGalleryData | undefined,
    ) {
        this.images = removeWithSuffixes(listImages(data, true), ['_side', '_top']); // TODO allow suffixes by a parameter, sort by parameter
    }

    static async create(plugin: PluginContext, serverUrl: string, entryId: string) {
        const data = await getData(plugin, serverUrl, entryId);
        console.log('data:', data);
        if (data === undefined) {
            console.error(`StateGalleryManager failed to get data for entry ${entryId}`);
        }
        return new this(plugin, serverUrl, entryId, data);
    }

    private async _load(filename: string): Promise<string> {
        const file = await this.getSnapshot(filename);
        const oldSphere = getVisibleBoundingSphere(this.plugin);
        await PluginCommands.State.Snapshots.OpenFile(this.plugin, { file });
        // await this.plugin.managers.snapshot.setStateSnapshot(json.data);
        this.plugin.canvas3d?.commit();
        const newSphere = getVisibleBoundingSphere(this.plugin);
        if (sphereDelta(oldSphere, newSphere) >= SPHERE_TOLERANCE) { // TODO doesn't work for manually changed camera
            await PluginCommands.Camera.Reset(this.plugin);
        }
        this.loadedStateName.next(filename);
        return filename;
    }
    private readonly loader = new PreemptiveQueue((filename: string) => this._load(filename));
    async load(filename: string) {
        this.requestedStateName.next(filename);
        return await this.loader.requestRun(filename);
    }

    private readonly cache: { [filename: string]: File } = {};
    private async fetchSnapshot(filename: string): Promise<File> {
        const fullFilename = `${filename}.molj`;
        const url = combineUrl(this.serverUrl, fullFilename);
        let data = await this.plugin.runTask(this.plugin.fetch({ url, type: 'string' }));
        data = mutilateSnapshot(data, { removeBackground: true, removeCamera: true });
        return new File([data], fullFilename);
    }
    async getSnapshot(filename: string): Promise<File> {
        return this.cache[filename] ??= await this.fetchSnapshot(filename);
    }
}


async function getData(plugin: PluginContext, serverUrl: string, entryId: string) {
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
        out.push(...data?.entry?.all?.image ?? []);
        // Validation
        out.push(...data?.validation?.geometry?.deposited?.image ?? []);
        // Bfactor
        out.push(...data?.entry?.bfactor?.image ?? []);
        // Assembly
        const assemblies = data?.assembly;
        for (const ass in assemblies) {
            out.push(...assemblies[ass].image);
        }
        // Entity
        const entities = data?.entity;
        for (const entity in entities) {
            out.push(...entities[entity].image);
        }
        // Ligand
        const ligands = data?.entry?.ligands;
        for (const ligand in ligands) {
            out.push(...ligands[ligand].image);
        }
        // Modres
        const modres = data?.entry?.mod_res;
        for (const res in modres) {
            out.push(...modres[res].image);
        }
        // Domain
        for (const entity in entities) {
            const dbs = entities[entity].database;
            for (const db in dbs) {
                const domains = dbs[db];
                for (const domain in domains) {
                    out.push(...domains[domain].image);
                }
            }
        }

        // Any other potential images not caught in categories above
        pushImages(out, data);
        return arrayDistinct(out as any) as any;
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

function mutilateSnapshot(snapshot: string, options: { removeBackground?: boolean, removeCamera?: boolean }) {
    const json = JSON.parse(snapshot);
    if (json.entries) {
        for (const entry of json.entries) {
            if (entry.snapshot) {
                if (options.removeBackground) delete entry.snapshot.canvas3d;
                if (options.removeCamera) delete entry.snapshot.camera;
            }
        }
    }
    return JSON.stringify(json);
}

/** Arbitrary measure of difference between two spheres, scale-invariant. */
function sphereDelta(a: Sphere3D | undefined, b: Sphere3D | undefined): number {
    if (!a || !b) return Infinity;
    const deltaCenter = Vec3.distance(a.center, b.center);
    const deltaRadius = Math.abs(a.radius - b.radius);
    return (deltaCenter + deltaRadius) / (a.radius + b.radius);
}

/** Return a deep copy of bounding sphere of current visible scene. */
function getVisibleBoundingSphere(plugin: PluginContext): Sphere3D | undefined {
    const sphere = plugin.canvas3d?.boundingSphereVisible;
    if (sphere === undefined) return undefined;
    return {
        center: Vec3.copy(Vec3(), sphere.center),
        radius: sphere.radius,
    };
}
