// One model call that is not a subject: a judge, a reviewer, or a simulated user. It runs on a host (Pi unless the
// setup names another) without tools, skills, context files or session, in its own isolated directories; the host
// adapter in hosts/ owns how.

import { hostAdapter } from "./hosts/index.mjs";

/**
 * Starts one model call on a prompt in its own directory, which keeps the prompt, events, final response and stderr.
 *
 * @param {string} directory replaced on every call
 * @param {string} prompt
 * @param {{host?: string, model: string, thinking: string | null, extensions: Array<{path: string}>, settings: object, signal?: AbortSignal, role?: string}} options
 * @returns {Promise<{response: string | null, errors: string[], usage: any, isolation: any}>}
 */
export async function launchModel(directory, prompt, options) {
  return hostAdapter(options.host ?? "pi").modelCall(directory, prompt, options);
}
