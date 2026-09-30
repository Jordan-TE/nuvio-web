import { expect, test } from "@playwright/test";
import { collectRuntimeErrors } from "./errors.ts";

// The webm harness clip has working Vorbis audio : the silent-media detector
// must not false-flag it, and the rework must not throw.
test("silent-media detector does not false-flag a normal clip", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/dev/player?src=/e2e/sample.webm");
	await page.waitForLoadState("networkidle");

	await page.evaluate(() => {
		const v = document.querySelector("video");
		if (v) {
			v.loop = true;
			void v.play().catch(() => {});
		}
	});

	// Let it play well past the detector's evaluation window.
	await page.waitForTimeout(12_000);

	await expect(page.getByText(/without sound|no audio/i)).toHaveCount(0);
	// Audio the browser decodes by itself is left to `<video>` : no re-mux.
	expect(
		await page.evaluate(() => document.querySelector("video")?.currentSrc),
	).toContain("/e2e/sample.webm");
	expect(errors, "runtime errors").toEqual([]);
});

// VP9 + AC-3 5.1 : Chromium plays the picture and drops the audio track. The
// player reads the file's tracks as playback starts and converts straight away,
// long before the silence detector (~8s in) could have flagged anything.
test("an undecodable audio track is converted as playback starts", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);

	await page.goto("/dev/player?src=/e2e/ac3.mkv");

	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const video = document.querySelector("video") as
						| (HTMLVideoElement & { webkitAudioDecodedByteCount?: number })
						| null;
					void video?.play().catch(() => {});
					return Boolean(
						video?.currentSrc.startsWith("blob:") &&
							(video.webkitAudioDecodedByteCount ?? 0) > 0,
					);
				}),
			{ timeout: 15_000 },
		)
		.toBe(true);

	await page.waitForTimeout(1000);
	await expect(page.getByText(/no sound/i)).toHaveCount(0);
	expect(errors, "runtime errors").toEqual([]);
});

// `<video>` refuses the file (its own request gets garbage) while `fetch` still
// reads it : what a container the browser doesn't play looks like.
test("a file the video element refuses is re-muxed in the browser", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.route("**/e2e/ac3.mkv", (route) =>
		route.request().resourceType() === "media"
			? route.fulfill({
					status: 200,
					contentType: "video/x-matroska",
					body: "not a video",
				})
			: route.continue(),
	);

	await page.goto("/dev/player?src=/e2e/ac3.mkv");

	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const video = document.querySelector("video");
					void video?.play().catch(() => {});
					return Boolean(
						video?.currentSrc.startsWith("blob:") && video.currentTime > 1,
					);
				}),
			{ timeout: 20_000 },
		)
		.toBe(true);
	await expect(page.getByText(/can't play/i)).toHaveCount(0);
	expect(errors, "runtime errors").toEqual([]);
});
