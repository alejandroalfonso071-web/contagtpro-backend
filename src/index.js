require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const logger = require("./middleware/logger");

const nitRoutes  = require("./routes/nit");
const felRoutes  = require("./routes/fel");
const flatRoutes = require("./routes/flat");
const healthRoutes = require("./routes/health");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── SEGURIDAD ────────────────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*").split(",");
app.use(cors({
  origin: allowedOrigins[0] === "*" ? "*" : (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error("Origen no permitido por CORS"));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "X-API-Key"],
}));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  message: { error: "Demasiadas solicitudes. Intenta en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const nitLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  message: { error: "Límite de consultas NIT alcanzado. Espera 1 minuto." },
});

const felLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { error: "Límite de validaciones FEL alcanzado. Espera 1 minuto." },
});

app.use(globalLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(logger);

// ─── API KEY MIDDLEWARE ───────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // Sin API key configurada = abierto (solo para dev)
  const provided = req.headers["x-api-key"] || req.query.apikey;
  if (provided !== apiKey) {
    return res.status(401).json({ error: "API Key inválida o no proporcionada" });
  }
  next();
}

// ─── RUTAS ────────────────────────────────────────────────────────────────────
app.use("/health",    healthRoutes);
app.use("/api/nit",  requireApiKey, nitLimiter,  nitRoutes);
app.use("/api/fel",  requireApiKey, felLimiter,  felRoutes);
app.use("/api/flat", requireApiKey, flatRoutes);

// ─── RUTA RAÍZ ────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    nombre: "ContaGT Pro — Backend SAT",
    version: "1.0.0",
    estado: "activo",
    endpoints: {
      "GET  /health":                   "Estado del servicio",
      "GET  /api/nit/:nit":             "Consulta RTU/NIT en SAT",
      "GET  /api/fel/:uuid":            "Validar factura FEL por UUID",
      "POST /api/fel/lote":             "Validar múltiples UUIDs",
      "POST /api/flat/iva":             "Generar archivo FLAT IVA (SAT-1311)",
      "POST /api/flat/isr":             "Generar archivo FLAT ISR (SAT-1361)",
      "POST /api/flat/iso":             "Generar archivo FLAT ISO (SAT-2800)",
    },
    documentacion: "https://github.com/tu-usuario/contagtpro-backend",
  });
});

// ─── MANEJO DE ERRORES ────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(err.status || 500).json({
    error: err.message || "Error interno del servidor",
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─── INICIO ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 ContaGT Pro Backend corriendo en puerto ${PORT}`);
  console.log(`🌐 Ambiente: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔐 API Key: ${process.env.API_KEY ? "configurada" : "sin configurar (modo abierto)"}`);
  console.log(`🔗 CORS: ${allowedOrigins.join(", ")}\n`);
});

module.exports = app;
