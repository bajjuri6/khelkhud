/**
 * Generate the brand illustrations for apps/web/public/brand/ via Azure OpenAI.
 *
 *   pnpm brand:images              # only what's missing
 *   pnpm brand:images --force      # regenerate everything
 *   pnpm brand:images hero-six     # one key
 *   pnpm brand:images --list
 *
 * Config (repo-root .env, gitignored):
 *   AZURE_OPENAI_ENDPOINT     https://<resource>.cognitiveservices.azure.com/
 *   AZURE_OPENAI_KEY          resource key
 *   AZURE_OPENAI_IMAGE_MODEL  deployment name (default: dall-e-3)
 *
 * The output is committed. Regeneration is non-deterministic, so a rerun produces a
 * different picture — treat these as assets, not as build artifacts, and only re-run when
 * you actually want a new one.
 *
 * ── Moderation ───────────────────────────────────────────────────────────────
 * The nybr handoff records this the hard way: "Azure gpt-image moderation blocks
 * photoreal child-centric prompts — reframe." Every prompt here is written to stay clear
 * of that filter, and the rules are not cosmetic:
 *
 *   - Say ILLUSTRATION, loudly and first. Photoreal + minors is the combination that
 *     trips the filter; a screen-printed poster style does not read as a photograph of a
 *     real child.
 *   - Say "young athlete" / "teenager", never "child", "kid", or "little girl".
 *   - No faces in close-up, no isolated single minor as the subject of a portrait.
 *     Mid-distance action, bodies in motion, faces small or turned away.
 *   - Describe worn equipment as ordinary and specific (bare feet, a taped bat), never
 *     as deprivation, poverty, suffering, or need. It reads as documentary hardship
 *     framing, which is both a moderation risk and — more importantly — the exact tone
 *     the brand forbids (docs/brand-guidelines.md §1).
 *
 * If a prompt is refused, the error body is printed in full. Reframe rather than retry:
 * the filter is deterministic for a given prompt.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const OUT_DIR = path.join(repoRoot, "apps/web/public/brand");

const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
const KEY = process.env.AZURE_OPENAI_KEY ?? "";
const MODEL = process.env.AZURE_OPENAI_IMAGE_MODEL ?? "gpt-image-2";
const IS_GPT_IMAGE = MODEL.startsWith("gpt-image");

// The two families need different api-versions AND different request shapes. dall-e-3 is
// deprecated service-wide as of 2026 (every call returns HTTP 410 ModelDeprecated), so
// gpt-image is the default; the dall-e branches are kept only so an older deployment in
// some other subscription still works.
const API_VERSION =
  process.env.AZURE_OPENAI_API_VERSION ?? (IS_GPT_IMAGE ? "2025-04-01-preview" : "2024-02-01");

// Supported sizes differ by family: gpt-image tops out at 1536x1024 for landscape and
// rejects dall-e-3's 1792x1024 outright. Specs declare an ASPECT and the size is resolved
// per model, so switching deployments never silently 400s.
const SIZES = {
  landscape: IS_GPT_IMAGE ? "1536x1024" : "1792x1024",
  square: "1024x1024",
} as const;

// Shared style preamble. Repeated verbatim on every prompt so the set looks like one
// hand rather than five different stock illustrations.
const STYLE = [
  "A bold editorial ILLUSTRATION in a limited-palette screen-print / risograph poster style.",
  "Flat shapes, visible paper grain, confident linework, NOT photorealistic, no 3D render.",
  "Strictly limited palette: deep indigo #141B34, warm marigold orange #E8873A, warm cream #FBF7F0,",
  "muted maidan green #2F5D3A. Dramatic low sunrise light with long shadows.",
  "Composition leaves clear negative space for text overlay.",
].join(" ");

type Spec = {
  key: string;
  file: string;
  aspect: keyof typeof SIZES;
  prompt: string;
  /** What this is for, so a future reader knows whether a regeneration is safe. */
  usage: string;
};

