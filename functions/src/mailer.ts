/**
 * §6.4 — mail is sent from Cloud Functions, never the browser.
 *
 * This file carries exactly one message: the organizer/admin invitation. The three account
 * mails a visitor sees — address verification, password reset, address change — are sent by
 * Firebase Auth itself from the templates under Authentication → Templates, triggered from
 * src/lib/authActions.ts. Nothing here affects them.
 *
 * EmailJS. The wording and the layout live in the EmailJS dashboard, not in this repository:
 * whoever owns the event can restyle the invitation without a deploy, which is the point.
 * What lives here is only the set of variables the template is allowed to interpolate — keep
 * `templateParams` below and the `{{...}}` placeholders in the dashboard in step, because a
 * placeholder with no matching key renders as empty text rather than failing.
 *
 * Four pieces of configuration, three of them public and kept in functions/.env:
 *
 *   EMAILJS_SERVICE_ID            the connected mail service (Gmail, in this account)
 *   EMAILJS_PUBLIC_KEY            the account's public key
 *   EMAILJS_TEMPLATE_INVITE       booth organizer invitation
 *   EMAILJS_TEMPLATE_INVITE_ADMIN administrator invitation (no booth); optional
 *
 * and the one real secret, which is never written to a file:
 *
 *   firebase functions:secrets:set EMAILJS_PRIVATE_KEY
 *
 * The private key is what lets a server — as opposed to a browser — call the API at all. It
 * also requires "Allow EmailJS API for non-browser applications" to stay on under
 * Account → Security in the dashboard; with it off every send comes back 403.
 *
 * Unconfigured is a supported state, not a failure: `inviteOrganizer` hands the admin a
 * copyable single-use link instead, which is a perfectly good way to invite twelve people.
 */
import { defineSecret, defineString } from 'firebase-functions/params'

/** EmailJS → Account → General → Private Key. The only value here that is a real secret. */
export const EMAILJS_PRIVATE_KEY = defineSecret('EMAILJS_PRIVATE_KEY')
export const EMAILJS_SERVICE_ID = defineString('EMAILJS_SERVICE_ID', { default: '' })
export const EMAILJS_PUBLIC_KEY = defineString('EMAILJS_PUBLIC_KEY', { default: '' })
/** Booth organizer invitation. Uses every variable in `templateParams`. */
export const EMAILJS_TEMPLATE_INVITE = defineString('EMAILJS_TEMPLATE_INVITE', { default: '' })
/**
 * Administrator invitation — same design, wording without a booth. Optional: left blank, an
 * admin invitation is not emailed and falls back to the copyable link, because sending an
 * admin the organizer template would greet them with "run the booth screen for" and a gap
 * where the booth name should be.
 */
export const EMAILJS_TEMPLATE_INVITE_ADMIN = defineString('EMAILJS_TEMPLATE_INVITE_ADMIN', { default: '' })
export const APP_ORIGIN = defineString('APP_ORIGIN', { default: 'https://mfu-passport.web.app' })

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send'

/**
 * The emulator fetches secrets from the live project's Secret Manager, so once a real key is
 * set there, `npm run e2e` would email every invitation it creates — and spend the account's
 * 200 requests a month doing it. Sending from the emulator is therefore off unless
 * EMULATOR_SEND_MAIL=1 is set for the session.
 */
const emulatorMailOff = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.EMULATOR_SEND_MAIL !== '1'

/** `.value()` throws when a param is read outside a request, hence the try. */
function conf(): { service: string; user: string; token: string } | null {
  if (emulatorMailOff) return null
  try {
    const service = EMAILJS_SERVICE_ID.value()
    const user = EMAILJS_PUBLIC_KEY.value()
    const token = EMAILJS_PRIVATE_KEY.value()
    return service && user && token ? { service, user, token } : null
  } catch {
    return null
  }
}

export function mailConfigured(): boolean {
  try {
    return !!(conf() && EMAILJS_TEMPLATE_INVITE.value())
  } catch {
    return false
  }
}

export interface InviteMail {
  to: string
  name: string
  /** Empty for an admin invitation. */
  boothName: string
  link: string
  expires: string
  eventName: string
  eventDates: string
  role: 'organizer' | 'admin'
}

/**
 * Exactly the variables the dashboard templates may use. Anything a template references that
 * is not in here renders empty, so add the key here first and the `{{placeholder}}` second.
 */
function templateParams(m: InviteMail): Record<string, string> {
  return {
    to_email: m.to,
    to_name: m.name,
    booth_name: m.boothName,
    event_name: m.eventName,
    event_dates: m.eventDates,
    expires: m.expires,
    invite_link: m.link,
  }
}

function templateFor(role: InviteMail['role']): string {
  try {
    return role === 'admin' ? EMAILJS_TEMPLATE_INVITE_ADMIN.value() : EMAILJS_TEMPLATE_INVITE.value()
  } catch {
    return ''
  }
}

/**
 * Returns true if EmailJS accepted the message.
 *
 * A refusal throws rather than returning false: the caller logs it and still hands the admin
 * the copyable link, and the audit entry records `mailed: false`. The body EmailJS returns on
 * an error is a short plain-text reason ("The Public Key is invalid", "API calls are disabled
 * for non-browser applications", …), which is worth having in the log verbatim.
 */
async function send(m: InviteMail): Promise<boolean> {
  const c = conf()
  if (!c) return false
  const template = templateFor(m.role)
  if (!template) return false

  const res = await fetch(EMAILJS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: c.service,
      template_id: template,
      user_id: c.user,
      accessToken: c.token,
      template_params: templateParams(m),
    }),
  })
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return true
}

/** Returns true if an email actually went out. */
export async function sendInvite(m: InviteMail): Promise<boolean> {
  return send(m)
}
