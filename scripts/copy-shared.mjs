// Copies ../shared into functions/src/shared so `firebase deploy` (which only
// uploads the functions folder) sees the same token + model code as the client.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '..', 'shared')
const dst = resolve(here, '..', 'functions', 'src', 'shared')
mkdirSync(dst, { recursive: true })
cpSync(src, dst, { recursive: true })
console.log(`copied shared -> ${dst}`)
