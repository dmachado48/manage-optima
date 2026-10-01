/**
 * cPanel Node.js startup file for Next.js.
 * Application root: /home/webitonc/apps/manage-optima
 * Startup file: server.js
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || process.env.PORT_ || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const app = next({
  dev: false,
  hostname,
  port,
  dir: __dirname,
});
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error("Error handling", req.url, err);
        res.statusCode = 500;
        res.end("internal server error");
      }
    }).listen(port, hostname, () => {
      console.log(`manage-optima ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start Next.js", err);
    process.exit(1);
  });
