// Renders docs/images/feature-web.webp, the hero at the top of the README: the
// dark home screenshot from the showcase run, framed in a browser window next
// to a tagline, laid out here and photographed by Chromium.
//
//   bun run graphics   (`bun run screenshots` runs it after the shots)
import { join } from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { file, Image, write } from "bun";

const root = join(import.meta.dir, "..");
// Inlined: a page set from a string may not read files.
const inline = async (path: string) =>
	`data:image/webp;base64,${Buffer.from(await file(join(root, path)).bytes()).toString("base64")}`;
const home = await inline("docs/images/home-dark.webp");
const logo = await inline("static/logo.webp");

// The dark theme's ground and ink, and the logo's gradient.
const GROUND = "#0a0a0a";
const INK = "#fafafa";
const MUTED = "#a1a1a1";
const CYAN = "#4fd8ec";
const VIOLET = "#a54cf0";
const BLUE = "#2f62d8";

const page = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1024px; height: 500px; overflow: hidden; }
  body {
    position: relative;
    background:
      radial-gradient(620px 420px at 96% 0%, ${CYAN}40, transparent 70%),
      radial-gradient(560px 400px at 4% 108%, ${VIOLET}4d, transparent 70%),
      radial-gradient(420px 300px at 60% 110%, ${BLUE}33, transparent 70%),
      ${GROUND};
    color: ${INK};
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* The logo, blurred into the light the window sits in. */
  .mark { position: absolute; left: 560px; top: -200px; width: 560px; opacity: 0.55; filter: blur(48px); }
  .words { position: absolute; left: 64px; top: 0; width: 400px; height: 500px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.2px; }
  .brand img { width: 30px; }
  h1 { margin-top: 28px; font-size: 50px; line-height: 1.04; font-weight: 650; letter-spacing: -1.6px; text-wrap: balance; }
  p { margin-top: 18px; max-width: 340px; font-size: 18px; line-height: 1.45; color: ${MUTED}; text-wrap: pretty; }
  .window { position: absolute; left: 470px; top: 80px; width: 760px; overflow: hidden; border-radius: 14px; background: ${GROUND}; box-shadow: 0 30px 80px -20px #000c, 0 0 0 1px #ffffff1f; }
  .window > img { display: block; width: 100%; }
  .bar { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; background: #161616; border-bottom: 1px solid #ffffff14; }
  .bar i { width: 10px; height: 10px; border-radius: 50%; background: #ffffff2e; }
  .bar span { margin-left: 14px; padding: 4px 14px; border-radius: 8px; background: #ffffff12; color: ${MUTED}; font-size: 11px; }
</style></head><body>
  <img class="mark" src="${logo}" alt="">
  <div class="window">
    <div class="bar"><i></i><i></i><i></i><span>nuvio.example.com</span></div>
    <img src="${home}" alt="">
  </div>
  <div class="words">
    <div class="brand"><img src="${logo}" alt="">Nuvio Web</div>
    <h1>Your Nuvio, in a browser.</h1>
    <p>Profiles, addons, library and a player that streams right in the tab.</p>
  </div>
</body></html>`;

const browser = await chromium.launch();
// Twice the layout's size: the README shows it wide.
const context = await browser.newContext({
	viewport: { width: 1024, height: 500 },
	deviceScaleFactor: 2,
});
const tab = await context.newPage();
await tab.setContent(page, { waitUntil: "load" });
await write(
	join(root, "docs/images/feature-web.webp"),
	await new Image(await tab.screenshot()).webp({ quality: 92 }).bytes(),
);
await browser.close();
process.stdout.write("docs/images/feature-web.webp\n");
