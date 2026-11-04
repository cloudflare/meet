import { describe, expect, it } from 'vitest'
import {
	findHiddenMembers,
	findUnlistedMembers,
	HIDDEN_MEMBER_GRACE_MS,
	updateUnlistedSince,
} from './e2eeRoster'

describe('findUnlistedMembers', () => {
	it('returns MLS members missing from the participant list', () => {
		expect(
			findUnlistedMembers(['me', 'alice', 'eve'], ['me', 'alice', 'bob'])
		).toEqual(['eve'])
	})

	it('ignores participants that are not in the MLS group', () => {
		expect(findUnlistedMembers(['me'], ['me', 'bob'])).toEqual([])
	})
})

describe('hidden member detection', () => {
	const t0 = 1_000_000

	it('reports a member only once they have been unlisted for the grace period', () => {
		const members = ['me', 'alice', 'eve']
		const shown = ['me', 'alice']
		const since = updateUnlistedSince(new Map(), members, shown, t0)

		expect(
			findHiddenMembers(members, shown, since, t0 + HIDDEN_MEMBER_GRACE_MS - 1)
		).toEqual([])
		expect(
			findHiddenMembers(members, shown, since, t0 + HIDDEN_MEMBER_GRACE_MS)
		).toEqual(['eve'])
	})

	it('does not report a member who is removed from the group within the grace period', () => {
		// Alice leaves: the server stops listing her before her Remove is committed
		let since = updateUnlistedSince(new Map(), ['me', 'alice'], ['me'], t0)
		// Her Remove is committed shortly after
		since = updateUnlistedSince(since, ['me'], ['me'], t0 + 500)

		expect(since.size).toBe(0)
		expect(
			findHiddenMembers(['me'], ['me'], since, t0 + HIDDEN_MEMBER_GRACE_MS)
		).toEqual([])
	})

	it('keeps reporting a member whose Remove is never committed', () => {
		const members = ['me', 'alice']
		const since = updateUnlistedSince(new Map(), members, ['me'], t0)

		expect(
			findHiddenMembers(members, ['me'], since, t0 + 60 * 60 * 1000)
		).toEqual(['alice'])
	})

	it('does not restart the grace period if the server briefly lists the member', () => {
		const members = ['me', 'eve']
		let since = updateUnlistedSince(new Map(), members, ['me'], t0)
		// The server lists Eve for a moment, then hides her again
		since = updateUnlistedSince(since, members, ['me', 'eve'], t0 + 5_000)
		since = updateUnlistedSince(since, members, ['me'], t0 + 5_001)

		expect(
			findHiddenMembers(members, ['me'], since, t0 + HIDDEN_MEMBER_GRACE_MS)
		).toEqual(['eve'])
	})

	it('does not report a member while they are listed', () => {
		const members = ['me', 'eve']
		const since = updateUnlistedSince(new Map(), members, ['me'], t0)

		expect(
			findHiddenMembers(
				members,
				['me', 'eve'],
				since,
				t0 + HIDDEN_MEMBER_GRACE_MS
			)
		).toEqual([])
	})

	it('starts a new grace period for a member who leaves the group and is added again', () => {
		let since = updateUnlistedSince(new Map(), ['me', 'bob'], ['me'], t0)
		since = updateUnlistedSince(since, ['me'], ['me'], t0 + 1_000)
		since = updateUnlistedSince(since, ['me', 'bob'], ['me'], t0 + 20_000)

		expect(since.get('bob')).toBe(t0 + 20_000)
	})
})
