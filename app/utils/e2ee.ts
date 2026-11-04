import type { PartyTracks } from 'partytracks/client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import invariant from 'tiny-invariant'
import type useRoom from '~/hooks/useRoom'
import type { ServerMessage } from '~/types/Messages'

type MessagesToE2eeWorker =
	| {
			type: 'userJoined'
			id: string
	  }
	| {
			type: 'userLeft'
			id: string
	  }
	| { type: 'recvMlsMessage'; msg: Uint8Array }
	| { type: 'encryptStream'; in: ReadableStream; out: WritableStream }
	| { type: 'decryptStream'; in: ReadableStream; out: WritableStream }
	| {
			type: 'initializeAndCreateGroup'
			id: string
			safetyNumberLength: number
	  }

type MessagesFromE2eeWorker =
	| {
			type: 'workerReady'
	  }
	| {
			type: 'sendMlsMessage'
			msg: Uint8Array
	  }
	| {
			type: 'newSafetyNumber'
			msg: Uint8Array
	  }

export async function loadWorker(
	handleEvents: (message: MessagesFromE2eeWorker) => void
) {
	// Create a new worker
	const worker = new Worker('/e2ee/worker.js')

	const ready = new Promise<void>((res) => {
		const handler = (event: MessageEvent) => {
			if (event.data.type === 'workerReady') {
				res()
				worker.removeEventListener('message', handler)
			}
		}
		worker.addEventListener('message', handler)
	})

	// Listen for messages from the worker
	worker.onmessage = function (event: MessageEvent<MessagesFromE2eeWorker>) {
		console.log('Received message from worker:', event.data)
		handleEvents(event.data)
	}

	// Error handling
	worker.onerror = function (error) {
		console.error('Worker error:', error.message)
	}

	await ready

	async function safePostMessage(message: MessagesToE2eeWorker): Promise<void>
	async function safePostMessage(
		message: MessagesToE2eeWorker,
		transfer: Transferable[]
	): Promise<void>
	async function safePostMessage(
		message: MessagesToE2eeWorker,
		transfer?: Transferable[]
	): Promise<void> {
		if (transfer) {
			worker.postMessage(message, transfer)
		} else {
			worker.postMessage(message)
		}
	}

	return Object.assign(worker, {
		safePostMessage,
	})
}

type MessagesFromWorker =
	| { type: 'shareKeyPackage'; keyPkg: Uint8Array }
	| { type: 'sendMlsMessage'; msg: Uint8Array; senderId: string }
	| {
			type: 'sendMlsWelcome'
			senderId: string
			welcome: Uint8Array
			rtree: Uint8Array
	  }
	| { type: 'newSafetyNumber'; hash: Uint8Array; members: string[] }

export interface E2eeGroupState {
	safetyNumber: string
	/** IDs of every MLS group member covered by the safety number, including this user */
	members: string[]
}

export class EncryptionWorker {
	get worker(): Worker {
		invariant(
			this._worker !== null,
			'worker not yet initialized, call initialize() or initializeAndCreateGroup() first'
		)
		return this._worker
	}

	_worker: Worker | null = null
	safetyNumber: number = -1
	id: string
	safetyNumberLength: number

	constructor(config: { id: string; safetyNumberLength: number }) {
		this.id = config.id
		this.safetyNumberLength = config.safetyNumberLength
		this._worker = new Worker('/e2ee/worker.js')
	}

	dispose() {
		this.worker.terminate()
	}

	initialize() {
		this.worker.postMessage({
			type: 'initialize',
			id: this.id,
			safetyNumberLength: this.safetyNumberLength,
		})
	}

	initializeAndCreateGroup() {
		this.worker.postMessage({
			type: 'initializeAndCreateGroup',
			id: this.id,
			safetyNumberLength: this.safetyNumberLength,
		})
	}

	userJoined(keyPkg: Uint8Array) {
		this.worker.postMessage({ type: 'userJoined', keyPkg })
	}

	userLeft(id: string) {
		this.worker.postMessage({ type: 'userLeft', id })
	}

	receiveMlsWelcome(senderId: string, welcome: Uint8Array, rtree: Uint8Array) {
		this.worker.postMessage({
			type: 'recvMlsWelcome',
			welcome,
			rtree,
			senderId,
		})
	}

	receiveMlsMessage(msg: Uint8Array, senderId: string) {
		const message = {
			msg,
			senderId,
			type: 'recvMlsMessage',
		}
		console.log('passing receiveMlsMessage into worker', message)
		this.worker.postMessage(message)
	}

