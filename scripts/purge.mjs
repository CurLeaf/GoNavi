#!/usr/bin/env node
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TREES = ['.superpowers', 'openspec', 'tests', 'design', '.cursor/plans']

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'vendor',
  'wailsjs',
  'third_party',
  'dist',
  'build',
])

const FIXTURE_DIR_NAMES = new Set(['__test__', '_test_', '__tests__'])

/** Vitest / Go / Pester 散落测试，含与实现成对的文件 */
const STRAY_TEST_FILE = /\.test\.(?:[cm]?[jt]sx?)$|_test\.go$|\.Tests\.ps1$/

function toPosix(path) {
  return path.replace(/\\/g, '/')
}

function removePath(path) {
  if (!existsSync(path)) {
    console.log(`skip (missing) ${path}`)
    return 0
  }
  rmSync(path, { recursive: true, force: true })
  console.log(`removed ${path}`)
  return 1
}

function walk(dir, onFile, onFixtureDir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (!st.isDirectory()) {
      onFile(full, name)
      continue
    }
    if (SKIP_DIR_NAMES.has(name)) continue
    if (FIXTURE_DIR_NAMES.has(name)) {
      onFixtureDir(full)
      continue
    }
    walk(full, onFile, onFixtureDir)
  }
}

/**
 * 清掉本仓工作流残留、散落测试与夹具目录。
 * `*.test.{ts,tsx,js,jsx,mjs,cjs,mts,cts}` / `*_test.go` / `*.Tests.ps1` 一律删除。
 * docs/ 整棵留给人工清理。
 */
export function purgeRepo(root) {
  let removed = 0
  for (const rel of TREES) removed += removePath(join(root, rel))
  walk(
    root,
    (full, name) => {
      if (STRAY_TEST_FILE.test(name)) removed += removePath(full)
    },
    (full) => {
      removed += removePath(full)
    },
  )
  console.log(`purged ${removed} path(s)`)
  return removed
}

const isDirect = process.argv[1] && /purge\.(mjs|js|ts)$/.test(toPosix(process.argv[1]))
if (isDirect) purgeRepo(process.argv[2] || process.cwd())
