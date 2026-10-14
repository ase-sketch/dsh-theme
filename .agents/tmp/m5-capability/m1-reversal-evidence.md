# M1 section-9.2 reversal - verbatim primary evidence

## E1 - static client half materialization: direct factory call (asar, line-numbered)
source: dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/client.js
command: node asar.cjs read <path> | awk NR>=670 && NR<=706

670: 			/** Materialize a registered factory (synchronous; memoized in loadCache). */
671: 			materialize(id, ownerId = id) {
672: 				const existing = this.loadCache.get(id);
673: 				if (existing !== void 0) return existing;
674: 				const registered = this.factories.get(id);
675: 				/* v8 ignore next -- callers check the factory branch before dispatching here. */
676: 				if (registered === void 0) throw new Error(`client-modules: no registered factory for "${id}"`);
677: 				if (this.materializing.has(id)) throw new Error(`client-modules: require cycle through "${id}" (factory-form CJS cannot deliver partial exports)`);
678: 				this.materializing.add(id);
679: 				try {
680: 					const edges = /* @__PURE__ */ new Set();
681: 					const record = {
682: 						id,
683: 						exports: registered.factory(this.makeRequire(ownerId, edges)),
684: 						styles: claimStyles(ownerId),
685: 						edges
686: 					};
687: 					this.loadCache.set(id, record);
688: 					return record;
689: 				} catch (error) {
690: 					removeOwnedStyles(ownerId);
691: 					throw error;
692: 				} finally {
693: 					this.materializing.delete(id);
694: 				}
695: 			}
696: 			/** Build the synchronous module-table require and its asynchronous chunk operation. */
697: 			makeRequire(ownerId, edges) {
698: 				const require = (spec) => {
699: 					edges.add(spec);
700: 					if (this.seed.has(spec)) return this.seed.get(spec);
701: 					const id = stripClientSuffix(spec);
702: 					const record = this.loadCache.get(id);
703: 					if (record !== void 0) return record.exports;
704: 					if (this.factories.has(id)) return this.materialize(id).exports;
705: 					throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a materialized module, and no registered package factory (a build-time externals drift, or a dynamic dependency that did not arrive)`);
706: 				};

## E2 - no closure-evaluation primitive in the static loader
command: node asar.cjs read <client-modules/lib/client.js> | grep -c "new Function|AsyncFunction"
hits: 0

## E3 - dynamic path (control group) IS closure evaluation
source: dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/README.md
32:A browser half is written in plain JavaScript — no JSX, no TypeScript, no module imports — and runs as an async function. It receives a fixed set of names — `React`, `console`, `styles`, and `host` — while browser globals like `fetch` and `setTimeout` are unavailable. The plugin it returns can use the lifecycle verbs and only the services it declared in its own `inject`. Calling `host.call(method, args)` from the loaded half reaches its own host half. A crash that happens while React renders the loaded half is reported to the host with the slot, whether the crash removed the entry, and a message written for the author.
75:A `cordis/request-run` event asks this page whether to run a definition. Whoever answers — the page after an approval, or the user pressing run — drives the orchestration: the host half first (so a host-half failure short-circuits before the browser has moved), then the source fetch, then the browser half, then one resolution carrying what happened. The browser half's source is evaluated as an async function body with the symbol surface as parameters, the returned plugin is guard-wrapped and mounted through the loader, and the resolution reports the loaded revision or the failing stage with the closure's, guard's, or fiber's message. `host.call` routes through the Remote namespace; an omitted argument travels as `null`, and a payload the generated codec refuses becomes a teaching error naming the call and the contract.

## E4 - live-sample counter-evidence (skin-center, verbatim lines)
source: C:/Users/pass/.dsh/profiles/desktop/node_modules/@linxin666/dsh-client-ui-skin-center/lib/client.js
line 1-3 (static bundle wrapper):
window.__ModuleLoader__.load({
	id: "@linxin666/dsh-client-ui-skin-center",
	factory: (require) => {
line 3996:
			const fetchImpl = options.fetchImpl ?? fetch.bind(doc.defaultView);
line 3616:
				const timer = setTimeout(() => rejectLink(/* @__PURE__ */ new Error(`stylesheet load timeout: ${href}`)), 15e3);
line 4914-4919 (module-level inject array):
		const inject = [
			"slots",
			"locale",
			"theme",
			"configForms"
		];
occurrences of "timer" in the whole file: 0

## E5 - conclusion
dynamic path constraint comes from closure evaluation (E3);
static path is a synchronous factory call (E1 line 683 + E2 zero hits);
live sample breaks the constraint on the static path (E4: fetch + setTimeout, no timer in inject).
=> HANDOFF-M1 section 9.2 misattributed the dynamic runner constraint to static bundles.
=> M1 ROOT CAUSE remains undetermined: roster-not-activated / host-mount-failure / desktop-vs-web assembly all unexcluded.
