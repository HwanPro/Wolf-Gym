"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileJson, FileSpreadsheet, RefreshCw } from "lucide-react";
import { saveAs } from "file-saver";
import { useRouter } from "next/navigation";

type Severity = "high" | "medium" | "low";

type ReportData = {
  generatedAt: string;
  overview: {
    totalIncome: number;
    productSales: number;
    newClients: number;
    todayAttendance: number;
    activeMemberships: number;
  };
  trends: {
    incomeTrend: { period: string; total: number }[];
    attendanceTrend: { day: string; count: number }[];
  };
  inventory: {
    totalProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
  };
  debts: {
    clientsWithDebt: number;
    totalDebt: number;
    dailyDebtsCount: number;
    debtHistoryCount: number;
  };
  distributions: {
    planDistribution: { plan: string; count: number }[];
    topProducts: { productId: string; name: string; revenue: number; quantity: number }[];
  };
  dataQuality: {
    score: number;
    issueCount: number;
    inconsistencies: {
      id: string;
      title: string;
      severity: Severity;
      count: number;
      description: string;
      samples: string[];
    }[];
  };
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value ?? 0);
}

function severityColor(severity: Severity) {
  if (severity === "high") return { bg: "rgba(229,72,77,0.10)", border: "rgba(229,72,77,0.35)", text: "#E5484D" };
  if (severity === "medium") return { bg: "rgba(255,122,26,0.10)", border: "rgba(255,122,26,0.35)", text: "#FF7A1A" };
  return { bg: "rgba(255,194,26,0.08)", border: "rgba(255,194,26,0.3)", text: "#FFC21A" };
}

const card: React.CSSProperties = {
  background: "#141414",
  border: "1px solid rgba(255,194,26,0.12)",
  borderRadius: 14,
  padding: 20,
};

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(255,194,26,0.6)",
  margin: 0,
};

const cardTitle: React.CSSProperties = {
  fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
  fontSize: 22,
  letterSpacing: "0.02em",
  color: "#fff",
  margin: "4px 0 16px",
  lineHeight: 1,
};

