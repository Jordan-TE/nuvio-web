import { getAddonClient } from "#lib/addons/server.js";
import type { MetaPreview } from "#lib/addons/types.js";
import { pooledMap } from "#lib/core/pool.js";
import type {
	CatalogSource,
	Collection,
	CollectionFolder,
	NuvioClient,
} from "#lib/nuvio/index.js";

/** This profile's collections blob, or `[]` on any failure. */
export async function pullCollections(
	nuvio: NuvioClient,
	profileId: number,
): Promise<Collection[]> {
	const blobs = await nuvio.collections.pull(profileId).catch(() => []);
	return normalizeCollections(blobs[0]?.collections_json);
}

type Keyed = Record<string, unknown> & { id: string; title: string };

function isKeyed(value: unknown): value is Keyed {
	const entry = value as Partial<Keyed> | null;
	return typeof entry?.id === "string" && typeof entry.title === "string";
}

/** Same as the Nuvio apps: the first slot, the last value. */
function byId<T extends Keyed>(entries: T[]): T[] {
	return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

/**
 * Every Nuvio client and a few third-party tools write this blob, and the
 * pages key their lists by id: a repeated or missing id throws at render.
 */
function normalizeCollections(raw: unknown): Collection[] {
	let list = raw;
	if (typeof raw === "string") {
		try {
			list = JSON.parse(raw);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(list)) {
		return [];
	}
	return byId(
		list.filter(isKeyed).map((collection) => ({
			...collection,
			folders: byId(
				Array.isArray(collection.folders)
					? collection.folders.filter(isKeyed)
					: [],
			),
		})),
	) as Collection[];
}

/** The slice of `AddonClient` this needs, so tests can hand in a fake. */
export interface CatalogFetcher {
	getCatalog: (
		selector: { type: string; id: string },
		addonId: string,
	) => Promise<{ metas: MetaPreview[] } | null>;
}

export interface FolderContents {
	id: string;
	metas: MetaPreview[];
}

// Folders × sources can add up (a few folders of three catalogs each); the
// same cap the home rows use keeps it from bursting at one addon.
const SOURCE_CONCURRENCY = 4;

/**
 * Every folder's titles: each of its catalog sources fetched, merged in source
 * order and de-duplicated by `type:id`. A source that fails contributes
 * nothing rather than failing its folder, and a folder that fails comes back
 * empty rather than failing the page.
 */
export async function folderContents(
	client: CatalogFetcher,
	folders: CollectionFolder[],
): Promise<FolderContents[]> {
	const sources = folders.flatMap((folder) =>
		(folder.catalogSources ?? []).map((source) => ({ folder, source })),
	);
	const fetched = await pooledMap(
		sources,
		SOURCE_CONCURRENCY,
		async ({ source }: { source: CatalogSource }) => {
			try {
				const result = await client.getCatalog(
					{ type: source.type, id: source.catalogId },
					source.addonId,
				);
				return result?.metas ?? [];
			} catch {
				return [];
			}
		},
	);

	const byFolder = new Map<string, MetaPreview[]>();
	sources.forEach(({ folder }, index) => {
		byFolder.set(folder.id, [
			...(byFolder.get(folder.id) ?? []),
			...fetched[index],
		]);
	});

	return folders.map((folder) => {
		const seen = new Set<string>();
		const metas: MetaPreview[] = [];
		for (const meta of byFolder.get(folder.id) ?? []) {
			const key = `${meta.type}:${meta.id}`;
			if (!seen.has(key)) {
				seen.add(key);
				metas.push(meta);
			}
		}
		return { id: folder.id, metas };
	});
}

/**
 * Request-scoped wrapper for the collection page's load: this request's addon
 * client, then {@link folderContents}. `[]` when the addons cannot be reached
 * at all : the page still renders its folders, empty.
 */
export async function pullFolderContents(
	collection: Collection | null,
): Promise<FolderContents[]> {
	if (!collection) {
		return [];
	}
	try {
		const { client } = await getAddonClient();
		return await folderContents(client, collection.folders);
	} catch {
		return [];
	}
}
