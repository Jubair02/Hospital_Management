/**
 * Escapes every character that carries meaning inside a regular expression,
 * so a user-supplied search term is matched literally.
 *
 * Every `$regex` filter in this codebase is built from a query string a client
 * controls. Without this, `search=.*` is a full scan of the collection dressed
 * up as a search, `search=(((((a)))))` is a pattern the engine can be made to
 * backtrack through, and a stray `\` is a syntax error that reaches the user
 * as a 500.
 *
 * This lived as nine identical private copies across the controllers, which is
 * nine chances for one of them to drift and become the hole the other eight
 * were closing. It is one function precisely because it is security-relevant.
 */
export const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default escapeRegex;
