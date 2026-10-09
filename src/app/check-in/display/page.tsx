"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type ActivityLog = {
  id: string;
  timestamp: Date;
  fullName: string;
  action: "checkin" | "checkout";
  avatarUrl?: string;
  monthlyDebt: number;
  dailyDebt: number;
  totalDebt: number;
  daysLeft?: number;
  profileId?: string;
  minutesOpen?: number;
};

function CheckInDisplayContent() {
  const searchParams = useSearchParams();
  const room = searchParams.get("room") || "default";

  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [currentUser, setCurrentUser] = useState<ActivityLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);

  // Cargar historial inicial
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const loadHistory = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/check-in/history?room=${encodeURIComponent(room)}&limit=50`);
        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.activityLog) {
            const processedLog = data.activityLog.map((item: any) => ({
              ...item,
              timestamp: new Date(item.timestamp),
            }));
            if (!stopped) {
              setActivityLog(processedLog);
              setHistoryError(false);
            }
            console.log(`Historial cargado: ${processedLog.length} registros`);
          }
        } else if (!stopped) setHistoryError(true);
      } catch (error) {
        console.error('Error cargando historial:', error);
        if (!stopped) setHistoryError(true);
      } finally {
        if (!stopped) setLoading(false);
        inFlight = false;
      }
    };

    loadHistory();
    const timer = setInterval(loadHistory, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [room]);

  // Escuchar eventos de marcación en tiempo real
  useEffect(() => {
    const eventSource = new EventSource(`/api/check-in/stream?room=${encodeURIComponent(room)}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'checkin' || data.type === 'checkout') {
          const logEntry: ActivityLog = {
            id: `${data.userId}-${data.type}-${Date.now()}`,
            timestamp: new Date(),
            fullName: data.fullName || "Usuario",
            action: data.type === "checkout" ? "checkout" : "checkin",
            avatarUrl: data.avatarUrl,
            monthlyDebt: data.monthlyDebt || 0,
            dailyDebt: data.dailyDebt || 0,
            totalDebt: data.totalDebt || 0,
            daysLeft: data.daysLeft,
            profileId: data.profileId,
            minutesOpen: data.minutesOpen,
          };

          // Mostrar usuario actual por 5 segundos
          setCurrentUser(logEntry);
          setTimeout(() => setCurrentUser(null), 5000);

          // Agregar al log (evitar duplicados)
          setActivityLog(prev => {
            const exists = prev.some(item =>
              item.profileId === logEntry.profileId &&
              item.action === logEntry.action &&
              Math.abs(item.timestamp.getTime() - logEntry.timestamp.getTime()) < 2000
            );

            if (!exists) {
              return [logEntry, ...prev.slice(0, 49)];
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
    };

    eventSource.onopen = () => {
      console.log('EventSource conectado');
    };

    return () => {
      eventSource.close();
    };
  }, [room]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-yellow-400 mb-2">
          🏋️ Wolf Gym
        </h1>
        <p className="text-xl text-gray-300">
          Pantalla de Asistencia - Sala: <span className="text-yellow-400">{room}</span>
        </p>
      </div>

      {historyError && <p role="alert" className="mb-4 text-center text-amber-300">No se pudo actualizar el historial. Se reintentará automáticamente.</p>}
      {/* Indicador de carga */}
      {loading && (
        <div className="mb-8 flex justify-center">
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-8 max-w-2xl w-full text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
            <h2 className="text-xl text-gray-400">Cargando historial...</h2>
          </div>
        </div>
      )}

      {/* Usuario Actual */}
      {!loading && currentUser ? (
        <div className="mb-8 flex justify-center">
          <div className="bg-gradient-to-r from-yellow-400/20 to-yellow-600/20 border-2 border-yellow-400 rounded-xl p-8 max-w-2xl w-full">
            <div className="flex items-center gap-6">
              <img
                src={currentUser.avatarUrl || `https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${encodeURIComponent(currentUser.fullName)}`}
                alt="Avatar"
                className="w-24 h-24 rounded-full border-4 border-yellow-400"
              />
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-white mb-2">
                  {currentUser.fullName}
                </h2>
                <div className="flex items-center gap-4 mb-3">
                  <span className={`px-4 py-2 rounded-full text-lg font-semibold ${
                    currentUser.action === "checkin"
                      ? "bg-green-600 text-white"
                      : "bg-red-600 text-white"
                  }`}>
                    {currentUser.action === "checkin" ? "✅ ENTRADA" : "🚪 SALIDA"}
                  </span>
                  <span className="text-gray-300 text-lg">
                    {currentUser.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-lg">
                  {currentUser.totalDebt > 0 && (
                    <div className="bg-red-900/30 px-3 py-2 rounded">
                      <span className="text-red-400">Deuda Total: </span>
                      <span className="font-bold text-red-300">S/. {currentUser.totalDebt.toFixed(2)}</span>
                    </div>
                  )}
                  {currentUser.daysLeft !== undefined && (
                    <div className="bg-blue-900/30 px-3 py-2 rounded">
                      <span className="text-blue-400">Días restantes: </span>
                      <span className="font-bold text-blue-300">{currentUser.daysLeft}</span>
                    </div>
                  )}
                  {currentUser.action === "checkout" && currentUser.minutesOpen && (
                    <div className="bg-purple-900/30 px-3 py-2 rounded col-span-2">
                      <span className="text-purple-400">Tiempo en gimnasio: </span>
                      <span className="font-bold text-purple-300">{currentUser.minutesOpen} minutos</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !loading && (
        <div className="mb-8 flex justify-center">
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-8 max-w-2xl w-full text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-2xl text-gray-400">Esperando marcación...</h2>
            <p className="text-gray-500 mt-2">La información aparecerá cuando alguien marque asistencia</p>
          </div>
        </div>
      )}

      {/* Historial Reciente */}
      <div className="max-w-6xl mx-auto">
        <h3 className="text-2xl font-bold text-yellow-400 mb-4 text-center">
          📊 Actividad Reciente
        </h3>

        {activityLog.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-4">📝</div>
            <p>No hay actividad reciente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activityLog.slice(0, 12).map((log) => (
              <div key={log.id} className="bg-gray-900 rounded-lg p-4 border border-gray-700 hover:border-yellow-400/50 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={log.avatarUrl || `https://ui-avatars.com/api/?background=0D8ABC&color=fff&name=${encodeURIComponent(log.fullName)}`}
                    alt="Avatar"
                    className="w-12 h-12 rounded-full"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-white text-sm">{log.fullName}</div>
                    <div className="text-xs text-gray-400">
                      {log.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    log.action === "checkin"
                      ? "bg-green-600/20 text-green-400"
                      : "bg-red-600/20 text-red-400"
                  }`}>
                    {log.action === "checkin" ? "Entrada" : "Salida"}
                  </span>
                  {log.daysLeft !== undefined && (
                    <span className="text-xs text-blue-400">
                      {log.daysLeft} días
                    </span>
                  )}
                </div>

                {log.totalDebt > 0 && (
                  <div className="text-xs text-red-400">
                    Deuda: S/. {log.totalDebt.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckInDisplayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando pantalla de asistencia...</p>
        </div>
      </div>
    }>
      <CheckInDisplayContent />
    </Suspense>
  );
}
