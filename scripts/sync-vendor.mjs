import { copyFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const source = 'node_modules/jszip/dist/jszip.min.js';
const target = 'src/vendor/jszip.min.js';

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Vendor synced: ${target}`);
