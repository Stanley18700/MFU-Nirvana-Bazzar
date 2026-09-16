import { doc } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './auth'
import { useDoc } from './data'
import { EVENT_SURVEY_ID, type SurveyDoc } from '../../shared/model'

/**
 * The festival survey as it concerns the visitor holding the phone: is it published, how long
 * is it, and have they already answered.
 *
 * Read in one place because three screens now depend on the same two facts and must never
 * disagree — the Prize page (which withholds the gift QR until the answers are in), the nudge
 * sheet in the passport layout, and the banner on the cover. `surveys/{EVENT_SURVEY_ID}` is
 * readable by any signed-in visitor; `surveyTaken/{uid}_{id}` only by its owner and admins.
 *
 * `loading` matters to the gate: until both documents have answered, the Prize page must not
 * decide either way, or the QR would flash for a moment before the survey card replaced it.
 */
export function useFestivalSurvey() {
  const { user } = useAuth()
  const survey = useDoc<SurveyDoc>(doc(db, 'surveys', EVENT_SURVEY_ID), [])
  const taken = useDoc(user ? doc(db, 'surveyTaken', `${user.uid}_${EVENT_SURVEY_ID}`) : null, [user?.uid])
  const count = survey.data?.questions?.length ?? 0
  return {
    survey: survey.data,
    count,
    /** Published with at least one question — the only state in which a visitor is asked. */
    live: !!survey.data?.active && count > 0,
    /**
     * Whether an unanswered survey also withholds the gift QR. Separate from `live` so the gate
     * can come down at the prize desk without unpublishing the survey and losing the answers;
     * absent means off, so a deploy never arms it on its own.
     */
    gate: !!survey.data?.active && count > 0 && survey.data?.gateGift === true,
    taken: !!taken.data,
    loading: survey.loading || (!!user && taken.loading),
  }
}
