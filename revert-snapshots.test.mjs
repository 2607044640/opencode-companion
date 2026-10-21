import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createSnapshotStore } from './revert-snapshots.mjs'

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'revert-test-'))
  const work = path.join(root, 'AISpace')
  const note = path.join(root, 'ObsidianNote')
  const desktop = path.join(root, 'Desktop')
  for (const dir of [work, note, desktop]) fs.mkdirSync(dir)
  const options = { root: path.join(root, 'snapshots'), allowedRoots: [work, note, desktop], safeDelete: (file) => fs.renameSync(file, file + '.recycle') }
  return { root, work, note, desktop, options, store: createSnapshotStore(options) }
}

test('exact bytes across workspaces and desktop survive repeated edits and store restart', () => {
  const f = fixture()
  const paths = [f.work, f.note, f.desktop].map((dir) => path.join(dir, 'same.txt'))
  const original = Buffer.from([0xef, 0xbb, 0xbf, 65, 13, 10, 0, 255])
  for (const file of paths) fs.writeFileSync(file, original)
  f.store.capture('ses_a', 'call_1', paths)
  for (const file of paths) fs.writeFileSync(file, 'middle\n')
  f.store.finish('ses_a', 'call_1')
  f.store.capture('ses_a', 'call_2', paths)
  for (const file of paths) fs.writeFileSync(file, 'last\n')
  f.store.finish('ses_a', 'call_2')
  assert.equal(createSnapshotStore(f.options).restore('ses_a', ['call_1', 'call_2']).ok, true)
  for (const file of paths) assert.deepEqual(fs.readFileSync(file), original)
  assert.deepEqual(f.store.restore('ses_a', ['call_1', 'call_2']).applied, [])
})

test('empty originals, newly created files and moved files restore exact existence', () => {
  const f = fixture()
  const old = path.join(f.note, 'empty.txt')
  const created = path.join(f.desktop, 'new.txt')
  fs.writeFileSync(old, '')
  f.store.capture('s', 'c', [old, created])
  fs.renameSync(old, created)
  f.store.finish('s', 'c')
  f.store.restore('s', ['c'])
  assert.equal(fs.readFileSync(old).length, 0)
  assert.equal(fs.existsSync(created), false)
  assert.equal(fs.existsSync(created + '.recycle'), true)
})

test('conflicting later changes reject the entire preflight without touching another file', () => {
  const f = fixture()
  const a = path.join(f.work, 'a.txt'), b = path.join(f.note, 'b.txt')
  for (const file of [a, b]) fs.writeFileSync(file, 'before')
  f.store.capture('s', 'c', [a, b])
  for (const file of [a, b]) fs.writeFileSync(file, 'after')
  f.store.finish('s', 'c')
  fs.writeFileSync(b, 'human edit')
  assert.throws(() => f.store.restore('s', ['c']), /changed/)
  assert.equal(fs.readFileSync(a, 'utf8'), 'after')
  assert.equal(fs.readFileSync(b, 'utf8'), 'human edit')
})

