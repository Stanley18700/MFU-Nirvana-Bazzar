import type { Role, VisitorType, Zone } from '../../shared/model'

/** Human labels for the enums that used to leak into the admin screens as raw values. */
export const ZONE_LABEL: Record<Zone, string> = { entrance: 'Entrance row', middle: 'Middle hall', far: 'Far corner' }
export const ROLE_LABEL: Record<Role, string> = { visitor: 'Visitor', organizer: 'Booth organizer', admin: 'Admin' }
export const VISITOR_TYPE_LABEL: Record<VisitorType, string> = { student: 'Student', staff: 'Staff', alumni: 'Alumni', guest: 'Guest' }
