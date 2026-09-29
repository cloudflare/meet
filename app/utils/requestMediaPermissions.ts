export interface GrantedDevices {
	micId?: string
	cameraId?: string
}

type GetUserMedia = (
	constraints: MediaStreamConstraints
) => Promise<MediaStream>

function isPermissionError(error: unknown) {
	return (
		error instanceof Error &&
		(error.name === 'NotAllowedError' || error.name === 'SecurityError')
	)
}

function readDevices(stream: MediaStream): GrantedDevices {
	const devices = {
		micId: stream.getAudioTracks()[0]?.getSettings().deviceId,
		cameraId: stream.getVideoTracks()[0]?.getSettings().deviceId,
	}
	stream.getTracks().forEach((t) => t.stop())
	return devices
}

/**
 * Asks for camera and microphone permission. Rejects only when the user (or
 * the browser) refuses. A missing camera or microphone is not a refusal, so
 * the request falls back to each device on its own and resolves with
 * whichever devices exist, which can be none.
 */
export async function requestMediaPermissions(
	getUserMedia: GetUserMedia
): Promise<GrantedDevices> {
	try {
		return readDevices(await getUserMedia({ audio: true, video: true }))
	} catch (error) {
		if (isPermissionError(error)) throw error
	}

	const results = await Promise.allSettled([
		getUserMedia({ audio: true }),
		getUserMedia({ video: true }),
	])
	const refused = results.find(
		(r): r is PromiseRejectedResult =>
			r.status === 'rejected' && isPermissionError(r.reason)
	)
	if (refused) {
		results.forEach((r) => {
			if (r.status === 'fulfilled') readDevices(r.value)
		})
		throw refused.reason
	}
	const devices: GrantedDevices = {}
	for (const r of results) {
		if (r.status !== 'fulfilled') continue
		const { micId, cameraId } = readDevices(r.value)
		if (micId) devices.micId = micId
		if (cameraId) devices.cameraId = cameraId
	}
	return devices
}
