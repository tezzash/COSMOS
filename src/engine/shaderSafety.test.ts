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

  it('pins central Chapter IV Yin-Yang hero shaders strictly to highp precision', () => {
    const yinYangSrc = fs.readFileSync(
      path.join(ENGINE_DIR, 'scenes/CosmicYinYangFormation.ts'),
      'utf8',
    );
    const highpMatches = yinYangSrc.match(/precision:\s*'highp'/g) ?? [];
    expect(highpMatches.length).toBeGreaterThanOrEqual(2);
    expect(yinYangSrc).not.toMatch(/this\.starMat\.precision\s*=/);
    expect(yinYangSrc).not.toMatch(/this\.nebulaMat\.precision\s*=/);
  });

  it('uses mediump-safe hash math and highp vertex transform guards on ambient shaders', () => {
    const ambientFiles = [
      'scenes/DynamicNebulaParticles.ts',
      'scenes/ProceduralGalaxySystem.ts',
    ];
    for (const rel of ambientFiles) {
      const src = fs.readFileSync(path.join(ENGINE_DIR, rel), 'utf8');
      expect(src).not.toContain('456.21');
      expect(src).toContain('0.1031');
      expect(src).toContain('precision highp float;');
    }
  });

  it('never causes cross-stage uniform precision mismatch when vertex shaders use precision highp float', () => {
    const pairFiles = [
      'shaders.ts',
      'scenes/DynamicNebulaParticles.ts',
      'scenes/CosmicDriftField.ts',
      'scenes/ProceduralGalaxySystem.ts',
    ];
    const mismatches: string[] = [];

    for (const rel of pairFiles) {
      const src = fs.readFileSync(path.join(ENGINE_DIR, rel), 'utf8');
      const namedShaderRegex =
        /const\s+([A-Z0-9_]+_(VERTEX|FRAGMENT)_SHADER)\s*=\s*\/\*\s*glsl\s*\*\/\s*`([\s\S]*?)`/g;
      const shaders = new Map<string, string>();
      let m: RegExpExecArray | null;
      while ((m = namedShaderRegex.exec(src)) !== null) {
        if (m[1] && m[3]) shaders.set(m[1], m[3]);
      }

      for (const [name, vertSrc] of shaders.entries()) {
        if (!name.endsWith('_VERTEX_SHADER') || !vertSrc.includes('precision highp float;')) {
          continue;
        }
        const fragName = name.replace('_VERTEX_SHADER', '_FRAGMENT_SHADER');
        const fragSrc = shaders.get(fragName);
        if (!fragSrc) continue;

        const extractUniforms = (glsl: string) =>
          new Set(
            Array.from(glsl.matchAll(/^\s*uniform\s+(?:float|vec[234]|mat[234])\s+(\w+)\s*;/gm)).map(
              (u) => u[1] ?? '',
            ),
          );
        const vertUniforms = extractUniforms(vertSrc);
        const fragUniforms = extractUniforms(fragSrc);
        for (const u of vertUniforms) {
          if (u && fragUniforms.has(u)) {
            mismatches.push(`${rel}: ${name}/${fragName} shares un-qualified uniform '${u}'`);
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
