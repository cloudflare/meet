// The participant list comes from the server, which can't be trusted. Only the MLS group is bound to
// the safety number, so these helpers compare the two and surface any MLS members the server isn't
// showing, e.g. because it added an eavesdropper or blocked the Remove of someone who left.

/**
 * How long an MLS member may be missing from the participant list before they're reported as
 * hidden. When someone leaves, the server stops listing them before their Remove is committed, so
 * this avoids false alarms on every leave.
 */
export const HIDDEN_MEMBER_GRACE_MS = 10_000

/**
 * Returns the MLS members that the participant list doesn't show, in the order they appear in
 * `members`.
 */
export function findUnlistedMembers(members: string[], shownIds: string[]) {
	const shown = new Set(shownIds)
	return members.filter((id) => !shown.has(id))
}

/**
 * Updates the record of when each MLS member was first seen missing from the participant list.
 *
 * A member's entry is only dropped once they leave the MLS group. It is deliberately kept if the
 * server lists them again, so a server can't reset the grace period by briefly listing a hidden
 * member.
 */
export function updateUnlistedSince(
	previous: ReadonlyMap<string, number>,
	members: string[],
	shownIds: string[],
	now: number
) {
	const memberSet = new Set(members)
	const next = new Map([...previous].filter(([id]) => memberSet.has(id)))
	for (const id of findUnlistedMembers(members, shownIds)) {
		if (!next.has(id)) next.set(id, now)
	}
	return next
}

/**
 * Returns the MLS members that are currently missing from the participant list and were first seen
 * missing at least `graceMs` ago.
 */
export function findHiddenMembers(
	members: string[],
	shownIds: string[],
	unlistedSince: ReadonlyMap<string, number>,
	now: number,
	graceMs = HIDDEN_MEMBER_GRACE_MS
) {
	return findUnlistedMembers(members, shownIds).filter((id) => {
		const since = unlistedSince.get(id)
		return since !== undefined && now - since >= graceMs
	})
}
