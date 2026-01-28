import { createMVSX } from 'molstar/lib/extensions/mvs/export';
import { MVSData } from 'molstar/lib/extensions/mvs/mvs-data';
import { Tree } from 'molstar/lib/extensions/mvs/tree/generic/tree-schema';
import { dfs } from 'molstar/lib/extensions/mvs/tree/generic/tree-utils';
import { ajaxGet } from 'molstar/lib/mol-util/data-source';
import { deepClone } from 'molstar/lib/mol-util/object';


// TODO: remove this as soon as provided directly by core Molstar
/** @experimental Encode `MVSData` to MVSX (MolViewSpec JSON zipped together with referenced assets). Automatically fetches all referenced assets unless specified otherwise in `options`. */
export async function toMVSX(mvsData: MVSData, options: {
    /** Explicitely define assets to be included in the MVSX (binary data or string with asset content).
     * If not specified, assets will be fetched automatically. */
    assets?: { [uri: string]: Uint8Array<ArrayBuffer> | string },
    /** Base URI for resolving relative URIs (only applies if `assets` not specified). */
    baseUri?: string,
    /** Do not include external resources (i.e. absolute URIs) in the MVSX (default is to include both relative and absolute URIs) (only applies if `assets` not specified). */
    skipExternal?: boolean,
    /** Optional cache for sharing fetched assets across multiple `toMVSX` calls (only applies if `assets` not specified). */
    cache?: { [absoluteUri: string]: Uint8Array<ArrayBuffer> | string },
} = {}): Promise<Uint8Array<ArrayBuffer>> {
    let { assets, baseUri, skipExternal, cache } = options;
    mvsData = deepClone(mvsData);
    const uriParamNames = ['uri', 'url'];
    const trees = mvsData.kind === 'multiple' ? mvsData.snapshots.map(s => s.root) : [mvsData.root];
    // Fetch assets:
    if (!assets) {
        assets = {};
        cache ??= {};
        const theWindowUrl = windowUrl();
        const uris = new Set<string>();
        for (const tree of trees) {
            findUris(tree, uriParamNames, uris);
        }
        for (const uri of uris) {
            if (skipExternal && isAbsoluteUri(uri)) continue;
            const resolvedUri = resolveUri(uri, baseUri, theWindowUrl)!;
            const content = cache[resolvedUri] ??= await ajaxGet({ url: resolvedUri, type: 'binary' }).run();
            assets[uri] = content;
        }
    }
    // Replace URIs by asset names:
    const uriMapping: Record<string, string> = {};
    const namedAssets: { name: string, content: string | Uint8Array<ArrayBuffer> }[] = [];
    let counter = 0;
    for (const uri in assets) {
        const nameHint = uri.split('/').pop()!.replace(/[^\w.+-]/g, '_').slice(0, 64);
        const assetName = `./assets/${counter++}-${nameHint}`;
        uriMapping[uri] = assetName;
        namedAssets.push({ name: assetName, content: assets[uri] });
    }
    for (const tree of trees) {
        replaceUris(tree, uriMapping, uriParamNames);
    }
    // Zip:
    return await createMVSX(mvsData, namedAssets);
}

function isAbsoluteUri(uri: string): boolean {
    try {
        const url = new URL(uri);
        return !!url.protocol;
    } catch {
        return false;
    }
}

/** Resolve a sequence of URI references (relative URIs), where each reference is either absolute or relative to the next one
 * (i.e. the last one is the base URI). Skip any `undefined`.
 * E.g. `resolveUri('./unexpected.png', '/spanish/inquisition/expectations.html', 'https://example.org/spam/spam/spam')`
 * returns `'https://example.org/spanish/inquisition/unexpected.png'`. */
function resolveUri(...refs: (string | undefined)[]): string | undefined {
    let result: string | undefined = undefined;
    for (const ref of refs.reverse()) {
        if (ref !== undefined) {
            if (result === undefined) result = ref;
            else result = new URL(ref, result).href;
        }
    }
    return result;
}

/** Gather any URI params in a tree. URI params are those listed in `uriParamNames`. */
export function findUris<T extends Tree>(tree: T, uriParamNames: string[], out = new Set<string>()): Set<string> {
    dfs(tree, node => {
        const params = node.params as Record<string, any> | undefined;
        if (!params) return;
        for (const name of uriParamNames) {
            const uri = params[name];
            if (typeof uri === 'string') {
                out.add(uri);
            }
        }
    });
    return out;
}

/** Replace any URI params in a tree using the given `uriMapping`, in place. URI params are those listed in `uriParamNames`. */
function replaceUris<T extends Tree>(tree: T, uriMapping: { [oldUri: string]: string }, uriParamNames: string[]): void {
    dfs(tree, node => {
        const params = node.params as Record<string, any> | undefined;
        if (!params) return;
        for (const name of uriParamNames) {
            const oldUri = params[name];
            if (typeof oldUri === 'string' && typeof uriMapping[oldUri] === 'string') {
                params[name] = uriMapping[oldUri];
            }
        }
    });
}

/** Return URL of the current page when running in a browser; or file:// URL of the current working directory when running in Node. */
function windowUrl(): string | undefined {
    if (typeof window !== 'undefined') {
        return window.location.href;
    }
    if (typeof process !== 'undefined') {
        const cwd = process.cwd().replace(/\/?$/, '/');
        return `file://${cwd}`;
    }
    return undefined;
}
