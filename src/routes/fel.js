const express = require("express");
const router = express.Router();
const { validarFELEnSAT, validarLoteFEL, validarFormatoUUID } = require("../services/felService");

/**
 * GET /api/fel/:uuid
 * Valida una factura electrónica FEL en el portal SAT
 * 
 * Params: uuid — UUID de la factura (formato: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX)
 * 
 * Response 200: { uuid, estado, tipo, emisor, receptor, fecha, montos, certificador }
 * Response 400: { error: "UUID inválido" }
 * Response 404: { estado: "NO ENCONTRADA" }
 */
router.get("/:uuid", async (req, res) => {
  const { uuid } = req.params;

  try {
    validarFormatoUUID(uuid); // lanzará error si es inválido
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  try {
    const resultado = await validarFELEnSAT(uuid);

    const status = resultado.estado === "NO ENCONTRADA" ? 404 : 200;
    res.status(status).json({
      ok: resultado.estado === "CERTIFICADA",
      timestamp: new Date().toISOString(),
      datos: resultado,
    });

  } catch (err) {
    const status = err.message.includes("no disponible") ? 503 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/fel/lote
 * Valida múltiples facturas FEL en batch
 * Body: { uuids: ["UUID-1", "UUID-2", ...] } (máx 20)
 * 
 * Response 200: { resultados: [{ uuid, ok, datos | error }, ...], resumen: { validas, invalidas, errores } }
 */
router.post("/lote", async (req, res) => {
  const { uuids } = req.body;

  if (!Array.isArray(uuids) || uuids.length === 0) {
    return res.status(400).json({ error: "Se requiere array 'uuids' con al menos un UUID" });
  }
  if (uuids.length > 20) {
    return res.status(400).json({ error: "Máximo 20 UUIDs por lote" });
  }

  try {
    const resultados = await validarLoteFEL(uuids);

    const resumen = {
      total: resultados.length,
      certificadas: resultados.filter(r => r.estado === "CERTIFICADA").length,
      anuladas: resultados.filter(r => r.estado === "ANULADA").length,
      noEncontradas: resultados.filter(r => r.estado === "NO ENCONTRADA").length,
      errores: resultados.filter(r => r.estado === "ERROR").length,
    };

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      resumen,
      resultados: resultados.map(r => ({
        uuid: r.uuid,
        ok: r.estado === "CERTIFICADA",
        estado: r.estado,
        datos: r.estado !== "ERROR" ? r : undefined,
        error: r.estado === "ERROR" ? r.error : undefined,
      })),
    });

  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
