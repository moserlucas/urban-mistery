import {
  createInitialRoomState,
  setupSocketHandlers,
  SocketWrapper
} from './gameEngine.js';

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.room = null;

    const self = this;
    this.io = {
      to(targetId) {
        return {
          emit(event, data) {
            if (self.room && targetId === self.room.id) {
              self.sessions.forEach(s => s.emit(event, data));
            } else {
              const sock = self.sessions.get(targetId);
              if (sock) sock.emit(event, data);
            }
          }
        };
      }
    };
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Esperado Upgrade: websocket', { status: 426 });
    }

    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId') || url.searchParams.get('sala') || 'sala-principal';

    if (!this.room) {
      this.room = createInitialRoomState(roomId, this.io);
    } else {
      this.room.io = this.io;
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    const socketId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('sock_' + Math.random().toString(36).substring(2, 9));

    const sockWrapper = new SocketWrapper(server, socketId, roomId);
    this.sessions.set(socketId, sockWrapper);

    setupSocketHandlers(sockWrapper, () => this.room);

    server.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { event: evt, data } = payload;
        sockWrapper.dispatch(evt, data);
      } catch (err) {
        console.error('Erro ao processar mensagem WS no Worker:', err);
      }
    });

    server.addEventListener('close', () => {
      sockWrapper.dispatch('disconnect');
      this.sessions.delete(socketId);
    });

    server.addEventListener('error', (err) => {
      console.warn('Erro no socket WS do Worker:', err);
    });

    sockWrapper.emit('connect', { id: socketId });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/ws' || request.headers.get('Upgrade') === 'websocket') {
      const roomId = url.searchParams.get('roomId') || url.searchParams.get('sala') || 'sala-principal';
      const id = env.GAME_ROOM.idFromName(roomId);
      const roomStub = env.GAME_ROOM.get(id);
      return roomStub.fetch(request);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Servidor Mistério Urbano Ativo', { status: 200 });
  }
};
