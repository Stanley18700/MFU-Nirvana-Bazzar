/**
 * §6.4 — mail is sent from Cloud Functions, never the browser.
 *
 * This file carries exactly one message: the organizer invitation. The three account mails a
 * visitor sees — address verification, password reset, address change — are sent by Firebase
 * Auth itself from the templates under Authentication → Templates, triggered from
 * src/lib/authActions.ts. Nothing here affects them.
 *
 * Resend, not EmailJS. EmailJS is built for a browser posting a form, and using it from a
 * server meant a *private* key, a *public* key, a service id and a dashboard-hosted template
 * id — four pieces of configuration to get one email out, with the wording living somewhere
 * nobody working on this repository could see. Resend needs a key and a verified sender, and
 * takes the HTML in the request, so the invitation below is the invitation: it is reviewed in
 * a pull request like everything else, and changing it is a deploy rather than a login.
 *
 *   firebase functions:secrets:set RESEND_API_KEY
 *   (RESEND_FROM, RESEND_REPLY_TO and APP_ORIGIN are plain params — the CLI prompts for them
 *    on first deploy, or reads functions/.env. See functions/.env.example.)
 *
 * Unconfigured is a supported state, not a failure: `inviteOrganizer` hands the admin a
 * copyable single-use link instead, which is a perfectly good way to invite twelve people.
 */
import { defineSecret, defineString } from 'firebase-functions/params'

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY')
/**
 * The sender, as `Name <address@domain>`. The domain has to be verified in the Resend
 * dashboard — mail from an unverified one is refused outright, which is the single most
 * common reason a first send fails.
 */
export const RESEND_FROM = defineString('RESEND_FROM', { default: '' })
/** Optional: where a confused organizer's reply should land. Falls back to the sender. */
export const RESEND_REPLY_TO = defineString('RESEND_REPLY_TO', { default: '' })
export const APP_ORIGIN = defineString('APP_ORIGIN', { default: 'https://mfu-passport.web.app' })

/**
 * The emulator fetches secrets from the live project's Secret Manager, so once a real key is
 * set there, `npm run e2e` would email every invitation it creates. Sending from the emulator
 * is therefore off unless EMULATOR_SEND_MAIL=1 is set for the session.
 */
const emulatorMailOff = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.EMULATOR_SEND_MAIL !== '1'

export function mailConfigured(): boolean {
  if (emulatorMailOff) return false
  try {
    return !!(RESEND_API_KEY.value() && RESEND_FROM.value())
  } catch {
    return false
  }
}

/** Values go into HTML; a booth called `Arts & Crafts <East>` must not break the markup. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Message {
  to: string
  subject: string
  html: string
  text: string
}

async function send(m: Message): Promise<boolean> {
  if (!mailConfigured()) return false
  const replyTo = RESEND_REPLY_TO.value()
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM.value(),
      to: [m.to],
      subject: m.subject,
      html: m.html,
      // Sent alongside the HTML rather than instead of it: a message with no plain-text part
      // scores worse with spam filters, and university mail is filtered hard.
      text: m.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
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

/**
 * The invitation itself.
 *
 * Table-based and inline-styled on purpose: this is email, where a stylesheet is stripped,
 * flexbox is unreliable and Outlook renders through Word. The button is a padded anchor rather
 * than anything clever, and the URL is repeated as text underneath because a good number of
 * clients will not make the button clickable at all.
 */
function inviteHtml(m: InviteMail): string {
  const link = esc(m.link)
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F4FBFD;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FBFD;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17414E;">
        <tr><td style="background:#7EDFF2;padding:20px 28px;">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#17414E;">
            ${esc(m.eventName)} &middot; ${esc(m.eventDates)}
          </div>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hello ${esc(m.name)},</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
            You are invited to run the booth screen for <strong>${esc(m.boothName)}</strong>.
          </p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#3A6B78;">
            Open the link below on the tablet or laptop that will sit on your booth. It sets up your
            organizer account and takes you straight to your booth's QR screen.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:10px;background:#12708A;">
              <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Set up my booth</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#3A6B78;">
            The link works once and expires on ${esc(m.expires)}. If the button does nothing,
            paste this into your browser:
          </p>
          <p style="margin:0;font-size:13px;word-break:break-all;"><a href="${link}" style="color:#12708A;">${link}</a></p>
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <p style="margin:0;border-top:1px solid #E3EFF3;padding-top:16px;font-size:12px;color:#6B8D97;">
            Office of International Affairs, Mae Fah Luang University.
            If you were not expecting this, you can ignore it — the link does nothing until someone signs in with this address.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function inviteText(m: InviteMail): string {
  return [
    `${m.eventName} · ${m.eventDates}`,
    '',
    `Hello ${m.name},`,
    '',
    `You are invited to run the booth screen for ${m.boothName}.`,
    '',
    "Open this link on the tablet or laptop that will sit on your booth. It sets up your organizer account and takes you straight to your booth's QR screen.",
    '',
    m.link,
    '',
    `The link works once and expires on ${m.expires}.`,
    '',
    'Office of International Affairs, Mae Fah Luang University.',
    'If you were not expecting this, you can ignore it — the link does nothing until someone signs in with this address.',
  ].join('\n')
}

/** Returns true if an email actually went out. */
export async function sendInvite(m: InviteMail): Promise<boolean> {
  return send({
    to: m.to,
    subject: `You are running ${m.boothName} at ${m.eventName}`,
    html: inviteHtml(m),
    text: inviteText(m),
  })
}
