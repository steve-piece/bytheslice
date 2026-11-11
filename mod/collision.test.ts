// mod/collision.test.ts
// The two-session incident, replayed through the Pass's public surfaces: session A baked all of Pie 23 on one pie branch and opened PR 251; session B, on a slice branch cut from main in a merge-per-slice project, starts /sell-pie for the same pie. bts_status and the skill start must name A's work, and bts_claim must record B's claim and its release.

import { expect, test } from 'claude-code/testing'

import { CONFIG, LEDGER, SESSION, START_MS, engineLoops, rowsOf, stage, status } from './testing.tsx'
import type { World } from './testing.tsx'

// Named as a session lists it, so this file runs against a Pass without claims too (and fails there on what it asserts).
const CLAIM_LISTED = 'mcp__bytheslice__bts_claim'
const HOUR = 60 * 60 * 1000
const MAIN_SHA = 'c0ffee0000000000000000000000000000000001'
const A_BRANCH = 'pie-23-video-gif-posting'
const B_BRANCH = 'pie-23-s23.1-media-kinds'
const SLICES = ['23.1', '23.2', '23.3', '23.4', '23.5', '23.6']

/** Pie 23 open in B's checklist, as every worktree cut from main reads it, behind an earlier pie that still has an open row. */
const PIE_23 = [
  '## Pie 8 - Earlier [ ]    <!-- review: boundary -->',
  '### Slice 8.6 - Left open [ ]',
  'Status: Not Started',
  '',
  '## Pie 22 - Scheduling [x]    <!-- review: boundary -->',
  '### Slice 22.1 - Calendar [x]',
  '',
  '## Pie 23 - Video and GIF posting [ ]    <!-- review: boundary -->',
  ...SLICES.flatMap((id, i) => [`### Slice ${id} - Part ${i + 1} [ ]`, 'Status: Not Started', '']),
].join('\n')

const row = (sid: string, t: number, ev: string, slice: string | null, data?: Record<string, unknown>) =>
  JSON.stringify({ v: 1, t, sid, ev, ...(slice === null ? { pie: 23 } : { pie: 23, slice }), ...(data ? { data } : {}) })

/** Session A's ledger rows, written by an older plugin with no claim rows: starts, commits on its pie branch, done flips. */
function sessionA(lastT: number): string[] {
  const lines = [row('chat-a', lastT - 20 * HOUR, 'pie.started', null, { skill: 'sell-pie' })]
  SLICES.forEach((id, i) => {
    const t = lastT - (6 - i) * HOUR
    lines.push(row('chat-a', t, 'slice.started', id, { skill: 'sell-pie' }))
    lines.push(row('chat-a', t + 1000, 'commit', id, { sha: `a${i}`.padEnd(40, '0'), branch: A_BRANCH }))
    lines.push(row('chat-a', t + 2000, 'slice.done', id, { verdict: null }))
  })
  lines.push(row('chat-a', lastT, 'push', SLICES[5] ?? '23.6', { branch: A_BRANCH }))
  return lines
}

