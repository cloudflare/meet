import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import Toast from '~/components/Toast'
import { Icon } from './Icon/Icon'

export function SafetyNumberToast(props: {
	safetyNumber: string
	memberCount: number
	hiddenMemberCount: number
}) {
	const { safetyNumber, memberCount, hiddenMemberCount } = props
	return (
		<div className="flex items-start gap-2 text-sm">
			<div className="space-y-1">
				<Toast.Title className="flex items-center gap-1 ">
					<Icon type="LockClosedIcon" /> Safety Number:{' '}
					<span className="font-mono tracking-wider font-semibold">
						{safetyNumber.match(/.{1,4}/g)?.join(' ')}
					</span>
				</Toast.Title>
				<Toast.Description>
					{memberCount} {memberCount === 1 ? 'member' : 'members'} in the
					encrypted group
				</Toast.Description>
				{hiddenMemberCount > 0 && (
					<Toast.Description className="flex items-center gap-1 font-semibold text-red-700 dark:text-red-300">
						<Icon type="ExclamationCircleIcon" />
						{hiddenMemberCount === 1
							? '1 of them is not shown in this call.'
							: `${hiddenMemberCount} of them are not shown in this call.`}{' '}
						Someone may be listening in.
					</Toast.Description>
				)}
			</div>
			<Toast.Close className="flex items-center justify-center w-5 h-5 px-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600">
				<span aria-hidden>×</span>
				<VisuallyHidden>Dismiss</VisuallyHidden>
			</Toast.Close>
		</div>
	)
}
