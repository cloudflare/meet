import { useEffect, useMemo, useRef, useState } from 'react'
import type { E2eeGroupState } from '~/utils/e2ee'
import {
	findHiddenMembers,
	HIDDEN_MEMBER_GRACE_MS,
	updateUnlistedSince,
} from '~/utils/e2eeRoster'

export interface E2eeStatus extends E2eeGroupState {
	/** MLS members that the participant list has been missing for longer than the grace period */
	hiddenMembers: string[]
}

function sameIds(a: string[], b: string[]) {
	return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * Combines the MLS group state with the server's participant list (`shownIds`, which must include
 * this user) to find MLS members the UI isn't showing.
 */
export function useE2eeStatus(
	group: E2eeGroupState | undefined,
	shownIds: string[]
): E2eeStatus | undefined {
	const unlistedSince = useRef(new Map<string, number>())
	const [hiddenMembers, setHiddenMembers] = useState<string[]>([])

	// Arrays are recreated on every render, so compare them by value
	const membersKey = JSON.stringify(group?.members ?? [])
	const shownKey = JSON.stringify([...shownIds].sort())

	useEffect(() => {
		const members: string[] = JSON.parse(membersKey)
		const shown: string[] = JSON.parse(shownKey)
		const now = Date.now()
		unlistedSince.current = updateUnlistedSince(
			unlistedSince.current,
			members,
			shown,
			now
		)

		const update = () => {
			const next = findHiddenMembers(
				members,
				shown,
				unlistedSince.current,
				Date.now()
			)
			setHiddenMembers((prev) => (sameIds(prev, next) ? prev : next))
		}
		update()

		// Check again whenever a member's grace period runs out
		const timers = [...unlistedSince.current.values()]
			.map((since) => since + HIDDEN_MEMBER_GRACE_MS - now)
			.filter((ms) => ms > 0)
			.map((ms) => setTimeout(update, ms))
		return () => timers.forEach(clearTimeout)
	}, [membersKey, shownKey])

	return useMemo(
		() => group && { ...group, hiddenMembers },
		[group, hiddenMembers]
	)
}