/** Git, gh and the worktrees as B's machine answers them. */
function answer(world: World, opts: { gh?: boolean } = {}): void {
  world.run = argv => {
    const line = argv.join(' ')
    if (line === 'git symbolic-ref --quiet --short refs/remotes/origin/HEAD') return { stdout: 'origin/main\n' }
    if (line.startsWith('git rev-parse --verify --quiet origin/main')) return { stdout: `${MAIN_SHA}\n` }
    if (argv[0] === 'git' && argv[1] === 'log' && argv.includes('--source')) {
      // A's twelve commits on its pushed pie branch, none on main or B's HEAD.
      const commits = SLICES.flatMap((id, i) => [
        [`b${i}`.padEnd(40, '1'), `refs/remotes/origin/${A_BRANCH}`, String(Math.floor((START_MS - (7 - i) * HOUR) / 1000)), `feat(pie-23): ${id} task 1 build`],
        [`a${i}`.padEnd(40, '0'), `refs/remotes/origin/${A_BRANCH}`, String(Math.floor((START_MS - (6 - i) * HOUR) / 1000)), `feat(pie-23): ${id} part ${i + 1}`],
      ])
      return { stdout: `${commits.map(c => c.join('\t')).join('\n')}\n` }
    }
    if (argv[0] === 'git' && argv[1] === 'log') return { stdout: `${MAIN_SHA} feat(pie-22): 22.1 calendar\n` }
    if (argv[0] === 'git' && argv[1] === 'for-each-ref') {
      return { stdout: `refs/heads/main\t${MAIN_SHA}\t1\nrefs/remotes/origin/${A_BRANCH}\t${'a5'.padEnd(40, '0')}\t2\n` }
    }
    if (line === 'git worktree list --porcelain') {
      return { stdout: `worktree /repo\nHEAD ${MAIN_SHA}\nbranch refs/heads/${B_BRANCH}\n\n` }
    }
    if (argv[0] === 'gh') {
      if (opts.gh === false) return { exitCode: 127, stderr: 'gh: not found' }
      const prs = [{ number: 251, title: 'Pie 23: Video and GIF posting', headRefName: A_BRANCH, url: 'https://github.com/o/r/pull/251', updatedAt: new Date(START_MS - HOUR).toISOString() }]
      return { stdout: JSON.stringify(prs) }
    }
    return undefined
  }
}

function incident(on: Parameters<typeof stage>[0], opts: { gh?: boolean; aLive?: boolean } = {}) {
  const staged = stage(on, { checklist: PIE_23, branch: B_BRANCH })
  const { world } = staged
  world.files[CONFIG] = JSON.stringify({ delivery: { mode: 'merge-per-slice' } })
  world.files[LEDGER] = `${sessionA(START_MS - 2 * HOUR).join('\n')}\n`
  // A's chat is still open on this machine: its roadmap strip entry is fresh.
  if (opts.aLive !== false) world.store['strip:/repo:chat-a'] = { pie: 23, slice: null, status: 'done', branch: A_BRANCH, t: START_MS - 60000 }
  answer(world, opts)
  return staged
}

test('bts_status names the other session, its pie branch, its open PR and the delivery-mode mismatch', async ($, on) => {
  const { start } = incident(on)
  await start($)
  const text = await status($)
  expect(text).toContain('Other work on Pie 23: 2')
  expect(text).toContain(
    `Slices 23.1, 23.2, 23.3, 23.4, 23.5, 23.6 are also being built by another session (chat-a) on branch ${A_BRANCH} (12 commits not on the default branch, 23.1, 23.2, 23.3, 23.4, 23.5, 23.6 done in its ledger, last activity 1 h ago, PR 251 open)`,
  )
  expect(text).toContain(`delivery.mode is merge-per-slice (one branch and PR per slice), but another run used one pie branch, ${A_BRANCH}, for Pie 23`)
  expect(text).toContain('Next: other work is on Pie 23: raise a destructive_operation HITL with these facts before cutting a branch or writing code')
})

test('a /sell-pie start on that pie writes its claim and tells the model to raise a HITL before it cuts a branch', async ($, on) => {
  const { world, start } = incident(on)
  engineLoops(on)
  await start($)
  await $.skill.prompt({ skill: 'bytheslice:sell-pie', text: 'bake', frontmatter: {}, source: 'plugin' })
  const mine = rowsOf(world).filter(r => r.sid === SESSION)
  // Pie 23 from the branch, not Pie 8 (the first pie with an open row); contested, since A's work is there.
  const claims = mine.filter(r => r.ev === 'claim')
  expect(claims.map(r => [r.pie, r.slice ?? null, (r.data as Record<string, unknown>).branch, (r.data as Record<string, unknown>).contested])).toEqual([
    [23, null, B_BRANCH, true],
    [23, '23.1', B_BRANCH, true],
  ])
  expect(mine.filter(r => r.ev === 'pie.started' || r.ev === 'slice.started').every(r => r.pie === 23)).toBe(true)
  const warn = mine.find(r => r.ev === 'warn')
  expect((warn?.data as Record<string, unknown>).code).toBe('session-collision')
  expect(String((warn?.data as Record<string, unknown>).text)).toContain('PR 251 open')
  expect(String((warn?.data as Record<string, unknown>).text)).toContain('raise a destructive_operation HITL')
  expect(world.toasts.some(t => t.startsWith('Pass session-collision'))).toBe(true)
})

