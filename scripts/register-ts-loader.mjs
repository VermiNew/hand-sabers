import { registerHooks } from 'node:module';
import { load, resolve } from './resolve-ts-imports.mjs';

registerHooks({ load, resolve });