	async setupSenderTransform(sender: RTCRtpSender) {
		console.log('Setting up sender transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			sender.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'encryptStream',
			})
			return
		}

		// Otherwise if this is Chrome we'll have to use createEncodedStreams
		if (
			'createEncodedStreams' in sender &&
			typeof sender.createEncodedStreams === 'function'
		) {
			const senderStreams = sender.createEncodedStreams()
			const { readable, writable } = senderStreams
			this.worker.postMessage(
				{
					type: 'encryptStream',
					in: readable,
					out: writable,
				},
				[readable, writable]
			)

			return
		}

		throw new Error(
			'Neither RTCRtpScriptTransform nor RTCRtpSender.createEncodedStreams methods supported'
		)
	}

	async setupReceiverTransform(receiver: RTCRtpReceiver) {
		console.log('Setting up receiver transform')

		// If this is Firefox, we will have to use RTCRtpScriptTransform
		if (window.RTCRtpScriptTransform) {
			receiver.transform = new RTCRtpScriptTransform(this.worker, {
				operation: 'decryptStream',
			})

			return
		}

		// Otherwise if this is Chrome we'll have to use createEncodedStreams
		if (
			'createEncodedStreams' in receiver &&
			typeof receiver.createEncodedStreams === 'function'
		) {
			const senderStreams = receiver.createEncodedStreams()
			const { readable, writable } = senderStreams
			this.worker.postMessage(
				{
					type: 'decryptStream',
					in: readable,
					out: writable,
				},
				[readable, writable]
			)

			return
		}

		throw new Error(
			'Neither RTCRtpScriptTransform nor RTCRtpSender.createEncodedStreams methods supported'
		)
	}

	decryptStream(inStream: ReadableStream, outStream: WritableStream) {
		this.worker.postMessage({
			type: 'decryptStream',
			in: inStream,
			out: outStream,
		})
	}

	handleOutgoingEvents(onMessage: (data: string) => void) {
		this.worker.addEventListener('message', (event) => {
			const excludedEvents = ['workerReady', 'newSafetyNumber']
			if (!excludedEvents.includes(event.data.type)) {
				console.log('Message from worker in handleOutgoingEvents', event.data)
				onMessage(JSON.stringify(event.data, replacer))
			}
		})
	}

	handleIncomingEvent(data: string) {
		const message = JSON.parse(data, reviver) as MessagesFromWorker
		// the message type here came from another user's worker
		console.log('Incoming event: ', message.type, { message })
		switch (message.type) {
			case 'shareKeyPackage': {
				this.userJoined(message.keyPkg)
				break
			}
			case 'sendMlsWelcome': {
				this.receiveMlsWelcome(message.senderId, message.welcome, message.rtree)
				break
			}
			case 'sendMlsMessage': {
				this.receiveMlsMessage(message.msg, message.senderId)
				break
			}
		}
	}

	onNewSafetyNumber(
		handler: (safetyNumber: Uint8Array, members: string[]) => void
	) {
		this.worker.addEventListener('message', (event) => {
			if (event.data.type === 'newSafetyNumber') {
				handler(event.data.hash, event.data.members)
			}
		})
	}
}

const FLAG_TYPED_ARRAY = 'FLAG_TYPED_ARRAY'
const FLAG_ARRAY_BUFFER = 'FLAG_ARRAY_BUFFER'

function replacer(_key: string, value: any) {
	if (value instanceof Uint8Array) {
		return { [FLAG_TYPED_ARRAY]: true, data: Array.from(value) }
	}
	if (value instanceof ArrayBuffer) {
		return {
			[FLAG_ARRAY_BUFFER]: true,
			data: Array.from(new Uint8Array(value)),
		}
	}
	return value
}

function reviver(_key: string, value: any) {
	if (value && value[FLAG_TYPED_ARRAY]) {
		return Uint8Array.from(value.data)
	}
	if (value && value[FLAG_ARRAY_BUFFER]) {
		return new Uint8Array(value.data).buffer
	}
	return value
}