test('bts_claim records the goal and lists the conflicts; over: true records the takeover; release lets go', async ($, on) => {
  const { world, start } = incident(on)
  await start($)
  const claim = String((await $.tool.call({ tool: CLAIM_LISTED, pie: 23, slice: '23.1', goal: 'media kinds for video and GIF' })).result)
  expect(claim.startsWith('not claimed: other work is on Slice 23.1 (recorded as a contested claim, which nobody counts as a claim):')).toBe(true)
  expect(claim).toContain('Before cutting a branch or writing code, raise a destructive_operation HITL')
  const over = String((await $.tool.call({ tool: CLAIM_LISTED, pie: 23, slice: '23.1', over: true })).result)
  expect(over).toContain(`over chat-a, ${A_BRANCH} with the operator's approval`)
  // The takeover of 23.1 covers A's ledger rows and branch commits for it: this slice run's status no longer stops for them.
  expect((await status($)).includes('Other work on Pie 23')).toBe(false)
  const released = String((await $.tool.call({ tool: CLAIM_LISTED, slice: '23.1', release: 'abandoned' })).result)
  expect(released).toBe('released Slice 23.1 (abandoned)')
  const mine = rowsOf(world).filter(r => r.sid === SESSION)
  const d = (r: Record<string, unknown>) => r.data as Record<string, unknown>
  expect(mine.map(r => [r.ev, r.slice, d(r).goal ?? null, d(r).over ?? null, d(r).reason ?? null, d(r).contested ?? false])).toEqual([
    ['claim', '23.1', 'media kinds for video and GIF', null, null, true],
    ['claim', '23.1', null, ['chat-a', A_BRANCH], null, false],
    ['release', '23.1', null, null, 'abandoned', false],
  ])
  const bad = String((await $.tool.call({ tool: CLAIM_LISTED, slice: 'Slice 23.1', release: 'abandoned' })).result)
  expect(bad.startsWith('bts_claim: "Slice 23.1" is not a slice id')).toBe(true)
  expect(rowsOf(world).filter(r => r.sid === SESSION)).toHaveLength(3)
  // Asked about the whole pie, A's other five slices and its pie PR still show.
  const pie = String((await $.tool.call({ tool: CLAIM_LISTED, pie: 23, goal: 'the rest of the pie' })).result)
  expect(pie).toContain('Slices 23.2, 23.3, 23.4, 23.5, 23.6 are also being built by another session (chat-a)')
  expect(pie).toContain('PR 251 open')
  expect(pie.includes('Slices 23.1,')).toBe(false)
})

test('without gh the branch and ledger facts still show, and the claim says PRs were not checked', async ($, on) => {
  const { world, start } = incident(on, { gh: false })
  // Nothing past main anywhere and no other session: a clean pie.
  world.files[LEDGER] = ''
  const run = world.run
  world.run = argv => (argv[0] === 'git' && argv[1] === 'log' && argv.includes('--source') ? { stdout: '' } : run?.(argv))
  await start($)
  const text = await status($)
  expect(text.includes('Other work on Pie 23')).toBe(false)
  const claim = String((await $.tool.call({ tool: CLAIM_LISTED, slice: '23.1', goal: 'media kinds' })).result)
  expect(claim).toBe(`claimed Slice 23.1 on branch ${B_BRANCH}; no other session, branch or open PR is on it (open PRs were not checked: gh is unavailable).`)
})

test('a session that ended still shows its unmerged work, worded as ended rather than live', async ($, on) => {
  const { world, start } = incident(on, { aLive: false })
  world.store['strip-ended:/repo:chat-a'] = START_MS - HOUR
  await start($)
  const text = await status($)
  expect(text).toContain('were worked on by a session that has ended (chat-a)')
})

