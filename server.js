const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "db.json");
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function ensureDatabase() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ attendance: [], vitals: [] }, null, 2), "utf8");
  }
}

function readDatabase() {
  ensureDatabase();
  try {
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch {
    return { attendance: [], vitals: [] };
  }
}

function writeDatabase(db) {
  ensureDatabase();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function handleApi(request, response, pathname) {
  const key = pathname === "/api/attendance" ? "attendance" : pathname === "/api/vitals" ? "vitals" : "";
  if (!key) return false;

  const db = readDatabase();
  if (request.method === "GET") {
    sendJson(response, 200, Array.isArray(db[key]) ? db[key] : []);
    return true;
  }

  if (request.method === "PUT") {
    const body = await readBody(request);
    const records = JSON.parse(body || "[]");
    if (!Array.isArray(records)) {
      sendJson(response, 400, { error: "records must be an array" });
      return true;
    }
    db[key] = records;
    writeDatabase(db);
    sendJson(response, 200, { ok: true, count: records.length });
    return true;
  }

  sendJson(response, 405, { error: "method not allowed" });
  return true;
}

function serveStatic(request, response, pathname) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(rootDir, requested));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (await handleApi(request, response, url.pathname)) return;
    serveStatic(request, response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "server error" });
  }
});

server.listen(port, () => {
  console.log(`Life Care is running at http://localhost:${port}`);
});