export default function AdminReportes() {
  const router = useRouter();
  const isRedirecting = useRef(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const exportInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const redirectToLogin = useCallback(() => {
    if (isRedirecting.current) return;
    isRedirecting.current = true;
    router.replace("/auth/login");
  }, [router]);

  const fetchReport = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/admin/reports", { credentials: "include", cache: "no-store" });
      if (response.status === 401) { redirectToLogin(); return; }
      if (!response.ok) throw new Error("No se pudieron cargar los reportes");
      const data: ReportData = await response.json();
      setReport(data);
      setError(null);
    } catch (err) {
      console.error("Error cargando reportes:", err);
      setError("No se pudieron cargar los reportes de administración.");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [redirectToLogin]);

  useEffect(() => {
    fetchReport(false);
    const interval = setInterval(() => fetchReport(true), 300000);
    return () => clearInterval(interval);
  }, [fetchReport]);

  const downloadReportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wolf-gym-report-${new Date(report.generatedAt).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadReportExcel = async () => {
    if (!report || exportInFlight.current) return;
    exportInFlight.current = true;
    setExportingExcel(true);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Wolf Gym";
      workbook.created = new Date(report.generatedAt);
      workbook.subject = "Reporte administrativo";

      const addSheet = (
        name: string,
        headers: string[],
        rows: Array<Array<string | number>>,
      ) => {
        const sheet = workbook.addWorksheet(name, {
          views: [{ state: "frozen", ySplit: 3 }],
        });
        const lastColumn = Math.max(1, headers.length);
        sheet.mergeCells(1, 1, 1, lastColumn);
        const title = sheet.getCell(1, 1);
        title.value = "WOLF GYM · REPORTE ADMINISTRATIVO";
        title.font = { bold: true, size: 16, color: { argb: "FF0A0A0A" } };
        title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC21A" } };
        title.alignment = { vertical: "middle", horizontal: "left" };
        sheet.getRow(1).height = 26;

        sheet.mergeCells(2, 1, 2, lastColumn);
        const generated = sheet.getCell(2, 1);
        generated.value = `Generado: ${new Date(report.generatedAt).toLocaleString("es-PE")}`;
        generated.font = { italic: true, color: { argb: "FF666666" } };

        const headerRow = sheet.addRow(headers);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF141414" } };
          cell.alignment = { vertical: "middle" };
        });
        headerRow.height = 22;

        rows.forEach((row) => sheet.addRow(row));
        headers.forEach((header, index) => {
          sheet.getColumn(index + 1).width = Math.min(
            46,
            Math.max(
              14,
              header.length + 3,
              ...rows.map((row) => String(row[index] ?? "").length + 2),
            ),
          );
        });
        sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: lastColumn } };
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 3) return;
          row.eachCell((cell) => {
            cell.alignment = { vertical: "top", wrapText: true };
            cell.border = { bottom: { style: "hair", color: { argb: "FFD9D9D9" } } };
          });
        });
        return sheet;
      };

      addSheet("Resumen", ["Indicador", "Valor"], [
        ["Ingresos totales", report.overview.totalIncome],
        ["Ventas de productos", report.overview.productSales],
        ["Nuevos clientes", report.overview.newClients],
        ["Asistencia hoy", report.overview.todayAttendance],
        ["Membresías activas", report.overview.activeMemberships],
        ["Calidad de datos", `${report.dataQuality.score}/100`],
        ["Productos", report.inventory.totalProducts],
        ["Productos con stock bajo", report.inventory.lowStockProducts],
        ["Productos sin stock", report.inventory.outOfStockProducts],
        ["Clientes con deuda", report.debts.clientsWithDebt],
        ["Monto adeudado", report.debts.totalDebt],
      ]);
      addSheet(
        "Ingresos",
        ["Periodo", "Ingresos (PEN)"],
        report.trends.incomeTrend.map((item) => [item.period, item.total]),
      );
      addSheet(
        "Asistencia",
        ["Fecha", "Marcaciones"],
        report.trends.attendanceTrend.map((item) => [item.day, item.count]),
      );
      addSheet(
        "Planes",
        ["Plan", "Clientes"],
        report.distributions.planDistribution.map((item) => [item.plan, item.count]),
      );
      addSheet(
        "Productos",
        ["Producto", "Cantidad", "Ingresos (PEN)"],
        report.distributions.topProducts.map((item) => [item.name, item.quantity, item.revenue]),
      );
      addSheet(
        "Calidad de datos",
        ["Severidad", "Hallazgo", "Casos", "Descripción", "Muestras"],
        report.dataQuality.inconsistencies.map((item) => [
          item.severity.toUpperCase(),
          item.title,
          item.count,
          item.description,
          item.samples.join("; "),
        ]),
      );

      const buffer = await workbook.xlsx.writeBuffer();
      const date = new Date(report.generatedAt).toISOString().slice(0, 10);
      saveAs(
        new Blob([buffer as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `wolf-gym-reporte-${date}.xlsx`,
      );
    } catch (exportError) {
      console.error("Error exportando reporte Excel:", exportError);
      setError("No se pudo generar el archivo Excel.");
    } finally {
      exportInFlight.current = false;
      setExportingExcel(false);
    }
  };

  const maxIncome = useMemo(() => {
    if (!report?.trends.incomeTrend.length) return 1;
    return Math.max(...report.trends.incomeTrend.map((item) => item.total), 1);
  }, [report?.trends.incomeTrend]);

  const maxAttendance = useMemo(() => {
    if (!report?.trends.attendanceTrend.length) return 1;
    return Math.max(...report.trends.attendanceTrend.map((item) => item.count), 1);
  }, [report?.trends.attendanceTrend]);

  const maxPlan = useMemo(() => {
    if (!report?.distributions.planDistribution.length) return 1;
    return Math.max(...report.distributions.planDistribution.map((p) => p.count), 1);
  }, [report?.distributions.planDistribution]);

  return (
    <div
      className="admin-reports"
      style={{
        minHeight: "100vh",
        background: "#0A0A0A",
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
        @media (max-width: 900px) {
          .reports-overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .reports-two-grid, .reports-wide-grid { grid-template-columns: minmax(0, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .reports-header { align-items: flex-start !important; padding: 20px 16px 16px !important; }
          .reports-actions { width: 100%; }
          .reports-actions > * { flex: 1 1 auto; justify-content: center; }
          .reports-content { padding: 16px !important; }
          .reports-overview-grid { grid-template-columns: minmax(0, 1fr) !important; }
          .reports-card { padding: 16px !important; }
        }
      `}</style>

      {/* Page header */}
      <div
        className="reports-header"
        style={{
          padding: "24px 32px 20px",
          borderBottom: "1px solid rgba(255,194,26,0.12)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <p style={eyebrow}>Análisis</p>
          <h1
            style={{
              fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
              fontSize: 36,
              letterSpacing: "0.02em",
              color: "#fff",
              margin: "4px 0 0",
              lineHeight: 1,
            }}
          >
            REPORTES
          </h1>
          {report && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: "4px 0 0" }}>
              Generado: {new Date(report.generatedAt).toLocaleString("es-PE")}
            </p>
          )}
        </div>
        <div className="reports-actions" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <a
            href="/admin/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 38,
              padding: "0 16px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            ← Dashboard
          </a>
          <button
            type="button"
            onClick={() => fetchReport(true)}
            disabled={refreshing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              padding: "0 16px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              fontWeight: 600,
              cursor: refreshing ? "not-allowed" : "pointer",
              opacity: refreshing ? 0.6 : 1,
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={downloadReportExcel}
            disabled={!report || exportingExcel}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              padding: "0 16px",
              background: "#FFC21A",
              color: "#0A0A0A",
              border: "1px solid #FFC21A",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              cursor: report && !exportingExcel ? "pointer" : "not-allowed",
              opacity: report && !exportingExcel ? 1 : 0.5,
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
            title="Descargar un libro de Excel con hojas y encabezados"
          >
            <FileSpreadsheet style={{ width: 15, height: 15 }} />
            {exportingExcel ? "Generando" : "Exportar Excel"}
          </button>
          <button
            type="button"
            onClick={downloadReportJson}
            disabled={!report}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              padding: "0 14px",
              background: "transparent",
              color: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: report ? "pointer" : "not-allowed",
              opacity: report ? 1 : 0.5,
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
            title="Descargar los datos sin formato en JSON"
          >
            <FileJson style={{ width: 15, height: 15 }} />
            JSON
          </button>
        </div>
      </div>

      <div className="reports-content" style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        {loading && (
          <div
            style={{
              ...card,
              color: "rgba(255,255,255,0.65)",
              fontSize: 14,
            }}
          >
            Cargando reportes...
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              background: "rgba(229,72,77,0.08)",
              border: "1px solid rgba(229,72,77,0.35)",
              borderRadius: 14,
              padding: "18px 20px",
              color: "#E5484D",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && report && (
          <>
            {/* Overview metrics — 5 columns */}
            <div className="reports-overview-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {[
                { label: "Ingresos totales", value: formatMoney(report.overview.totalIncome), yellow: true },
                { label: "Ventas productos", value: formatMoney(report.overview.productSales), yellow: true },
                { label: "Nuevos clientes", value: report.overview.newClients, yellow: false },
                { label: "Asistencia hoy", value: report.overview.todayAttendance, yellow: false },
                { label: "Calidad de datos", value: `${report.dataQuality.score}/100`, yellow: false },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    background: "#141414",
                    border: "1px solid rgba(255,194,26,0.12)",
                    borderRadius: 14,
                    padding: "16px 18px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.65)",
                      margin: "0 0 8px",
                    }}
                  >
                    {m.label}
                  </p>
                  <p
                    style={{
                      fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                      fontSize: 28,
                      lineHeight: 1,
                      color: m.yellow ? "#FFC21A" : "#fff",
                      margin: 0,
                    }}
                  >
                    {m.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Inventory + Debts */}
            <div className="reports-two-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={card}>
                <p style={eyebrow}>Inventario</p>
                <h3 style={cardTitle}>ESTADO DEL STOCK</h3>
                {[
                  { label: "Total de productos", value: report.inventory.totalProducts, color: "#fff" },
                  { label: "Stock bajo (≤ 10)", value: report.inventory.lowStockProducts, color: "#FF7A1A" },
                  { label: "Sin stock", value: report.inventory.outOfStockProducts, color: "#E5484D" },
                ].map((row, i, arr) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid rgba(255,194,26,0.08)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{row.label}</span>
                    <span
                      style={{
                        fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                        fontSize: 22,
                        color: row.color,
                        lineHeight: 1,
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div style={card}>
                <p style={eyebrow}>Cobranza</p>
                <h3 style={cardTitle}>DEUDAS</h3>
                {[
                  { label: "Clientes con deuda", value: report.debts.clientsWithDebt, color: "#fff" },
                  { label: "Monto total adeudado", value: formatMoney(report.debts.totalDebt), color: "#FFC21A" },
                  { label: "Registros diarios", value: report.debts.dailyDebtsCount, color: "#fff" },
                  { label: "Registros en historial", value: report.debts.debtHistoryCount, color: "#fff" },
                ].map((row, i, arr) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid rgba(255,194,26,0.08)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{row.label}</span>
                    <span
                      style={{
                        fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                        fontSize: 22,
                        color: row.color,
                        lineHeight: 1,
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Inconsistencies */}
            {report.dataQuality.inconsistencies.length > 0 && (
              <div
                style={{
                  background: "linear-gradient(90deg, rgba(229,72,77,0.10), rgba(255,122,26,0.05))",
                  border: "1px solid rgba(229,72,77,0.35)",
                  borderRadius: 14,
                  padding: 20,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: "rgba(229,72,77,0.15)",
                      color: "#E5484D",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    ⚠
                  </div>
                  <div>
                    <p style={{ ...eyebrow, color: "#E5484D", margin: 0 }}>
                      {report.dataQuality.issueCount} inconsistencia{report.dataQuality.issueCount !== 1 ? "s" : ""} detectada{report.dataQuality.issueCount !== 1 ? "s" : ""}
                    </p>
                    <h3
                      style={{
                        fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                        fontSize: 20,
                        color: "#fff",
                        margin: "2px 0 0",
                        letterSpacing: "0.02em",
                      }}
                    >
                      INCONSISTENCIAS DETECTADAS
                    </h3>
                  </div>
                </div>
                <div className="reports-two-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {report.dataQuality.inconsistencies.map((issue) => {
                    const sc = severityColor(issue.severity);
                    return (
                      <article
                        key={issue.id}
                        style={{
                          background: sc.bg,
                          border: `1px solid ${sc.border}`,
                          borderRadius: 10,
                          padding: "14px 16px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <h4 style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0 }}>{issue.title}</h4>
                          <span
                            style={{
                              padding: "2px 8px",
                              background: sc.bg,
                              border: `1px solid ${sc.border}`,
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 700,
                              color: sc.text,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {issue.severity} · {issue.count}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: 0 }}>{issue.description}</p>
                        {issue.samples.length > 0 && (
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 6, marginBottom: 0 }}>
                            Muestras: {issue.samples.join(", ")}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Trends */}
            <div className="reports-wide-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
              {/* Income trend bar chart */}
              <div style={card}>
                <p style={eyebrow}>Últimos 6 meses</p>
                <h3 style={cardTitle}>TENDENCIA DE INGRESOS</h3>
                {report.trends.incomeTrend.length === 0 ? (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Sin datos de ingresos.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {report.trends.incomeTrend.map((point, index) => (
                      <div key={`${point.period}-${index}`}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.6)",
                          }}
                        >
                          <span>{point.period}</span>
                          <span style={{ color: "#FFC21A", fontWeight: 600 }}>{formatMoney(point.total)}</span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${(point.total / maxIncome) * 100}%`,
                              background: "linear-gradient(90deg, #FFC21A, #FF7A1A)",
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Plan distribution */}
              <div style={card}>
                <p style={eyebrow}>Membresías</p>
                <h3 style={cardTitle}>DISTRIBUCIÓN DE PLANES</h3>
                {report.distributions.planDistribution.length === 0 ? (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Sin clientes con plan.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {report.distributions.planDistribution.map((plan) => (
                      <div key={plan.plan}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{plan.plan}</span>
                          <span
                            style={{
                              fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                              fontSize: 18,
                              color: "#FFC21A",
                              lineHeight: 1,
                            }}
                          >
                            {plan.count}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${(plan.count / maxPlan) * 100}%`,
                              background: "#FF7A1A",
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Attendance trend + Top products */}
            <div className="reports-two-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={card}>
                <p style={eyebrow}>Últimos 14 días</p>
                <h3 style={cardTitle}>ASISTENCIA DIARIA</h3>
                {report.trends.attendanceTrend.length === 0 ? (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>Sin datos de asistencia.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.trends.attendanceTrend.map((point) => (
                      <div key={point.day}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 4,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.6)",
                          }}
                        >
                          <span>{point.day}</span>
                          <span style={{ fontWeight: 600 }}>{point.count}</span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${(point.count / maxAttendance) * 100}%`,
                              background: "#FFC21A",
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={card}>
                <p style={eyebrow}>Por ingresos</p>
                <h3 style={cardTitle}>TOP PRODUCTOS</h3>
                {report.distributions.topProducts.length === 0 ? (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>No hay ventas registradas.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.distributions.topProducts.map((product) => (
                      <div
                        key={product.productId}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          background: "#0A0A0A",
                          border: "1px solid rgba(255,194,26,0.10)",
                          borderRadius: 10,
                        }}
                      >
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>{product.name}</p>
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: "2px 0 0" }}>
                            {product.quantity} unidades vendidas
                          </p>
                        </div>
                        <p
                          style={{
                            fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
                            fontSize: 20,
                            color: "#FFC21A",
                            margin: 0,
                            lineHeight: 1,
                          }}
                        >
                          {formatMoney(product.revenue)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
