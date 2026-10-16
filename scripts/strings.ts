// Lists visible English strings with no Vietnamese translation yet (JSON array), for the i18n pass.
import { visibleStrings } from '../tests/strings.ts';
import { VI } from '../src/vi.ts';
const missing = visibleStrings().filter(s => !(s in VI));
console.log(JSON.stringify(missing, null, 1));
console.error(`${missing.length} missing of ${visibleStrings().length}`);
