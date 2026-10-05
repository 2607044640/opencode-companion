import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { companionSessionUrl, edgeLaunchArgs, resolveEdgeExecutable } from './pwa-launch.mjs'

describe('pwa-launch', () => {
  it('builds a same-origin session url and drops anything that is not a session id', () => {
    assert.equal(
      companionSessionUrl('ses_ef997f279ffeT8QYTSJf2St7K1'),
      'http://127.0.0.1:5173/?session=ses_ef997f279ffeT8QYTSJf2St7K1'
    )
    assert.equal(companionSessionUrl('ses_a b'), 'http://127.0.0.1:5173/')
    assert.equal(companionSessionUrl(''), 'http://127.0.0.1:5173/')
  })

  it('navigates the installed app instead of only focusing its previous url', () => {
    const args = edgeLaunchArgs('ses_target', 'gdgheecefcmlccfepljfcjakkdblfgmm', 'msedge.exe')
    assert.deepEqual(args, [
      '--app-id=gdgheecefcmlccfepljfcjakkdblfgmm',
      '--app-launch-url-for-shortcuts-menu-item=http://127.0.0.1:5173/?session=ses_target',
      '--profile-directory=Default',
    ])

    const helperArgs = edgeLaunchArgs('ses_target', 'gdgheecefcmlccfepljfcjakkdblfgmm', 'pwahelper.exe')
    assert.deepEqual(helperArgs, [
      '--app-id=gdgheecefcmlccfepljfcjakkdblfgmm',
      '--ip-edge-aumid=Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!MSEDGE',
      '--ip-override-url=http://127.0.0.1:5173/?session=ses_target',
      '--profile-directory=Default',
      '--app-launch-source=4',
    ])
  })

  it('uses the first edge or pwahelper path that exists', () => {
    const helper = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\pwahelper.exe'
    const x86 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    assert.equal(resolveEdgeExecutable((candidate) => candidate === helper), helper)
    assert.equal(resolveEdgeExecutable((candidate) => candidate === x86), x86)
    assert.equal(resolveEdgeExecutable(() => false), 'pwahelper.exe')
  })
})
