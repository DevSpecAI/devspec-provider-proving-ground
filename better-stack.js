// Better Stack signals for the DevSpec provider proving ground.
//
// Everything here is driven by environment variables set on the host (never committed):
//   BETTER_STACK_LOGS_HOST, BETTER_STACK_LOGS_TOKEN  -> HTTP log source (logs)
//   BETTER_STACK_ERRORS_DSN                          -> error-tracking app (Sentry SDK)
//   BETTER_STACK_HEARTBEAT_URL                       -> scheduled check-in (heartbeat)
//   CONTROL_TOKEN                                    -> guards the switches in server.js
// Any of them may be absent: that signal is simply off.
const Sentry = require("@sentry/node");

const logsHost = process.env.BETTER_STACK_LOGS_HOST;
const logsToken = process.env.BETTER_STACK_LOGS_TOKEN;
const errorsDsn = process.env.BETTER_STACK_ERRORS_DSN;
const heartbeatUrl = process.env.BETTER_STACK_HEARTBEAT_URL;

if (errorsDsn) {
  Sentry.init({ dsn: errorsDsn, environment: process.env.RAILWAY_ENVIRONMENT_NAME || "production", release: process.env.RAILWAY_GIT_COMMIT_SHA });
}

// Logs are batched and flushed every 2 s so a burst of requests is one HTTP call.
let pending = [];
async function flushLogs() {
  if (!logsHost || !logsToken || pending.length === 0) return;
  const batch = pending;
  pending = [];
  try {
    const res = await fetch(`https://${logsHost}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${logsToken}` },
      body: JSON.stringify(batch),
    });
    if (!res.ok) console.error(`log shipping failed: ${res.status}`);
  } catch (err) {
    console.error(`log shipping failed: ${err.message}`);
  }
}
setInterval(flushLogs, 2000).unref();

function log(level, message, fields = {}) {
  const entry = { dt: new Date().toISOString(), level, message, service: "devspec-provider-proving-ground", ...fields };
  console.log(JSON.stringify(entry));
  pending.push(entry);
}

// The scheduled job: checks in every 30 s while the switch is on (Better Stack expects 60 s + 30 s grace).
const state = { heartbeat: true, outage: false };
async function checkIn() {
  if (!heartbeatUrl || !state.heartbeat) return;
  try {
    const res = await fetch(heartbeatUrl);
    log("debug", "scheduled job checked in", { status: res.status });
  } catch (err) {
    log("warn", "scheduled job check-in failed", { error: err.message });
  }
}
setInterval(checkIn, 30000).unref();
checkIn();

function captureError(err, context) {
  log("error", err.message, { error_type: err.name, ...context });
  if (errorsDsn) Sentry.captureException(err, { extra: context });
}

module.exports = { log, captureError, state, flushLogs, Sentry };
