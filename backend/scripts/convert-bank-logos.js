#!/usr/bin/env node

/**
 * Bank Logo Converter Script
 * Converts downloaded PNG / JPG bank logos into high-efficiency, lightweight WebP/AVIF format.
 *
 * Usage:
 *   node backend/scripts/convert-bank-logos.js [input-directory] [output-directory]
 * Example:
 *   node backend/scripts/convert-bank-logos.js ./raw-logos ./frontend/public/banks
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const inputDir = process.argv[2] || path.resolve("raw-logos");
const outputDir = process.argv[3] || path.resolve("frontend/public/banks");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

if (!fs.existsSync(inputDir)) {
  console.log(`Input directory "${inputDir}" not found. Creating it for you...`);
  fs.mkdirSync(inputDir, { recursive: true });
  console.log(`Place your bank logo PNG or JPG files inside: ${inputDir}`);
  process.exit(0);
}

const files = fs.readdirSync(inputDir).filter((file) => /\.(png|jpe?g)$/i.test(file));

if (files.length === 0) {
  console.log(`No PNG or JPG images found in "${inputDir}".`);
  process.exit(0);
}

console.log(`Found ${files.length} image(s) to convert...`);

for (const file of files) {
  const ext = path.extname(file);
  const baseName = path.basename(file, ext).toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const inputFilePath = path.join(inputDir, file);
  const outputFilePath = path.join(outputDir, `${baseName}.webp`);

  try {
    // Try cwebp command-line tool if available
    execSync(`cwebp -q 80 -resize 96 96 "${inputFilePath}" -o "${outputFilePath}"`, { stdio: "pipe" });
    console.log(`✓ Converted with cwebp: ${file} -> ${baseName}.webp`);
  } catch {
    try {
      // Fallback: Copy to destination if cwebp isn't installed
      const destPath = path.join(outputDir, `${baseName}${ext}`);
      fs.copyFileSync(inputFilePath, destPath);
      console.log(`ℹ Copied image directly to: ${destPath}`);
    } catch (err) {
      console.error(`✗ Failed to process ${file}:`, err.message);
    }
  }
}

console.log("\nLogo processing complete!");
