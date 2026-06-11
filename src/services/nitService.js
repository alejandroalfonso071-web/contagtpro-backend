const axios = require("axios");
const cheerio = require("cheerio");
const NodeCache = require("node-cache");

// Cache de 1 hora — siempre fresco pero evita saturar SAT
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

const TIMEOUT_MS = 15000;

const HEADERS_NAVEGADOR = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-GT,es;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Cache-Control": "max-age=0",
};

function normalizarNIT(nit) {
  const clean = (nit || "").toString().trim().toUpperCase().replace(/\s/g, "");
  const nums = clean.replace(/[^0-9K]/g, "");
  if (nums.length < 4) throw new Error("NIT inválido. Formato: 1234567-8");
  return nums;
}

function validarDigitoVerificador(nit) {
  const clean = nit.replace(/[^0-9K]/gi, "").toUpperCase();
  if (clean.length < 2) return false;
  const digitos = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    suma += parseInt(digitos[i]) * (digitos.length + 1 - i);
  }
  const residuo = (11 - (suma % 11)) % 11;
  const dvCalculado = residuo === 10 ? "K" : residuo.toString();
  return dv === dvCalculado;
}

async function consultarNITEnSAT(nitRaw) {
  const nit = normalizarNIT(nitRaw);
  const cacheKey = `nit_${nit}`;

  // Verificar cache
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[NIT] Cache hit: ${nit}`);
    return { ...cached, fuente: "cache" };
  }

  console.log(`[NIT] Consultando SAT RTU: ${nit}`);

  try {
    // Intentar consulta directa al portal SAT
    const resultado = await consultarPortalSAT(nit);
    cache.set(cacheKey, resultado);
    return { ...resultado, fuente: "sat-portal" };
  } catch (err) {
    console.warn(`[NIT] Portal SAT falló (${err.message}), intentando método alternativo...`);
    try {
      const resultado = await consultarFELPortal(nit);
      cache.set(cacheKey, resultado);
      return { ...resultado, fuente: "sat-fel" };
    } catch (err2) {
      console.warn(`[NIT] Método alternativo falló (${err2.message})`);
      return {
        nit,
        existe: true,
        nombre: "No disponible — Portal SAT no accesible",
        estado: "DESCONOCIDO",
        tipo: "—",
        regimen: "—",
        actividad: "—",
        direccion: "—",
        dvValido: validarDigitoVerificador(nit),
        fuente: "sin-datos",
        mensaje: "El portal SAT no respondió. Verifica manualmente en portal.sat.gob.gt",
      };
    }
  }
}

// Método 1: Portal RTU directo
async function consultarPortalSAT(nit) {
  const URL_RTU = "https://portal.sat.gob.gt/portal/consulta-cui-nit/";

  // Paso 1: Obtener página y CSRF token
  const session = await axios.get(URL_RTU, {
    timeout: TIMEOUT_MS,
    headers: HEADERS_NAVEGADOR,
    maxRedirects: 5,
  });

  const cookies = (session.headers["set-cookie"] || []).join("; ");
  const $ = cheerio.load(session.data);
  const csrf = $("input[name='csrfmiddlewaretoken']").val() || "";

  if (!csrf) throw new Error("No se pudo obtener token CSRF del portal SAT");

  // Paso 2: Enviar consulta
  const params = new URLSearchParams();
  params.append("csrfmiddlewaretoken", csrf);
  params.append("nit", nit);

  const respuesta = await axios.post(URL_RTU, params.toString(), {
    timeout: TIMEOUT_MS,
    headers: {
      ...HEADERS_NAVEGADOR,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": URL_RTU,
      "Cookie": cookies,
      "X-CSRFToken": csrf,
      "Origin": "https://portal.sat.gob.gt",
    },
    maxRedirects: 5,
  });

  return parsearHTMLSAT(cheerio.load(respuesta.data), nit);
}

// Método 2: Portal FEL como alternativa
async function consultarFELPortal(nit) {
  const URL_FEL = `https://fel.sat.gob.gt/portal/nit/${nit}`;

  const respuesta = await axios.get(URL_FEL, {
    timeout: TIMEOUT_MS,
    headers: HEADERS_NAVEGADOR,
  });

  if (respuesta.headers["content-type"]?.includes("application/json")) {
    const data = respuesta.data;
    return {
      nit,
      existe: true,
      nombre: data.nombre || data.razonSocial || "No disponible",
      estado: data.estado || "ACTIVO",
      tipo: data.tipo || "—",
      regimen: data.regimen || "—",
      actividad: data.actividad || "—",
      direccion: data.direccion || "—",
      dvValido: validarDigitoVerificador(nit),
    };
  }

  return parsearHTMLSAT(cheerio.load(respuesta.data), nit);
}

function parsearHTMLSAT($, nit) {
  const texto = $.root().text().toLowerCase();

  // Detectar NIT no encontrado
  if (texto.includes("no existe") || texto.includes("no encontrado") ||
      texto.includes("no registrado") || texto.includes("nit no válido")) {
    return { nit, existe: false, nombre: null, estado: "NO REGISTRADO", tipo: null, regimen: null, actividad: null, direccion: null, dvValido: validarDigitoVerificador(nit) };
  }

  // Extraer datos de tablas
  const filas = {};
  $("table tr, .resultado tr, .datos tr").each((_, tr) => {
    const celdas = $(tr).find("td");
    if (celdas.length >= 2) {
      const key = $(celdas[0]).text().trim().toLowerCase().replace(/[:\s]+$/, "");
      const val = $(celdas[1]).text().trim();
      if (key && val) filas[key] = val;
    }
  });

  // También buscar en definición de listas (dl/dt/dd)
  $("dl").each((_, dl) => {
    const dts = $(dl).find("dt");
    const dds = $(dl).find("dd");
    dts.each((i, dt) => {
      const key = $(dt).text().trim().toLowerCase().replace(/[:\s]+$/, "");
      const val = $(dds[i])?.text().trim() || "";
      if (key && val) filas[key] = val;
    });
  });

  const nombre = filas["nombre"] || filas["razón social"] || filas["razon social"] ||
    filas["nombre del contribuyente"] || $(".nombre, #nombre, [class*='nombre']").first().text().trim();

  const estado = filas["estado"] || filas["situación"] || filas["estatus"] ||
    $(".estado, [class*='estado']").first().text().trim() || "ACTIVO";

  return {
    nit,
    existe: true,
    nombre: nombre || "No disponible",
    estado: estado.toUpperCase().includes("ACTIVO") ? "ACTIVO" :
            estado.toUpperCase().includes("SUSPENDIDO") ? "SUSPENDIDO" :
            estado.toUpperCase().includes("CANCELADO") ? "CANCELADO" : estado.toUpperCase() || "ACTIVO",
    tipo: filas["tipo"] || filas["tipo de persona"] || filas["tipo contribuyente"] || "—",
    regimen: filas["régimen"] || filas["regimen"] || filas["régimen tributario"] || "—",
    actividad: filas["actividad"] || filas["actividad económica"] || filas["giro"] || "—",
    direccion: filas["dirección"] || filas["direccion"] || filas["domicilio"] || filas["domicilio fiscal"] || "—",
    dvValido: validarDigitoVerificador(nit),
  };
}

module.exports = { consultarNITEnSAT, normalizarNIT, validarDigitoVerificador };