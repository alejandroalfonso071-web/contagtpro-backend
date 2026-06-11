/**
 * GENERADOR DE ARCHIVOS FLAT PARA DECLARAGUATE
 * 
 * El portal Declaraguate (portal.sat.gob.gt) acepta declaraciones
 * en formato de texto plano (.txt) con estructura específica por tipo.
 * 
 * Decretos aplicables:
 * - IVA:  Decreto 27-92 y sus reformas
 * - ISR:  Decreto 10-2012 (Ley de Actualización Tributaria)
 * - ISO:  Decreto 73-2008 (Impuesto de Solidaridad)
 * 
 * NOTA: La SAT actualiza ocasionalmente el formato de los archivos FLAT.
 * Verificar en portal.sat.gob.gt la versión vigente del formato.
 */

const { v4: uuidv4 } = require("uuid");

const MESES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];

// ─── VALIDACIONES COMUNES ─────────────────────────────────────────────────────

function validarDatosBase(datos) {
  const errores = [];
  if (!datos.nit || datos.nit.trim().length < 5) errores.push("NIT es requerido");
  if (!datos.nombre || datos.nombre.trim().length < 2) errores.push("Razón Social es requerida");
  if (errores.length > 0) throw new Error(`Datos inválidos: ${errores.join(", ")}`);
}

function limpiarNIT(nit) {
  return (nit || "").toString().replace(/\s/g, "").toUpperCase();
}

function limpiarTexto(texto, maxLen = 100) {
  return (texto || "").toString().trim().substring(0, maxLen).toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // quitar tildes
}

