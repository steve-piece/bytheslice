// mod/policy.test.ts
// Unit tests for the warning plumbing and the policy: defaults, config overrides recorded once, the once-a-minute report, toasts and the atoms.

import { expect, test } from 'claude-code/testing'

import { headsMatch, skillName } from './checks.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { DEFAULT_MARKERS, DEFAULT_POLICY, DEFAULT_ROLES, policyFrom, readPolicy, tierAllowed } from './policy.ts'
import { CWD, HEAD, LEDGER, activeAt52, bashResult, engineLoops, ledgerLine, ledgerText, rowsOf, stage, warnsOf } from './testing.tsx'

const CONFIG = `${CWD}/bytheslice.config.json`

const PROJECT = `{
  // JSONC, as config-generator writes it.
  "pass": {
    "checks": { "enabled": true, "requireTester": "always" },
    "spawnPolicy": {
      "roles": { "implementer": ["opus"], "bytheslice:discovery": ["haiku", "sonnet"], "fix-attempter": "opus" },
      "contextMarkers": ["files_changed", "my transcript"],
    },
  },
}`

test('the defaults cover every role with one tier each and the four context markers', () => {
  expect(Object.keys(DEFAULT_ROLES)).toHaveLength(49)
  expect(Object.values(DEFAULT_ROLES).every(tiers => tiers.length === 1)).toBe(true)
  expect(DEFAULT_ROLES.implementer).toEqual(['opus'])
  expect(DEFAULT_ROLES['quality-reviewer']).toEqual(['opus'])
  expect(DEFAULT_ROLES['fix-attempter']).toEqual(['sonnet'])
  expect(DEFAULT_ROLES['slice-verifier']).toEqual(['sonnet'])
  expect(DEFAULT_ROLES.discovery).toEqual(['haiku'])
  expect(DEFAULT_MARKERS).toEqual(['files_changed', 'diff --git', 'implementer returned', 'builder transcript'])
  expect(DEFAULT_POLICY).toMatchObject({ enabled: true, requireTester: 'ui-slices' })
})

test('a project config overrides per role, replaces the markers and lists each change', () => {
  const read = readPolicy(PROJECT)
  expect(read.problem).toBeNull()
  expect(read.policy.requireTester).toBe('always')
  expect(read.policy.roles.discovery).toEqual(['haiku', 'sonnet'])
  expect(read.policy.roles['fix-attempter']).toEqual(['opus'])
  expect(read.policy.roles['slice-verifier']).toEqual(['sonnet'])
  expect(read.policy.contextMarkers).toEqual(['files_changed', 'my transcript'])
  expect(read.overrides.map(o => o.setting)).toEqual([
    'checks.requireTester',
    'roles.discovery',
    'roles.fix-attempter',
    'contextMarkers',
  ])
  expect(read.overrides[1]).toEqual({ setting: 'roles.discovery', value: ['haiku', 'sonnet'], default: ['haiku'] })
})

test('a missing or malformed config gives the defaults; a malformed one says why', () => {
  expect(readPolicy(null)).toEqual({ policy: DEFAULT_POLICY, overrides: [], problem: null })
  const broken = readPolicy('{ "pass": ')
  expect(broken.policy).toEqual(DEFAULT_POLICY)
  expect(broken.problem).not.toBeNull()
  expect(policyFrom({ pass: { checks: { enabled: 'no', requireTester: 'sometimes' } } }).overrides).toEqual([])
})

test('tiers match model aliases and API ids by substring, case-insensitively', () => {
  expect(tierAllowed('claude-sonnet-4-6', ['sonnet'])).toBe(true)
  expect(tierAllowed('Opus', ['opus'])).toBe(true)
  expect(tierAllowed('claude-opus-5-5', ['haiku', 'sonnet'])).toBe(false)
  expect(tierAllowed('anything', [])).toBe(false)
})

test('heads match on a shared prefix of seven or more; skill names lose their plugin prefix', () => {
  expect(headsMatch('a1b2c3d', 'a1b2c3d4e5f6')).toBe(true)
  expect(headsMatch('a1b2c3', 'a1b2c3d4e5f6')).toBe(false)
  expect(headsMatch(null, 'a1b2c3d')).toBe(false)
  expect(skillName('bytheslice:sell-pie')).toBe('sell-pie')
  expect(skillName('/cook-pizzas')).toBe('cook-pizzas')
  expect(skillName('commit')).toBeNull()
})

