'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveOps, blessingFromComment } = require('../live-ops');

test('666 likes trigger sixty-second rain and reset the next meter', () => {
  let now = 100000;
  const ops = new LiveOps({ now: () => now });
  assert.equal(ops.addLikes(665), false);
  assert.equal(ops.getSummary().heartsTowardsRain, 665);
  assert.equal(ops.addLikes(1), true);
  assert.equal(ops.getSummary().rainUntil, 160000);
  assert.equal(ops.getSummary().heartsTowardsRain, 0);
  now += 3000;
  assert.equal(ops.addLikes(3), false);
  assert.equal(ops.getSummary().totalLikes, 669);
});

test('guests are bounded and greeted once per server session', () => {
  const ops = new LiveOps({ maxGuests: 120 });
  for (let i = 0; i < 300; i++) ops.join({ user: 'Guest ' + i, uniqueId: 'u' + i, avatar: '' });
  assert.equal(ops.getGuests().length, 120);
  assert.equal(ops.join({ user: 'Guest 200', uniqueId: 'u200' }), false);
  assert.equal(ops.getGuests()[0].uniqueId, 'u200');
});

test('TOP THÀNH TÂM counts 1/comment and 10/coin', () => {
  const ops = new LiveOps();
  ops.addScore({ user: 'A', uniqueId: 'a', comments: 1 });
  ops.addScore({ user: 'B', uniqueId: 'b', giftCoins: 5 });
  ops.addScore({ user: 'A', uniqueId: 'a', comments: 1, giftCoins: 6 });
  assert.deepEqual(ops.getTop(2).map(x => [x.name, x.score]), [['A', 62], ['B', 50]]);
});

test('live state remains bounded during 10,000 simulated events', () => {
  const ops = new LiveOps({ maxGuests: 120, maxScores: 1500 });
  for (let i = 0; i < 10000; i++) {
    ops.join({ user: 'x'+i, uniqueId: ''+i });
    ops.addScore({ user: 'x'+i, uniqueId: ''+i, comments: 1 });
    ops.addLikes(1);
  }
  assert.equal(ops.getGuests().length, 120);
  assert.equal(ops.scores.size, 1500);
  assert.ok(ops.getTop().length <= 10);
});

test('categorized wishes do not promise outcomes', () => {
  assert.match(blessingFromComment('thi cử'), /thi cử/);
  assert.match(blessingFromComment('sức khỏe'), /sức khỏe/);
  assert.match(blessingFromComment('tình duyên'), /chân thành/);
});
