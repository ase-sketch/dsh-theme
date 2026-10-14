#!/usr/bin/env node
/**
 * extract.mjs - mechanical inline-SVG icon inventory for DSH client bundles.
 * Zero dependencies: string scanning + bracket matching only.
 *
 * Counting rule (one definition, used by every number reported):
 *   one "svg element call" = <jsxFactory>("svg", {<object literal>}).
 *   Factories accepted: jsx / jsxs, optionally namespaced
 *   (react_jsx_runtime.jsx) and optionally digit-suffixed (jsx2).
 *   A bare "svg" string literal (data: URI, SVG_NS constant, MIME type,
 *   createElementNS) is NOT an element call and is counted separately.
 *
 * Env overrides:
 *   DSH_SCAN_ROOT  scan root (default: the installed dsh node_modules tree)
 *   DSH_OUT_DIR    output dir  (default: E:\dsh-theme\.agents\tmp\m7-icons)
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const SCAN_ROOT = process.env.DSH_SCAN_ROOT
  || 'C:\\Users\\pass\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai';
const OUT_DIR = process.env.DSH_OUT_DIR || 'E:\\dsh-theme\\.agents\\tmp\\m7-icons';

const BT = String.fromCharCode(96);

/* ---------------- 1. low level scanners ---------------- */

function readStringAt(text, i) {
  const q = text[i];
  let j = i + 1;
  let out = '';
  while (j < text.length) {
    const c = text[j];
    if (c === String.fromCharCode(92)) { out += text[j + 1]; j += 2; continue; }
    if (c === q) { j++; break; }
    out += c;
    j++;
  }
  return { value: out, next: j };
}

function readTemplateAt(text, i) {
  let j = i + 1;
  let out = '';
  while (j < text.length) {
    const c = text[j];
    if (c === String.fromCharCode(92)) { out += text[j + 1]; j += 2; continue; }
    if (c === BT) { j++; break; }
    if (c === '$' && text[j + 1] === '{') {
      const end = matchBracket(text, j + 1);
      out += '$' + '{' + text.slice(j + 2, end) + '}';
      j = end + 1;
      continue;
    }
    out += c;
    j++;
  }
  return { value: out, next: j };
}

function matchBracket(text, open) {
  const openCh = text[open];
  const closeCh = openCh === '{' ? '}' : openCh === '[' ? ']' : ')';
  let depth = 0;
  let i = open;
  const len = text.length;
  while (i < len) {
    const c = text[i];
    if (c === '"' || c === "'") { i = readStringAt(text, i).next; continue; }
    if (c === BT) { i = readTemplateAt(text, i).next; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < len && text[i] !== String.fromCharCode(10)) i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e === -1 ? len : e + 2; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0 && c === closeCh) return i;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

function readValue(text, i) {
  const len = text.length;
  while (i < len && /\s/.test(text[i])) i++;
  const c = text[i];
  if (c === '"' || c === "'") { const s = readStringAt(text, i); return { raw: s.value, next: s.next, literal: true }; }
  if (c === BT) { const s = readTemplateAt(text, i); return { raw: s.value, next: s.next, literal: true }; }
  if (c === '{' || c === '[') { const e = matchBracket(text, i); return { raw: text.slice(i, e + 1), next: e + 1, literal: false }; }
  let j = i;
  let depth = 0;
  while (j < len) {
    const ch = text[j];
    if (ch === '(' || ch === '[' || ch === '{') { depth++; j++; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) break; depth--; j++; continue; }
    if (ch === '"' || ch === "'") { j = readStringAt(text, j).next; continue; }
    if (ch === BT) { j = readTemplateAt(text, j).next; continue; }
    if (ch === ',' && depth === 0) break;
    j++;
  }
  const raw = text.slice(i, j).trim();
  return { raw: raw, next: j, literal: /^(true|false|null|-?[0-9]+(\.[0-9]+)?)$/.test(raw) };
}

function parseProps(objText) {
  const props = new Map();
  const dynamic = new Set();
  let i = 1;
  const len = objText.length - 1;
  while (i < len) {
    while (i < len && /[\s,]/.test(objText[i])) i++;
    if (i >= len) break;
    if (objText[i] === '}') break;
    if (objText.startsWith('...', i)) {
      const v = readValue(objText, i + 3);
      dynamic.add('...spread');
      i = v.next;
      continue;
    }
    let key;
    if (objText[i] === '"' || objText[i] === "'") { const s = readStringAt(objText, i); key = s.value; i = s.next; }
    else {
      const m = /^[A-Za-z0-9_$]+/.exec(objText.slice(i));
      if (!m) { const v = readValue(objText, i); i = Math.max(v.next, i + 1); continue; }
      key = m[0];
      i += m[0].length;
    }
    while (i < len && /\s/.test(objText[i])) i++;
    if (objText[i] !== ':') { const v = readValue(objText, i); i = Math.max(v.next, i + 1); continue; }
    const v = readValue(objText, i + 1);
    props.set(key, v.raw);
    if (!v.literal) dynamic.add(key);
    i = v.next;
  }
  return { props: props, dynamic: dynamic };
}

/* ---------------- 2. shape vocabulary ---------------- */

const SHAPE_TAGS = ['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
  'g', 'defs', 'clipPath', 'mask', 'use', 'text', 'tspan', 'image', 'symbol',
  'linearGradient', 'radialGradient', 'stop', 'filter', 'animate'];

const SKIP_ATTRS = new Set(['className', 'style', 'key', 'ref', 'xmlns', 'aria-hidden',
  'id', 'width', 'height', 'tabIndex', 'role', 'focusable', 'onClick', 'onMouseDown',
  'xmlnsXlink', 'version', 'preserveAspectRatio', 'xmlSpace']);

