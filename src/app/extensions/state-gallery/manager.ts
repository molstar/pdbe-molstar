import { PluginContext } from 'molstar/lib/mol-plugin/context';
import { isPlainObject } from 'molstar/lib/mol-util/object';
import { combineUrl } from '../../helpers';


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


export class StateGalleryManager {
    public readonly images: Image[];

    private constructor(
        public readonly plugin: PluginContext,
        public readonly serverUrl: string,
        public readonly entryId: string,
        public readonly data: StateGalleryData | undefined,
    ) {
        this.images = removeWithSuffixes(listImages(data), ['_side', '_top']); // TODO allow suffixes by a parameter
    }

    public static async create(plugin: PluginContext, serverUrl: string, entryId: string) {
        const data = await getData(plugin, serverUrl, entryId);
        console.log('data:', data);
        if (data === undefined) {
            console.error(`StateGalleryManager failed to get data for entry ${entryId}`);
        }
        return new this(plugin, serverUrl, entryId, data);
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

function listImages(data: StateGalleryData | undefined): Image[] {
    return pushImages([], data);
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
