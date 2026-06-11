// Middleware de logging simple y legible
module.exports = function logger(req, res, next) {
  const start = Date.now();
  const { method, path: urlPath, ip } = req;

  res.on("finish", () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? "31" : status >= 400 ? "33" : status >= 200 ? "32" : "36";
    const time = new Date().toLocaleTimeString("es-GT");
    console.log(`\x1b[90m${time}\x1b[0m \x1b[${color}m${status}\x1b[0m ${method.padEnd(6)} ${urlPath.padEnd(35)} \x1b[90m${ms}ms\x1b[0m`);
  });

  next();
};
