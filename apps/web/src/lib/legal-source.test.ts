import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_VERSION } from '@vtp/shared-types';
import { describe, expect, it } from 'vitest';
import { readLegalSource, renderLegalModule } from './legal-source';

const root = join(import.meta.dirname, '..', '..', '..', '..');

describe('legal pages', () => {
  it('are generated from docs/legal (run `pnpm --filter @vtp/web legal:build`)', () => {
    const generated = readFileSync(
      join(import.meta.dirname, '..', 'content', 'legal.generated.ts'),
      'utf8',
    );
    expect(generated).toBe(renderLegalModule(readLegalSource(root)));
  });

  it('use the version users accept', () => {
    expect(readLegalSource(root).version).toBe(LEGAL_VERSION);
  });

  it('leave no placeholder unfilled', () => {
    for (const doc of readLegalSource(root).documents) expect(doc.markdown).not.toMatch(/\{\{/);
  });
});
