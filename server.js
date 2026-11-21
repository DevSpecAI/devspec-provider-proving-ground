const http = require("http");
const { log, captureError, state, flushLogs, Sentry } = require("./better-stack");

const port = process.env.PORT || 3000;
const controlToken = process.env.CONTROL_TOKEN;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "X-Proving-Ground": "1" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// A cart with no items renders as empty instead of crashing.
function renderCart(cart) {
  return (cart.items ?? []).map((i) => i.id);
}

// A deliberate, recognisable crash for error tracking to group (the /control/throw switch).
function crashOnPurpose(cart) {
  return cart.items.map((i) => i.id);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const started = Date.now();
  res.on("finish", () => log(res.statusCode >= 500 ? "error" : "info", `${req.method} ${url.pathname} ${res.statusCode}`, { path: url.pathname, status: res.statusCode, duration_ms: Date.now() - started }));

  // Switches, so a real outage, a real missed check-in and a real error can be made and then cleared.
  if (url.pathname.startsWith("/control/")) {
    if (!controlToken || req.headers["x-control-token"] !== controlToken) return json(res, 403, { ok: false });
    const body = await readBody(req);
    if (url.pathname === "/control/outage") {
      state.outage = body.on === true;
      // An outage is an error in the logs too, so it can be found there as well as in uptime.
      if (state.outage) log("error", "maintenance switch on: /health now answers 503", { switch: "/control/outage" });
    }
    else if (url.pathname === "/control/heartbeat") state.heartbeat = body.on !== false;
    else if (url.pathname === "/control/throw") {
      try {
        crashOnPurpose({});
      } catch (err) {
        captureError(err, { route: "/control/throw" });
        await Sentry.flush(5000).catch(() => {});
        await flushLogs();
        return json(res, 500, { ok: false, error: err.message });
      }
    } else return json(res, 404, { ok: false });
    log("warn", `control switch changed`, { switch: url.pathname, ...state });
    return json(res, 200, { ok: true, ...state });
  }

  if (url.pathname === "/health") {
    if (state.outage) return json(res, 503, { ok: false, reason: "maintenance switch on" });
    return json(res, 200, { ok: true });
  }

  json(res, 200, { ok: true, service: "devspec-provider-proving-ground", path: url.pathname });
});

server.listen(port, "0.0.0.0", () => {
  log("info", `Listening on port ${port}`);
});
