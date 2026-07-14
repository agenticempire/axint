#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MEDIA_DIR = join(ROOT, "media");
const WIDTH = 1200;
const HEIGHT = 720;
const FPS = 10;
const DURATION_SECONDS = 12;
const FRAME_COUNT = FPS * DURATION_SECONDS;
const COLORS = {
  background: "#090B0A",
  surface: "#0F1210",
  surfaceRaised: "#151917",
  line: "#2A302C",
  grid: "#202522",
  text: "#F4F1EA",
  muted: "#949B96",
  subtle: "#626964",
  accent: "#F05138",
  success: "#71D49A",
  warning: "#E9C46A",
  info: "#8BB8E8",
};

const SANS = "sans-serif";
const MONO = "monospace";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function easeOut(value) {
  const t = clamp(value);
  return 1 - (1 - t) ** 3;
}

function reveal(time, start, duration = 0.28) {
  return easeOut((time - start) / duration);
}

function sceneOpacity(time, start, end) {
  const fadeIn = reveal(time, start, 0.24);
  const fadeOut = 1 - reveal(time, end - 0.22, 0.22);
  return clamp(Math.min(fadeIn, fadeOut));
}

function rect(x, y, width, height, fill, stroke = "none", radius = 6, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" opacity="${opacity}"/>`;
}

function line(x1, y1, x2, y2, stroke, width = 1, opacity = 1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}"/>`;
}

