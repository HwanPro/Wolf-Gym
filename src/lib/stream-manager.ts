// src/lib/stream-manager.ts
// Gestor centralizado para el stream de eventos

// Store para mantener las conexiones activas por sala
// Next puede cargar este módulo desde varios paquetes de rutas en el mismo proceso.
const streamGlobal = globalThis as typeof globalThis & {
  wolfGymStreamConnections?: Map<string, Set<ReadableStreamDefaultController>>;
};
const connections = streamGlobal.wolfGymStreamConnections ??= new Map<string, Set<ReadableStreamDefaultController>>();

// Función para agregar una conexión
export function addConnection(room: string, controller: ReadableStreamDefaultController) {
  if (!connections.has(room)) {
    connections.set(room, new Set());
  }
  connections.get(room)!.add(controller);
  console.log(`Nueva conexión agregada a sala: ${room}. Total: ${connections.get(room)!.size}`);
}

// Función para remover una conexión
export function removeConnection(room: string, controller: ReadableStreamDefaultController) {
  const roomConnections = connections.get(room);
  if (roomConnections) {
    roomConnections.delete(controller);
    console.log(`Conexión removida de sala: ${room}. Total: ${roomConnections.size}`);
    if (roomConnections.size === 0) {
      connections.delete(room);
    }
  }
}

// Función para broadcast a todas las conexiones de una sala
export function broadcastToRoom(room: string, data: any) {
  const roomConnections = connections.get(room);
  if (!roomConnections || roomConnections.size === 0) {
    console.log(`No hay conexiones activas para sala: ${room}`);
    return;
  }

  const message = `data: ${JSON.stringify(data)}\n\n`;
  console.log(`Broadcasting a ${roomConnections.size} conexiones en sala: ${room}`);

  // Enviar a todas las conexiones activas
  const deadConnections: ReadableStreamDefaultController[] = [];

  roomConnections.forEach((controller) => {
    try {
      controller.enqueue(message);
    } catch (error) {
      console.error('Error enviando mensaje, marcando conexión como muerta:', error);
      deadConnections.push(controller);
    }
  });

  // Limpiar conexiones muertas
  deadConnections.forEach(controller => {
    roomConnections.delete(controller);
  });
}

// Función para obtener estadísticas
export function getConnectionStats() {
  const stats: Record<string, number> = {};
  connections.forEach((controllers, room) => {
    stats[room] = controllers.size;
  });
  return stats;
}
