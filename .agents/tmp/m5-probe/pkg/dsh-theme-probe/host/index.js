/**
 * Host half for dsh-theme-probe.
 *
 * A pure probe bundle owns nothing on the host plane. This module still has to
 * exist and be exported as ".": the roster imports the package by name to mount
 * the client row, and without exports["."] that import fails with
 * ERR_PACKAGE_PATH_NOT_EXPORTED and the whole entry is reported as
 * 'failed to import'.
 *
 * Named exports only, never `export default`: the loader's unwrapExports takes
 * `exports.default ?? exports`, so a default export would replace the whole
 * namespace and drop the metadata it needs.
 */
export const name = 'dsh-theme-probe'
export const inject = []

export function apply(ctx) {
  // Nothing to do on the host. The probe lives entirely in lib/client.js.
}