function text(value, x, y, options = {}) {
  const {
    size = 16,
    color = COLORS.text,
    family = SANS,
    weight = 500,
    opacity = 1,
    anchor = "start",
  } = options;
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="0" text-anchor="${anchor}" opacity="${opacity}">${escapeXml(value)}</text>`;
}

function pill(label, x, y, width, options = {}) {
  const {
    fill = COLORS.surfaceRaised,
    stroke = COLORS.line,
    color = COLORS.muted,
    opacity = 1,
  } = options;
  return [
    rect(x, y, width, 28, fill, stroke, 6, opacity),
    text(label, x + width / 2, y + 19, {
      size: 11,
      color,
      family: MONO,
      weight: 600,
      anchor: "middle",
      opacity,
    }),
  ].join("");
}

function statusRow(label, detail, y, progress, color = COLORS.success, layout = {}) {
  const { x = 384, width = 720 } = layout;
  const opacity = clamp(progress);
  const offset = (1 - easeOut(progress)) * 18;
  return `<g transform="translate(${offset},0)" opacity="${opacity}">
    ${rect(x, y - 20, width, 46, COLORS.surfaceRaised, COLORS.line, 6)}
    ${rect(x + 16, y - 5, 8, 8, color, "none", 2)}
    ${text(label, x + 40, y + 1, { size: 15, family: MONO, weight: 600 })}
    ${text(detail, x + width - 22, y + 1, { size: 13, color: COLORS.muted, family: MONO, anchor: "end" })}
  </g>`;
}

function diagnosticRow(code, evidence, message, y, progress, color) {
  const opacity = clamp(progress);
  const offset = (1 - easeOut(progress)) * 18;
  return `<g transform="translate(${offset},0)" opacity="${opacity}">
    ${rect(384, y - 24, 720, 62, COLORS.surfaceRaised, COLORS.line, 6)}
    ${text(code, 402, y, { size: 13, color, family: MONO, weight: 700 })}
    ${pill(evidence.toUpperCase(), 470, y - 18, evidence === "suppressed" ? 96 : 82, {
      fill: COLORS.background,
      color,
      opacity,
    })}
    ${text(message, 402, y + 25, { size: 14, color: COLORS.text, family: MONO, weight: 500 })}
  </g>`;
}

function logoMark() {
  return `<g transform="translate(54,38)">
    <polyline points="18,2 2,20 18,38" fill="none" stroke="${COLORS.text}" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>
    <polyline points="38,2 54,20 38,38" fill="none" stroke="${COLORS.text}" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/>
    <rect x="25" y="17" width="6" height="6" fill="${COLORS.accent}"/>
  </g>`;
}

function pipeline(time) {
  const stages = ["DISCOVER", "CHECK", "XCODE", "RECONCILE", "RECEIPT"];
  const active = Math.min(stages.length - 1, Math.floor(time / 2.15));
  const finished = time >= 10.75;
  const parts = [
    text("PROOF LOOP", 66, 156, {
      size: 11,
      color: COLORS.subtle,
      family: MONO,
      weight: 700,
    }),
  ];

  stages.forEach((stage, index) => {
    const y = 198 + index * 58;
    const complete = index < active || (finished && index === active);
    const isActive = index === active && !finished;
    const color = complete ? COLORS.success : isActive ? COLORS.accent : COLORS.subtle;
    const labelColor = complete || isActive ? COLORS.text : COLORS.muted;
    parts.push(
      rect(66, y - 12, 22, 22, isActive ? COLORS.accent : COLORS.surfaceRaised, color, 4)
    );
    parts.push(
      text(complete ? "OK" : String(index + 1).padStart(2, "0"), 77, y + 4, {
        size: complete ? 9 : 10,
        color: isActive ? COLORS.background : color,
        family: MONO,
        weight: 700,
        anchor: "middle",
      })
    );
    parts.push(
      text(stage, 106, y + 4, {
        size: 13,
        color: labelColor,
        family: MONO,
        weight: isActive ? 700 : 500,
      })
    );
    if (index < stages.length - 1) {
      parts.push(
        line(77, y + 12, 77, y + 44, complete ? COLORS.success : COLORS.line, 1)
      );
    }
  });

  parts.push(line(66, 500, 298, 500, COLORS.line));
  parts.push(
    text("PROJECT", 66, 530, {
      size: 11,
      color: COLORS.subtle,
      family: MONO,
      weight: 700,
    })
  );
  parts.push(text("Lumin", 66, 558, { size: 18, color: COLORS.text, weight: 650 }));
  parts.push(
    text("Apple app / 2 targets", 66, 582, {
      size: 12,
      color: COLORS.muted,
      family: MONO,
    })
  );
  parts.push(
    text("184 Swift files", 66, 610, { size: 12, color: COLORS.muted, family: MONO })
  );
  parts.push(pill("LOCAL", 66, 630, 68, { color: COLORS.success }));
  parts.push(pill("NO SOURCE UPLOAD", 142, 630, 136, { color: COLORS.info }));
  return parts.join("");
}

function introScene(time) {
  const opacity = sceneOpacity(time, 0, 2.2);
  const command = "axint prove --dir ./Lumin";
  const typedLength = Math.floor(clamp((time - 0.3) / 1.05) * command.length);
  const typed = command.slice(0, typedLength);
  const cursorOpacity = Math.floor(time * 5) % 2 === 0 ? 1 : 0.25;
  const scan = reveal(time, 1.35, 0.35);
  return `<g opacity="${opacity}">
    ${text("ONE COMMAND. FRESH APPLE EVIDENCE.", 382, 196, { size: 13, color: COLORS.accent, family: MONO, weight: 700 })}
    ${text("Prove the project your agent changed.", 382, 244, { size: 34, color: COLORS.text, weight: 680 })}
    ${text("Static findings stay provisional until Xcode and tests weigh in.", 382, 278, { size: 16, color: COLORS.muted, weight: 450 })}
    ${rect(382, 326, 722, 86, COLORS.background, COLORS.line, 6)}
    ${text("$", 404, 378, { size: 18, color: COLORS.accent, family: MONO, weight: 700 })}
    ${text(typed, 432, 378, { size: 18, color: COLORS.text, family: MONO, weight: 550 })}
    ${rect(432 + typed.length * 10.8, 360, 8, 22, COLORS.accent, "none", 1, cursorOpacity)}
    <g opacity="${scan}">
      ${text("Inspecting project graph and recent changes...", 404, 458, { size: 14, color: COLORS.muted, family: MONO })}
      ${rect(404, 484, 640, 4, COLORS.line, "none", 2)}
      ${rect(404, 484, 640 * clamp((time - 1.45) / 0.6), 4, COLORS.accent, "none", 2)}
    </g>
  </g>`;
}

function discoverScene(time) {
  const opacity = sceneOpacity(time, 2, 4.25);
  return `<g opacity="${opacity}">
    ${text("PROJECT DISCOVERY", 382, 186, { size: 12, color: COLORS.info, family: MONO, weight: 700 })}
    ${text("Context before conclusions.", 382, 228, { size: 32, weight: 680 })}
    ${text("Axint scopes the proof run to the project, scheme, and changed surfaces.", 382, 260, { size: 15, color: COLORS.muted })}
    ${statusRow("Lumin.xcodeproj", "scheme: Lumin", 330, reveal(time, 2.2))}
    ${statusRow("Sources/HomeComposer.swift", "modified", 394, reveal(time, 2.45), COLORS.warning)}
    ${statusRow("UITests/ComposerFlowTests.swift", "focused proof", 458, reveal(time, 2.7), COLORS.info)}
    ${statusRow("Project mutation", "none", 522, reveal(time, 2.95))}
    ${text("Brownfield-safe by default. Fixes require explicit opt-in.", 404, 582, { size: 13, color: COLORS.success, family: MONO, opacity: reveal(time, 3.2) })}
  </g>`;
}

function checkScene(time) {
  const opacity = sceneOpacity(time, 4.05, 6.35);
  return `<g opacity="${opacity}">
    ${text("EVIDENCE-AWARE CHECK", 382, 176, { size: 12, color: COLORS.warning, family: MONO, weight: 700 })}
    ${text("Findings with provenance, not guesses.", 382, 218, { size: 31, weight: 680 })}
    ${text("Every diagnostic carries an evidence class and a stable repair identity.", 382, 250, { size: 15, color: COLORS.muted })}
    ${diagnosticRow("AX764", "probable", "Overlay may intercept composer input", 326, reveal(time, 4.3), COLORS.warning)}
    ${diagnosticRow("AX736", "advisory", "Container identifier may hide child controls", 410, reveal(time, 4.55), COLORS.info)}
    ${diagnosticRow("AX721", "advisory", "UI model isolation needs compiler evidence", 494, reveal(time, 4.8), COLORS.info)}
    ${text("Next: run the focused build and interaction test.", 404, 570, { size: 13, color: COLORS.text, family: MONO, opacity: reveal(time, 5.1) })}
  </g>`;
}

function xcodeScene(time) {
  const opacity = sceneOpacity(time, 6.15, 8.45);
  const progress = clamp((time - 6.35) / 1.35);
  return `<g opacity="${opacity}">
    ${text("XCODE PROOF", 382, 176, { size: 12, color: COLORS.success, family: MONO, weight: 700 })}
    ${text("Builds can outlive the agent connection.", 382, 218, { size: 31, weight: 680 })}
    ${text("The run is resumable, compact, and backed by .xcresult evidence.", 382, 250, { size: 15, color: COLORS.muted })}
    ${statusRow("xcodebuild build", progress > 0.3 ? "PASS" : "running", 330, reveal(time, 6.35), progress > 0.3 ? COLORS.success : COLORS.warning)}
    ${statusRow("ComposerFlowTests/testInput", progress > 0.68 ? "PASS" : "queued", 394, reveal(time, 6.65), progress > 0.68 ? COLORS.success : COLORS.info)}
    ${statusRow("Result bundle", progress > 0.9 ? "attached" : "collecting", 458, reveal(time, 6.95), progress > 0.9 ? COLORS.success : COLORS.info)}
    ${rect(404, 526, 664, 4, COLORS.line, "none", 2)}
    ${rect(404, 526, 664 * progress, 4, progress >= 0.9 ? COLORS.success : COLORS.accent, "none", 2)}
    ${text(progress >= 0.9 ? "Job axrun_7f3c complete" : "Job axrun_7f3c remains rejoinable", 404, 562, { size: 13, color: progress >= 0.9 ? COLORS.success : COLORS.muted, family: MONO })}
  </g>`;
}

function reconcileScene(time) {
  const opacity = sceneOpacity(time, 8.25, 10.45);
  return `<g opacity="${opacity}">
    ${text("EVIDENCE RECONCILIATION", 382, 176, { size: 12, color: COLORS.accent, family: MONO, weight: 700 })}
    ${text("Compiler truth changes the verdict.", 382, 218, { size: 31, weight: 680 })}
    ${text("Passing focused proof suppresses contradicted heuristics without deleting history.", 382, 250, { size: 15, color: COLORS.muted })}
    ${diagnosticRow("AX764", "suppressed", "Focused interaction test passed", 332, reveal(time, 8.5), COLORS.success)}
    ${diagnosticRow("AX736", "advisory", "Review identifier ownership before release", 416, reveal(time, 8.75), COLORS.info)}
    ${statusRow("Build and focused test evidence", "confirmed", 506, reveal(time, 9.0))}
    ${text("0 blocking findings  /  1 advisory  /  1 suppressed", 404, 578, { size: 13, color: COLORS.text, family: MONO, opacity: reveal(time, 9.2) })}
  </g>`;
}

function receiptScene(time) {
  const opacity = sceneOpacity(time, 10.2, 12.1);
  const scale = 0.985 + reveal(time, 10.35, 0.35) * 0.015;
  return `<g opacity="${opacity}" transform="translate(${(1 - scale) * 744},${(1 - scale) * 400}) scale(${scale})">
    ${rect(382, 154, 722, 418, COLORS.surfaceRaised, COLORS.success, 8)}
    ${pill("PROOF COMPLETE", 412, 184, 126, { fill: COLORS.background, color: COLORS.success })}
    ${text("Signed receipt. Small enough for the next turn.", 412, 252, { size: 30, weight: 680 })}
    ${text("The agent gets the verdict, evidence, stable findings, and exact rerun path.", 412, 285, { size: 15, color: COLORS.muted })}
    ${line(412, 316, 1074, 316, COLORS.line)}
    ${text("BUILD", 412, 352, { size: 11, color: COLORS.subtle, family: MONO, weight: 700 })}
    ${text("PASS", 412, 382, { size: 21, color: COLORS.success, family: MONO, weight: 700 })}
    ${text("TEST", 600, 352, { size: 11, color: COLORS.subtle, family: MONO, weight: 700 })}
    ${text("PASS", 600, 382, { size: 21, color: COLORS.success, family: MONO, weight: 700 })}
    ${text("VERDICT", 788, 352, { size: 11, color: COLORS.subtle, family: MONO, weight: 700 })}
    ${text("REVIEWABLE", 788, 382, { size: 21, color: COLORS.text, family: MONO, weight: 700 })}
    ${line(412, 414, 1074, 414, COLORS.line)}
    ${text("latest.proof.json", 412, 452, { size: 14, color: COLORS.text, family: MONO, weight: 600 })}
    ${text("Ed25519 signed", 1074, 452, { size: 13, color: COLORS.success, family: MONO, anchor: "end" })}
    ${text("source-free  /  resumable  /  portable", 412, 486, { size: 13, color: COLORS.muted, family: MONO })}
    ${pill("REPAIR PACKET READY", 412, 516, 154, { fill: COLORS.background, color: COLORS.accent })}
    ${text("rerun: axint prove", 1074, 535, { size: 13, color: COLORS.muted, family: MONO, anchor: "end" })}
  </g>`;
}

function capabilityStrip(time) {
  const labels = ["GENERATE", "CHECK", "RUN", "TEAM", "CLOUD"];
  const active = Math.min(labels.length - 1, Math.floor(time / 2.4));
  return labels
    .map((label, index) => {
      const x = 382 + index * 145;
      const color =
        index === active ? COLORS.accent : index < active ? COLORS.text : COLORS.subtle;
      return `${text(label, x, 654, { size: 11, color, family: MONO, weight: index === active ? 700 : 600 })}${
        index === active ? rect(x, 666, 68, 3, COLORS.accent, "none", 1) : ""
      }`;
    })
    .join("");
}

function frameSvg(frameIndex) {
  const time = frameIndex / FPS;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${COLORS.grid}" stroke-width="1" opacity="0.22"/>
    </pattern>
  </defs>
  ${rect(0, 0, WIDTH, HEIGHT, COLORS.background, "none", 0)}
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  ${logoMark()}
  ${text("axint", 124, 72, { size: 35, weight: 720 })}
  ${pill("OPEN SOURCE", 224, 48, 92, { color: COLORS.text })}
  ${text("APPLE-NATIVE PROOF + REPAIR", 1142, 62, { size: 11, color: COLORS.muted, family: MONO, weight: 700, anchor: "end" })}
  ${text("MCP  /  CLI  /  XCODE  /  CI", 1142, 82, { size: 11, color: COLORS.subtle, family: MONO, anchor: "end" })}
  ${line(48, 110, 1152, 110, COLORS.line)}
  ${rect(48, 132, 268, 548, COLORS.surface, COLORS.line, 8)}
  ${rect(348, 132, 804, 476, COLORS.surface, COLORS.line, 8)}
  ${pipeline(time)}
  ${introScene(time)}
  ${discoverScene(time)}
  ${checkScene(time)}
  ${xcodeScene(time)}
  ${reconcileScene(time)}
  ${receiptScene(time)}
  ${capabilityStrip(time)}
  ${text("axint.ai", 1142, 674, { size: 12, color: COLORS.muted, family: MONO, weight: 600, anchor: "end" })}
</svg>`;
}

function socialPreviewSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640">
  <defs>
    <pattern id="social-grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${COLORS.grid}" stroke-width="1" opacity="0.26"/>
    </pattern>
  </defs>
  ${rect(0, 0, 1280, 640, COLORS.background, "none", 0)}
  <rect width="1280" height="640" fill="url(#social-grid)"/>
  <g transform="translate(58,48)">
    <polyline points="18,2 2,20 18,38" fill="none" stroke="${COLORS.text}" stroke-width="5"/>
    <polyline points="38,2 54,20 38,38" fill="none" stroke="${COLORS.text}" stroke-width="5"/>
    <rect x="25" y="17" width="6" height="6" fill="${COLORS.accent}"/>
  </g>
  ${text("axint", 128, 82, { size: 34, weight: 720 })}
  ${pill("OPEN SOURCE", 226, 54, 92, { color: COLORS.text })}
  ${text("PROOF + REPAIR FOR APPLE CODING AGENTS", 58, 166, { size: 12, color: COLORS.accent, family: MONO, weight: 700 })}
  ${text("Agents can write Swift.", 58, 230, { size: 45, weight: 720 })}
  ${text("Axint makes them prove it.", 58, 286, { size: 45, weight: 720 })}
  ${text("Generate Apple-native capabilities. Check existing Swift.", 58, 340, { size: 18, color: COLORS.muted })}
  ${text("Reconcile every finding with Xcode, tests, and runtime evidence.", 58, 370, { size: 18, color: COLORS.muted })}
  ${line(58, 424, 686, 424, COLORS.line)}
  ${text("GENERATE", 58, 464, { size: 12, color: COLORS.text, family: MONO, weight: 700 })}
  ${text("CHECK", 180, 464, { size: 12, color: COLORS.text, family: MONO, weight: 700 })}
  ${text("RUN", 278, 464, { size: 12, color: COLORS.text, family: MONO, weight: 700 })}
  ${text("TEAM", 356, 464, { size: 12, color: COLORS.text, family: MONO, weight: 700 })}
  ${text("CLOUD", 445, 464, { size: 12, color: COLORS.text, family: MONO, weight: 700 })}
  ${text("axint.ai", 58, 558, { size: 16, color: COLORS.muted, family: MONO, weight: 600 })}

  ${rect(744, 94, 474, 452, COLORS.surface, COLORS.line, 8)}
  ${text("PROOF LOOP", 776, 132, { size: 11, color: COLORS.subtle, family: MONO, weight: 700 })}
  ${pill("COMPLETE", 1092, 112, 94, { fill: COLORS.background, color: COLORS.success })}
  ${statusRow("Discover project", "OK", 192, 1, COLORS.success, { x: 776, width: 410 })}
  ${statusRow("Check Swift", "REVIEWABLE", 252, 1, COLORS.warning, { x: 776, width: 410 })}
  ${statusRow("Run Xcode proof", "PASS", 312, 1, COLORS.success, { x: 776, width: 410 })}
  ${statusRow("Reconcile evidence", "DONE", 372, 1, COLORS.success, { x: 776, width: 410 })}
  ${line(776, 418, 1186, 418, COLORS.line)}
  ${text("latest.proof.json", 776, 458, { size: 15, color: COLORS.text, family: MONO, weight: 600 })}
  ${text("Ed25519 signed", 1186, 458, { size: 13, color: COLORS.success, family: MONO, anchor: "end" })}
  ${text("source-free / portable / ready for repair", 776, 494, { size: 12, color: COLORS.muted, family: MONO })}
