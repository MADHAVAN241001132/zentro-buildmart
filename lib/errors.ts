/** Turns a database error message into text an owner can act on. Long or technical messages are replaced. */
export function friendly(message: string): string {
  const m = message.replace(/^.*?: /, '');
  return m.length > 180 ? 'The operation was refused. Check the values and try again.' : m;
}
