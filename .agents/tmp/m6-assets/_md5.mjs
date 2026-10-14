
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const d = 'E:/dsh-theme/plugins/dsh-theme/assets/deepy';
const h = readdirSync(d).sort().map(f => f + ':' + createHash('md5').update(readFileSync(d + '/' + f)).digest('hex'));
process.stdout.write(createHash('sha256').update(h.join('|')).digest('hex') + '\n' + h.join('\n'));
