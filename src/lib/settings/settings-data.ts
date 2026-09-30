import * as v from "valibot";
import type { NuvioClient } from "#lib/nuvio/index.js";
import {
	EMPTY_HOME_LAYOUT,
	type HomeLayout,
	parseHomeLayout,
} from "./home-layout.ts";
import { PLATFORM, type UiSettings, uiSettingsSchema } from "./ui-settings.ts";

/** The raw `web` settings blob for a profile, or `{}` on any failure. */
export async function pullSettingsBlob(
	nuvio: NuvioClient,
	profileId: number,
): Promise<Record<string, unknown>> {
	const blobs = await nuvio.settings
		.pull({ p_profile_id: profileId, p_platform: PLATFORM })
		.catch(() => []);
	return (blobs[0]?.settings_json ?? {}) as Record<string, unknown>;
}

/** The Nuvio mobile app's namespace in the profile settings store. */
const MOBILE_PLATFORM = "mobile";

/** The audio languages set in the Nuvio mobile app, as it stores them. */
export interface AppAudioLanguage {
	preferred: string | null;
	secondary: string | null;
}

/**
 * Read-only : the mobile app owns that blob and replaces it whole, so this
 * client never writes there. Nulls when the app was never used or on any failure.
 */
export async function pullAppAudioLanguage(
	nuvio: NuvioClient,
	profileId: number,
): Promise<AppAudioLanguage> {
	const blobs = await nuvio.settings
		.pull({ p_profile_id: profileId, p_platform: MOBILE_PLATFORM })
		.catch(() => []);
	const features = (
		blobs[0]?.settings_json as Record<string, unknown> | undefined
	)?.features as Record<string, unknown> | undefined;
	const player = (features?.player_settings ?? {}) as Record<string, unknown>;
	const text = (value: unknown) =>
		typeof value === "string" && value.trim() ? value.trim() : null;
	return {
		preferred: text(player.preferred_audio_language),
		secondary: text(player.secondary_preferred_audio_language),
	};
}

/**
 * UI settings for SSR / first paint. Gates every `(app)` page through the layout
 * load, so a slow / failed pull falls back to defaults rather than stalling or
 * 500-ing the shell : the client `theme` controller re-syncs once it's up.
 */
export async function pullUiSettings(
	nuvio: NuvioClient,
	profileId: number,
): Promise<UiSettings> {
	const blob = await pullSettingsBlob(nuvio, profileId);
	return v.parse(uiSettingsSchema, blob.ui ?? {});
}

/** This profile's home layout for the web client, or the empty one on any failure. */
export async function pullHomeLayout(
	nuvio: NuvioClient,
	profileId: number,
): Promise<HomeLayout> {
	const rows = await nuvio.homeCatalog
		.pull({ p_profile_id: profileId, p_platform: PLATFORM })
		.catch(() => []);
	return rows[0] ? parseHomeLayout(rows[0].settings_json) : EMPTY_HOME_LAYOUT;
}
