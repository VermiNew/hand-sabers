import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = new URL('http://localhost/maps.html');
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {} },
});

const { renderMapCard } = await import('../src/maps/library-list-view.ts');
const { renderLibraryDetail } = await import('../src/maps/library-detail-view.ts');

const payload = '"><img src=x onerror="globalThis.__xss=1">';
const maliciousMap = {
  id: payload,
  source: 'server',
  meta: {
    title: payload,
    artist: payload,
    mapper: payload,
    difficulty: payload,
    duration: 60,
  },
  beats: [{ t: 1 }],
};

function assertPayloadIsEscaped(html) {
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('onerror="'), false);
  assert.match(html, /&lt;img/);
}

test('map library renderers escape imported map and score metadata', () => {
  const cardHtml = renderMapCard(maliciousMap, 0, 0, {
    favorite: false,
    score: 0,
    selected: true,
  });
  assertPayloadIsEscaped(cardHtml);

  const detailHtml = renderLibraryDetail(
    maliciousMap,
    {
      tries: 1,
      best: { mapId: payload, player: payload, score: 100, combo: 2 },
      progress: 0.5,
    },
    false,
    50,
  );
  assertPayloadIsEscaped(detailHtml);
  assert.match(detailHtml, /map=%22%3E%3Cimg/);
});
