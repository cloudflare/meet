import { describe, expect, test } from 'vitest'
import { requestMediaPermissions } from './requestMediaPermissions'

function domError(name: string) {
	const error = new Error(name)
	error.name = name
	return error
}

function fakeStream(devices: { audio?: string; video?: string }) {
	const track = (deviceId: string) => ({
		getSettings: () => ({ deviceId }),
		stop: () => {},
	})
	return {
		getAudioTracks: () => (devices.audio ? [track(devices.audio)] : []),
		getVideoTracks: () => (devices.video ? [track(devices.video)] : []),
		getTracks: () => [
			...(devices.audio ? [track(devices.audio)] : []),
			...(devices.video ? [track(devices.video)] : []),
		],
	} as unknown as MediaStream
}

// Mimics a machine with the given hardware. Browsers reject with
// NotFoundError when any requested kind of device is missing.
function machine(hardware: { audio?: string; video?: string }) {
	return async (constraints: MediaStreamConstraints) => {
		if (
			(constraints.audio && !hardware.audio) ||
			(constraints.video && !hardware.video)
		) {
			throw domError('NotFoundError')
		}
		return fakeStream({
			audio: constraints.audio ? hardware.audio : undefined,
			video: constraints.video ? hardware.video : undefined,
		})
	}
}

describe('requestMediaPermissions', () => {
	test('returns both devices when both exist', async () => {
		await expect(
			requestMediaPermissions(machine({ audio: 'mic1', video: 'cam1' }))
		).resolves.toEqual({ micId: 'mic1', cameraId: 'cam1' })
	})

	test('grants when the machine has a microphone but no camera', async () => {
		await expect(
			requestMediaPermissions(machine({ audio: 'mic1' }))
		).resolves.toEqual({ micId: 'mic1', cameraId: undefined })
	})

	test('grants when the machine has a camera but no microphone', async () => {
		await expect(
			requestMediaPermissions(machine({ video: 'cam1' }))
		).resolves.toEqual({ micId: undefined, cameraId: 'cam1' })
	})

	test('grants when the machine has neither device', async () => {
		await expect(requestMediaPermissions(machine({}))).resolves.toEqual({})
	})

	test('rejects when the user refuses permission', async () => {
		await expect(
			requestMediaPermissions(async () => {
				throw domError('NotAllowedError')
			})
		).rejects.toMatchObject({ name: 'NotAllowedError' })
	})
})
