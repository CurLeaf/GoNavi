import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { purgeRepo } from './purge.mjs'

function touch(root, rel, content = 'x') {
  const full = join(root, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

function makeSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'gonavi-purge-'))
  for (const tree of ['.superpowers/plans', 'openspec', 'tests', 'design', '.cursor/plans']) {
    touch(root, `${tree}/note.md`)
  }
  touch(root, 'docs/keep.md')
  touch(root, 'pkg/impl.go')
  touch(root, 'pkg/impl_test.go')
  touch(root, 'frontend/src/impl.ts')
  touch(root, 'frontend/src/impl.test.ts')
  touch(root, 'frontend/src/impl.test.tsx')
  touch(root, 'win/Foo.Tests.ps1')
  touch(root, 'pkg/__tests__/a.ts')
  touch(root, 'pkg/_test_/b.ts')
  touch(root, 'pkg/__test__/c.ts')
  touch(root, 'node_modules/pkg/x.test.ts')
  touch(root, 'vendor/pkg/x_test.go')
  touch(root, 'frontend/wailsjs/x.test.ts')
  touch(root, 'third_party/lib/x.test.ts')
  touch(root, 'dist/x.test.ts')
  touch(root, 'build/x.test.ts')
  touch(root, '.git/hooks/x.test.ts')
  touch(root, 'scripts/purge.test.mjs')
  touch(root, 'scripts/keep.ts')
  return {
    root,
    at: (rel) => join(root, rel),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

test('removes workflow trees', () => {
  const box = makeSandbox()
  try {
    purgeRepo(box.root)
    for (const rel of ['.superpowers', 'openspec', 'tests', 'design', '.cursor/plans']) {
      assert.equal(existsSync(box.at(rel)), false, rel)
    }
  } finally {
    box.cleanup()
  }
})

test('removes stray tests and fixture dirs, keeps paired sources', () => {
  const box = makeSandbox()
  try {
    purgeRepo(box.root)
    assert.equal(existsSync(box.at('pkg/impl_test.go')), false)
    assert.equal(existsSync(box.at('frontend/src/impl.test.ts')), false)
    assert.equal(existsSync(box.at('frontend/src/impl.test.tsx')), false)
    assert.equal(existsSync(box.at('win/Foo.Tests.ps1')), false)
    assert.equal(existsSync(box.at('pkg/__tests__')), false)
    assert.equal(existsSync(box.at('pkg/_test_')), false)
    assert.equal(existsSync(box.at('pkg/__test__')), false)
    assert.equal(existsSync(box.at('pkg/impl.go')), true)
    assert.equal(existsSync(box.at('frontend/src/impl.ts')), true)
    assert.equal(existsSync(box.at('scripts/keep.ts')), true)
  } finally {
    box.cleanup()
  }
})

test('skips vendor-like trees and docs, keeps purge self-test', () => {
  const box = makeSandbox()
  try {
    purgeRepo(box.root)
    assert.equal(existsSync(box.at('docs/keep.md')), true)
    assert.equal(existsSync(box.at('node_modules/pkg/x.test.ts')), true)
    assert.equal(existsSync(box.at('vendor/pkg/x_test.go')), true)
    assert.equal(existsSync(box.at('frontend/wailsjs/x.test.ts')), true)
    assert.equal(existsSync(box.at('third_party/lib/x.test.ts')), true)
    assert.equal(existsSync(box.at('dist/x.test.ts')), true)
    assert.equal(existsSync(box.at('build/x.test.ts')), true)
    assert.equal(existsSync(box.at('.git/hooks/x.test.ts')), true)
    assert.equal(existsSync(box.at('scripts/purge.test.mjs')), true)
  } finally {
    box.cleanup()
  }
})