const PER_TAG_IDENTITY = {
  path: ['d', 'fillRule', 'clipRule'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'],
  polygon: ['points', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'],
  g: ['fill', 'stroke', 'strokeWidth', 'transform', 'opacity']
};

const ROOT_IDENTITY = ['viewBox', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap',
  'strokeLinejoin', 'strokeDasharray', 'fillRule', 'clipRule', 'opacity'];

/* ---------------- 3. naming engine ---------------- */

const STOPWORDS = new Set(['icon', 'icons', 'outline', 'outlined', 'filled', 'regular',
  'solid', 'small', 'large', 'default', 'module', 'css', 'component', 'render', 'renders',
  'decorative', 'geometry', 'artwork', 'client', 'src', 'assets', 'lib', 'types', 'index',
  'function', 'const', 'var', 'let', 'returns', 'return', 'param', 'params', 'props',
  'the', 'and', 'for', 'with', 'new', 'react', 'runtime', 'jsx', 'svg', 'element', 'node',
  'wrapper', 'square', 'shape', 'px', 'via', 'is', 'of', 'a', 'an', 'to', 'uses', 'use',
  'base', 'core', 'ui', 'dsh', 'deepseek', 'ai', 'does', 'not', 'be', 'or', 'it', 'this',
  'should', 'can', 'will', 'only', 'just', 'same', 'per', 'one', 'two', 'get', 'set', 'if']);

const PHRASES = {};
(function () {
  const list = [
    ['chevron', 'up'], ['chevron', 'down'], ['chevron', 'left'], ['chevron', 'right'],
    ['chevrons', 'up', 'down'], ['chevrons', 'left', 'right'], ['chevrons', 'up', 'right'],
    ['chevrons', 'up', 'left'], ['chevrons', 'down', 'right'], ['chevrons', 'down', 'left'],
    ['caret', 'up'], ['caret', 'down'], ['caret', 'left'], ['caret', 'right'],
    ['arrow', 'up'], ['arrow', 'down'], ['arrow', 'left'], ['arrow', 'right'],
    ['arrow', 'up', 'right'], ['arrow', 'up', 'left'], ['arrow', 'down', 'right'], ['arrow', 'down', 'left'],
    ['arrow', 'up', 'from', 'line'], ['arrow', 'down', 'to', 'line'], ['arrow', 'left', 'from', 'line'],
    ['external', 'link'], ['more', 'horizontal'], ['more', 'vertical'],
    ['plus', 'circle'], ['minus', 'circle'], ['x', 'circle'], ['check', 'circle'],
    ['alert', 'circle'], ['info', 'circle'], ['help', 'circle'], ['play', 'circle'],
    ['loader', 'circle'], ['square', 'check'], ['square', 'plus'], ['circle', 'dot'],
    ['circle', 'check'], ['circle', 'plus'], ['circle', 'alert'], ['circle', 'x'],
    ['folder', 'plus'], ['folder', 'open'], ['folder', 'search'], ['folder', 'x'],
    ['file', 'text'], ['file', 'code'], ['file', 'image'], ['file', 'plus'], ['file', 'search'],
    ['file', 'music'], ['file', 'video'], ['file', 'archive'], ['file', 'warning'], ['file', 'check'],
    ['git', 'branch'], ['git', 'commit'], ['git', 'merge'], ['git', 'pull'], ['git', 'compare'],
    ['message', 'circle'], ['message', 'square'], ['message', 'square', 'more'],
    ['user', 'plus'], ['user', 'check'], ['user', 'round'], ['log', 'out'], ['log', 'in'],
    ['list', 'plus'], ['list', 'filter'], ['cloud', 'upload'], ['cloud', 'download'],
    ['chart', 'bar'], ['chart', 'line'], ['chart', 'pie'], ['bar', 'chart'],
    ['trending', 'up'], ['trending', 'down'],
    ['panel', 'left'], ['panel', 'right'], ['panel', 'top'], ['panel', 'bottom'],
    ['panel', 'left', 'open'], ['panel', 'left', 'close'],
    ['text', 'cursor'], ['align', 'left'], ['align', 'right'], ['align', 'center'],
    ['rotate', 'cw'], ['rotate', 'ccw'], ['refresh', 'cw'], ['zoom', 'in'], ['zoom', 'out'],
    ['book', 'open'], ['shield', 'check'], ['shield', 'alert'], ['shield', 'x'],
    ['scan', 'line'], ['scan', 'search'], ['corner', 'down', 'right'], ['corner', 'up', 'right'],
    ['corner', 'down', 'left'], ['corner', 'up', 'left'],
    ['monitor', 'play'], ['monitor', 'up'], ['monitor', 'down'],
    ['user', 'cog'], ['sliders', 'horizontal'], ['clock', 'arrow', 'up'],
    ['app', 'window'], ['life', 'buoy'], ['shopping', 'cart'], ['credit', 'card'],
    ['table', 'properties'], ['folder', 'tree'], ['file', 'tree'], ['message', 'square', 'plus'],
    ['sticky', 'note'], ['notebook', 'pen'], ['gauge'], ['fuel']
  ];
  for (const p of list) PHRASES[p.join(' ')] = p.join('-');
})();

const TOKENS = {
  x: 'x', close: 'x', dismiss: 'x', cross: 'x', times: 'x', cancel: 'x', escape: 'x',
  remove: 'minus', plus: 'plus', add: 'plus', minus: 'minus', subtract: 'minus',
  check: 'check', tick: 'check', done: 'check', validate: 'check', select: 'check',
  selected: 'check', active: 'check', enabled: 'check', approve: 'check',
  search: 'search', magnify: 'search', magnifier: 'search', find: 'search',
  settings: 'settings', gear: 'settings', cog: 'settings', preferences: 'settings',
  prefs: 'settings', config: 'settings', configure: 'settings', options: 'settings',
  user: 'user', users: 'users', person: 'user', profile: 'profile', account: 'account',
  avatar: 'avatar', bot: 'bot', robot: 'robot', agent: 'agent', assistant: 'bot',
  human: 'human', team: 'users', guest: 'guest',
  paperclip: 'paperclip', attach: 'paperclip', attachment: 'paperclip', clip: 'paperclip',
  pin: 'pin', pinned: 'pin',
  mic: 'mic', microphone: 'microphone', voice: 'mic', record: 'record',
  image: 'image', images: 'images', picture: 'image', photo: 'image', gallery: 'image',
  thumbnail: 'image', screenshot: 'image',
  file: 'file', files: 'files', doc: 'file', document: 'file', filename: 'file',
  folder: 'folder', folders: 'folder', dir: 'folder', directory: 'folder', workspace: 'folder',
  terminal: 'terminal', console: 'terminal', shell: 'terminal', bash: 'terminal',
  cmd: 'terminal', command: 'terminal',
  browser: 'browser', globe: 'globe', world: 'globe', earth: 'globe', web: 'globe',
  http: 'globe', https: 'globe', internet: 'globe', url: 'link',
  code: 'code', source: 'code', programming: 'code', developer: 'code',
  git: 'git', branch: 'git-branch', commit: 'git-commit', merge: 'merge', diff: 'diff',
  compare: 'compare',
  plugin: 'plugin', plugins: 'plugin', puzzle: 'plugin', extension: 'plugin', addon: 'plugin',
  package: 'package', box: 'package', cube: 'package',
  calendar: 'calendar', date: 'calendar', schedule: 'calendar', event: 'calendar',
  clock: 'clock', time: 'clock', timer: 'timer', stopwatch: 'timer', history: 'history',
  recent: 'history',
  bell: 'bell', notification: 'bell', notify: 'bell',
  alert: 'warning', warning: 'warning', error: 'warning',
  sun: 'sun', moon: 'moon', theme: 'theme', appearance: 'theme', palette: 'palette',
  contrast: 'contrast', brightness: 'contrast',
  panel: 'panel', sidebar: 'sidebar', layout: 'layout', columns: 'columns', rows: 'layout',
  maximize: 'maximize', fullscreen: 'fullscreen', minimize: 'minimize',
  expand: 'expand', collapse: 'collapse', resize: 'resize',
  more: 'more', menu: 'menu', list: 'list', filter: 'filter', sort: 'sort',
  reorder: 'sort', info: 'info', help: 'help', question: 'help', faq: 'help', hint: 'info',
  eye: 'eye', visibility: 'visibility', visible: 'eye', hidden: 'eye-off',
  show: 'eye', hide: 'eye-off', preview: 'eye',
  lock: 'lock', unlock: 'lock-open', locked: 'lock', secure: 'lock', private: 'lock',
  readonly: 'lock',
  logout: 'log-out', login: 'log-in', signin: 'log-in', signout: 'log-out', auth: 'auth',
  mail: 'mail', email: 'mail', envelope: 'mail', inbox: 'inbox',
  reply: 'reply', forward: 'forward',
  download: 'download', upload: 'upload', import: 'download', export: 'upload',
  copy: 'copy', clipboard: 'clipboard', duplicate: 'copy', paste: 'clipboard',
  cut: 'scissors', scissors: 'scissors',
  trash: 'trash', delete: 'trash', bin: 'trash', garbage: 'trash',
  edit: 'edit', pencil: 'edit', write: 'edit', compose: 'edit', rename: 'edit',
  refresh: 'refresh', reload: 'refresh', sync: 'refresh', reset: 'refresh',
  retry: 'refresh', update: 'refresh', reinstall: 'refresh',
  rotate: 'rotate', play: 'play', start: 'play', run: 'play', resume: 'play',
  stop: 'stop', pause: 'pause', abort: 'stop', halt: 'stop',
  send: 'send', paperplane: 'send', submit: 'send', dispatch: 'send',
  star: 'star', bookmark: 'bookmark', heart: 'heart',
  like: 'thumbs-up', dislike: 'thumbs-down', vote: 'thumbs-up', feedback: 'message',
  video: 'video', camera: 'camera', screen: 'monitor', monitor: 'monitor',
  desktop: 'monitor', display: 'monitor', presentation: 'monitor',
  phone: 'smartphone', mobile: 'smartphone', tablet: 'tablet', device: 'device',
  database: 'database', cloud: 'cloud', cpu: 'cpu', chip: 'cpu', memory: 'memory',
  server: 'server', network: 'network', container: 'container', model: 'cpu',
  provider: 'plug', plug: 'plug', hook: 'plug', hooks: 'plug', trigger: 'zap',
  zap: 'zap', bolt: 'zap', lightning: 'zap',
  sparkles: 'sparkles', sparkle: 'sparkles', magic: 'sparkles', wand: 'sparkles',
  auto: 'sparkles',
  at: 'at-sign', hash: 'hash', type: 'type', font: 'type', text: 'type',
  typography: 'type', quote: 'quote', cursor: 'cursor',
  link: 'link', unlink: 'link-off', external: 'external-link', chain: 'link',
  share: 'share', layers: 'layers',
  dollar: 'dollar', price: 'dollar', cost: 'dollar', token: 'token',
  budget: 'wallet', wallet: 'wallet', billing: 'credit-card',
  briefcase: 'briefcase', work: 'briefcase', job: 'briefcase', jobs: 'briefcase',
  book: 'book', read: 'book', library: 'library', manual: 'book', docs: 'file',
  feather: 'feather', loader: 'loader', spinner: 'loader', loading: 'loader',
  target: 'target', goal: 'target', objective: 'target', aim: 'target',
  compass: 'compass', explore: 'compass', discover: 'compass', rocket: 'rocket',
  home: 'home', house: 'home', main: 'home', root: 'home',
  grid: 'grid', table: 'table', kanban: 'columns', dashboard: 'dashboard',
  chart: 'chart', analytics: 'chart', stats: 'chart', statistic: 'chart', graph: 'chart',
  activity: 'activity', pulse: 'activity', status: 'activity', health: 'activity',
  signal: 'activity', connectivity: 'activity',
  chat: 'chat', message: 'message', messages: 'message', comment: 'message',
  conversation: 'message', thread: 'message', discussion: 'message', notice: 'info',
  brain: 'brain', mind: 'brain', think: 'brain', thinking: 'brain', reason: 'brain',
  tool: 'tool', tools: 'tool', wrench: 'tool', hammer: 'tool', screwdriver: 'tool',
  build: 'tool', craft: 'tool',
  skill: 'skill', skills: 'skill', recipe: 'skill', playbook: 'skill',
  workflow: 'workflow', pipeline: 'workflow',
  todo: 'check', task: 'check', plan: 'clipboard', step: 'step', approval: 'check-circle',
  recall: 'history', context: 'layers',
  flag: 'flag', report: 'flag', banana: 'banana',
  fish: 'fish', logo: 'logo', wordmark: 'wordmark', brand: 'brand', mascot: 'fish',
  deepy: 'deepy',
  key: 'key', api: 'code', webhook: 'zap',
  route: 'route', tree: 'network',
  skip: 'skip', next: 'arrow-right', previous: 'arrow-left',
  enter: 'corner-down-left', tab: 'tab', space: 'space',
  beta: 'beta', flask: 'flask', beaker: 'flask', test: 'flask', experiment: 'flask',
  bug: 'bug', issue: 'bug', debug: 'bug', stack: 'layers',
  arrow: 'arrow', up: 'arrow-up', down: 'arrow-down', left: 'arrow-left', right: 'arrow-right',
  triangle: 'triangle', diamond: 'diamond', hexagon: 'hexagon',
  circle: 'circle', dot: 'circle-dot', dash: 'minus', line: 'minus',
  scroll: 'move', scrollbar: 'move', pagination: 'list', drag: 'move', move: 'move',
  grip: 'grip-vertical', divider: 'minus', handle: 'grip-vertical',
  offline: 'wifi-off', wifi: 'wifi', bluetooth: 'bluetooth',
  tabs: 'tabs', tabbar: 'tabs', breadcrumb: 'chevron-right',
  searchbar: 'search', searchfield: 'search', filterbar: 'filter',
  queued: 'clock', running: 'loader', failed: 'x', passed: 'check', waiting: 'loader',
  connected: 'check', disconnected: 'x', pending: 'loader', progress: 'loader',
  memory: 'memory', memories: 'brain', note: 'notebook', notes: 'notebook', journal: 'notebook',
  scheduler: 'calendar-clock', cron: 'calendar-clock', watch: 'eye', newchat: 'message-square-plus',
  newmessage: 'send', newsession: 'plus', news: 'newspaper', megaphone: 'megaphone',
  announcement: 'megaphone', support: 'life-buoy', helpdesk: 'life-buoy', contact: 'mail',
  permission: 'shield', permissions: 'shield', safe: 'shield', policy: 'shield',
  deny: 'x', reject: 'x', map: 'map', location: 'map-pin', quote_: 'quote',
  library_: 'library', keyboard: 'keyboard', hotkey: 'keyboard', keybinding: 'keyboard',
  shortcuts: 'keyboard', typed: 'type', format: 'type', fonts: 'type',
  unicode: 'type', language: 'globe', translate: 'globe', i18n: 'globe', locale: 'globe',
  themeicon: 'palette', lightmode: 'sun', darkmode: 'moon', systemmode: 'monitor',
  appearance_: 'theme', inspector: 'sliders-horizontal', debugpanel: 'bug',
  order: 'list', steps: 'list', sequence: 'list', workflowicon: 'workflow',
  account_: 'account', profile_: 'profile', identity: 'user', auth_: 'lock',
  tokenkey: 'key', password: 'key', encryption: 'lock', hash_: 'hash',
  money: 'dollar', subscription: 'credit-card', plan_: 'clipboard', billing_: 'credit-card',
  prompt: 'terminal', input: 'cursor', composer: 'type', textarea: 'type',
  shield: 'shield', data: 'database', dark: 'moon', light: 'sun',
  checklist: 'list-checks', checkitem: 'list-checks', tasks: 'list-checks',
  wrap: 'wrap-text', wraplines: 'wrap-text', wraptext: 'wrap-text', nowrap: 'wrap-text',
  follow: 'route', followup: 'route', system: 'monitor', subagent: 'bot', subagents: 'bot',
  queue: 'list'
};

const CATEGORY_RULES = [
  ['file-attachment', ['file', 'folder', 'paperclip', 'clipboard', 'archive', 'download',
    'upload', 'document', 'package', 'save', 'notebook', 'database', 'scissors']],
  ['identity', ['user', 'bot', 'robot', 'agent', 'person', 'profile', 'avatar', 'account',
    'lock', 'key', 'auth', 'log-in', 'log-out', 'login', 'logout', 'shield', 'mail',
    'email', 'at-sign', 'fish', 'logo', 'wordmark', 'brand', 'team', 'human', 'plug']],
  ['media', ['image', 'camera', 'video', 'play', 'stop', 'pause', 'record', 'mic',
    'microphone', 'screen', 'monitor', 'presentation', 'gallery', 'palette', 'sun',
    'moon', 'contrast', 'camera']],
  ['status', ['check', 'alert', 'warning', 'info', 'help', 'bell', 'loader', 'spinner',
    'clock', 'timer', 'history', 'ban', 'activity', 'pulse', 'signal', 'flask', 'bug',
    'circle-x', 'x-circle', 'check-circle', 'plus-circle', 'minus-circle', 'wifi']],
  ['navigation', ['chevron', 'arrow', 'caret', 'menu', 'panel', 'sidebar', 'home', 'route',
    'compass', 'corner', 'columns', 'maximize', 'minimize', 'fullscreen', 'expand',
    'collapse', 'layout', 'list', 'tabs', 'skip', 'tab', 'link', 'external-link',
    'grip', 'align']],
  ['action', ['send', 'search', 'filter', 'sort', 'refresh', 'copy', 'share', 'edit',
    'trash', 'delete', 'plus', 'minus', 'x', 'close', 'dismiss', 'undo', 'redo',
    'reply', 'forward', 'zoom', 'settings', 'cog', 'gear', 'sliders', 'pin', 'star',
    'heart', 'thumbs', 'magic', 'wand', 'sparkles', 'zap', 'target', 'rocket', 'tool',
    'wrench', 'scan', 'move', 'rotate', 'terminal', 'code', 'git', 'diff', 'compare',
    'bookmark', 'flag', 'brain', 'tool', 'wand', 'task', 'step', 'run']]
];

function categorize(name) {
  const n = (name || '').toLowerCase();
  if (n === 'unknown') return 'unknown';
  for (const pair of CATEGORY_RULES) {
    for (const kw of pair[1]) {
      if (n === kw || n.indexOf(kw + '-') === 0 || n.indexOf('-' + kw + '-') >= 0 || n.endsWith('-' + kw)) {
        return pair[0];
      }
    }
  }
  return 'other';
}

function words(s) {
  return String(s || '')
    .replace(/\.(svg|tsx|jsx|js|ts|css|json|md)$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(function (w) { return w.toLowerCase(); })
    .filter(function (w) { return w.length > 0 && !STOPWORDS.has(w); });
}

function matchWords(ws) {
  const unrecognized = [];
  for (let i = 0; i < ws.length;) {
    let hit = null;
    let used = 1;
    if (i + 2 < ws.length) {
      const t3 = ws.slice(i, i + 3).join(' ');
      if (PHRASES[t3]) { hit = PHRASES[t3]; used = 3; }
    }
    if (!hit && i + 1 < ws.length) {
      const t2 = ws.slice(i, i + 2).join(' ');
      if (PHRASES[t2]) { hit = PHRASES[t2]; used = 2; }
    }
    if (!hit) {
      const t1 = ws[i];
      if (TOKENS[t1]) hit = TOKENS[t1];
      else if (PHRASES[t1]) hit = PHRASES[t1];
      else unrecognized.push(t1);
    }
    if (hit) return { name: hit, used: used, unrecognized: unrecognized };
    i += 1;
  }
  return { name: null, unrecognized: unrecognized };
}

/* geometry-only fallback: tiny, deterministic, deliberately conservative */
function geometryGuess(shapes) {
  const seg = [];
  for (const s of shapes) {
    if (s.tag === 'line') seg.push('M' + (s.attrs.x1 || '0') + ' ' + (s.attrs.y1 || '0') + 'L' + (s.attrs.x2 || '0') + ' ' + (s.attrs.y2 || '0'));
    else if (s.tag === 'polyline' || s.tag === 'polygon') {
      const pts = String(s.attrs.points || '').trim().split(/\s+/);
      if (pts.length === 3) seg.push('M' + pts[0].replace(/,/g, ' ') + 'L' + pts[1].replace(/,/g, ' ') + 'L' + pts[2].replace(/,/g, ' '));
    } else if (s.tag === 'path') {
      const d = String(s.attrs.d || '');
      const m = d.match(/^M([\d.]+)\s+([\d.]+)\s*L([\d.]+)\s+([\d.]+)\s*L([\d.]+)\s+([\d.]+)\s*$/);
      if (m) seg.push(m[0].replace(/\s+/g, ' '));
    }
  }
  if (seg.length === 2) {
    const a = seg[0].match(/^M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)$/);
    const b = seg[1].match(/^M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)$/);
    if (a && b) {
      const dx1 = +a[3] - +a[1], dy1 = +a[4] - +a[2];
      const dx2 = +b[3] - +b[1], dy2 = +b[4] - +b[2];
      if (dx1 && dx2) {
        const s1 = dy1 / dx1, s2 = dy2 / dx2;
        if (s1 * s2 < 0) return 'x';
        if (Math.abs(s1) < 0.2 && Math.abs(s2) > 4) return 'plus';
        if (Math.abs(s1) > 4 && Math.abs(s2) < 0.2) return 'plus';
      }
    }
  }
  if (seg.length === 1) {
    const m = seg[0].match(/^M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)$/);
    if (m) {
      const x1 = +m[1], y1 = +m[2], x2 = +m[3], y2 = +m[4], x3 = +m[5], y3 = +m[6];
      if (y2 < y1 && y2 < y3) return 'chevron-up';
      if (y2 > y1 && y2 > y3) return 'chevron-down';
      if (x2 > x1 && x2 > x3) return 'chevron-right';
      if (x2 < x1 && x2 < x3) return 'chevron-left';
    }
  }
  return null;
}