test('at session start the policy is read once and each override is recorded once as a note', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: PROJECT } })
  await start($)
  const notes = rowsOf(world).filter(row => row.ev === 'note')
  expect(notes).toHaveLength(4)
  expect(notes[1]?.data).toEqual({
    kind: 'policy-override',
    setting: 'roles.discovery',
    value: ['haiku', 'sonnet'],
    default: ['haiku'],
  })
  // A second session over the same ledger records nothing new.
  await start($)
  expect(rowsOf(world).filter(row => row.ev === 'note')).toHaveLength(4)
})

test('without a master checklist the policy is read but nothing is recorded', async ($, on) => {
  const { world, start } = stage(on, { files: { [CONFIG]: PROJECT } })
  await start($)
  expect(world.files[LEDGER]).toBeUndefined()
})

test('a malformed config logs why and the checks run on the defaults', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: '{ nope' } })
  await start($)
  expect(world.logs.some(line => line.includes('could not read bytheslice.config.json'))).toBe(true)
  expect(rowsOf(world).filter(row => row.ev === 'note')).toEqual([])
})

test("the project's requireTester always asks a tester pass of an infrastructure slice too", async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: PROJECT } })
  world.files[LEDGER] = ledgerText([ledgerLine(1, 'verdict', '5.1', { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: HEAD })])
  on('tool.call', () => ({ result: {} }))
  await start($)
  await $.tool.call({
    tool: 'Edit',
    file_path: 'docs/plans/00_master_checklist.md',
    old_string: '### Slice 5.1 - Pass pane and band [ ]',
    new_string: '### Slice 5.1 - Pass pane and band [x]',
  })
  expect(warnsOf(world)).toEqual([['checkbox-without-tester', '5.1']])
})

test('checks turned off in the config raise nothing', async ($, on) => {
  const off = '{ "pass": { "checks": { "enabled": false } } }'
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: off }, branch: 'main' })
  on('tool.call', () => bashResult())
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(warnsOf(world)).toEqual([])
})

test('a report writes one warn row and one toast, and the same key repeats only after a minute', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, branch: 'main' })
  on('tool.call', () => bashResult())
  await start($)
  const first = await $.tool.call({ tool: 'Bash', command: 'git commit -m one' })
  const again = await $.tool.call({ tool: 'Bash', command: 'git commit -m two' })
  expect(first.context?.[0]).toContain('The Pass warning (commit-on-main): A git commit ran while this session is on main')
  expect(again.context).toBeUndefined()
  expect(warnsOf(world)).toEqual([['commit-on-main', null]])
  const row = rowsOf(world).find(entry => entry.ev === 'warn')
  expect(row).toMatchObject({ ev: 'warn', data: { code: 'commit-on-main' } })
  expect(Object.keys((row?.data ?? {}) as object).sort()).toEqual(['code', 'text'])
  expect(JSON.stringify(row)).not.toContain('git commit -m one')
  expect(world.toasts).toHaveLength(1)
  expect(world.toasts[0]?.startsWith('Pass commit-on-main: A git commit ran')).toBe(true)
  await clock.advance(61000)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m three' })
  expect(warnsOf(world)).toHaveLength(2)
})

test('HEAD, branch and the active skill follow the session, as the checks read them', async ($, on) => {
  const next = 'feedfacecafe1234feedfacecafe1234feedface'
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE) })
  world.files[LEDGER] = ledgerText([ledgerLine(1, 'verdict', '5.2', { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: next })])
  engineLoops(on)
  on('tool.call', (_$, e) => (e.tool === 'Bash' ? bashResult({ commit: { sha: next, kind: 'committed', branch: 'pie-5-the-pass' } }) : { result: {} }))
  await start($)
  // HEAD: the verifier passed at the commit made in this session, so the flip is silent.
  world.head = next
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat(pie-5): 5.2 task 1 x"' })
  await $.tool.call({
    tool: 'Edit',
    file_path: 'docs/plans/00_master_checklist.md',
    old_string: '### Slice 5.2 - Ledger and status tool [ ]',
    new_string: '### Slice 5.2 - Ledger and status tool [x]',
  })
  expect(warnsOf(world)).toEqual([])
  // Branch: a switch to main is read again, so the next commit there warns.
  world.branch = 'main'
  await $.tool.call({ tool: 'Bash', command: 'git switch main' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -m y' })
  expect(warnsOf(world)).toEqual([['commit-on-main', null]])
  // Skill: sell-slice makes a plan write warn; a skill of another plugin leaves it so.
  await $.skill.prompt({ skill: 'bytheslice:sell-slice', text: 'sell', frontmatter: {}, source: 'plugin' })
  await $.skill.prompt({ skill: 'commit', text: 'not ours', frontmatter: {}, source: 'built-in' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/docs/plans/stage_53_pass_checks.md', content: 'x' })
  expect(warnsOf(world).map(([code]) => code)).toEqual(['commit-on-main', 'plan-write-during-bake'])
})
