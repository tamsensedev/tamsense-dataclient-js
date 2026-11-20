import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { test } from 'node:test'
import { DEFAULT_SETTINGS, isPageSkipped, pageRuleMatches, parseSettings, selectorRules, settingsUrl } from '../src/utils/settings.ts'

test('the settings live next to the events address and carry the key', () => {
    assert.equal(settingsUrl('https://my.tamsense.com/api/events', 'tk_a b'), 'https://my.tamsense.com/api/tracker-config?key=tk_a%20b')
    assert.equal(settingsUrl('https://my.tamsense.tech/api/events/', 'tk'), 'https://my.tamsense.tech/api/tracker-config?key=tk')
    assert.equal(settingsUrl('https://example.com/collect', 'tk'), null)
    assert.equal(settingsUrl('https://my.tamsense.com/api/events', ''), null)
})

test('a reply is read only with a known mode and a list of rules; broken rules are dropped', () => {
    assert.deepEqual(parseSettings({ masking: 'all', rules: [{ target: ' #card ', action: 'hide' }, { target: '', action: 'hide' }, { target: '.x', action: 'show' }, 'junk'], record: true }), { masking: 'all', rules: [{ target: '#card', action: 'hide' }], record: true })
    assert.equal(parseSettings({ masking: 'marked', rules: [] })?.record, true)
    assert.equal(parseSettings({ masking: 'typed', rules: [], record: false })?.record, false)
    assert.equal(parseSettings({ masking: 'secret', rules: [] }), null)
    assert.equal(parseSettings({ masking: 'typed' }), null)
    assert.equal(parseSettings(null), null)
    assert.deepEqual(DEFAULT_SETTINGS, { masking: 'typed', rules: [], record: true })
})

test('a page rule is a path where * stands for anything, the rest is taken as is', () => {
    assert.ok(pageRuleMatches('/billing/*', '/billing/cards'))
    assert.ok(pageRuleMatches('/billing/*', '/billing/'))
    assert.ok(!pageRuleMatches('/billing/*', '/billing'))
    assert.ok(pageRuleMatches('/account', '/account'))
    assert.ok(!pageRuleMatches('/account', '/account/edit'))
    assert.ok(pageRuleMatches('/a.b+c', '/a.b+c'))
    assert.ok(!pageRuleMatches('/a.b', '/axb'))
})

test('only pages under a skip rule are left out, and selectors are split by what they do', () => {
    const rules = [{ target: '/billing/*', action: 'skip' as const }, { target: '/profile', action: 'hide' as const }, { target: '#card', action: 'skip' as const }, { target: '.name', action: 'hide' as const }]
    assert.ok(isPageSkipped(rules, '/billing/cards'))
    assert.ok(!isPageSkipped(rules, '/profile'))
    assert.ok(!isPageSkipped(rules, '/'))
    assert.deepEqual(selectorRules(rules, 'hide'), ['.name'])
    assert.deepEqual(selectorRules(rules, 'skip'), ['#card'])
})
