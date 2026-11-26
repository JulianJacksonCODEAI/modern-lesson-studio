import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLink, tabKey, bestTab} from '../shared/link-field.mjs';

const DECK = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';
const PAGE = '1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b';

test('Slides links from the address bar, Share and other accounts name the same deck', () => {
  const want = {
    url: `https://docs.google.com/presentation/d/${DECK}/edit`,
    key: 'slides:' + DECK,
  };
  for (const link of [
    `https://docs.google.com/presentation/d/${DECK}/edit#slide=id.p4`,
    `https://docs.google.com/presentation/d/${DECK}/edit?usp=sharing`,
    `https://docs.google.com/presentation/u/1/d/${DECK}/edit`,
    `docs.google.com/presentation/d/${DECK}`,
    `  https://docs.google.com/presentation/d/${DECK}/present  `,
  ]) {
    assert.deepEqual(sourceLink('slides', link), want, link);
  }
});

test('Slides field names the wrong kind of Google link', () => {
  assert.match(
    sourceLink('slides', `https://docs.google.com/document/d/${DECK}/edit`)
      .error,
    /Google Docs link, not a Slides deck/
  );
  assert.match(
    sourceLink('slides', `https://drive.google.com/file/d/${DECK}/view`).error,
    /Google Drive link/
  );
  assert.match(
    sourceLink('slides', 'https://example.com/deck').error,
    /isn’t a Google Slides link/
  );
  assert.match(
    sourceLink('slides', 'https://docs.google.com/presentation/').error,
    /doesn’t name a deck/
  );
  assert.deepEqual(sourceLink('slides', '   '), {empty: true});
});

test('Notion links on notion.so, team sites and ?p= pages name the same page', () => {
  assert.deepEqual(
    sourceLink('notion', `https://www.notion.so/codeai/AI-Lab-${PAGE}?pvs=4`),
    {
      url: `https://www.notion.so/codeai/AI-Lab-${PAGE}`,
      key: 'notion:' + PAGE,
    }
  );
  assert.equal(
    sourceLink('notion', `https://codeai.notion.site/${PAGE}`).key,
    'notion:' + PAGE
  );
  const dashed = `${PAGE.slice(0, 8)}-${PAGE.slice(8, 12)}-${PAGE.slice(12, 16)}-${PAGE.slice(16, 20)}-${PAGE.slice(20)}`;
  assert.equal(
    sourceLink('notion', `https://www.notion.so/${dashed}`).key,
    'notion:' + PAGE
  );
  const db = sourceLink(
    'notion',
    `https://www.notion.so/codeai/abcdef0123456789abcdef0123456789?v=1&p=${PAGE}&pm=s`
  );
  assert.equal(db.key, 'notion:' + PAGE);
  assert.equal(
    db.url,
    `https://www.notion.so/codeai/abcdef0123456789abcdef0123456789?p=${PAGE}`
  );
});

test('Notion field refuses other sites and links with no page', () => {
  assert.match(
    sourceLink('notion', 'https://notion.so.evil.example/x').error,
    /isn’t a Notion link/
  );
  assert.match(
    sourceLink('notion', 'http://www.notion.so/' + PAGE).error,
    /starts with https/
  );
  assert.match(
    sourceLink('notion', 'https://www.notion.so/codeai').error,
    /doesn’t name a page/
  );
});

test('the open tab to suggest is the active match, else the most recently used', () => {
  const tabs = [
    {id: 1, url: 'https://example.com', active: true},
    {
      id: 2,
      url: `https://docs.google.com/presentation/d/${DECK}/edit`,
      lastAccessed: 5,
    },
    {
      id: 3,
      url: `https://docs.google.com/presentation/d/${DECK}x/edit`,
      lastAccessed: 9,
    },
  ];
  assert.equal(bestTab('slides', tabs).id, 3);
  tabs[1].active = true;
  assert.equal(bestTab('slides', tabs).id, 2);
  assert.equal(bestTab('notion', tabs), null);
  assert.equal(tabKey('slides', tabs[0].url), null);
});
