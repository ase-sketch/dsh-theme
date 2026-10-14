/**
 * Host half for dsh-theme.
 *
 * A pure skin bundle owns nothing on the host plane — no services, no tools, no
 * state. The roster still imports this module to mount the client row, so the
 * host half exists to be a valid mount point and to stay an empty namespace:
 * without it `import('dsh-theme')` fails with ERR_PACKAGE_PATH_NOT_EXPORTED and
 * the whole entry is reported as 'failed to import'.
 *
 * Named exports only, never `export default`: the loader's unwrapExports takes
 * `exports.default ?? exports`, so a default export would replace the whole
 * namespace and drop the metadata it needs.
 */
export const name = 'dsh-theme-fixed'
export const inject = []

export function apply(ctx) {
  // Nothing to do on the host. The skin lives entirely in lib/client.js.
}
