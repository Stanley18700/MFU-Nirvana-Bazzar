/**
 * §6.4 — mail is sent from Cloud Functions, never the browser.
 *
 * This file now carries exactly one message: the organizer invitation. The three account
 * mails a visitor sees — address verification, password reset, address change — are sent by
 * Firebase Auth itself from the templates under Authentication → Templates, triggered from
 * src/lib/authActions.ts. Nothing to configure here for those.
 *
 * EmailJS server-side path: POST with the PRIVATE key as accessToken. If EmailJS is not
 * configured the callable returns the link instead so the admin can copy it by hand.
 *
 *   firebase functions:secrets:set EMAILJS_PRIVATE_KEY
 *   (EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_INVITE, APP_ORIGIN are plain
 *    params; the CLI prompts for them on first deploy or reads functions/.env)
 */
import { defineSecret, defineString } from 'firebase-functions/params'

export const EMAILJS_PRIVATE_KEY = defineSecret('EMAILJS_PRIVATE_KEY')
export const EMAILJS_PUBLIC_KEY = defineString('EMAILJS_PUBLIC_KEY', { default: '' })
export const EMAILJS_SERVICE_ID = defineString('EMAILJS_SERVICE_ID', { default: '' })
export const EMAILJS_TEMPLATE_INVITE = defineString('EMAILJS_TEMPLATE_INVITE', { default: '' })
export const APP_ORIGIN = defineString('APP_ORIGIN', { default: 'https://mfu-passport.web.app' })

/**
 * The emulator fetches secrets from the live project's Secret Manager, so once a real EmailJS key
 * is set there, `npm run e2e` would email every invitation it creates. Sending from the emulator
 * is therefore off unless EMULATOR_SEND_MAIL=1 is set for the session.
 */
const emulatorMailOff = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.EMULATOR_SEND_MAIL !== '1'

export function mailConfigured(): boolean {
  if (emulatorMailOff) return false
  try {
    return !!(EMAILJS_PRIVATE_KEY.value() && EMAILJS_PUBLIC_KEY.value() && EMAILJS_SERVICE_ID.value())
  } catch {
    return false
  }
}

async function send(templateId: string, params: Record<string, string>): Promise<boolean> {
  if (!mailConfigured() || !templateId) return false
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID.value(),
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY.value(),
      accessToken: EMAILJS_PRIVATE_KEY.value(),
      template_params: params,
    }),
  })
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${await res.text()}`)
  return true
}

export interface InviteMail {
  to: string
  name: string
  boothName: string
  link: string
  expires: string
  eventName: string
  eventDates: string
}

/** Returns true if an email actually went out. */
export async function sendInvite(m: InviteMail): Promise<boolean> {
  return send(EMAILJS_TEMPLATE_INVITE.value(), {
    to_email: m.to,
    to_name: m.name,
    booth_name: m.boothName,
    invite_link: m.link,
    expires: m.expires,
    event_name: m.eventName,
    event_dates: m.eventDates,
  })
}
