import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLegalSource, renderLegalModule } from '../src/lib/legal-source';

const root = join(import.meta.dirname, '..', '..', '..');
const target = join(import.meta.dirname, '..', 'src', 'content', 'legal.generated.ts');
writeFileSync(target, renderLegalModule(readLegalSource(root)));
console.log(`Wrote ${target}`);
