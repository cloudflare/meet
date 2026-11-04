import { describe, expect, it } from 'vitest'
import {
	DEFAULT_SAFETY_NUMBER_LENGTH,
	MAX_SAFETY_NUMBER_LENGTH,
	MIN_SAFETY_NUMBER_LENGTH,
	safetyNumberToAlphanumeric,
} from './e2ee'

function fromHex(hex: string) {
	return Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16))
}

// Expected values were generated independently of safetyNumberToAlphanumeric
// by taking the last 5 * length bits of the 256-bit big-endian input and
// mapping each 5-bit group to the Crockford base32 alphabet.
const KATS: {
	name: string
	input: string
	expected: Record<number, string>
}[] = [
	{
		name: 'all zeros',
		input: '0000000000000000000000000000000000000000000000000000000000000000',
		expected: {
			16: '0000000000000000',
			20: '00000000000000000000',
			52: '0000000000000000000000000000000000000000000000000000',
		},
	},
	{
		name: 'all ones',
		input: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
		expected: {
			16: 'ZZZZZZZZZZZZZZZZ',
			20: 'ZZZZZZZZZZZZZZZZZZZZ',
			52: '1ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
		},
	},
	{
		name: 'one',
		input: '0000000000000000000000000000000000000000000000000000000000000001',
		expected: {
			16: '0000000000000001',
			20: '00000000000000000001',
			52: '0000000000000000000000000000000000000000000000000001',
		},
	},
	{
		name: 'counting bytes 0x00..0x1f',
		input: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
		expected: {
			16: '2RBHG68T3CE1T7GZ',
			20: '650N2RBHG68T3CE1T7GZ',
			52: '0001081G81860W40J2GB1G6GW3RG2491650N2RBHG68T3CE1T7GZ',
		},
	},
	{
		name: 'SHA-256("")',
		input: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
		expected: {
			16: 'JD6A95CS3DW55E2N',
			20: '8S4VJD6A95CS3DW55E2N',
			52: '1RXGRH19HZ0W2JDFQX68K5QVJ917NS0Y8S4VJD6A95CS3DW55E2N',
		},
	},
	{
		name: 'SHA-256("abc")',
		input: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		expected: {
			16: 'FAEB847ZC7S005DD',
			20: '75GQFAEB847ZC7S005DD',
			52: '1EKR2TZRY0EFX90M2G6YBPQ248XG0DGT75GQFAEB847ZC7S005DD',
		},
	},
	{
		// The low 160 bits are the 5-bit values 0, 1, ..., 31 in order
		name: 'every digit value in order',
		input: '00000000000000000000000000443214c74254b635cf84653a56d7c675be77df',
		expected: {
			32: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
		},
	},
]

describe('safetyNumberToAlphanumeric', () => {
	describe('known answer tests', () => {
		for (const { name, input, expected } of KATS) {
			for (const [length, output] of Object.entries(expected)) {
				it(`${name}, length ${length}`, () => {
					expect(
						safetyNumberToAlphanumeric(fromHex(input), Number(length))
					).toBe(output)
				})
			}
		}
	})

	it('accepts an ArrayBuffer as well as a Uint8Array', () => {
		const { input, expected } = KATS[5]
		expect(safetyNumberToAlphanumeric(fromHex(input).buffer, 20)).toBe(
			expected[20]
		)
	})

	it('does not modify the input', () => {
		const input = fromHex(KATS[3].input)
		const copy = input.slice()
		safetyNumberToAlphanumeric(input, MAX_SAFETY_NUMBER_LENGTH)
		expect(input).toEqual(copy)
	})

	it('accepts the minimum and maximum lengths', () => {
		const input = fromHex(KATS[3].input)
		expect(
			safetyNumberToAlphanumeric(input, MIN_SAFETY_NUMBER_LENGTH)
		).toHaveLength(MIN_SAFETY_NUMBER_LENGTH)
		expect(
			safetyNumberToAlphanumeric(input, MAX_SAFETY_NUMBER_LENGTH)
		).toHaveLength(MAX_SAFETY_NUMBER_LENGTH)
	})

	it('rejects lengths outside the allowed range', () => {
		const input = fromHex(KATS[3].input)
		for (const length of [
			MIN_SAFETY_NUMBER_LENGTH - 1,
			MAX_SAFETY_NUMBER_LENGTH + 1,
			0,
			-1,
			20.5,
			NaN,
			Infinity,
		]) {
			expect(() => safetyNumberToAlphanumeric(input, length)).toThrow(
				RangeError
			)
		}
	})

	it('only uses Crockford base32 characters', () => {
		for (const { input } of KATS) {
			expect(
				safetyNumberToAlphanumeric(fromHex(input), MAX_SAFETY_NUMBER_LENGTH)
			).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/)
		}
	})
})

describe('safety number length limits', () => {
	it('has the expected bounds and default', () => {
		expect(MIN_SAFETY_NUMBER_LENGTH).toBe(16)
		expect(DEFAULT_SAFETY_NUMBER_LENGTH).toBe(20)
		expect(MAX_SAFETY_NUMBER_LENGTH).toBe(52)
	})

	it('can encode a full 256-bit hash at the maximum length', () => {
		expect(MAX_SAFETY_NUMBER_LENGTH * 5).toBeGreaterThanOrEqual(256)
		expect((MAX_SAFETY_NUMBER_LENGTH - 1) * 5).toBeLessThan(256)
	})
})
