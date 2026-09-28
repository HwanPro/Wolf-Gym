// src/app/admin/attendence/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Download,
  LogIn,
  LogOut,
  QrCode,
  Timer,
  Users,
} from "lucide-react";

type GroupMode = "day" | "month" | "year";

interface Attendance {
  id: string;
  userId: string;
  checkInTime: string;
  checkOutTime?: string;
  durationMins?: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  };
}

const W = {
  black: "#0A0A0A",
  ink: "#141414",
  graph: "#1C1C1C",
  yellow: "#FFC21A",
  orange: "#FF7A1A",
  danger: "#E5484D",
  success: "#2EBD75",
  line: "rgba(255,194,26,0.15)",
  lineStrong: "rgba(255,194,26,0.35)",
  muted: "rgba(255,255,255,0.60)",
  faint: "rgba(255,255,255,0.40)",
  font: "'Inter', system-ui, sans-serif",
  display: "'Bebas Neue', 'Arial Narrow', sans-serif",
};

export default function AdminAttendance() {
  const [attendees, setAttendees] = useState<Attendance[]>([]);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [mode, setMode] = useState<GroupMode>("day");

  useEffect(() => {
    const fetchAttendance = async () => {
      try {
        const response = await fetch("/api/attendance", { cache: "no-store" });
        if (!response.ok) throw new Error("Error obteniendo la lista de asistencia.");
        const data: Attendance[] = await response.json();
        setAttendees(data);
      } catch (error) {
        console.error("Error cargando la lista de asistencia:", error);
      }
    };
    setCurrentTime(new Date().toLocaleString());
    fetchAttendance();
    const clock = setInterval(() => setCurrentTime(new Date().toLocaleString()), 30000);
    const timer = setInterval(() => fetchAttendance(), 60000);
    return () => { clearInterval(clock); clearInterval(timer); };
  }, []);

  const groups = useMemo(() => {
    const buckets = new Map<string, { records: Attendance[]; latestCheckIn: number }>();

    for (const attendance of attendees) {
      const d = new Date(attendance.checkInTime);
      let key: string;
      if (mode === "day") key = d.toLocaleDateString("es-PE", { year: "numeric", month: "2-digit", day: "2-digit" });
      else if (mode === "month") key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      else key = `${d.getFullYear()}`;

      const current = buckets.get(key);
      if (current) {
        current.records.push(attendance);
        current.latestCheckIn = Math.max(current.latestCheckIn, d.getTime());
      } else {
        buckets.set(key, { records: [attendance], latestCheckIn: d.getTime() });
      }
    }

    return Array.from(buckets.entries())
      .sort(([, left], [, right]) => right.latestCheckIn - left.latestCheckIn)
      .map(([label, bucket]) => [label, bucket.records] as [string, Attendance[]]);
  }, [attendees, mode]);

  const metrics = useMemo(() => {
    const active = attendees.filter((a) => !a.checkOutTime).length;
    const uniqueUsers = new Set(attendees.map((a) => a.userId || a.user?.id)).size;
    const totalMs = attendees.reduce((acc, a) => {
      const checkIn = new Date(a.checkInTime).getTime();
      const checkOut = a.checkOutTime ? new Date(a.checkOutTime).getTime() : Date.now();
      return acc + Math.max(0, checkOut - checkIn);
    }, 0);
    return { total: attendees.length, active, completed: attendees.length - active, uniqueUsers, totalMs };
  }, [attendees]);

  const fmtH = (ms: number) => {
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  };

  const handleDownloadQR = () => {
    saveAs("/QR-GYM.png", "QR-GYM.png");
    Swal.fire({
      title: "QR Exportado",
      text: "La imagen del código QR ha sido guardada con éxito.",
      icon: "success",
      confirmButtonText: "Aceptar",
      confirmButtonColor: "#facc15",
      background: "#000000",
      color: "#ffffff",
    });
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: W.yellow,
    borderBottom: `1px solid ${W.line}`,
    fontFamily: W.font,
    textAlign: "left",
    background: W.black,
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 13,
    color: W.muted,
    borderBottom: "1px solid rgba(255,194,26,0.07)",
    fontFamily: W.font,
  };

  return (
    <div style={{ minHeight: "100vh", background: W.black, color: "#fff", fontFamily: W.font }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <header style={{ borderBottom: `1px solid ${W.line}`, background: W.black, padding: "16px 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CalendarDays style={{ width: 28, height: 28, color: W.yellow }} />
              <h1 style={{ fontFamily: W.display, fontSize: 28, letterSpacing: "0.04em", color: "#fff", margin: 0 }}>Asistencia</h1>
            </div>
            <p style={{ marginTop: 4, fontSize: 13, color: W.faint }}>Entradas, salidas y permanencia del gimnasio.</p>
          </div>
          <Link href="/admin/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: W.yellow, color: W.black, borderRadius: 10, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Dashboard
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Metric cards */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
          <div style={{ background: W.ink, border: `1px solid ${W.line}`, borderRadius: 14, padding: "16px 20px", gridColumn: "span 2" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: W.faint, marginBottom: 10 }}>
              <Clock3 style={{ width: 16, height: 16, color: W.yellow }} />Hora actual
            </div>
            <div style={{ fontFamily: W.display, fontSize: 24, color: "#fff", letterSpacing: "0.02em" }}>{currentTime}</div>
          </div>
          <Metric icon={<Users style={{ width: 16, height: 16 }} />} label="Registros" value={metrics.total} />
          <Metric icon={<LogIn style={{ width: 16, height: 16 }} />} label="Activos" value={metrics.active} tone="yellow" />
          <Metric icon={<Timer style={{ width: 16, height: 16 }} />} label="Tiempo total" value={fmtH(metrics.totalMs)} />
        </section>

        <section style={{ display: "grid", gap: 24, gridTemplateColumns: "1fr 280px" }}>
          {/* Records */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Controls */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontFamily: W.display, fontSize: 22, color: "#fff", margin: 0, letterSpacing: "0.04em" }}>Registros</h2>
                <p style={{ fontSize: 12, color: W.faint, margin: "4px 0 0" }}>
                  {metrics.uniqueUsers} clientes únicos · {metrics.completed} sesiones cerradas
                </p>
              </div>
              <div style={{ display: "flex", overflow: "hidden", border: `1px solid ${W.line}`, borderRadius: 10, background: W.ink }}>
                {(["day", "month", "year"] as GroupMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: W.font,
                      transition: "background 0.12s, color 0.12s",
                      background: mode === m ? W.yellow : "transparent",
                      color: mode === m ? W.black : W.muted,
                    }}
                  >
                    {m === "day" ? "Día" : m === "month" ? "Mes" : "Año"}
                  </button>
                ))}
              </div>
            </div>

            {/* Groups */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {groups.length === 0 ? (
                <div style={{ background: W.ink, border: `1px dashed ${W.line}`, borderRadius: 14, padding: 40, textAlign: "center", color: W.faint, fontSize: 13 }}>
                  No hay asistentes aún.
                </div>
              ) : (
                groups.map(([key, list]) => {
                  const total = list.length;
                  const totalMs = list.reduce((acc, a) => {
                    const ci = new Date(a.checkInTime).getTime();
                    const co = a.checkOutTime ? new Date(a.checkOutTime).getTime() : Date.now();
                    return acc + Math.max(0, co - ci);
                  }, 0);
                  return (
                    <div key={key} style={{ background: W.ink, border: `1px solid ${W.line}`, borderRadius: 14, overflow: "hidden" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${W.line}`, background: W.black, padding: "14px 20px" }}>
                        <h3 style={{ fontFamily: W.display, fontSize: 18, color: W.yellow, margin: 0, letterSpacing: "0.04em" }}>
                          {mode === "day" ? `Día ${key}` : mode === "month" ? `Mes ${key}` : `Año ${key}`}
                        </h3>
                        <div style={{ fontSize: 13, color: W.faint }}>
                          <span style={{ marginRight: 16 }}>Registros: <b style={{ color: "#fff" }}>{total}</b></span>
                          <span>Tiempo total: <b style={{ color: "#fff" }}>{fmtH(totalMs)}</b></span>
                        </div>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              {["Usuario", "Día", "Entrada / salida", "Estancia", "Estado"].map((h) => (
                                <th key={h} style={thStyle}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {list.map((attendee) => {
                              const checkIn = new Date(attendee.checkInTime);
                              const checkOut = attendee.checkOutTime ? new Date(attendee.checkOutTime) : null;
                              const dayOfWeek = checkIn.toLocaleDateString("es-PE", { weekday: "long" }).toUpperCase();
                              const duration =
                                attendee.durationMins != null
                                  ? `${attendee.durationMins} min`
                                  : checkOut
                                  ? `${Math.round((+checkOut - +checkIn) / 60000)} min`
                                  : "En curso";
                              return (
                                <tr
                                  key={attendee.id}
                                  style={{ transition: "background 0.1s" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,194,26,0.04)")}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                >
                                  <td style={tdStyle}>
                                    <div style={{ fontWeight: 600, color: "#fff" }}>{attendee.user.firstName} {attendee.user.lastName}</div>
                                    <div style={{ fontSize: 11, color: W.faint }}>{attendee.user.phoneNumber}</div>
                                  </td>
                                  <td style={tdStyle}>{dayOfWeek}</td>
                                  <td style={tdStyle}>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                                      <LogIn style={{ width: 13, height: 13, color: W.yellow }} />{checkIn.toLocaleTimeString()}
                                    </div>
                                    <br />
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 4 }}>
                                      <LogOut style={{ width: 13, height: 13, color: W.danger }} />{checkOut ? checkOut.toLocaleTimeString() : "Pendiente"}
                                    </div>
                                  </td>
                                  <td style={{ ...tdStyle, color: "#fff", fontWeight: 600 }}>{duration}</td>
                                  <td style={tdStyle}>
                                    {checkOut ? (
                                      <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "rgba(255,255,255,0.06)", color: W.muted, border: "1px solid rgba(255,255,255,0.1)" }}>
                                        Cerrado
                                      </span>
                                    ) : (
                                      <span className="wolf-badge-yellow" style={{ fontSize: 11 }}>
                                        En curso
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* QR sidebar */}
          <aside style={{ background: W.ink, border: `1px solid ${W.line}`, borderRadius: 14, padding: 20, height: "fit-content", position: "sticky", top: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, color: W.yellow }}>
              <QrCode style={{ width: 18, height: 18 }} />
              <h2 style={{ fontFamily: W.display, fontSize: 18, color: "#fff", margin: 0, letterSpacing: "0.04em" }}>QR de registro</h2>
            </div>
            <div style={{ background: "#fff", borderRadius: 10, padding: 12 }}>
              <Image
                src="/uploads/images/QR-GYM.png"
                alt="Código QR de acceso"
                width={220}
                height={220}
                style={{ display: "block", margin: "0 auto" }}
              />
            </div>
            <button
              onClick={handleDownloadQR}
              style={{
                marginTop: 14,
                display: "inline-flex",
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 42,
                background: W.yellow,
                border: `1px solid ${W.yellow}`,
                borderRadius: 10,
                color: W.black,
                fontFamily: W.font,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = W.orange; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = W.yellow; }}
            >
              <Download style={{ width: 15, height: 15 }} />
              Exportar QR
            </button>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Metric({ icon, label, value, tone = "default" }: { icon: ReactNode; label: string; value: number | string; tone?: "default" | "yellow"; }) {
  return (
    <div style={{ background: "#141414", border: "1px solid rgba(255,194,26,0.15)", borderRadius: 14, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: tone === "yellow" ? "#FFC21A" : "rgba(255,255,255,0.4)", marginBottom: 10 }}>
        {icon}{label}
      </div>
      <div style={{ fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif", fontSize: 36, color: "#fff", letterSpacing: "0.02em", lineHeight: 1 }}>{value}</div>
    </div>
  );
}
