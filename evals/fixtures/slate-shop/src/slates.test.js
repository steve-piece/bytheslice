// src/slates.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatGame } from './slates.js'

test('formats one game', () => {
  assert.equal(formatGame({ away: 'NYL', home: 'LVA', tipoff: '7:00 PM' }), 'NYL at LVA, 7:00 PM')
})
