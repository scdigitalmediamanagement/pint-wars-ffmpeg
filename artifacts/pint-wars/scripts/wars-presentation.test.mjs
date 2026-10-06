import test from 'node:test';
import assert from 'node:assert/strict';
import { currentLeague, dayLabel, initials, leagueStanding, ordinal } from '../components/wars/presentation.ts';

const league = {
  id: 'war', name: 'Real War', status: 'active',
  starts_at: '2026-10-01T12:00:00Z', ends_at: '2026-10-11T12:00:00Z',
  duration_days: 10, completed_at: null,
};
const item = { membershipId: 'me', membershipStatus: 'active', league };
const member = (id, points, status = 'active') => ({ id, points, status, display_name: id });

test('completion from either live response is not undone by an older active cache', () => {
  const completed = { ...league, status: 'completed' };
  assert.equal(currentLeague({ ...item, league: completed }, { league }).status, 'completed');
  assert.equal(currentLeague(item, { league: completed }).status, 'completed');
});

test('days use live dates and clamp to the actual duration', () => {
  assert.equal(dayLabel(league, Date.parse('2026-10-04T12:00:00Z')), 'Day 4 of 10');
  assert.equal(dayLabel(league, Date.parse('2026-09-01T12:00:00Z')), 'Day 1 of 10');
  assert.equal(dayLabel(league, Date.parse('2026-12-01T12:00:00Z')), 'Day 10 of 10');
  assert.equal(dayLabel({ ...league, duration_days: null }, Date.parse('2026-10-04T12:00:00Z')), 'Day 4 of 10');
});
test('completed day freezes at completion, including early finishes', () => {
  assert.equal(dayLabel({ ...league, status: 'completed', completed_at: '2026-10-03T12:00:00Z' }, Date.now()), 'Day 3 of 10');
  assert.equal(dayLabel({ ...league, status: 'completed' }, Date.now()), 'Day 10 of 10');
});
test('invalid scheduling is explicit rather than fabricated', () => {
  assert.equal(dayLabel({ ...league, starts_at: 'invalid' }, Date.now()), 'Schedule unavailable');
});
test('standing preserves server points and competition ties; counts exclude removed players', () => {
  const dashboard = { league, members: [member('leader', 9), member('tie', 7), member('me', 7), member('retired', 6, 'retired'), member('removed', 99, 'removed')] };
  const result = leagueStanding(item, dashboard);
  assert.equal(result.rank, 2);
  assert.equal(result.me.points, 7);
  assert.equal(result.members.length, 4);
  assert.equal(leagueStanding({ ...item, membershipStatus: 'removed' }, dashboard).rank, undefined);
});
test('missing data never produces invented counts, scores, or rankings', () => {
  assert.equal(leagueStanding(item).members, undefined);
  assert.equal(leagueStanding(item).rank, undefined);
  assert.equal(leagueStanding(item, { league, members: [member('other', 4)] }).me, undefined);
});
test('avatar initials and ordinal suffixes are correct', () => {
  assert.equal(initials(' Alex Lewis '), 'AL');
  assert.equal(initials('Prince'), 'PR');
  assert.equal(initials(''), '?');
  assert.deepEqual([1, 2, 3, 11, 12, 13, 21, 112].map(ordinal), ['1st', '2nd', '3rd', '11th', '12th', '13th', '21st', '112th']);
});
