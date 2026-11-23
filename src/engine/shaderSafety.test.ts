import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE_DIR = path.resolve(process.cwd(), 'src/engine');

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extracts GLSL shader template literals tagged with `/* glsl *\/` from a TypeScript file.
 */
function extractGlslBlocks(source: string): string[] {
  const blocks: string[] = [];
  const regex = /\/\*\s*glsl\s*\*\/\s*`([\s\S]*?)`/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    if (match[1]) blocks.push(match[1]);
  }
  return blocks;
}

describe('GLSL shader NaN safety across hardware GPUs (Apple Metal / ANGLE D3D11)', () => {
  const files = collectTsFiles(ENGINE_DIR);

  it('finds GLSL shader blocks to audit', () => {
    const totalBlocks = files.reduce(
      (sum, f) => sum + extractGlslBlocks(fs.readFileSync(f, 'utf8')).length,
      0,
    );
    expect(totalBlocks).toBeGreaterThan(15);
  });

  it('never uses pow(..., 2.0) inside GLSL shaders (which yields NaN for negative bases on Metal/D3D11)', () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const blocks = extractGlslBlocks(content);
      for (const glsl of blocks) {
        const lines = glsl.split('\n');
        for (const line of lines) {
          if (/\bpow\s*\([^;\n]*,\s*2(?:\.0)?\s*\)/.test(line)) {
            violations.push(`${path.relative(process.cwd(), file)}: ${line.trim()}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('never uses exp(-pow(signed_diff, ...)) patterns in GLSL shaders', () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const blocks = extractGlslBlocks(content);
      for (const glsl of blocks) {
        const lines = glsl.split('\n');
        for (const line of lines) {
          // Allow exp(-pow(max(0.0001, ...), ...)) where base is explicitly clamped positive
          if (/exp\(\s*-\s*pow\(/.test(line) && !/exp\(\s*-\s*pow\(\s*max\(\s*0\.0001/.test(line)) {
            violations.push(`${path.relative(process.cwd(), file)}: ${line.trim()}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