/* ---------------- 4. scan ---------------- */

function listJsFiles(root) {
  const out = [];
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    const p = join(root, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'types') continue;
      out.push.apply(out, listJsFiles(p));
    } else if (e.isFile() && /\.js$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}
function lineOf(starts, off) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
function nearest(text, re, upto) {
  const sub = text.slice(0, upto);
  let m = null;
  let guard = 0;
  while (guard++ < 600) {
    const n = re.exec(sub);
    if (!n) break;
    m = n;
  }
  return m;
}

const FN_RE = /(?:function\s+([A-Za-z0-9_$]+)\s*\(|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*(?::[^=]*?)?=>|[A-Za-z0-9_$]+\s*=>))/g;
const REGION_RE = /\/\/#region\s+([^\r\n*]+)/g;
const JSDOC_RE = /\/\*\*([\s\S]{0,1200}?)\*\//g;
const SVG_CALL_RE = /([A-Za-z_$][\w$]*)\)?\("svg"\s*,\s*\{/g;
const SHAPE_RE = new RegExp('\\b(?:jsx[s]?\\d*|createElement)\\)?\\("(' + SHAPE_TAGS.join('|') + ')"\\s*,\\s*\\{', 'g');

let packages = [];
try {
  packages = readdirSync(SCAN_ROOT, { withFileTypes: true })
    .filter(function (e) { return e.isDirectory() && /^dsh-client-ui-/.test(e.name); })
    .map(function (e) { return e.name; })
    .sort();
} catch (e) {
  console.error('FATAL: cannot read scan root: ' + SCAN_ROOT);
  process.exit(2);
}

const allFiles = [];
for (const pkg of packages) {
  const libDir = join(SCAN_ROOT, pkg, 'lib');
  if (!statSync(libDir, { throwIfNoEntry: false })) continue;
  for (const f of listJsFiles(libDir)) allFiles.push({ pkg: pkg, path: f });
}

const iconsByFingerprint = new Map();
let totalSvgCalls = 0;
let rawSvgLiteralCalls = 0;
const factoryHistogram = {};
const rejectedFactories = {};
const byFile = {};

for (const entry of allFiles) {
  const pkg = entry.pkg;
  const text = readFileSync(entry.path, 'utf8');
  const rel = relative(SCAN_ROOT, entry.path).split('\\').join('/');
  const starts = lineIndex(text);
  const before0 = totalSvgCalls;

  SVG_CALL_RE.lastIndex = 0;
  let m;
  while ((m = SVG_CALL_RE.exec(text)) !== null) {
    rawSvgLiteralCalls++;
    const factory = m[1];
    if (!/^(jsx[s]?\d*|createElement)$/.test(factory)) { rejectedFactories[factory] = (rejectedFactories[factory] || 0) + 1; continue; }
    factoryHistogram[factory] = (factoryHistogram[factory] || 0) + 1;
    const braceIdx = text.indexOf('{', m.index + m[0].length - 1);
    const end = matchBracket(text, braceIdx);
    if (end === -1) continue;
    const objText = text.slice(braceIdx, end + 1);
    const parsed = parseProps(objText);
    const props = parsed.props;
    totalSvgCalls++;

    const shapes = [];
    SHAPE_RE.lastIndex = 0;
    let sm;
    while ((sm = SHAPE_RE.exec(objText)) !== null) {
      const sb = objText.indexOf('{', sm.index + sm[0].length - 1);
      const se = matchBracket(objText, sb);
      if (se === -1) continue;
      const sp = parseProps(objText.slice(sb, se + 1));
      const attrs = {};
      for (const kv of sp.props) if (!SKIP_ATTRS.has(kv[0])) attrs[kv[0]] = kv[1];
      shapes.push({ tag: sm[1], attrs: attrs, dynamic: Array.from(sp.dynamic) });
    }

    const viewBox = props.get('viewBox') || props.get('viewbox') || null;
    const presentation = {};
    for (const k of ROOT_IDENTITY) {
      if (k !== 'viewBox' && props.has(k)) presentation[k] = props.get(k);
    }

    const identShapes = shapes.map(function (s) {
      const keys = PER_TAG_IDENTITY[s.tag] || Object.keys(s.attrs).filter(function (k) { return !SKIP_ATTRS.has(k); });
      const parts = keys.filter(function (k) { return s.attrs[k] !== undefined; })
        .map(function (k) { return k + '=' + s.attrs[k]; }).sort();
      return s.tag + '(' + parts.join(',') + ')';
    }).join('|');
    const rootIdent = ROOT_IDENTITY.map(function (k) { return k + '=' + (props.get(k) === undefined ? '' : props.get(k)); }).join(',');
    const fingerprint = (viewBox || '?') + '#' + rootIdent + '##' + identShapes;
    const geometryKey = (viewBox || '?') + '#' + shapes.map(function (s) {
      const keys = PER_TAG_IDENTITY[s.tag] || [];
      const parts = keys.filter(function (k) { return s.attrs[k] !== undefined; })
        .map(function (k) { return k + '=' + s.attrs[k]; }).sort();
      return s.tag + '(' + parts.join(',') + ')';
    }).join('|');

    const off = m.index;
    const line = lineOf(starts, off);
    const rm = nearest(text, REGION_RE, off);
    const regionPath = rm ? rm[1].trim() : null;
    const fm = nearest(text, FN_RE, off);
    const enclosingFn = fm ? (fm[1] || fm[2] || null) : null;
    const jm = nearest(text, JSDOC_RE, off);
    const jsdoc = jm ? jm[1].replace(/\s+/g, ' ').trim().slice(0, 400) : null;
    const before = text.slice(Math.max(0, off - 600), off).replace(/\s+/g, ' ').trim();
    const after = text.slice(m.index + m[0].length, Math.min(text.length, m.index + m[0].length + 600)).replace(/\s+/g, ' ').trim();

    let rec = iconsByFingerprint.get(fingerprint);
    if (!rec) {
      const hash = createHash('sha1').update(fingerprint).digest('hex').slice(0, 8);
      const rootAttrs = {};
      for (const kv of props) if (!SKIP_ATTRS.has(kv[0]) && kv[0] !== 'children') rootAttrs[kv[0]] = kv[1];
      rec = {
        id: 'ico-' + hash,
        guessName: 'unknown',
        nameSource: 'unknown',
        nameCandidates: [],
        category: 'unknown',
        lucideStyleName: null,
        package: pkg,
        file: rel,
        line: line,
        viewBox: viewBox,
        width: props.get('width') || null,
        height: props.get('height') || null,
        presentation: presentation,
        paths: shapes.filter(function (s) { return s.tag === 'path' && s.attrs.d !== undefined; })
          .map(function (s) { return s.attrs.d; }),
        shapes: shapes,
        shapeCount: shapes.length,
        rootAttrs: rootAttrs,
        flags: {
          hasSpread: objText.indexOf('...') >= 0,
          hasConditional: /\?\s*[^:?]+\s*:/.test(objText),
          hasDefs: objText.indexOf('("defs"') >= 0,
          hasDynamicAttrs: Array.from(parsed.dynamic),
          nonLiteralPathCount: shapes.filter(function (s) { return s.tag === 'path' && s.attrs.d !== undefined && !/^\s*M/.test(String(s.attrs.d)); }).length
        },
        occurrences: 0,
        occurrenceSites: [],
        packages: {},
        contextHint: { before: before, after: after, jsdoc: jsdoc, enclosingFn: enclosingFn, regionPath: regionPath },
        fingerprint: fingerprint,
        geometryKey: geometryKey
      };
      iconsByFingerprint.set(fingerprint, rec);
    }
    rec.occurrences++;
    rec.occurrenceSites.push({
      package: pkg, file: rel, line: line, column: off - starts[line - 1] + 1,
      factory: factory, enclosingFn: enclosingFn, regionPath: regionPath, jsdoc: jsdoc,
      contextBefore: before, contextAfter: after
    });
    rec.packages[pkg] = (rec.packages[pkg] || 0) + 1;
  }
  byFile[rel] = totalSvgCalls - before0;
}

// ---- data: URI svg assets (not element calls) ----
const dataUris = [];
for (const entry of allFiles) {
  const text = readFileSync(entry.path, 'utf8');
  const rel = relative(SCAN_ROOT, entry.path).split('\\').join('/');
  const starts = lineIndex(text);
  const re = /data:image\/svg\+xml(;charset=UTF-8)?(;base64)?,([^\s"')]{1,40000})/g;
  let m;
  let n = 0;
  while ((m = re.exec(text)) !== null && n < 60) {
    n++;
    const isB64 = !!m[2];
    let decoded = '';
    try {
      decoded = isB64 ? Buffer.from(m[3], 'base64').toString('utf8') : decodeURIComponent(m[3]);
    } catch (e) { decoded = '<decode-failed>'; }
    const rm = nearest(text, REGION_RE, m.index);
    const fm = nearest(text, FN_RE, m.index);
    dataUris.push({
      package: entry.pkg, file: rel, line: lineOf(starts, m.index),
      regionPath: rm ? rm[1].trim() : null,
      enclosingFn: fm ? (fm[1] || fm[2] || null) : null,
      encoding: isB64 ? 'base64' : 'url-encoded',
      byteLength: decoded.length,
      svgHead: decoded.slice(0, 240)
    });
  }
}

/* ---------------- 5. naming pass ---------------- */

const icons = Array.from(iconsByFingerprint.values());

function fallbackName(rec) {
  const parts = [];
  for (const s of rec.occurrenceSites) {
    if (s.enclosingFn) parts.push(s.enclosingFn);
    if (s.regionPath) {
      const base = s.regionPath.split('/').pop();
      if (base && !/^index\./i.test(base)) parts.push(base);
    }
    if (parts.length) break;
  }
  const w = words(parts.join(' '));
  if (!w.length) return null;
  return w.slice(0, 4).join('-');
}

function siteCandidates(site) {
  const out = [];
  if (site.regionPath) {
    const m = matchWords(words(site.regionPath.split('/').pop()));
    if (m.name) out.push({ name: m.name, source: 'region-filename', evidence: site.regionPath });
  }
  if (site.enclosingFn) {
    const m = matchWords(words(site.enclosingFn));
    if (m.name) out.push({ name: m.name, source: 'component-name', evidence: site.enclosingFn });
  }
  if (site.jsdoc) {
    const m = matchWords(words(site.jsdoc));
    if (m.name) out.push({ name: m.name, source: 'jsdoc', evidence: site.jsdoc.slice(0, 160) });
  }
  const cssTokens = [];
  const cm = /(?:className:\s*([A-Za-z0-9_$.]*)|["']([a-z0-9-]*icon[a-z0-9-]*)["'])/gi;
  let c;
  const ctx = (site.contextBefore || '') + ' ' + (site.contextAfter || '');
  while ((c = cm.exec(ctx)) !== null) {
    const v = c[1] || c[2] || '';
    v.split(/[^A-Za-z0-9]+/).forEach(function (t) { if (t && t.length > 1) cssTokens.push(t); });
  }
  if (cssTokens.length) {
    const m = matchWords(words(cssTokens.join(' ')));
    if (m.name) out.push({ name: m.name, source: 'classname', evidence: cssTokens.slice(0, 8).join('/') });
  }
  return out;
}

for (const rec of icons) {
  let candidates = siteCandidates(rec.occurrenceSites[0]);
  for (let i = 1; i < rec.occurrenceSites.length; i++) {
    const extra = siteCandidates(rec.occurrenceSites[i]);
    for (const c of extra) candidates.push({ name: c.name, source: c.source, evidence: c.evidence, secondary: true });
  }
  if (candidates.length) {
    const primary = candidates.filter(function (c) { return !c.secondary; });
    const pick = (primary.length ? primary : candidates)[0];
    rec.guessName = pick.name;
    rec.nameSource = pick.source;
    const seen = {};
    rec.nameCandidates = [];
    for (const c of candidates) {
      const k = c.name + '/' + c.source;
      if (!seen[k] && rec.nameCandidates.length < 5) { seen[k] = 1; rec.nameCandidates.push(c.name + ' (' + c.source + ')'); }
    }
  } else {
    const g = geometryGuess(rec.shapes);
    if (g) { rec.guessName = g; rec.nameSource = 'geometry'; rec.nameCandidates = []; }
    else {
      const s = rec.occurrenceSites[0];
      const raw = [];
      if (s.enclosingFn) raw.push(s.enclosingFn);
      if (s.regionPath) raw.push(s.regionPath.split('/').pop());
      if (s.jsdoc) raw.push(s.jsdoc.slice(0, 120));
      rec.nameCandidates = raw.slice(0, 3);
    }
  }
  rec.category = categorize(rec.guessName);
  // lucideStyleName: kebab-case name in LUCIDE NAMING STYLE, NOT verified against the
  // lucide package (that tarball is out of scope here). Treat it as a search key only.
  rec.lucideStyleName = rec.guessName;
  const uniq = function (arr) { return Array.from(new Set(arr.filter(function (v) { return v !== undefined && v !== null && v !== ''; }))); };
  rec.strokeInfo = {
    rootStroke: rec.presentation.stroke || null,
    rootStrokeWidth: rec.presentation.strokeWidth || null,
    rootStrokeLinecap: rec.presentation.strokeLinecap || null,
    shapeStroke: uniq(rec.shapes.map(function (s) { return s.attrs.stroke; })),
    shapeStrokeWidth: uniq(rec.shapes.map(function (s) { return s.attrs.strokeWidth; })),
    shapeStrokeLinecap: uniq(rec.shapes.map(function (s) { return s.attrs.strokeLinecap; })),
    shapeFill: uniq(rec.shapes.map(function (s) { return s.attrs.fill; })),
    usesCurrentColor: JSON.stringify(rec.presentation).indexOf('currentColor') >= 0
      || rec.shapes.some(function (s) { return s.attrs.stroke === 'currentColor' || s.attrs.fill === 'currentColor'; })
  };
  rec.flags.dynamicViewBox = /\$\{/.test(String(rec.viewBox || '')) || !/^[\d\-. ]+$/.test(String(rec.viewBox || ''));
  rec.flags.zeroShapes = rec.shapeCount === 0;
}

icons.sort(function (a, b) {
  if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
  return a.id < b.id ? -1 : 1;
});

/* ---------------- 6. stats ---------------- */

const byPackage = {};
const byPackageUnique = {};
for (const rec of icons) {
  for (const p of Object.keys(rec.packages)) {
    byPackage[p] = (byPackage[p] || 0) + rec.packages[p];
    byPackageUnique[p] = (byPackageUnique[p] || 0) + 1;
  }
}
const sumByPackage = Object.keys(byPackage).reduce(function (s, k) { return s + byPackage[k]; }, 0);
const sumOccurrences = icons.reduce(function (s, r) { return s + r.occurrences; }, 0);
const geometryGroups = new Set(icons.map(function (r) { return r.geometryKey; })).size;
const identifiable = icons.filter(function (r) { return r.guessName !== 'unknown'; }).length;

let primitivesVersion = null;
try {
  primitivesVersion = JSON.parse(readFileSync(join(SCAN_ROOT, 'dsh-client-ui-primitives', 'package.json'), 'utf8')).version;
} catch (e) { /* optional */ }

const meta = {
  generatedAt: new Date().toISOString(),
  extractor: 'extract.mjs',
  scanRoot: SCAN_ROOT,
  packageGlob: 'dsh-client-ui-*/lib/**/*.js (types/ and *.d.ts excluded)',
  dshClientUiPrimitivesVersion: primitivesVersion,
  packagesScanned: packages.length,
  filesScanned: allFiles.length,
  countingRule: 'svg element call = any element factory called as ("svg", {object}) with factory in {jsx, jsxs, jsx<n>, createElement}; a bare "svg" string literal (data: URI, SVG_NS constant, MIME type) and createElementNS(SVG_NS, "svg") are NOT element calls',
  rawSvgLiteralMatches: rawSvgLiteralCalls,
  factoryHistogram: factoryHistogram,
  rejectedFactoryHistogram: rejectedFactories,
  extractedSvgCalls: totalSvgCalls,
  byFileSvgCalls: byFile
};

const stats = {
  totalSvgCalls: totalSvgCalls,
  uniqueIcons: icons.length,
  uniqueGeometry: geometryGroups,
  byPackage: byPackage,
  byPackageUniqueIcons: byPackageUnique,
  occurrencesSum: sumOccurrences,
  byPackageSum: sumByPackage,
  identifiable: identifiable,
  unknown: icons.length - identifiable,
  identifiableRate: icons.length ? +(identifiable / icons.length * 100).toFixed(2) : 0,
  dataUriSvgAssets: dataUris.length
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'inventory.json'),
  JSON.stringify({ meta: meta, stats: stats, icons: icons, dataUriSvgAssets: dataUris }, null, 2), 'utf8');

/* ---------------- 7. summary markdown ---------------- */

const HIGH_FREQ = 3;
const CATS = [
  ['navigation', '导航'], ['action', '操作'], ['file-attachment', '文件与附件'],
  ['media', '媒体'], ['identity', '用户与身份'], ['status', '状态'],
  ['other', '其它（已命名，类别待定）'], ['unknown', 'unknown（未能识别）']
];

const L = [];
L.push('# DSH 客户端内联 SVG 图标清单', '');
L.push('> 本文件由 extract.mjs 从 DSH 已安装客户端编译产物**机械生成**，禁止手改。');
L.push('> 重新生成：设置 DSH_SCAN_ROOT / DSH_OUT_DIR 后执行 node extract.mjs。', '');
L.push('## 怎么用这份清单', '');
L.push('- inventory.json 每条是一次**唯一图标**（按 viewBox + 形状几何 + 描边/填充属性去重）；');
L.push('  occurrenceSites[] 给出它在编译产物中的全部实例化位置（package / file / line / 外层组件名）。');
L.push('- guessName 是**规则推断**的 kebab-case 语义名，nameSource 标明依据：');
L.push('  region-filename / component-name / jsdoc / classname / geometry / unknown。');
L.push('- 做图标替换时先把 guessName 当 lucide 检索键（字段 lucideStyleName：**仅命名风格对齐 lucide，未与 lucide 包核对**）；');
L.push('  nameCandidates[] 是备选；unknown 条目需人工读 contextHint 再定。');
L.push('- 换之前必须核对 strokeInfo：多数图标把 stroke 写在每个 shape 上而不是根 svg；DSH 图标多为 stroke-based 自绘 path，');
L.push('  与 lucide 的 24x24 网格未必一一对应，width/height 常见 14/16/20 而非 24。', '');
L.push('## 统计', '');
L.push('| 指标 | 值 |', '| --- | --- |');
L.push('| 扫描包数 | ' + meta.packagesScanned + ' |');
L.push('| 扫描文件数 | ' + meta.filesScanned + ' |');
L.push('| svg 元素调用总数 totalSvgCalls | ' + stats.totalSvgCalls + ' |');
L.push('| 唯一图标数（几何+呈现属性去重） | ' + stats.uniqueIcons + ' |');
L.push('| 仅按几何去重的唯一图形数 | ' + stats.uniqueGeometry + ' |');
L.push('| 可识别（guessName != unknown） | ' + stats.identifiable + ' / ' + stats.uniqueIcons + '（' + stats.identifiableRate + '%）|');
L.push('| data:image/svg+xml 资产（另记，非元素调用） | ' + stats.dataUriSvgAssets + ' |');
L.push('| 计数口径 | ' + meta.countingRule + ' |');
L.push('');
L.push('### 各包 svg 调用数（求和 = ' + stats.byPackageSum + '，应等于 totalSvgCalls = ' + stats.totalSvgCalls + '）', '');
L.push('| 包 | 调用数 | 唯一图标 |', '| --- | ---: | ---: |');
Object.keys(stats.byPackage).sort(function (a, b) { return stats.byPackage[b] - stats.byPackage[a]; }).forEach(function (p) {
  L.push('| ' + p + ' | ' + stats.byPackage[p] + ' | ' + stats.byPackageUniqueIcons[p] + ' |');
});
L.push('');

const high = icons.filter(function (r) { return r.occurrences >= HIGH_FREQ; });
L.push('## 高频图标（实例化次数 ≥ ' + HIGH_FREQ + '，共 ' + high.length + ' 个）', '');
L.push('| id | guessName | 类别 | 次数 | viewBox | stroke | 主来源包 |', '| --- | --- | --- | ---: | --- | --- | --- |');
high.forEach(function (r) {
  L.push('| ' + r.id + ' | ' + r.guessName + ' | ' + r.category + ' | ' + r.occurrences + ' | ' + (r.viewBox || '-')
    + ' | ' + (r.presentation.stroke || r.presentation.strokeWidth || '-') + ' | ' + r.package + ' |');
});
L.push('');

for (const c of CATS) {
  const list = icons.filter(function (r) { return r.category === c[0]; });
  if (!list.length) continue;
  L.push('## ' + c[1] + '（' + list.length + '）', '');
  L.push('| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |', '| --- | --- | --- | ---: | --- | ---: | --- |');
  list.forEach(function (r) {
    L.push('| ' + r.id + ' | ' + r.guessName + ' | ' + r.nameSource + ' | ' + r.occurrences + ' | '
      + (r.viewBox || '-') + ' | ' + r.shapeCount + ' | ' + r.package + ' |');
  });
  L.push('');
}

const unknowns = icons.filter(function (r) { return r.guessName === 'unknown'; });
L.push('## unknown 明细（' + unknowns.length + ' 个，需人工定名）', '');
L.push('| id | 次数 | viewBox | package:file:line | 外层组件 | 上下文摘录（≤200 字符）|', '| --- | ---: | --- | --- | --- | --- |');
unknowns.forEach(function (r) {
  const s = r.occurrenceSites[0];
  const ex = (s.contextBefore.slice(-200) + ' >>> ' + s.contextAfter.slice(0, 60))
    .replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  L.push('| ' + r.id + ' | ' + r.occurrences + ' | ' + (r.viewBox || '-') + ' | ' + s.package + ' ' + s.file + ':' + s.line
    + ' | ' + (s.enclosingFn || '-') + ' | ' + ex + ' |');
});
L.push('');
L.push('## 已知局限', '');
L.push('- 只覆盖**内联 SVG 元素调用**与 data-URI 资产；外部 .svg 文件、sprite sheet、CSS background-image 引用的图标不在本次范围。');
L.push('- 编译产物随版本变化；本清单对应 dsh-client-ui-primitives@' + (primitivesVersion || 'unknown') + '。');
L.push('- flags.hasSpread / flags.hasConditional 为 true 的条目形状列表可能不完整（产物里有 {...props} 展开与三元表达式）。');
L.push('- guessName 是**推断**不是事实；nameSource 为 geometry 或 unknown 的条目在替换前必须人工复核。');
L.push('- shapes[] 为扁平化结果：嵌套在 g/defs 内的形状也会平铺列出，不保留层级。');

writeFileSync(join(OUT_DIR, 'icons-summary.md'), L.join('\n'), 'utf8');

console.log(JSON.stringify({
  packagesScanned: meta.packagesScanned,
  filesScanned: meta.filesScanned,
  rawSvgLiteralMatches: meta.rawSvgLiteralMatches,
  factoryHistogram: meta.factoryHistogram,
  stats: stats
}, null, 2));