const SPECS: Spec[] = [
  {
    key: "hero-six",
    file: "hero-six.png",
    aspect: "landscape",
    usage: "Landing hero, full-bleed behind the headline. Text sits on the LEFT third.",
    prompt: [
      STYLE,
      "Scene: a dusty Indian gully cricket ground at sunrise, seen wide from side-on.",
      "On the RIGHT side, a lanky teenage batter in an ordinary t-shirt and shorts, barefoot,",
      "has just completed an enormous six — body fully extended, follow-through high, seen from",
      "behind and to the side so the face is small and turned away. The bat is a battered plank of",
      "wood wrapped in electrical tape. No pads, no gloves, no helmet.",
      "The ball is a small dark speck high in the sky, arcing away toward the top-left.",
      "In the far background, a modest concrete building with one window whose glass has just",
      "cracked in a bright star pattern, catching the orange sunrise.",
      "Improvised stumps made of three uneven sticks behind the batter. A couple of small distant",
      "figures fielding, drawn simply, no detail.",
      "The LEFT third of the frame is open sky and haze — deliberately empty for text.",
      "Confident, joyful, triumphant energy. Absolutely no sadness, poverty or pity in the framing.",
    ].join(" "),
  },
  {
    key: "barefoot-sprint",
    file: "barefoot-sprint.png",
    aspect: "square",
    usage: "Secondary band / 'the gap' section. Square crop.",
    prompt: [
      STYLE,
      "Scene: a teenage sprinter mid-stride on a rough red-earth track at dawn, seen from the side",
      "at mid-distance, body in powerful full extension, face small and in profile shadow.",
      "She is barefoot; the shoes are simply absent, treated as unremarkable, not as hardship.",
      "Chalk-drawn lane lines on packed earth rather than a synthetic track.",
      "A very long shadow stretches behind her toward the viewer.",
      "Empty warm sky above for text. Energy is determination and speed, not struggle.",
    ].join(" "),
  },
  {
    key: "improvised-kit",
    file: "improvised-kit.png",
    aspect: "square",
    usage: "'What they're working with' — still life, used beside the requirement ledger.",
    prompt: [
      STYLE,
      "Scene: a still life, no people at all. Arranged on packed red earth in low sunrise light:",
      "a cricket bat made from a taped wooden plank, a worn tennis ball wrapped in electrical tape,",
      "three uneven sticks used as stumps, a single split running shoe held together with twine,",
      "a badminton racquet with two broken strings, and a plastic water bottle.",
      "Objects laid out cleanly and graphically, almost like a museum display, with long shadows.",
      "Dignified and matter-of-fact, like a catalogue of tools — NOT a picture of poverty.",
      "Generous empty space around the objects.",
    ].join(" "),
  },
];

function usage(): void {
  console.log("Brand image specs:\n");
  for (const s of SPECS) {
    console.log(`  ${s.key.padEnd(18)} ${SIZES[s.aspect].padEnd(10)} -> public/brand/${s.file}`);
    console.log(`  ${" ".repeat(18)} ${s.usage}\n`);
  }
}

async function generate(spec: Spec): Promise<void> {
  const url = `${ENDPOINT}/openai/deployments/${MODEL}/images/generations?api-version=${API_VERSION}`;

  // dall-e-3 accepts response_format; the gpt-image-* family always returns b64 and
  // REJECTS the parameter outright. Send it only where it is understood.
  const body: Record<string, unknown> = {
    prompt: spec.prompt,
    size: SIZES[spec.aspect],
    n: 1,
  };
  if (IS_GPT_IMAGE) {
    // gpt-image always returns b64 and REJECTS response_format. Its quality scale is
    // low|medium|high, not dall-e-3's standard|hd.
    body.quality = "high";
    body.output_format = "png";
  } else {
    body.response_format = "b64_json";
    body.quality = "hd";
    body.style = "vivid";
  }

  process.stdout.write(`  ${spec.key} … `);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": KEY },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.log("FAILED");
    console.error(`\n  HTTP ${res.status}\n  ${text}\n`);
    if (text.includes("content_policy") || text.includes("safety")) {
      console.error(
        "  This is the moderation filter. Reframe the prompt — see the header of this\n" +
          "  file for the four rules. Retrying the same text will fail the same way.\n",
      );
    }
    throw new Error(`${spec.key}: generation failed`);
  }

  const json = JSON.parse(text) as {
    data?: { b64_json?: string; url?: string; revised_prompt?: string }[];
  };
  const item = json.data?.[0];
  if (!item) throw new Error(`${spec.key}: response contained no image`);

  let buf: Buffer;
  if (item.b64_json) {
    buf = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    const img = await fetch(item.url);
    buf = Buffer.from(await img.arrayBuffer());
  } else {
    throw new Error(`${spec.key}: response had neither b64_json nor url`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, spec.file), buf);
  console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--list")) return usage();

  if (!ENDPOINT || !KEY) {
    console.error(
      "Missing AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_KEY in .env.\n\n" +
        "Fetch them with:\n" +
        "  az cognitiveservices account show -n palla-m78m2ltj-swedencentral \\\n" +
        "    -g rg-pallav-2204_ai --query properties.endpoint -o tsv\n" +
        "  az cognitiveservices account keys list -n palla-m78m2ltj-swedencentral \\\n" +
        "    -g rg-pallav-2204_ai --query key1 -o tsv\n",
    );
    process.exit(1);
  }

  const force = args.includes("--force");
  const wanted = args.filter((a) => !a.startsWith("--"));
  const todo = SPECS.filter((s) => wanted.length === 0 || wanted.includes(s.key));
  if (todo.length === 0) {
    console.error(`No spec matched: ${wanted.join(", ")}. Try --list.`);
    process.exit(1);
  }

  console.log(`Model: ${MODEL}  ->  ${OUT_DIR}\n`);
  let made = 0;
  let failed = 0;
  for (const spec of todo) {
    const dest = path.join(OUT_DIR, spec.file);
    if (!force && fs.existsSync(dest)) {
      console.log(`  ${spec.key} … exists, skipping (--force to replace)`);
      continue;
    }
    try {
      await generate(spec);
      made++;
    } catch {
      // Already reported in detail; keep going so one refusal doesn't block the rest.
      failed++;
    }
  }
  console.log(`\n${made} generated, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

void main();
