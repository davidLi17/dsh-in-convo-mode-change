// dsh-in-convo-mode-change — host half.
//
// Mounted as a normal plugin row in the profile composition (see
// cordis.patch.yml). It registers one exact HTTP route on the web server:
//
//   POST /change-convo-mode/switch   { sessionId, agentPreset }
//
// which re-composes the session's live agent onto the requested agent preset
// ("conversation mode": standard / code / minimal / cordis) using the host's
// own `agentPresets.recompose()` — the same machinery the built-in new-session
// picker uses for blank sessions, minus the "no turn has ever run"
// restriction, so an existing conversation can move between modes between
// turns.
//
// The host refuses a switch while a turn is open: the running turn resolves
// its tools through the agent's scope chain, and re-parenting that chain
// mid-call could strand an in-flight tool invocation. Between turns the
// re-link is safe — the next turn composes its tools and prompt sections
// from the new preset — and the switch is recorded in the session log as an
// `agent-preset/selected` event, so the transcript stays honest
// (reconstruction resolves the newest selection, never the creation header
// alone).
//
// Known trade-off, shown to the user before confirming: tool calls made under
// the previous composition may render differently in the live transcript,
// because the chat resolves tool views through the agent's CURRENT preset.
// The session data itself is untouched.

import { UnknownPresetError, PresetMountError } from "@deepseek-ai/dsh-agent-presets";

export const name = "dsh-in-convo-mode-change";

// Required host services (cordis fiber inject).
export const inject = ["webServer", "agentPresets", "agents"];

const ROUTE_PATH = "/change-convo-mode/switch";
const MAX_BODY_BYTES = 16384;

/**
 * Whether the session has a turn in flight: a `turn/start` that has not yet
 * been closed by its `turn/end`. Sessions are sequential (subagents own their
 * own sessions), so comparing the last indexes is enough.
 * @param session - the live session record.
 * @returns true while a turn is running.
 */
function turnOpen(session) {
	let lastStart = -1;
	let lastEnd = -1;
	const events = session.events;
	for (let index = 0; index < events.length; index += 1) {
		const type = events[index].type;
		if (type === "turn/start") lastStart = index;
		else if (type === "turn/end") lastEnd = index;
	}
	return lastStart > lastEnd;
}

/**
 * Read a request body as text, bounded so a hostile client cannot balloon
 * memory.
 * @param req - the node:http request.
 * @returns the body text.
 */
function readBody(req) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new Error("request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

/**
 * Write a JSON response.
 * @param res - the node:http response.
 * @param status - the HTTP status code.
 * @param payload - the JSON payload.
 */
function sendJson(res, status, payload) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body)
	});
	res.end(body);
}

/**
 * Perform one mode switch for a live session.
 *
 * Policy, deliberately mirrored from the built-in `agentPresets.select` RPC
 * minus its blank-session gate:
 * - the session must have a live agent (the header control only ever names
 *   the open session, which is live);
 * - subagent-owned sessions are fenced like every other host RPC;
 * - a running turn refuses the switch (the UI disables picking while
 *   running, this is the defense in depth);
 * - unknown or broken presets are refused with the same codes the built-in
 *   surface uses, so the browser shows one consistent vocabulary.
 *
 * @param ctx - the plugin context carrying the host services.
 * @param sessionId - the live session to re-compose.
 * @param agentPreset - the preset id to move the session to.
 * @returns the HTTP outcome ({ status, payload }).
 */
async function switchPreset(ctx, sessionId, agentPreset) {
	const presets = ctx.get("agentPresets");
	if (presets === undefined) {
		return {
			status: 404,
			payload: {
				error: {
					code: "agent-preset-not-found",
					message: "this deployment composes no agent presets"
				}
			}
		};
	}
	const agent = ctx.agents.get(sessionId);
	if (agent === undefined) {
		return {
			status: 404,
			payload: {
				error: {
					code: "session-not-found",
					message: `session "${sessionId}" has no live agent`
				}
			}
		};
	}
	if (agent.session.header.origin === "subagent") {
		return {
			status: 409,
			payload: {
				error: {
					code: "agent-busy",
					message: "subagent sessions cannot change mode"
				}
			}
		};
	}
	if (turnOpen(agent.session)) {
		return {
			status: 409,
			payload: {
				error: {
					code: "turn-running",
					message: "the session is running a turn; wait for it to finish before switching the agent preset"
				}
			}
		};
	}
	try {
		const preset = await presets.recompose(agent.ctx, agentPreset);
		agent.session.append("agent-preset/selected", { agentPreset: preset.id });
		return {
			status: 200,
			payload: { ok: true, agentPreset: preset.id }
		};
	} catch (error) {
		if (error instanceof UnknownPresetError) {
			return {
				status: 404,
				payload: {
					error: {
						code: "agent-preset-not-found",
						message: error.message,
						available: error.available
					}
				}
			};
		}
		if (error instanceof PresetMountError) {
			return {
				status: 422,
				payload: {
					error: {
						code: "agent-preset-invalid",
						message: error.message
					}
				}
			};
		}
		return {
			status: 500,
			payload: {
				error: {
					code: "internal",
					message: `failed to switch session "${sessionId}" to agent preset "${agentPreset}": ${String(error)}`
				}
			}
		};
	}
}

/**
 * Plugin body: register the switch route.
 * @param ctx - the plugin context carrying the host services.
 * @returns the route disposer.
 */
export function apply(ctx) {
	// Per-session serialization, mirroring the api-proxy's presetSwitches map:
	// two rapid picks for one session must not interleave recompose calls.
	const pending = /* @__PURE__ */ new Map();
	return ctx.webServer.register({
		kind: "exact",
		path: ROUTE_PATH,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, {
					error: {
						code: "method-not-allowed",
						message: "this route only accepts POST"
					}
				});
				return;
			}
			let body;
			try {
				body = JSON.parse(await readBody(req));
			} catch {
				sendJson(res, 400, {
					error: {
						code: "bad-request",
						message: "body must be JSON"
					}
				});
				return;
			}
			const sessionId = body?.sessionId;
			const agentPreset = body?.agentPreset;
			if (typeof sessionId !== "string" || sessionId === "" || typeof agentPreset !== "string" || agentPreset === "") {
				sendJson(res, 400, {
					error: {
						code: "bad-request",
						message: "sessionId and agentPreset are required strings"
					}
				});
				return;
			}
			const turn = (pending.get(sessionId) ?? Promise.resolve()).then(() => switchPreset(ctx, sessionId, agentPreset));
			pending.set(sessionId, turn.catch(() => void 0));
			try {
				const outcome = await turn;
				sendJson(res, outcome.status, outcome.payload);
			} finally {
				if (pending.get(sessionId) === turn) pending.delete(sessionId);
			}
		}
	});
}