function moneda(valor) {
  return Math.max(0, parseFloat(valor) || 0).toFixed(2);
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

function generarHash() {
  return uuidv4().replace(/-/g, "").toUpperCase().substring(0, 32);
}

// ─── IVA — SAT-1311 ───────────────────────────────────────────────────────────
/**
 * Genera el archivo FLAT del Formulario SAT-1311
 * Declaración Mensual del IVA — Decreto 27-92
 * 
 * Régimen General: 12% sobre base imponible
 * Pequeño Contribuyente: 5% sobre total de ventas (sin separar IVA)
 */
function generarFlatIVA(datos) {
  validarDatosBase(datos);

  const {
    nit, nombre, mes, anio,
    baseVentas = 0, ivaVentas = 0, ventasExentas = 0, exportaciones = 0,
    baseCompras = 0, ivaCompras = 0, importaciones = 0, ivaImportaciones = 0,
    remanenteMesPrevio = 0,
    multas = 0, intereses = 0, recargos = 0,
    regimen = "general",
  } = datos;

  const mesNum = parseInt(mes);
  const anioNum = parseInt(anio);
  const periodo = `${anioNum}${String(mesNum + 1).padStart(2, "0")}`;

  // Cálculos IVA
  const totalDebito = parseFloat(ivaVentas) || 0;
  const totalCredito = (parseFloat(ivaCompras) || 0) + (parseFloat(ivaImportaciones) || 0) + (parseFloat(remanenteMesPrevio) || 0);
  const diferencia = totalDebito - totalCredito;
  const ivaAPagar = Math.max(0, diferencia);
  const remanenteCF = Math.max(0, -diferencia);
  const totalAPagar = ivaAPagar + (parseFloat(multas) || 0) + (parseFloat(intereses) || 0) + (parseFloat(recargos) || 0);

  const hash = generarHash();
  const ts = timestamp();

  // Formato FLAT SAT-1311 (estructura requerida por Declaraguate)
  const lineas = [
    "INICIO_DECLARACION",
    `FORMULARIO=SAT-1311`,
    `VERSION=2024.1`,
    `HASH=${hash}`,
    `FECHA_GENERACION=${ts}`,
    `GENERADO_POR=CONTAGTPRO_V1`,
    "",
    "[CONTRIBUYENTE]",
    `NIT=${limpiarNIT(nit)}`,
    `RAZON_SOCIAL=${limpiarTexto(nombre)}`,
    `REGIMEN=${regimen.toUpperCase()}`,
    "",
    "[PERIODO]",
    `PERIODO=${periodo}`,
    `MES=${mesNum + 1}`,
    `MES_NOMBRE=${MESES[mesNum] || ""}`,
    `ANIO=${anioNum}`,
    "",
    "[DEBITO_FISCAL]",
    `BASE_VENTAS_GRAVADAS=${moneda(baseVentas)}`,
    `IVA_VENTAS_GRAVADAS=${moneda(ivaVentas)}`,
    `VENTAS_EXENTAS=${moneda(ventasExentas)}`,
    `EXPORTACIONES=${moneda(exportaciones)}`,
    `TOTAL_DEBITO_FISCAL=${moneda(totalDebito)}`,
    "",
    "[CREDITO_FISCAL]",
    `BASE_COMPRAS_GRAVADAS=${moneda(baseCompras)}`,
    `IVA_COMPRAS_GRAVADAS=${moneda(ivaCompras)}`,
    `BASE_IMPORTACIONES=${moneda(importaciones)}`,
    `IVA_IMPORTACIONES=${moneda(ivaImportaciones)}`,
    `REMANENTE_MES_PREVIO=${moneda(remanenteMesPrevio)}`,
    `TOTAL_CREDITO_FISCAL=${moneda(totalCredito)}`,
    "",
    "[DETERMINACION]",
    `DIFERENCIA=${moneda(Math.abs(diferencia))}`,
    `TIPO_DIFERENCIA=${diferencia >= 0 ? "IVA_A_PAGAR" : "REMANENTE_CF"}`,
    `IVA_A_PAGAR=${moneda(ivaAPagar)}`,
    `REMANENTE_CF=${moneda(remanenteCF)}`,
    "",
    "[SANCIONES_MORA]",
    `MULTAS=${moneda(multas)}`,
    `INTERESES=${moneda(intereses)}`,
    `RECARGOS=${moneda(recargos)}`,
    "",
    "[TOTAL]",
    `TOTAL_A_PAGAR=${moneda(totalAPagar)}`,
    "",
    "FIN_DECLARACION",
  ];

  return {
    contenido: lineas.join("\r\n"),
    nombreArchivo: `SAT1311_${periodo}_${limpiarNIT(nit)}.txt`,
    periodo,
    resumen: {
      debitoFiscal: totalDebito,
      creditoFiscal: totalCredito,
      ivaAPagar,
      remanenteCF,
      totalAPagar,
    },
  };
}

// ─── ISR — SAT-1361 ───────────────────────────────────────────────────────────
/**
 * Genera archivo FLAT para ISR Trimestral — SAT-1361
 * Decreto 10-2012 — Régimen Sobre Utilidades (25%)
 * También compatible con Régimen Opcional Simplificado Sobre Ingresos (7%)
 */
function generarFlatISR(datos) {
  validarDatosBase(datos);

  const {
    nit, nombre, anio, trimestre = 1,
    totalIngresos = 0, ingresosExentos = 0,
    totalCostos = 0, gastosDedudibles = 0, depreciaciones = 0,
    isrRetenido = 0, isrPagadoTrimestres = 0,
    regimen = "utilidades", // "utilidades" | "opcional"
    multas = 0, intereses = 0,
  } = datos;

  const anioNum = parseInt(anio);
  const trimNum = parseInt(trimestre);
  const tasa = regimen === "opcional" ? 0.07 : 0.25;
  const tasaDesc = regimen === "opcional" ? "7%" : "25%";

  // Cálculos ISR
  const ingravables = parseFloat(ingresosExentos) || 0;
  const ingresosGravados = Math.max(0, (parseFloat(totalIngresos) || 0) - ingravables);
  const deducciones = (parseFloat(totalCostos) || 0) + (parseFloat(gastosDedudibles) || 0) + (parseFloat(depreciaciones) || 0);
  const rentaImponible = regimen === "opcional" ? ingresosGravados : Math.max(0, ingresosGravados - deducciones);
  const isrDeterminado = rentaImponible * tasa;
  const isrAcreditable = (parseFloat(isrRetenido) || 0) + (parseFloat(isrPagadoTrimestres) || 0);
  const isrAPagar = Math.max(0, isrDeterminado - isrAcreditable);
  const totalAPagar = isrAPagar + (parseFloat(multas) || 0) + (parseFloat(intereses) || 0);

  const hash = generarHash();
  const ts = timestamp();

  const lineas = [
    "INICIO_DECLARACION",
    `FORMULARIO=SAT-1361`,
    `VERSION=2024.1`,
    `HASH=${hash}`,
    `FECHA_GENERACION=${ts}`,
    `GENERADO_POR=CONTAGTPRO_V1`,
    "",
    "[CONTRIBUYENTE]",
    `NIT=${limpiarNIT(nit)}`,
    `RAZON_SOCIAL=${limpiarTexto(nombre)}`,
    `REGIMEN_ISR=${regimen === "opcional" ? "OPCIONAL_SIMPLIFICADO" : "SOBRE_UTILIDADES"}`,
    `TASA_APLICABLE=${tasaDesc}`,
    "",
    "[PERIODO]",
    `ANIO=${anioNum}`,
    `TRIMESTRE=${trimNum}`,
    `TRIMESTRE_DESC=T${trimNum}_${anioNum}`,
    "",
    "[INGRESOS]",
    `TOTAL_INGRESOS=${moneda(totalIngresos)}`,
    `INGRESOS_EXENTOS=${moneda(ingresosExentos)}`,
    `INGRESOS_GRAVADOS=${moneda(ingresosGravados)}`,
    "",
    "[DEDUCCIONES]",
    `COSTOS_DEDUCIBLES=${moneda(totalCostos)}`,
    `GASTOS_DEDUCIBLES=${moneda(gastosDedudibles)}`,
    `DEPRECIACIONES=${moneda(depreciaciones)}`,
    `TOTAL_DEDUCCIONES=${moneda(deducciones)}`,
    "",
    "[DETERMINACION]",
    `RENTA_IMPONIBLE=${moneda(rentaImponible)}`,
    `TASA=${tasa}`,
    `ISR_DETERMINADO=${moneda(isrDeterminado)}`,
    "",
    "[ACREDITAMIENTOS]",
    `ISR_RETENIDO_TERCEROS=${moneda(isrRetenido)}`,
    `ISR_PAGADO_TRIMESTRES_ANTERIORES=${moneda(isrPagadoTrimestres)}`,
    `TOTAL_ACREDITAMIENTOS=${moneda(isrAcreditable)}`,
    "",
    "[SANCIONES_MORA]",
    `MULTAS=${moneda(multas)}`,
    `INTERESES=${moneda(intereses)}`,
    "",
    "[TOTAL]",
    `ISR_A_PAGAR=${moneda(isrAPagar)}`,
    `TOTAL_A_PAGAR=${moneda(totalAPagar)}`,
    "",
    "FIN_DECLARACION",
  ];

  return {
    contenido: lineas.join("\r\n"),
    nombreArchivo: `SAT1361_T${trimNum}_${anioNum}_${limpiarNIT(nit)}.txt`,
    periodo: `T${trimNum}-${anioNum}`,
    resumen: {
      ingresosGravados,
      deducciones,
      rentaImponible,
      isrDeterminado,
      isrAcreditable,
      isrAPagar,
      totalAPagar,
    },
  };
}

// ─── ISO — SAT-2800 ───────────────────────────────────────────────────────────
/**
 * Genera archivo FLAT para ISO — SAT-2800
 * Decreto 73-2008 — Impuesto de Solidaridad
 * Tasa: 1% sobre el mayor entre: ingresos brutos o activo neto del trimestre
 * El ISO pagado puede acreditarse contra el ISR del mismo período
 */
function generarFlatISO(datos) {
  validarDatosBase(datos);

  const {
    nit, nombre, anio, trimestre = 1,
    ingresosBrutos = 0, activoNeto = 0,
    isoAcreditadoISR = 0,
    multas = 0, intereses = 0,
  } = datos;

  const anioNum = parseInt(anio);
  const trimNum = parseInt(trimestre);

  // La base del ISO es el MAYOR entre ingresos brutos y activo neto
  const ingBrutos = parseFloat(ingresosBrutos) || 0;
  const actNeto = parseFloat(activoNeto) || 0;
  const baseISO = Math.max(ingBrutos, actNeto);
  const baseUsada = ingBrutos >= actNeto ? "INGRESOS_BRUTOS" : "ACTIVO_NETO";
  const isoDeterminado = baseISO * 0.01;
  const isoAcreditable = parseFloat(isoAcreditadoISR) || 0;
  const isoAPagar = Math.max(0, isoDeterminado - isoAcreditable);
  const totalAPagar = isoAPagar + (parseFloat(multas) || 0) + (parseFloat(intereses) || 0);

  const hash = generarHash();
  const ts = timestamp();

  const lineas = [
    "INICIO_DECLARACION",
    `FORMULARIO=SAT-2800`,
    `VERSION=2024.1`,
    `HASH=${hash}`,
    `FECHA_GENERACION=${ts}`,
    `GENERADO_POR=CONTAGTPRO_V1`,
    "",
    "[CONTRIBUYENTE]",
    `NIT=${limpiarNIT(nit)}`,
    `RAZON_SOCIAL=${limpiarTexto(nombre)}`,
    "",
    "[PERIODO]",
    `ANIO=${anioNum}`,
    `TRIMESTRE=${trimNum}`,
    `TRIMESTRE_DESC=T${trimNum}_${anioNum}`,
    "",
    "[BASE_CALCULO]",
    `INGRESOS_BRUTOS_TRIMESTRE=${moneda(ingBrutos)}`,
    `ACTIVO_NETO_TRIMESTRE=${moneda(actNeto)}`,
    `BASE_CALCULO=${moneda(baseISO)}`,
    `BASE_UTILIZADA=${baseUsada}`,
    `TASA_ISO=0.01`,
    `ISO_DETERMINADO=${moneda(isoDeterminado)}`,
    "",
    "[ACREDITAMIENTOS]",
    `ISO_ACREDITADO_CONTRA_ISR=${moneda(isoAcreditable)}`,
    "",
    "[SANCIONES_MORA]",
    `MULTAS=${moneda(multas)}`,
    `INTERESES=${moneda(intereses)}`,
    "",
    "[TOTAL]",
    `ISO_A_PAGAR=${moneda(isoAPagar)}`,
    `TOTAL_A_PAGAR=${moneda(totalAPagar)}`,
    "",
    `NOTA_ISO=EL ISO PAGADO EN ESTE TRIMESTRE PUEDE SER ACREDITADO CONTRA EL ISR ANUAL (ART. 10 DECRETO 73-2008)`,
    "",
    "FIN_DECLARACION",
  ];

  return {
    contenido: lineas.join("\r\n"),
    nombreArchivo: `SAT2800_T${trimNum}_${anioNum}_${limpiarNIT(nit)}.txt`,
    periodo: `T${trimNum}-${anioNum}`,
    resumen: {
      ingresosBrutos: ingBrutos,
      activoNeto: actNeto,
      baseISO,
      baseUsada,
      isoDeterminado,
      isoAcreditable,
      isoAPagar,
      totalAPagar,
    },
  };
}

module.exports = { generarFlatIVA, generarFlatISR, generarFlatISO };