test('a merge-per-slice conductor on main starting /sell-pie 23 claims Pie 23, never the first open pie', async ($, on) => {
  const { world, start } = incident(on)
  world.branch = 'main'
  engineLoops(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  await $.tool.call({ tool: 'Skill', skill: 'bytheslice:sell-pie', args: '23' })
  const claims = rowsOf(world).filter(r => r.sid === SESSION && r.ev === 'claim')
  expect(claims.map(r => [r.pie, r.slice ?? null])).toEqual([
    [23, null],
    [23, '23.1'],
  ])
})

test('a session resumed from a plain message is checked at its first edit, and the warning rides on the edit result', async ($, on) => {
  const { world, start } = incident(on)
  on('tool.call', () => ({ result: 'edited' }))
  await start($)
  const ran = await $.tool.call({ tool: 'Edit', file_path: '/repo/src/media.ts', old_string: 'a', new_string: 'b' })
  expect((ran.context ?? []).some(text => text.includes('The Pass warning (session-collision): other work is already on Pie 23'))).toBe(true)
  expect(rowsOf(world).some(r => r.ev === 'warn' && (r.data as Record<string, unknown>).code === 'session-collision')).toBe(true)
  // Within the half hour the next edit reads nothing again.
  const before = world.runs.length
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/media.ts', old_string: 'b', new_string: 'c' })
  expect(world.runs.slice(before).some(argv => argv.includes('--source'))).toBe(false)
})

test('back-to-back reads reuse one git snapshot for ten seconds', async ($, on) => {
  const { world, start } = incident(on)
  await start($)
  await status($)
  await status($)
  expect(world.runs.filter(argv => argv[0] === 'git' && argv.includes('--source'))).toHaveLength(1)
})

test('the skill prompt a Skill tool call raises takes that call arguments, so the start is claimed on Pie 23', async ($, on) => {
  const { world, start } = incident(on)
  world.branch = 'main'
  engineLoops(on)
  // The engine beneath: running the Skill tool raises the skill prompt before the call returns.
  on('tool.call', async (_engine, e) => {
    if (e.tool === 'Skill') await $.skill.prompt({ skill: 'bytheslice:sell-pie', text: 'bake', frontmatter: {}, source: 'plugin' })
    return { result: {} }
  })
  await start($)
  await $.tool.call({ tool: 'Skill', skill: 'bytheslice:sell-pie', args: '23' })
  const mine = rowsOf(world).filter(r => r.sid === SESSION && (r.ev === 'claim' || r.ev === 'pie.started' || r.ev === 'slice.started'))
  expect(mine.every(r => r.pie === 23)).toBe(true)
  expect(mine.filter(r => r.ev === 'claim')).toHaveLength(2)
})

test('/sell-slice 23.1 is not stopped by another session working only on 23.2', async ($, on) => {
  const { world, start } = incident(on)
  world.branch = 'main'
  world.files[LEDGER] = ''
  world.store = {}
  const run = world.run
  world.run = argv => {
    if (argv[0] === 'git' && argv[1] === 'log' && argv.includes('--source')) {
      return { stdout: `${'c'.padEnd(40, '2')}\trefs/remotes/origin/pie-23-s23.2-upload\t${Math.floor((START_MS - HOUR) / 1000)}\tfeat(pie-23): 23.2 task 1 upload\n` }
    }
    if (argv[0] === 'gh') return { stdout: '[]' }
    return run?.(argv)
  }
  engineLoops(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  await $.tool.call({ tool: 'Skill', skill: 'bytheslice:sell-slice', args: '23.1' })
  const claims = rowsOf(world).filter(r => r.sid === SESSION && r.ev === 'claim')
  expect(claims.map(r => [r.slice, (r.data as Record<string, unknown>).contested ?? false])).toEqual([['23.1', false]])
  expect(rowsOf(world).some(r => r.ev === 'warn')).toBe(false)
  // The whole-pie view still lists 23.2's branch, for a run that asks about the pie.
  expect(String((await $.tool.call({ tool: CLAIM_LISTED, pie: 23, goal: 'look' })).result)).toContain('Slice 23.2 already has commits on branch pie-23-s23.2-upload')
})