test('protected paths, escaped symlinks, unfinished calls and wrong sessions fail closed', () => {
  const f = fixture()
  assert.throws(() => f.store.capture('s', 'env', [path.join(f.work, '.env')]), /protected/)
  assert.throws(() => f.store.capture('s', 'escape', [path.join(f.root, 'outside')]), /outside/)
  try {
    fs.symlinkSync(f.note, path.join(f.work, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => f.store.capture('s', 'link', [path.join(f.work, 'link', 'a.txt')]), /physical root/)
  } catch (err) {
    if (err.code !== 'EPERM') throw err
  }
  f.store.capture('s', 'pending', [path.join(f.work, 'a.txt')])
  assert.throws(() => f.store.restore('s', ['pending']), /completion/)
  assert.throws(() => f.store.restore('wrong', ['pending']), /ENOENT/)
})

test('omitted branched calls still restore the earliest pre-mutation state, including deletes', () => {
  const f = fixture(), a = path.join(f.desktop, 'created.txt')
  f.store.capture('s', 'create', [a]); fs.writeFileSync(a, 'created'); f.store.finish('s', 'create')
  f.store.capture('s', 'edit_a', [a]); fs.writeFileSync(a, 'branch-a'); f.store.finish('s', 'edit_a')
  fs.writeFileSync(a, 'created')
  f.store.capture('s', 'edit_b', [a]); fs.writeFileSync(a, 'branch-b'); f.store.finish('s', 'edit_b')
  assert.equal(f.store.restore('s', ['create', 'edit_b']).ok, true)
  assert.equal(fs.existsSync(a), false)
  assert.equal(fs.existsSync(a + '.recycle'), true)
})

test('an external write between kept snapshots still restores the earliest recorded bytes', () => {
  const f = fixture(), a = path.join(f.work, 'a.txt')
  fs.writeFileSync(a, 'one')
  f.store.capture('s', 'c1', [a]); fs.writeFileSync(a, 'two'); f.store.finish('s', 'c1')
  fs.writeFileSync(a, 'external')
  f.store.capture('s', 'c2', [a]); fs.writeFileSync(a, 'three'); f.store.finish('s', 'c2')
  assert.equal(f.store.restore('s', ['c1', 'c2']).ok, true)
  assert.equal(fs.readFileSync(a, 'utf8'), 'one')
  fs.writeFileSync(a, 'human edit')
  assert.throws(() => f.store.restore('s', ['c1', 'c2']), /changed/)
  assert.equal(fs.readFileSync(a, 'utf8'), 'human edit')
})

test('corrupt snapshot bytes cannot restore', () => {
  const f = fixture(), a = path.join(f.work, 'a.txt')
  fs.writeFileSync(a, 'one')
  f.store.capture('s', 'c2', [a]); fs.writeFileSync(a, 'three'); f.store.finish('s', 'c2')
  const sessionDir = path.join(f.options.root, fs.readdirSync(f.options.root)[0])
  for (const name of fs.readdirSync(sessionDir)) {
    const file = path.join(sessionDir, name), record = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (record.call === 'c2') { record.entries[0].content = Buffer.from('bad').toString('base64'); fs.writeFileSync(file, JSON.stringify(record)) }
  }
  assert.throws(() => f.store.restore('s', ['c2']), /integrity/)
  assert.equal(fs.readFileSync(a, 'utf8'), 'three')
})

test('actual jail hook captures a cross-directory patch before mutation and attaches only references', { skip: process.platform === 'win32' }, async () => {
  const { default: RevertSnapshot } = await import('/home/developer/projects/AICore/opencode-jail/plugins/revert-snapshot.js')
  const f = fixture()
  const a = path.join(f.work, 'a.txt'), b = path.join(f.desktop, 'b.txt')
  fs.writeFileSync(a, 'header\nmiddle\nfooter\n')
  const hooks = await RevertSnapshot({ directory: f.work }, { snapshotRoot: f.options.root })
  const input = { tool: 'apply_patch', sessionID: 'ses_hook', callID: 'call_hook' }
  await hooks['tool.execute.before'](input, { args: { patchText: `*** Begin Patch\n*** Update File: ${a}\n@@\n-middle\n+changed\n*** Add File: ${b}\n+new\n*** End Patch` } })
  fs.writeFileSync(a, 'header\nchanged\nfooter\n'); fs.writeFileSync(b, 'new\n')
  const output = { metadata: {} }
  await hooks['tool.execute.after'](input, output)
  assert.equal(output.metadata.revertSnapshot.call, 'call_hook')
  assert.equal(JSON.stringify(output).includes('middle'), false)
  f.store.restore('ses_hook', ['call_hook'])
  assert.equal(fs.readFileSync(a, 'utf8'), 'header\nmiddle\nfooter\n')
  assert.equal(fs.existsSync(b), false)
  await assert.rejects(hooks['tool.execute.before']({ ...input, callID: 'bad' }, { args: { patchText: 'unrecognized patch' } }), /No snapshot paths/)
})

test('host API rejects legacy contents instead of reporting skipped actions as success', async () => {
  const { handleHostApi } = await import('./host-api.mjs')
  const body = JSON.stringify({ actions: [{ kind: 'restore', path: '/mnt/desktop/any.txt', content: 'fragment' }] })
  const req = { url: '/api/external-file-rollback', method: 'POST', on(event, handler) { if (event === 'data') handler(Buffer.from(body)); if (event === 'end') handler() } }
  let payload
  const res = { statusCode: 0, setHeader() {}, end(data) { payload = JSON.parse(data) } }
  await handleHostApi(req, res)
  assert.equal(res.statusCode, 409)
  assert.equal(payload.ok, false)
  assert.match(payload.error, /snapshot/i)
})
