import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { FC, ReactNode } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import { useUserMetadata } from '~/hooks/useUserMetadata'
import type { User } from '~/types/Messages'
import populateTraceLink from '~/utils/populateTraceLink'
import { cn } from '~/utils/style'
import { AudioIndicator } from './AudioIndicator'
import { Button } from './Button'
import { Dialog, DialogContent, DialogOverlay, Portal, Trigger } from './Dialog'
import { Icon } from './Icon/Icon'
import { MuteUserButton } from './MuteUserButton'
import { OptionalLink } from './OptionalLink'
import { usePulledAudioTrack } from './PullAudioTracks'
import { Tooltip } from './Tooltip'

/** Shows whether a participant is in the MLS group, if E2EE is enabled */
const E2eeMembershipIndicator: FC<{ userId: string }> = ({ userId }) => {
	const { e2ee } = useRoomContext()
	if (!e2ee) return null
	return e2ee.members.includes(userId) ? (
		<Tooltip content="In the encrypted group">
			<span className="flex">
				<Icon type="LockClosedIcon" />
				<VisuallyHidden>In the encrypted group</VisuallyHidden>
			</span>
		</Tooltip>
	) : (
		<Tooltip content="Not in the encrypted group">
			<span className="flex text-orange-700 dark:text-orange-300">
				<Icon type="ExclamationCircleIcon" />
				<VisuallyHidden>Not in the encrypted group</VisuallyHidden>
			</span>
		</Tooltip>
	)
}

const UserListItem: FC<{
	user: User
	audioTrack?: MediaStreamTrack
	children?: ReactNode
}> = ({ user, audioTrack }) => {
	const { traceLink } = useRoomContext()
	const { data } = useUserMetadata(user.name)

	return (
		<li className="flex items-center gap-4 text-base h-9">
			<E2eeMembershipIndicator userId={user.id} />
			<div className="mr-auto overflow-hidden whitespace-nowrap text-ellipsis">
				<OptionalLink
					href={
						user.transceiverSessionId
							? populateTraceLink(user.transceiverSessionId, traceLink)
							: undefined
					}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-3"
				>
					{data?.photob64 && (
						<img
							className="rounded-full h-6"
							src={`data:image/png;base64,${data.photob64}`}
							alt={data.displayName}
						/>
					)}
					<span>{data?.displayName}</span>
				</OptionalLink>
			</div>
			{audioTrack && user.tracks.audioEnabled && (
				<div className="px-5">
					<AudioIndicator audioTrack={audioTrack} />
				</div>
			)}
			<MuteUserButton user={user} />
		</li>
	)
}

const OtherUser: FC<{ user: User }> = ({ user }) => {
	const audioTrack = usePulledAudioTrack(user.tracks.audio)
	return <UserListItem user={user} audioTrack={audioTrack}></UserListItem>
}

export const participantCount = (count: number) =>
	`${count} Participant${count > 1 ? 's' : ''}`

interface ParticipantDialogProps {
	children?: ReactNode
	otherUsers: User[]
	identity?: User
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

export const ParticipantsButton: FC<
	Omit<ParticipantDialogProps, 'children'> & {
		className?: string
	}
> = ({ className, ...rest }) => {
	const {
		room: { otherUsers },
	} = useRoomContext()
	return (
		<ParticipantsDialog {...rest}>
			<Tooltip content={participantCount(otherUsers.length + 1)}>
				<Trigger asChild>
					<Button className={cn('relative', className)} displayType="secondary">
						<Icon type="userGroup" />
					</Button>
				</Trigger>
			</Tooltip>
		</ParticipantsDialog>
	)
}

export const ParticipantsDialog: FC<ParticipantDialogProps> = ({
	children,
	otherUsers,
	identity,
	open,
	onOpenChange,
}) => {
	const { userMedia, e2ee } = useRoomContext()
	const allParticipants = [identity, ...otherUsers]
		.filter((x): x is User => x !== undefined)
		.sort((a, b) => {
			const nameA = a.name.toLowerCase()
			const nameB = b.name.toLowerCase()

			if (nameA < nameB) return -1
			if (nameA > nameB) return 1
			return 0
		})
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{children}

			<Portal>
				<DialogOverlay />
				<DialogContent>
					<div className="space-y-4">
						<div>
							<h2 className="text-xl font-bold">
								{participantCount(otherUsers.length + 1)}
							</h2>
							{e2ee && (
								<p className="text-sm text-zinc-600 dark:text-zinc-300">
									{e2ee.members.length}{' '}
									{e2ee.members.length === 1 ? 'member' : 'members'} in the
									encrypted group
								</p>
							)}
						</div>
						<ul className="space-y-2">
							{allParticipants.map((p) =>
								p === identity ? (
									<UserListItem
										user={identity}
										audioTrack={userMedia.audioStreamTrack}
										key={identity.id}
									>
										{identity.name}
									</UserListItem>
								) : (
									<OtherUser user={p} key={p.id} />
								)
							)}
						</ul>
						{e2ee && e2ee.hiddenMembers.length > 0 && (
							<div className="space-y-2 text-red-700 dark:text-red-300">
								<h3 className="flex items-center gap-1 font-bold">
									<Icon type="ExclamationCircleIcon" />
									Hidden members of the encrypted group
								</h3>
								<p className="text-sm">
									These members can decrypt this call but are not shown as
									participants. Someone may be listening in.
								</p>
								<ul className="space-y-1 font-mono text-sm">
									{e2ee.hiddenMembers.map((id) => (
										<li key={id} className="break-all">
											{id}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				</DialogContent>
			</Portal>
		</Dialog>
	)
}
