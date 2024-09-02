import { Image } from './manager';


type Titles = Pick<Image, 'title' | 'subtitle'>;


/** Functions for creating informative image (3D state) titles for display in UI */
export const ImageTitles = {
    entry(img: Image): Titles {
        if (img.filename.includes('_chemically_distinct_molecules')) {
            return { title: 'Deposited model (color by entity)' };
        }
        if (img.filename.includes('_chain')) {
            return { title: 'Deposited model (color by chain)' };
        }
        return {};
    },
    validation(img: Image): Titles {
        return { title: 'Geometry validation' };
    },
    bfactor(img: Image): Titles {
        return { title: 'B-factor' };
    },
    assembly(img: Image, info: { assemblyId: string }): Titles {
        if (img.filename.includes('_chemically_distinct_molecules')) {
            return { title: `Assembly ${info.assemblyId} (color by entity)` };
        }
        if (img.filename.includes('_chain')) {
            return { title: `Assembly ${info.assemblyId} (color by chain)` };
        }
        return {};
    },
    entity(img: Image, info: { entityId: string }): Titles {
        const entityName = getSpans(img.description)[1];
        return {
            title: `Entity ${info.entityId}`,
            subtitle: entityName,
        };
    },
    ligand(img: Image, info: { compId: string }): Titles {
        const ligandName = getParenthesis(getSpans(img.description)[0]);
        return {
            title: `Ligand environment for ${info.compId}`,
            subtitle: ligandName,
        };
    },
    modres(img: Image, info: { compId: string }): Titles {
        const modresName = getParenthesis(getSpans(img.description)[1]);
        return {
            title: `Modified residue ${info.compId}`,
            subtitle: modresName,
        };
    },
    domain(img: Image, info: { db: string, familyId: string, entityId: string }): Titles {
        const familyName = getParenthesis(getSpans(img.description)[1]);
        return {
            title: `${info.db} ${info.familyId} (entity ${info.entityId})`,
            subtitle: familyName,
        };
    },
};


/** Get contents of `<span ...>...</span>` tags from an HTML string */
function getSpans(text: string | undefined): string[] {
    const matches = (text ?? '').matchAll(/<span [^>]*>([^<]*)<\/span>/g);
    return Array.from(matches).map(match => match[1]);
}

/** Get content of parenthesis (`(...)`) from a string */
function getParenthesis(text: string | undefined): string | undefined {
    return text?.match(/\((.*)\)/)?.[1];
}
