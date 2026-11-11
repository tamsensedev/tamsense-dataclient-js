import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test
import { test } from 'node:test'
import { externalReferrer, fromSessionOfUrl, hasMarks, isProjectLink, marksOfUrl, sameMarks, withMarks } from '../src/utils/marks.ts'

test('marks are read from the address, trimmed and cut, and other parameters are left alone', () => {
    assert.deepEqual(marksOfUrl('https://tamsense.com/?utm_source=email&utm_campaign=wave-3&tsr=a1b2&ref=x'), { utm_source: 'email', utm_campaign: 'wave-3', tsr: 'a1b2' })
    assert.deepEqual(marksOfUrl(`https://tamsense.com/?utm_term=%20&utm_content=${'x'.repeat(300)}`), { utm_content: 'x'.repeat(200) })
    assert.deepEqual(marksOfUrl('not a url'), {})
    assert.equal(hasMarks({}), false)
    assert.equal(hasMarks({ tsr: 'a1' }), true)
    assert.equal(sameMarks({ tsr: 'a1' }, { tsr: 'a1', utm_source: '' }), true)
    assert.equal(sameMarks({ tsr: 'a1' }, { tsr: 'a2' }), false)
})

test('a referrer counts only when it is another site, and loses its query', () => {
    assert.equal(externalReferrer('https://mail.google.com/mail/u/0/?inbox=1', 'tamsense.com'), 'https://mail.google.com/mail/u/0/')
    assert.equal(externalReferrer('https://tamsense.com/pricing', 'tamsense.com'), '')
    assert.equal(externalReferrer('', 'tamsense.com'), '')
})

test('links to other sites of the same domain or of the listed domains carry the marks', () => {
    assert.equal(isProjectLink('my.tamsense.com', 'tamsense.com', []), true)
    assert.equal(isProjectLink('tamsense.com', 'www.tamsense.com', []), true)
    assert.equal(isProjectLink('tamsense.com', 'tamsense.com', []), false, 'a link on the same site keeps the session anyway')
    assert.equal(isProjectLink('google.com', 'tamsense.com', []), false)
    assert.equal(isProjectLink('app.tamsense.io', 'tamsense.com', ['tamsense.io']), true)
    assert.equal(isProjectLink('app.tamsense.io', 'tamsense.com', ['*.tamsense.io']), true)
    assert.equal(isProjectLink('127.0.0.2', '127.0.0.1', []), false)
    assert.equal(isProjectLink('', 'tamsense.com', []), false, 'mailto and tel links have no host')
})

test('the marks are added to a link without replacing its own', () => {
    assert.equal(withMarks('https://my.tamsense.com/auth/register?plan=pro', { utm_campaign: 'wave-3', tsr: 'a1' }, null), 'https://my.tamsense.com/auth/register?plan=pro&utm_campaign=wave-3&tsr=a1')
    assert.equal(withMarks('https://my.tamsense.com/?utm_campaign=own', { utm_campaign: 'wave-3' }, null), 'https://my.tamsense.com/?utm_campaign=own')
})

test('a link carries the current session even without marks, and replaces an older one', () => {
    assert.equal(withMarks('https://my.tamsense.com/', {}, 'mh2k-abc'), 'https://my.tamsense.com/?tsfrom=mh2k-abc')
    assert.equal(withMarks('https://my.tamsense.com/?tsfrom=old&utm_content=hero', { tsr: 'a1' }, 'mh2k-abc'), 'https://my.tamsense.com/?tsfrom=mh2k-abc&utm_content=hero&tsr=a1')
    assert.equal(withMarks('not a url', {}, 'mh2k-abc'), 'not a url')
})

test('the session a visitor came from is read from the address, but never the own one or a foreign string', () => {
    assert.equal(fromSessionOfUrl('https://my.tamsense.com/?tsfrom=mh2k-abc', 'own-1'), 'mh2k-abc')
    assert.equal(fromSessionOfUrl('https://my.tamsense.com/?tsfrom=own-1', 'own-1'), '')
    assert.equal(fromSessionOfUrl('https://my.tamsense.com/?tsfrom=%3Cscript%3E', 'own-1'), '')
    assert.equal(fromSessionOfUrl(`https://my.tamsense.com/?tsfrom=${'a'.repeat(65)}`, 'own-1'), '')
    assert.equal(fromSessionOfUrl('https://my.tamsense.com/', 'own-1'), '')
})
