/**
 * Phonetic keys: Double Metaphone via the `double-metaphone` package (wooorm; MIT, ESM,
 * no dependencies, ~3 kB gz). A faithful implementation is ~800 lines of rules; the package
 * is the well-known reference port, so we use it rather than re-deriving it.
 */
import { doubleMetaphone } from 'double-metaphone';

export type PhoneticKeys = readonly [primary: string, alternate: string];

const CACHE_LIMIT = 20_000;
const cache = new Map<string, PhoneticKeys>();

/** [primary, alternate] Double Metaphone keys for a normalized token. Memoized (bounded). */
export function phoneticKeys(token: string): PhoneticKeys {
  let keys = cache.get(token);
  if (!keys) {
    keys = token ? doubleMetaphone(token) : ['', ''];
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(token, keys);
  }
  return keys;
}
