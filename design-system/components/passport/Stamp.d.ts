/**
 * A booth's visa in the visitor's passport — an MRV-B-proportioned label with
 * a field block, a visa number and a two-line 44-character MRZ.
 *
 * @startingPoint section="Passport" subtitle="Issued and unissued visa labels, tilted, with accents" viewport="700x260"
 */
export interface StampProps {
  /** Booth short code — the label's headline. 2–4 characters reads best. */
  shortName?: string
  /** Issued. Unissued labels are dashed, faint, and carry no MRZ ink. */
  collected?: boolean
  /** Label **width** in px; height follows the 105 × 74 visa proportion. Under 150 the field block drops away. */
  size?: number
  /** Small stable rotation, −6…+6 degrees, derived from the booth id. */
  tilt?: number
  /** Shown as "N PTS · NOT ISSUED" while the slot is still empty. */
  points?: number
  /** Admin-uploaded square emblem; sits in the label's emblem patch in place of the generated rosette. */
  badgeUrl?: string
  /** Play the 420ms drop-and-settle. Use once, right after a successful scan. */
  animate?: boolean
  /** Issuing authority line, above the VISA mark. */
  markTop?: string
  /** "Issued in / on" value, and the date inside the ADMITTED cachet. */
  markBottom?: string
  /** "Valid for" value — the booth's own name. Falls back to `markTop`. */
  validFor?: string
  /** Visa number, top right. Defaults to `MFU<code>26`. */
  serial?: string
  /** Number of entries. One scan per booth, so "01". */
  entries?: string
  /** Visa type letter — "B" booth, "P" performance, "T" talk. */
  visaType?: string
  /** Duration of stay. */
  stay?: string
  /** The booth's accent colour: frame, security tint, visa number, cachet. */
  accent?: string
}
export function Stamp(props: StampProps): JSX.Element
