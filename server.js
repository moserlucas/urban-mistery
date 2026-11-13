const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');
const {
  createInitialRoomState,
  setupSocketHandlers,
  SocketWrapper
} = require('./gameEngine');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const rooms = new Map();
const connectedSockets = new Map(); // socketId -> SocketWrapper

const io = {
  to(targetId) {
    return {
      emit(event, data) {
        // Se targetId for um socket individual
        const sock = connectedSockets.get(targetId);
        if (sock) {
          sock.emit(event, data);
          return;
        }
        // Se targetId for uma sala, envia para todos da sala
        connectedSockets.forEach(s => {
          if (s.roomId === targetId) {
            s.emit(event, data);
          }
        });
      }
    };
  }
};

function getRoom(roomId) {
  const id = (roomId && typeof roomId === 'string') ? roomId.trim() : 'sala-principal';
  if (!rooms.has(id)) {
    const r = createInitialRoomState(id, io);
    rooms.set(id, r);
  }
  const r = rooms.get(id);
  r.io = io;
  return r;
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `http://${host}`);
  const initialRoomId = url.searchParams.get('roomId') || url.searchParams.get('sala') || 'sala-principal';
  const socketId = (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : ('sock_' + Math.random().toString(36).substring(2, 9));

  const sockWrapper = new SocketWrapper(ws, socketId, initialRoomId);
  connectedSockets.set(socketId, sockWrapper);

  setupSocketHandlers(sockWrapper, getRoom);

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      const { event, data } = payload;
      sockWrapper.dispatch(event, data);
    } catch (err) {
      console.error('Erro ao processar mensagem WS:', err);
    }
  });

  ws.on('close', () => {
    sockWrapper.dispatch('disconnect');
    connectedSockets.delete(socketId);
  });

  ws.on('error', (err) => {
    console.warn('Erro no socket WS:', err);
  });

  // Handshake inicial enviando o ID atribuido
  sockWrapper.emit('connect', { id: socketId });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
