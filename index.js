/**
 * Host half of the desktop pet. The pet lives entirely in the client: the
 * whale sprites are inlined into client.js, so there is nothing to serve.
 * This entry only exists so the profile bundle loads the client half.
 */
export const name = "dsh-desktop-pet";
export function apply() {}
