require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const logger = require("./middleware/logger");
const { initDB } = require("./services/dbService");

const nitRoutes    = require("./routes/nit");
const felRoutes    = require("./routes/fel");
const flatRoutes   = require("./routes/flat");
const healthRoutes = require("./routes/health");
const authRoutes   = require("./routes/auth");
const adminRoutes  = require("./routes/admin");

const app  = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",");
app.use(helmet());
app.use(cors({
  origin: allowedOrigins[0] === "*" ? "*" : (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error("Origen no permitido"));
  },
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","X-API-Key","Authorization"],
}));

const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 500 });
app.use(globalLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(logger);

function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();
  const provided = req.headers["x-api-key"] || req.query.apikey;
  if (provided !== apiKey) return res.status(401).json({ error: "API Key inválida" });
  next();
}

app.use("/health",       healthRoutes);
app.use("/api/auth",     authRoutes);
app.use("/api/admin",    requireApiKey, adminRoutes);
app.use("/api/nit",      requireApiKey, nitRoutes);
app.use("/api/fel",      requireApiKey, felRoutes);
app.use("/api/flat",     requireApiKey, flatRoutes);

app.get("/", (req, res) => {
  res.json({ nombre: "ContaGT Pro Backend", version: "2.0.0", estado: "activo" });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || "Error interno" });
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 ContaGT Pro Backend v2.0 corriendo en puerto ${PORT}`);
  });
}).catch(err => {
  console.error("Error iniciando DB:", err);
  process.exit(1);
});

module.exports = app;