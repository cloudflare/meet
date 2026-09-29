import { redirect } from '@remix-run/cloudflare'

// eslint-disable-next-line no-script-url
const unsafeSchemes = ['javascript:', 'data:', 'vbscript:']

function safeDecode(url: string) {
	try {
		return decodeURI(url)
	} catch {
		// A malformed escape sequence such as "%zz" makes decodeURI throw.
		// Fall back to the raw value so the scheme check still runs.
		return url
	}
}

export function safeRedirect(url: string, init?: number | ResponseInit) {
	if (
		unsafeSchemes.some((str) =>
			safeDecode(url).trim().toLowerCase().startsWith(str)
		)
	) {
		url = '/'
	}
	return redirect(url, init)
}
