import {
	type AudioByteSample,
	evaluateAudioTick,
	reportedAudioTrack,
} from "#lib/player/silent-audio.js";

export type AudioIssue = "no-track" | "codec";

interface HlsLike {
	audioTracks: { length: number };
	audioTrack: number;
}

interface SilentAudioDeps {
	src: () => string;
	video: () => HTMLVideoElement | null;
	hls: () => HlsLike | null;
	/** The stream label hints at a codec the browser can't decode. */
	audioRisky: () => boolean;
	/** True while a fatal error screen is up : pause sampling. */
	blocked: () => boolean;
	/** Called when the watch flips to an alternate HLS audio track. */
	onTrackSwitch: (index: number) => void;
	/** The in-browser fix : true when the source now has sound. */
	tryFix: (reason: "probe" | "silent") => Promise<boolean>;
}

/**
 * Watch a playing `<video>` for "picture plays, no sound" : an undecodable audio
 * codec (Dolby Digital / DTS / Atmos …) or a file with no audio track. Non-fatal:
 * `tryFix` gets a go first : it probes the file as playback starts, and again
 * once silence is confirmed : and only when it can't help does `.issue` drive a
 * dismissible banner. Re-arms whenever `src()` changes.
 *
 * The decision logic is the pure `evaluateAudioTick` / `classifyAudioSamples` in
 * `silent-audio.ts`; this rune just owns the timer, the sample buffer and the
 * one-shot HLS track retry.
 */
export function createSilentAudioWatch(deps: SilentAudioDeps) {
	let issue = $state<AudioIssue | null>(null);

	$effect(() => {
		// Re-arm on a new source.
		void deps.src();
		issue = null;

		const video = deps.video();
		if (!video) {
			return;
		}
		void deps.tryFix("probe");
		const el = video as HTMLVideoElement & {
			webkitAudioDecodedByteCount?: number;
			webkitVideoDecodedByteCount?: number;
			mozHasAudio?: boolean;
		};
		const haveCounters = el.webkitVideoDecodedByteCount !== undefined;
		const audioRisky = deps.audioRisky();
		if (!(haveCounters || audioRisky) && typeof el.mozHasAudio !== "boolean") {
			return; // nothing to go on
		}

		const needed = audioRisky ? 2 : 4;
		const samples: AudioByteSample[] = [];
		let playedSeconds = 0;
		let trackTried = false;
		let stale = false;

		function recordSample() {
			if (!haveCounters) {
				return;
			}
			samples.push({
				video: el.webkitVideoDecodedByteCount ?? 0,
				audio: el.webkitAudioDecodedByteCount ?? 0,
			});
			if (samples.length > 14) {
				samples.shift();
			}
		}

		function tick() {
			if (deps.blocked() || el.paused || el.currentTime < 3 || issue) {
				return;
			}
			playedSeconds += 1;
			recordSample();

			const hls = deps.hls();
			const action = evaluateAudioTick({
				mozHasAudio: el.mozHasAudio,
				haveCounters,
				samples,
				needed,
				reported: reportedAudioTrack(el),
				canSwitchTrack: Boolean(
					hls && hls.audioTracks.length > 1 && !trackTried,
				),
				audioRisky,
				playedSeconds,
			});

			// Try a stereo/AAC alt track once (HLS) before bothering the viewer.
			if (action.kind === "switch-track" && hls) {
				trackTried = true;
				const next = (hls.audioTrack + 1) % hls.audioTracks.length;
				hls.audioTrack = next;
				deps.onTrackSwitch(next);
				samples.length = 0;
				return;
			}
			if (action.kind === "flag") {
				clearInterval(timer);
				const flagged = action.issue;
				void deps.tryFix("silent").then((fixed) => {
					if (!(fixed || stale)) {
						issue = flagged;
					}
				});
			}
		}

		const timer = setInterval(tick, 1000);
		return () => {
			stale = true;
			clearInterval(timer);
		};
	});

	return {
		get issue() {
			return issue;
		},
		dismiss() {
			issue = null;
		},
	};
}
