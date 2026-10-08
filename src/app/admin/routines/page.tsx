"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, Filter, Plus, Search } from "lucide-react";
import ExerciseManagement from "@/ui/components/admin/ExerciseManagement";
import RoutineManagement from "@/ui/components/admin/RoutineManagement";
import { Button } from "@/ui/button";

interface ExerciseItem {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  level: string;
  isPublished: boolean;
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
  faint: "rgba(255,255,255,0.65)",
  font: "'Inter', system-ui, sans-serif",
  display: "'Bebas Neue', 'Arial Narrow', sans-serif",
};

function levelColor(level: string) {
  if (level === "beginner") return W.success;
  if (level === "intermediate") return W.yellow;
  return W.orange;
}

export default function AdminRoutinesPage() {
  const [managing, setManaging] = useState(false);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [level, setLevel] = useState("");
  const [items, setItems] = useState<ExerciseItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("published", "true");
      if (query) params.set("query", query);
      if (muscle) params.set("muscle", muscle);
      if (equipment) params.set("equipment", equipment);
      if (level) params.set("level", level);
      params.set("limit", "50");
      const res = await fetch(`/api/exercises?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputStyle: React.CSSProperties = {
    height: 40,
    padding: "0 12px",
    background: W.graph,
    border: `1px solid ${W.line}`,
    borderRadius: 10,
    color: "#fff",
    fontSize: 13,
    outline: "none",
    fontFamily: W.font,
    width: "100%",
  };

  return (
    <div style={{ minHeight: "100vh", background: W.black, color: "#fff", fontFamily: W.font, padding: 24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${W.line}` }}>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: W.display, fontSize: 28, color: W.yellow, margin: 0, letterSpacing: "0.04em" }}>
            <Dumbbell style={{ width: 24, height: 24 }} />
            Biblioteca de Ejercicios
          </h1>
          <div style={{ display: "flex", gap: 10 }}>
            <Button
              onClick={() => setManaging(current => !current)}
              type="button"
              style={{ height: 40, background: W.yellow, border: `1px solid ${W.yellow}`, borderRadius: 10, color: W.black, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Plus style={{ width: 15, height: 15 }} /> Gestionar ejercicios y rutinas
            </Button>
            <Link
              href="/admin/dashboard"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", height: 40, background: "transparent", border: `1px solid ${W.lineStrong}`, borderRadius: 10, color: W.muted, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ background: W.ink, border: `1px solid ${W.line}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: W.faint, marginBottom: 6 }}>Búsqueda</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="Nombre / descripción"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={inputStyle}
                />
                <button
                  onClick={load}
                  aria-label="Buscar ejercicios"
                  style={{ width: 40, height: 40, background: "transparent", border: `1px solid ${W.lineStrong}`, borderRadius: 10, color: W.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                >
                  <Search style={{ width: 15, height: 15 }} />
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: W.faint, marginBottom: 6 }}>Músculo</label>
              <input placeholder="Pecho / Dorsales / ..." value={muscle} onChange={(e) => setMuscle(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: W.faint, marginBottom: 6 }}>Equipo</label>
              <input placeholder="Barra / Mancuernas / ..." value={equipment} onChange={(e) => setEquipment(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: W.faint, marginBottom: 6 }}>Nivel</label>
              <input placeholder="beginner / intermediate / advanced" value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={load}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 14px", background: "transparent", border: `1px solid ${W.lineStrong}`, borderRadius: 10, color: W.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: W.font }}
            >
              <Filter style={{ width: 14, height: 14 }} /> Aplicar
            </button>
            <button
              onClick={() => { setQuery(""); setMuscle(""); setEquipment(""); setLevel(""); load(); }}
              style={{ display: "inline-flex", alignItems: "center", height: 38, padding: "0 14px", background: "transparent", border: "none", color: W.faint, fontSize: 13, cursor: "pointer", fontFamily: W.font }}
            >
              Limpiar
            </button>
          </div>
        </div>

        {managing && <section className="space-y-6"><ExerciseManagement /><RoutineManagement /></section>}
        {/* Exercise grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {loading ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: W.yellow, fontFamily: W.display, fontSize: 24, letterSpacing: "0.06em" }}>
              Cargando...
            </div>
          ) : items.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: W.faint, fontSize: 14 }}>
              Sin resultados
            </div>
          ) : (
            items.map((ex) => (
              <div
                key={ex.id}
                style={{ background: W.ink, border: `1px solid ${W.line}`, borderRadius: 14, padding: 18, transition: "border-color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = W.lineStrong)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = W.line)}
              >
                {/* Level indicator dots */}
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {["beginner", "intermediate", "advanced"].map((l) => (
                    <span
                      key={l}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: ex.level === l || (l === "intermediate" && ex.level !== "beginner") || (l === "advanced" && ex.level === "advanced")
                          ? levelColor(ex.level)
                          : "rgba(255,255,255,0.1)",
                        transition: "background 0.15s",
                      }}
                    />
                  ))}
                  <span style={{ marginLeft: 6, fontSize: 11, color: levelColor(ex.level), fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {ex.level}
                  </span>
                </div>
                <h3 style={{ fontFamily: W.display, fontSize: 18, color: "#fff", margin: "0 0 6px", letterSpacing: "0.04em" }}>
                  {ex.name}
                </h3>
                <p style={{ fontSize: 12, color: W.faint, margin: "0 0 10px" }}>
                  {ex.primaryMuscle} · {ex.equipment}
                </p>
                <span style={{
                  display: "inline-flex",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: ex.isPublished ? "rgba(46,189,117,0.12)" : "rgba(255,255,255,0.05)",
                  color: ex.isPublished ? W.success : W.faint,
                  border: ex.isPublished ? "1px solid rgba(46,189,117,0.35)" : "1px solid rgba(255,255,255,0.1)",
                }}>
                  {ex.isPublished ? "Publicado" : "Borrador"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
