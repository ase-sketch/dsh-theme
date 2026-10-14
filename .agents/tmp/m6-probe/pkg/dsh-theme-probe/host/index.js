/**
 * M6/T3 probe host half. Deliberately empty of behaviour: the host half only has
 * to EXIST for the package to be a well-formed bundle (HANDOFF.md §4 red line ③).
 * The probe is entirely client-side.
 */
export const name = 'dsh-theme-probe'

export function apply() {
  /* no host behaviour: probe a/b/c are all browser-side */
}
