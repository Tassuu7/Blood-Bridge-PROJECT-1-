import { Server as SocketIOServer, Socket } from 'socket.io';
import { SOCKET_EVENTS } from './events';

let ioInstance: SocketIOServer | null = null;

export function initSocketServer(io: SocketIOServer): void {
  ioInstance = io;

  io.on('connection', (socket: Socket) => {
    // Client joins user-specific and role-specific channels
    socket.on(SOCKET_EVENTS.JOIN_ROOM, (roomName: string) => {
      if (roomName && typeof roomName === 'string') {
        socket.join(roomName);
      }
    });

    socket.on(SOCKET_EVENTS.LEAVE_ROOM, (roomName: string) => {
      if (roomName && typeof roomName === 'string') {
        socket.leave(roomName);
      }
    });

    socket.on('disconnect', () => {
      // Clean disconnect
    });
  });
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized yet.');
  }
  return ioInstance;
}

/**
 * Emit event to a specific user
 */
export function emitToUser(userId: string, event: string, data: any): void {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
}

/**
 * Emit event to a role-based room (e.g. 'role:DONOR', 'role:HOSPITAL', 'role:ADMIN')
 */
export function emitToRole(role: string, event: string, data: any): void {
  if (ioInstance) {
    ioInstance.to(`role:${role}`).emit(event, data);
  }
}

/**
 * Emit event to a request-specific room
 */
export function emitToRequest(requestId: string, event: string, data: any): void {
  if (ioInstance) {
    ioInstance.to(`request:${requestId}`).emit(event, data);
  }
}

/**
 * Emit event to a hospital room (e.g. 'hospital:{hospitalId}')
 */
export function emitToHospital(hospitalId: string, event: string, data: any): void {
  if (ioInstance) {
    ioInstance.to(`hospital:${hospitalId}`).emit(event, data);
  }
}

/**
 * Broadcast event to all connected clients
 */
export function broadcastGlobal(event: string, data: any): void {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}
