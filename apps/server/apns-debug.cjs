/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const webpush = require("web-push");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const home = os.homedir();
const vapid = JSON.parse(fs.readFileSync(path.join(home, ".local/share/wrapt/notifications/vapid.json"), "utf8"));
webpush.setVapidDetails("mailto:admin@localhost", vapid.publicKey, vapid.privateKey);

const db = new DatabaseSync(path.join(home, ".local/share/wrapt/wrapt.sqlite"), { readOnly: true });
const rows = db.prepare("SELECT endpoint, subscription_json json FROM push_subscriptions").all();
db.close();

(async () => {
  for (const row of rows) {
    if (!row.endpoint.includes("web.push.apple.com")) continue;
    const sub = JSON.parse(row.json);
    try {
      const res = await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify({ version: 1, id: "00000000-0000-4000-8000-000000000001", title: "Debug", body: "APNs-Test", link: "/wrapt/inbox", source: "wrapt", severity: "info", createdAt: new Date().toISOString() }), { TTL: 300, urgency: "normal" });
      console.log("ERFOLG:", res.statusCode);
    } catch (error) {
      console.log("FEHLER statusCode:", error.statusCode);
      console.log("body:", error.body || "(kein body)");
      console.log("headers:", JSON.stringify(error.headers || {}));
    }
  }
})();
