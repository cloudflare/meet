import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safeReturnUrl'

describe('safeRedirect', () => {
	it('redirects to the given URL', () => {
		const response = safeRedirect('/room/abc')
		expect(response.status).toBe(302)
		expect(response.headers.get('Location')).toBe('/room/abc')
	})

	it('redirects to the root for unsafe schemes', () => {
		const response = safeRedirect('%6Aavascript:alert(1)')
		expect(response.headers.get('Location')).toBe('/')
	})

	it('does not throw when the URL contains a malformed escape sequence', () => {
		const response = safeRedirect('/room/100%zz')
		expect(response.status).toBe(302)
		expect(response.headers.get('Location')).toBe('/room/100%zz')
	})

	it('redirects to the root for an unsafe scheme with a malformed escape sequence', () => {
		// eslint-disable-next-line no-script-url
		const response = safeRedirect('javascript:alert(1)//%zz')
		expect(response.headers.get('Location')).toBe('/')
	})
})
