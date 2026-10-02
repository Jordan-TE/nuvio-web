import type { GenericSchema } from "valibot";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
	collectionsPull: vi.fn(),
	collectionsReplace: vi.fn(),
	getCatalog: vi.fn(),
};

vi.mock("$app/server", async () => {
	const v = await import("valibot");
	// Validates like the real thing, so the schemas are under test too.
	const remote =
		(schema: GenericSchema, fn: (input: unknown) => unknown) =>
		async (input: unknown) =>
			fn(v.parse(schema, input));
	return {
		query: remote,
		command: remote,
		getRequestEvent: () => ({ locals: {}, fetch }),
	};
});

vi.mock("#lib/server/guards.js", () => ({
	requireProfile: () => ({
		event: { locals: {}, fetch },
		nuvio: {
			collections: {
				pull: state.collectionsPull,
				replace: state.collectionsReplace,
			},
		},
		profileId: 1,
	}),
}));

vi.mock("#lib/addons/server.js", () => ({
	getAddonClient: async () => ({ client: { getCatalog: state.getCatalog } }),
}));

import { folderTitles, saveCollections } from "./collections.remote.ts";

beforeEach(() => {
	state.collectionsPull = vi.fn(async () => []);
	state.collectionsReplace = vi.fn(async () => undefined);
	state.getCatalog = vi.fn(async () => ({ metas: [] }));
});

describe("saveCollections", () => {
	it("replaces the blob and reports the count", async () => {
		const out = await saveCollections([
			{ id: "c1", title: "One", folders: [] },
		]);
		expect(out).toEqual({ count: 1 });
		expect(state.collectionsReplace).toHaveBeenCalledWith({
			p_profile_id: 1,
			p_collections_json: [{ id: "c1", title: "One", folders: [] }],
		});
	});

	// The push is a full replace: what the Nuvio apps store and this client
	// does not edit (Mobile's nulls and lower-case shapes, TMDB sources) must survive.
	it("passes another client's fields through untouched", async () => {
		const mobile = [
			{
				id: "c1",
				title: "One",
				backdropImageUrl: null,
				viewMode: "TABBED_GRID",
				folders: [
					{
						id: "f1",
						title: "F",
						coverImageUrl: null,
						tileShape: "poster",
						focusGifEnabled: true,
						sources: [{ provider: "tmdb", tmdbId: 42 }],
						catalogSources: [
							{
								addonId: "a",
								type: "movie",
								catalogId: "top",
								genre: "Action",
							},
						],
					},
				],
			},
		];
		await saveCollections(mobile as never);
		expect(state.collectionsReplace).toHaveBeenCalledWith({
			p_profile_id: 1,
			p_collections_json: mobile,
		});
	});

	it("rejects a collection without a folder list", async () => {
		await expect(
			saveCollections([{ id: "c1", title: "One" }] as never),
		).rejects.toThrow();
		expect(state.collectionsReplace).not.toHaveBeenCalled();
	});
});

describe("folderTitles", () => {
	it("fetches one folder's sources through this request's addon client", async () => {
		state.getCatalog = vi.fn(async (sel: { id: string }) => ({
			metas: [{ type: "movie", id: `m-${sel.id}` }],
		}));
		const metas = await folderTitles({
			id: "f1",
			title: "Folder",
			catalogSources: [
				{ addonId: "a", type: "movie", catalogId: "top" },
				{ addonId: "a", type: "movie", catalogId: "new" },
			],
		});
		expect(metas.map((meta) => meta.id)).toEqual(["m-top", "m-new"]);
	});

	it("is empty for a folder with no sources", async () => {
		expect(await folderTitles({ id: "f1", title: "Empty" })).toEqual([]);
	});
});