export function useE2EE({
	enabled = false,
	room,
	partyTracks,
	safetyNumberLength = DEFAULT_SAFETY_NUMBER_LENGTH,
}: {
	enabled?: boolean
	safetyNumberLength?: number
	partyTracks: PartyTracks
	room: ReturnType<typeof useRoom>
}) {
	const [groupState, setGroupState] = useState<E2eeGroupState>()

	const encryptionWorker = useMemo(
		() =>
			new EncryptionWorker({
				id: room.websocket.id,
				safetyNumberLength,
			}),
		[room.websocket.id, safetyNumberLength]
	)

	useEffect(() => {
		return () => {
			encryptionWorker.dispose()
		}
	}, [encryptionWorker])

	useEffect(() => {
		if (!enabled) return

		const subscription = partyTracks.transceiver$.subscribe((transceiver) => {
			if (transceiver.direction === 'sendonly') {
				if (transceiver.sender.track?.kind === 'video') {
					const capability = RTCRtpSender.getCapabilities('video')
					const codecs = capability ? capability.codecs : []
					const vp8codec = codecs.filter(
						(a) => a.mimeType === 'video/VP8' || a.mimeType === 'video/rtx'
					)
					transceiver.setCodecPreferences(vp8codec)
				}
				encryptionWorker.setupSenderTransform(transceiver.sender)
			}
		})

		return () => {
			subscription.unsubscribe()
		}
	}, [enabled, encryptionWorker, partyTracks.transceiver$])

	useEffect(() => {
		if (!enabled) return
		const subscription = partyTracks.transceiver$.subscribe((transceiver) => {
			if (transceiver.direction === 'recvonly') {
				encryptionWorker.setupReceiverTransform(transceiver.receiver)
			}
		})

		return () => {
			subscription.unsubscribe()
		}
	}, [enabled, encryptionWorker, partyTracks.transceiver$])

	const [joined, setJoined] = useState(false)
	const [firstUser, setFirstUser] = useState(false)

	const onJoin = useCallback(
		(firstUser: boolean) => {
			if (!enabled) return
			setJoined(true)
			setFirstUser(firstUser)
		},
		[enabled]
	)

	useEffect(() => {
		if (!joined) return
		encryptionWorker.onNewSafetyNumber((buffer, members) =>
			setGroupState({
				safetyNumber: safetyNumberToAlphanumeric(buffer, safetyNumberLength),
				members,
			})
		)
		encryptionWorker.handleOutgoingEvents((data) => {
			console.log('📬 sending e2eeMlsMessage to peers', data)
			room.websocket.send(
				JSON.stringify({
					type: 'e2eeMlsMessage',
					payload: data,
				})
			)
		})
		const handler = (event: MessageEvent) => {
			const message = JSON.parse(event.data) as ServerMessage
			if (message.type === 'e2eeMlsMessage') {
				console.log('📨 incoming e2eeMlsMessage from peer', message)
				encryptionWorker.handleIncomingEvent(message.payload)
			}
			if (message.type === 'userLeftNotification') {
				encryptionWorker.userLeft(message.id)
			}
		}

		room.websocket.addEventListener('message', handler)

		if (firstUser) {
			encryptionWorker.initializeAndCreateGroup()
		} else {
			encryptionWorker.initialize()
		}

		return () => {
			room.websocket.removeEventListener('message', handler)
		}
	}, [encryptionWorker, firstUser, joined, room.websocket, safetyNumberLength])

	return {
		e2eeGroupState: enabled ? groupState : undefined,
		onJoin,
	}
}

// Crockford's base32 alphabet, which omits the easily confused I, L, O and U
const SAFETY_NUMBER_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// Each base32 character carries 5 bits, so the default is 100 bits
export const DEFAULT_SAFETY_NUMBER_LENGTH = 20
// 80 bits, keeping collision search against the safety number infeasible
export const MIN_SAFETY_NUMBER_LENGTH = 16
// The safety number is derived from a 256-bit hash, and 52 base32 characters
// are enough to encode all 256 bits. Anything longer would add no entropy.
export const MAX_SAFETY_NUMBER_LENGTH = 52

/**
 * Encodes the hash as a Crockford base32 string of the given length. The hash
 * is treated as a big-endian integer, and the least significant `length`
 * base32 digits are returned, so every character depends on the whole hash.
 */
export function safetyNumberToAlphanumeric(
	buffer: ArrayBuffer | Uint8Array,
	length: number
) {
	if (
		!Number.isInteger(length) ||
		length < MIN_SAFETY_NUMBER_LENGTH ||
		length > MAX_SAFETY_NUMBER_LENGTH
	) {
		throw new RangeError(
			`Safety number length must be an integer between ${MIN_SAFETY_NUMBER_LENGTH} and ${MAX_SAFETY_NUMBER_LENGTH}, got ${length}`
		)
	}
	const base = BigInt(SAFETY_NUMBER_ALPHABET.length)
	let rest = new Uint8Array(buffer).reduce(
		(acc, byte) => acc * BigInt(256) + BigInt(byte),
		BigInt(0)
	)
	let result = ''
	for (let i = 0; i < length; i++) {
		const next = rest % base
		rest = rest / base
		result = SAFETY_NUMBER_ALPHABET[Number(next)] + result
	}
	return result
}
