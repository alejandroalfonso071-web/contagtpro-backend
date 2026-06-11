const express = require("express");
const router = express.Router();
const axios = require("axios");

let satStatus = { estado: "desconocido", lastCheck: null };

// Verifica disponibilidad del portal SAT cada 5 minutos
async function checkSAT() {
  try {
    await axios.get("https://portal.sat.gob.gt", { timeout: 5000 });
    satStatus = { estado: "disponible", lastCheck: new Date().toISOString() };
  } catch {
    satStatus = { estado: "no disponible", lastCheck: new Date().toISOString() };
  }
}

checkSAT();
setInterval(checkSAT, 5 * 60 * 1000);

router.get("/", (req, res) => {
  const uptime = process.uptime();
  res.json({
    servicio: "ContaGT Pro Backend",
    version: "1.0.0",
    estado: "activo",
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    ambiente: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
    portalSAT: satStatus,
    memoria: {
      usada: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
    },
  });
});

module.exports = router;
