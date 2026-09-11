import { useMemo } from 'react'
import { useLocale } from './locale'
import type { Role, VisitorType, Zone } from '../../shared/model'

/**
 * Human labels for the enums that used to leak into the admin screens as raw values.
 *
 * A hook rather than three constants, because these are now translated: a module-level object is
 * evaluated once at import and could never follow the language toggle. Call sites keep the same
 * shape — `const { ROLE_LABEL } = useLabels()` — so `ROLE_LABEL[u.role]` reads as it always did.
 */
export function useLabels(): {
  ZONE_LABEL: Record<Zone, string>
  ROLE_LABEL: Record<Role, string>
  VISITOR_TYPE_LABEL: Record<VisitorType, string>
} {
  const { t, locale } = useLocale()
  // `locale` is the dependency that matters; `t` is rebuilt with it.
  return useMemo(() => ({
    ZONE_LABEL: {
      entrance: t('label.zone.entrance'),
      middle: t('label.zone.middle'),
      far: t('label.zone.far'),
    },
    ROLE_LABEL: {
      visitor: t('label.role.visitor'),
      organizer: t('label.role.organizer'),
      admin: t('label.role.admin'),
    },
    VISITOR_TYPE_LABEL: {
      student: t('label.visitorType.student'),
      staff: t('label.visitorType.staff'),
      alumni: t('label.visitorType.alumni'),
      guest: t('label.visitorType.guest'),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [locale])
}
