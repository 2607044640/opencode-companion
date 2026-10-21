# Full-file revert snapshots

The jail plugin `AICore/opencode-jail/plugins/revert-snapshot.js` captures original bytes and existence before native edit/write/apply_patch/patch calls. Capture failure blocks the call. Completion records the resulting SHA-256 digest and adds an opaque reference to tool metadata. Bytes are stored under `.agent-work/revert-snapshots` (gitignored), not sent in model output.

Companion uses the selected message's tool metadata to request restoration through its existing host endpoint. It requires complete snapshots, verifies their content hashes, preflights all current file hashes, restores full bytes, and verifies the result. Newly created files go through Safe Delete; there is no unlink fallback. Git history and formatted read output are not recovery sources.

Conversation boundaries use native v2 `revert/stage` with `files:false`. Its response is RevertState, so the client fetches Session separately. Failure never falls back to the native disk-mutating revert. Code-only does not set or clear conversation boundaries.

## Activation and manual acceptance

1. From the Windows host, reload OpenCode using `python C:\AICore\skills\OpenCodeBackendOps\scripts\reload_opencode_service.py`. Do not run this inside the active jail conversation. Restart the Companion host server so it loads the changed host API, then refresh the 5173 PWA.
2. Use disposable files in AISpace, ObsidianNote and Desktop. Record original SHA-256 values (include one empty file and one CRLF file). In an AISpace session ask the AI to edit all three using native modification tools and create a fourth file. Verify each completed tool metadata has `revertSnapshot` with session and call identifiers.
3. Click the initiating user message's Revert. The confirmation must open. Choose code-only. Verify all original hashes match, the new file has gone through Safe Delete, and conversation messages remain.
4. Repeat with two successive edits and choose both. Verify bytes and conversation boundary. Repeat with conversation-only: file hashes must remain unchanged.
5. Change a test file manually after the AI mutation, then request revert. Expect a visible conflict error and no preflighted file mutation. Use a historical message without snapshot metadata: expect an explicit unavailable-snapshot error, never a guessed restore.

## Known limits requiring further work

- Not retroactive: historical mutations without complete snapshots cannot be recovered by this engine.
- Shell/package-manager changes and unrecognized custom tool names are not captured. Failed calls with partial mutations require manual snapshot inspection.
- Symlink descendants and files over 32 MiB are blocked. Workspace root mounts themselves are supported. Desktop mapping currently assumes `%USERPROFILE%\Desktop`; redirected/OneDrive Desktop requires explicit mapping work.
- No distributed lock against other processes. Hash preflight detects prior conflicts, but does not eliminate a writer racing after preflight. Multi-file OS I/O failure can leave partial restoration; errors are surfaced and retries accept files already restored. There is no crash-atomic multi-file transaction.
- Original bytes are persisted locally; protected paths are excluded, but file content is not a general-purpose secret scanner. Snapshot retention/garbage collection is not implemented.
- Native unrevert restores conversation visibility; this implementation does not provide file redo. A later revert uses the earliest requested snapshot even when an intermediate call was omitted by a branch or a previous rollback. The file must still match one recorded before or after digest from that request.
- Original OpenCode UI remains original; these changes wire the 5173 Companion flow only. The missing-confirmation report has not been reproduced in the Windows PWA.
- Windows activation and live daemon-to-PWA metadata persistence must be tested before calling the feature delivered.

## Verification in jail

`node --test revert-snapshots.test.mjs` exercises actual filesystem bytes and the real plugin hook adapter. The fake Safe Delete adapter moves test files to a recycle name; the Windows Safe Delete process itself is not exercised.

`npm run build` passed. Windows-native dependencies prevent the standard Linux `npm test` and lint run from passing reliably. An isolated TypeScript loader at `/tmp/opencode/revert-ts-loader.mjs` runs the test sources without esbuild; see the session decision record for exact counts and remaining failures. No project dependencies were replaced.
