const express = require("express");
const router = express.Router();
const { consultarNITEnSAT, validarDigitoVerificador, normalizarNIT } = require("../services/nitService");

/**
 * GET /api/nit/:nit
 * Consulta datos del contribuyente en el RTU de la SAT
 * 
 * Params: nit — NIT a consultar (acepta formato con o sin guión)
 * Headers: X-API-Key (requerido si API_KEY está configurado en .env)
 * 
 * Response 200: { nit, nombre, estado, tipo, regimen, actividad, direccion, dvValido, fuente }
 * Response 400: { error: "NIT inválido" }
 * Response 503: { error: "SAT no disponible" }
 */
router.get("/:nit", async (req, res) => {
  const { nit } = req.params;

  // Validación básica
  if (!nit || nit.trim().length < 4) {
    return res.status(400).json({ error: "NIT requerido. Ejemplo: /api/nit/1234567-8" });
  }

  try {
    // Verificar dígito verificador antes de consultar SAT
    let nitNorm;
    try {
      nitNorm = normalizarNIT(nit);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    const dvValido = validarDigitoVerificador(nitNorm);
    if (!dvValido) {
      // Advertencia pero no bloquear — el usuario puede tener el DV malo por error tipográfico
      console.warn(`[NIT] DV posiblemente inválido para: ${nitNorm}`);
    }

    const resultado = await consultarNITEnSAT(nit);

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      datos: {
        ...resultado,
        dvValido,
        nitConsultado: nit.trim(),
      },
    });

  } catch (err) {
    const status = err.message.includes("no disponible") ? 503 :
                   err.message.includes("inválido") ? 400 : 500;
    res.status(status).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/nit/lote
 * Consulta múltiples NITs en batch
 * Body: { nits: ["1234567-8", "9876543-1", ...] } (máx 10)
 */
router.post("/lote", async (req, res) => {
  const { nits } = req.body;

  if (!Array.isArray(nits) || nits.length === 0) {
    return res.status(400).json({ error: "Se requiere array 'nits' con al menos un NIT" });
  }
  if (nits.length > 10) {
    return res.status(400).json({ error: "Máximo 10 NITs por lote" });
  }

  const resultados = await Promise.allSettled(
    nits.map(nit => consultarNITEnSAT(nit))
  );

  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    resultados: resultados.map((r, i) => ({
      nit: nits[i],
      ...(r.status === "fulfilled"
        ? { ok: true, datos: r.value }
        : { ok: false, error: r.reason?.message }),
    })),
  });
});

module.exports = router;