</svg>`;
}

function run() {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "ImageMagick 7 is required. Install it with `brew install imagemagick`."
    );
  }
  try {
    execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("librsvg is required. Install it with `brew install librsvg`.");
  }

  const workDir = mkdtempSync(join(tmpdir(), "axint-readme-demo-"));
  try {
    const frames = [];
    for (let index = 0; index < FRAME_COUNT; index += 1) {
      const stem = `frame-${String(index).padStart(3, "0")}`;
      const svgPath = join(workDir, `${stem}.svg`);
      const pngPath = join(workDir, `${stem}.png`);
      writeFileSync(svgPath, frameSvg(index), "utf8");
      execFileSync(
        "rsvg-convert",
        [
          "--width",
          String(WIDTH),
          "--height",
          String(HEIGHT),
          "--output",
          pngPath,
          svgPath,
        ],
        { stdio: "inherit" }
      );
      frames.push(pngPath);
    }

    const gifPath = join(MEDIA_DIR, "intro.gif");
    const posterPath = join(MEDIA_DIR, "intro.png");
    const socialPreviewSvgPath = join(workDir, "social-preview.svg");
    const socialPreviewPath = join(ROOT, "docs", "assets", "social-preview.png");
    execFileSync(
      "magick",
      [
        "-delay",
        String(100 / FPS),
        ...frames,
        "-loop",
        "0",
        "-layers",
        "Optimize",
        "-colors",
        "128",
        gifPath,
      ],
      { stdio: "inherit" }
    );
    copyFileSync(frames[Math.floor(FRAME_COUNT * 0.9)], posterPath);
    writeFileSync(socialPreviewSvgPath, socialPreviewSvg(), "utf8");
    execFileSync(
      "rsvg-convert",
      [
        "--width",
        "1280",
        "--height",
        "640",
        "--output",
        socialPreviewPath,
        socialPreviewSvgPath,
      ],
      { stdio: "inherit" }
    );

    if (
      !existsSync(gifPath) ||
      !existsSync(posterPath) ||
      !existsSync(socialPreviewPath)
    ) {
      throw new Error(
        "Demo generation completed without producing every expected asset."
      );
    }
    console.log(`Generated ${gifPath}`);
    console.log(`Generated ${posterPath}`);
    console.log(`Generated ${socialPreviewPath}`);
  } finally {
    if (process.env.AXINT_DEMO_KEEP_FRAMES !== "1") {
      rmSync(workDir, { recursive: true, force: true });
    } else {
      console.log(`Kept source frames in ${workDir}`);
    }
  }
}

run();
