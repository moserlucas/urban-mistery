const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function rollDice() {
  return crypto.randomInt(1, 7);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Permite conexões de qualquer origem (ou coloque a URL da Vercel)
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ================= SISTEMA DE MONITORAMENTO DE BOTS (LOG TEMPORÁRIO) =================
const BOT_LOG_FILE = path.join(__dirname, 'bot_monitoring.log');

function initBotLog(room) {
  try {
    const timeStr = new Date().toLocaleString('pt-BR');
    let content = `================================================================================\n`;
    content += `MONITORAMENTO DE COMPORTAMENTO DOS BOTS - DETETIVE URBANO [SALA: ${room.id}]\n`;
    content += `Data/Hora de Inicio da Partida: ${timeStr}\n`;
    content += `Total de Jogadores na Mesa: ${room.players.length}\n`;
    content += `--------------------------------------------------------------------------------\n`;
    content += `SOLUCAO DO ENVELOPE (CONFIDENCIAL):\n`;
    content += `- Suspeito (Culpado): ${room.envelope.suspect}\n`;
    content += `- Arma do Crime:     ${room.envelope.weapon}\n`;
    content += `- Local do Crime:    ${room.envelope.location}\n`;
    content += `--------------------------------------------------------------------------------\n`;
    content += `DISTRIBUICAO INICIAL DE CARTAS AOS BOTS:\n`;

    const bots = room.players.filter(p => p.isBot);
    bots.forEach(bot => {
      bot.bluffCount = 0;
      const cardList = bot.cards.map(c => `[${c.type.toUpperCase()}: ${c.name}]`).join(', ') || 'Nenhuma';
      content += `- ${bot.name} (${bot.character.role}): ${cardList}\n`;
    });
    content += `================================================================================\n\n`;
    content += `REGISTRO CRONOLOGICO DE ATIVIDADES E COMPORTAMENTO:\n`;
    fs.writeFileSync(BOT_LOG_FILE, content, 'utf8');
  } catch (err) {
    console.error('Erro ao inicializar bot_monitoring.log:', err);
  }
}

function logBotAction(room, message) {
  try {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    fs.appendFileSync(BOT_LOG_FILE, `[${time}][${room.id}] ${message}\n`, 'utf8');
  } catch (err) {
    console.error('Erro ao gravar log do bot:', err);
  }
}

// 8 Personagens oficiais com posições iniciais calibradas
const CHARACTERS = [
  { id: 'fahur', name: 'Fahur', role: 'Sargento', color: '#f1c40f', startRoom: 'Batalhão', startPos: { x: 5, y: 2 } },
  { id: 'toguro', name: 'Toguro', role: 'Fisiculturista', color: '#ecf0f1', startRoom: 'Academia', startPos: { x: 9, y: 4 } },
  { id: 'jacao', name: 'Jacão', role: 'Chef', color: '#8d6e63', startRoom: 'Bistrô de Esquina', startPos: { x: 14, y: 2 } },
  { id: 'moraes', name: 'Moraes', role: 'Advogado', color: '#29b6f6', startRoom: 'Praça do Único Poder', startPos: { x: 6, y: 9 } },
  { id: 'carminha', name: 'Carminha', role: 'Atriz', color: '#e53935', startRoom: 'Teatro Regional', startPos: { x: 9, y: 15 } },
  { id: 'pecanha', name: 'Peçanha', role: 'Segurança', color: '#616161', startRoom: 'Museu', startPos: { x: 14, y: 7 } },
  { id: 'jailson', name: 'Jailson', role: 'Mecânico', color: '#43a047', startRoom: 'Mecânica', startPos: { x: 16, y: 15 } },
  { id: 'tadalafila', name: 'Tadalafila', role: 'Doutor', color: '#ec407a', startRoom: 'UPA 24H', startPos: { x: 5, y: 7 } }
];

const WEAPONS = [
  'Enxada Enferrujada', 'Barra de Ferro', 'Faca AK47', 'Maleta',
  'Chave de Roda', 'Estátua de Bronze', 'Arame Farpado', 'Bisturi'
];

const LOCATIONS = [
  'Batalhão', 'Academia', 'Bistrô de Esquina', 'UPA 24H',
  'Praça do Único Poder', 'Museu', 'Banco Master', 'Palace Hotel',
  'Metrô', 'Teatro Regional', 'Mecânica'
];

// Carregamento oficial da grade 20x20 e salas
const BOARD_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'gemini-code-1790744670078.json'), 'utf8'));
const GRID_MATRIX = BOARD_DATA.grid_matrix;
const GRID_SIZE = BOARD_DATA.board.width; // 20

const ROOMS_CONFIG = {};
const DOORS_BY_CELL = {};
const SECRET_PASSAGES = {};

BOARD_DATA.rooms.forEach(r => {
  const canonicalName = (r.name === 'Praça Único Poder' || r.id === 'praca_unico_poder')
    ? 'Praça do Único Poder'
    : r.name;

  const roomConf = {
    id: r.id,
    name: canonicalName,
    x: r.bounds.x,
    y: r.bounds.y,
    w: r.bounds.width,
    h: r.bounds.height,
    width: r.bounds.width,
    height: r.bounds.height,
    bounds: r.bounds,
    doors: r.doors.map(d => ({
      x: d.cell.x,
      y: d.cell.y,
      cell: d.cell,
      direction: d.direction,
      exitTo: { x: d.exitTo.x, y: d.exitTo.y }
    })),
    hasSecret: r.secretPassageTo ? (r.secretPassageTo === 'mecanica' ? 'Mecânica' : (r.secretPassageTo === 'batalhao' ? 'Batalhão' : (r.secretPassageTo === 'metro' ? 'Metrô' : 'UPA 24H'))) : null
  };

  ROOMS_CONFIG[canonicalName] = roomConf;
  if (canonicalName !== r.name) {
    ROOMS_CONFIG[r.name] = roomConf;
  }

  r.doors.forEach(d => {
    DOORS_BY_CELL[`${d.cell.x},${d.cell.y}`] = {
      roomName: canonicalName,
      roomId: r.id,
      exitTo: d.exitTo,
      direction: d.direction
    };
  });
});

if (BOARD_DATA.secretPassages) {
  BOARD_DATA.secretPassages.forEach(sp => {
    const nameA = sp.roomA === 'batalhao' ? 'Batalhão' : (sp.roomA === 'upa_24h' ? 'UPA 24H' : (sp.roomA === 'metro' ? 'Metrô' : 'Mecânica'));
    const nameB = sp.roomB === 'batalhao' ? 'Batalhão' : (sp.roomB === 'upa_24h' ? 'UPA 24H' : (sp.roomB === 'metro' ? 'Metrô' : 'Mecânica'));
    SECRET_PASSAGES[nameA] = nameB;
    SECRET_PASSAGES[nameB] = nameA;
  });
}

// Configurações de velocidade apenas para ações dos BOTS
const BOT_SPEEDS = {
  fast: {
    startDelay: 250,
    diceDelay: 500,
    suggestionDelay: 500,
    refuteDelay: 750,
    corridorTurnDelay: 750,
    accusationDelay: 1000
  },
  normal: {
    startDelay: 500,
    diceDelay: 1000, 
    suggestionDelay: 1000,
    refuteDelay: 1500,
    corridorTurnDelay: 1500,
    accusationDelay: 2000
  },
  slow: {
    startDelay: 750,
    diceDelay: 1500,
    suggestionDelay: 1500,
    refuteDelay: 2250,
    corridorTurnDelay: 2250,
    accusationDelay: 3000
  }
};

// ================= GESTÃO DE SALAS MULTIPLAYER =================
const rooms = new Map();

function createInitialRoomState(roomId) {
  return {
    id: roomId,
    started: false,
    hostId: null,
    players: [],
    envelope: {},
    turnIndex: 0,
    diceRolledThisTurn: false,
    lastDiceValue: 0,
    winner: null,
    currentSuggestion: null,
    currentRefutation: null,
    botSpeed: 'normal',
    humanTurnTimer: null,
    humanTimerPhase: null, // Padrão 30s: 'roll_move', 'move', 'suggestion', 'refute'
    humanSecondsLeft: 0
  };
}

function getRoom(roomId) {
  const id = (roomId && typeof roomId === 'string') ? roomId.trim() : 'sala-principal';
  if (!rooms.has(id)) {
    rooms.set(id, createInitialRoomState(id));
  }
  return rooms.get(id);
}

function broadcastToRoom(room, event, data) {
  io.to(room.id).emit(event, data);
}

function getBotSpeedConfig(room) {
  return BOT_SPEEDS[room.botSpeed] || BOT_SPEEDS.normal;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getAvailableCharacters(room) {
  const taken = room.players.map(p => p.character.id);
  return CHARACTERS.filter(c => !taken.includes(c.id));
}

function getPublicState(room) {
  return {
    roomId: room.id,
    started: room.started,
    turnPlayer: room.players[room.turnIndex],
    diceRolledThisTurn: room.diceRolledThisTurn,
    lastDiceValue: room.lastDiceValue,
    botSpeed: room.botSpeed,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      character: p.character,
      inRoom: p.inRoom,
      tile: p.tile,
      secretPassageUses: p.secretPassageUses,
      wasDraggedBySuggestion: p.wasDraggedBySuggestion,
      eliminated: p.eliminated,
      cardCount: p.cards.length
    })),
    winner: room.winner
  };
}

// Algoritmo BFS para cálculo de alcance no grid 20x20
function calculateReachablePositionsForBot(room, bot, dice) {
  const occupiedTiles = room.players
    .filter(p => p.id !== bot.id && !p.inRoom && !p.eliminated)
    .map(p => `${p.tile.x},${p.tile.y}`);

  function searchReachable(ignorePawns) {
    const rTiles = [];
    const rRooms = [];
    const vMap = new Map();
    const q = [];

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    if (bot.inRoom) {
      const canonicalRoomName = (bot.inRoom === 'Praça Único Poder' || bot.inRoom === 'Praça do Único Poder')
        ? 'Praça do Único Poder'
        : bot.inRoom;
      const rConf = ROOMS_CONFIG[canonicalRoomName] || ROOMS_CONFIG[bot.inRoom];
      if (rConf && rConf.doors) {
        rConf.doors.forEach(door => {
          const doorX = (door.cell && door.cell.x !== undefined) ? door.cell.x : door.x;
          const doorY = (door.cell && door.cell.y !== undefined) ? door.cell.y : door.y;
          let exit = door.exitTo;
          if (!exit) {
            const doorInfo = DOORS_BY_CELL[`${doorX},${doorY}`];
            if (doorInfo && doorInfo.exitTo) exit = doorInfo.exitTo;
          }
          if (!exit) {
            const nbrs = [
              { x: doorX + 1, y: doorY },
              { x: doorX - 1, y: doorY },
              { x: doorX, y: doorY + 1 },
              { x: doorX, y: doorY - 1 }
            ];
            exit = nbrs.find(n => n.x >= 0 && n.x < GRID_SIZE && n.y >= 0 && n.y < GRID_SIZE && GRID_MATRIX[n.y][n.x] === 1);
          }

          if (exit && exit.x >= 0 && exit.x < GRID_SIZE && exit.y >= 0 && exit.y < GRID_SIZE) {
            const exitKey = `${exit.x},${exit.y}`;
            const isBlocked = !ignorePawns && !bot.inRoom && occupiedTiles.includes(exitKey);
            if (GRID_MATRIX[exit.y][exit.x] === 1 && !isBlocked && dice >= 1) {
              const stepsLeft = dice - 1;
              q.push({ x: exit.x, y: exit.y, stepsLeft });
              vMap.set(exitKey, stepsLeft);
              if (stepsLeft === 0) {
                if (!rTiles.some(t => t.x === exit.x && t.y === exit.y)) {
                  rTiles.push({ x: exit.x, y: exit.y });
                }
              }
            }
          }
        });
      }
    } else {
      const startKey = `${bot.tile.x},${bot.tile.y}`;
      q.push({ x: bot.tile.x, y: bot.tile.y, stepsLeft: dice });
      vMap.set(startKey, dice);
    }

    while (q.length > 0) {
      const current = q.shift();
      if (current.stepsLeft <= 0) continue;

      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;

        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

        const cellVal = GRID_MATRIX[ny][nx];
        if (cellVal === 0) continue;

        // 2 = Porta de entrada para sala
        if (cellVal === 2) {
          const doorInfo = DOORS_BY_CELL[`${nx},${ny}`];
          if (doorInfo) {
            const targetRoom = doorInfo.roomName;
            if (!bot.inRoom || targetRoom !== bot.inRoom) {
              if (!rRooms.includes(targetRoom)) {
                rRooms.push(targetRoom);
              }
            }
          }
          continue;
        }

        // 1 = Corredor transitável
        if (cellVal === 1) {
          const key = `${nx},${ny}`;
          if (!ignorePawns && occupiedTiles.includes(key)) continue;

          const nextSteps = current.stepsLeft - 1;
          if (!vMap.has(key) || vMap.get(key) < nextSteps) {
            vMap.set(key, nextSteps);
            q.push({ x: nx, y: ny, stepsLeft: nextSteps });

            if (nextSteps === 0) {
              if (!rTiles.some(t => t.x === nx && t.y === ny)) {
                rTiles.push({ x: nx, y: ny });
              }
            }
          }
        }
      }
    }

    if (rTiles.length === 0 && rRooms.length === 0 && vMap.size > 0) {
      let minSteps = Infinity;
      vMap.forEach(steps => {
        if (steps < minSteps) minSteps = steps;
      });
      vMap.forEach((steps, key) => {
        if (steps === minSteps) {
          const [vx, vy] = key.split(',').map(Number);
          if (!bot.inRoom || (vx !== bot.tile.x || vy !== bot.tile.y)) {
            if (!rTiles.some(t => t.x === vx && t.y === vy)) {
              rTiles.push({ x: vx, y: vy });
            }
          }
        }
      });
    }

    return { rRooms, rTiles };
  }

  let result = searchReachable(false);
  if (result.rTiles.length === 0 && result.rRooms.length === 0) {
    result = searchReachable(true);
  }

  return { reachableRooms: result.rRooms, reachableTiles: result.rTiles };
}

// Redistribuição de cartas na eliminação
function redistributeCards(room, eliminatedPlayer) {
  if (!eliminatedPlayer || !eliminatedPlayer.cards || eliminatedPlayer.cards.length === 0) return;

  const activePlayers = room.players.filter(p => !p.eliminated && p.id !== eliminatedPlayer.id);
  if (activePlayers.length === 0) return;

  // Regra 1 contra 1: se restar apenas 1 jogador ativo na mesa (penúltimo errou), NÃO envia as cartas para o último
  if (activePlayers.length === 1) {
    logBotAction(room, `[1 CONTRA 1] Penúltimo jogador (${eliminatedPlayer.name}) errou a acusação. Suas cartas NÃO foram entregues ao último detetive ativo (${activePlayers[0].name}).`);
    broadcastToRoom(room, 'narrative_log', `O penúltimo detetive (${eliminatedPlayer.name}) errou a acusação e foi eliminado! Suas cartas foram lacradas pela perícia e NÃO serão entregues ao último investigador.`);
    eliminatedPlayer.cards = [];
    return;
  }

  const cardsToDistribute = [...eliminatedPlayer.cards];
  eliminatedPlayer.cards = [];

  let i = 0;
  cardsToDistribute.forEach(card => {
    activePlayers[i % activePlayers.length].cards.push(card);
    i++;
  });

  broadcastToRoom(room, 'narrative_log', `As cartas de ${eliminatedPlayer.name} foram redistribuídas entre os investigadores ativos.`);

  activePlayers.forEach(p => {
    if (p.isBot) {
      cardsToDistribute.forEach(c => {
        if (p.cards.includes(c) && !p.notebook.includes(c.name)) {
          p.notebook.push(c.name);
          logBotAction(room, `[REDISTRIBUIÇÃO] ${p.name} recebeu a carta [${c.name}] de ${eliminatedPlayer.name} e anotou no caderno. Total no caderno: ${p.notebook.length}/27.`);
        }
      });

      if (p.hotSuspicion && p.hotSuspicion.suggesterId === eliminatedPlayer.id) {
        const distributedNames = cardsToDistribute.map(c => c.name);
        ['suspect', 'weapon', 'location'].forEach(type => {
          const targetCard = p.hotSuspicion[type];
          if (targetCard && !p.envelopeConfirmed[type]) {
            if (distributedNames.includes(targetCard)) {
              logBotAction(room, `[DESMASCAROU BLEFE] ${p.name} descobriu que ${eliminatedPlayer.name} tinha [${targetCard}] na mão! Pista descartada do envelope.`);
            } else {
              p.envelopeConfirmed[type] = targetCard;
              logBotAction(room, `[CONFIRMAÇÃO DO ENVELOPE] ${p.name} confirmou que ${eliminatedPlayer.name} NÃO possuía [${targetCard}]. Como ninguém na mesa tinha, [${targetCard}] é a carta do envelope!`);
            }
          }
        });
        p.hotSuspicion = null;
      }
    } else {
      io.to(p.id).emit('your_cards', p.cards);
    }
  });
}

// ================= SISTEMA DE TEMPORIZADORES DE JOGADORES HUMANOS =================
// Padrão de 30 segundos para tudo:
// 30 segundos: Lançar dado e mover peão ou Acusação Final
// 30 segundos: Palpitar na sala
// 30 segundos: Refutar carta
function startHumanTimer(room, player, phase, seconds) {
  clearHumanTimer(room);

  room.humanTimerPhase = phase;
  room.humanSecondsLeft = seconds;

  broadcastToRoom(room, 'turn_timer_update', {
    secondsLeft: seconds,
    totalSeconds: seconds,
    phase,
    playerId: player.id,
    playerName: player.name
  });

  room.humanTurnTimer = setInterval(() => {
    room.humanSecondsLeft--;

    if (room.humanSecondsLeft > 0) {
      broadcastToRoom(room, 'turn_timer_tick', {
        secondsLeft: room.humanSecondsLeft,
        phase: room.humanTimerPhase
      });
    } else {
      // Tempo esgotado!
      const expiredPhase = room.humanTimerPhase;
      clearHumanTimer(room);
      handleHumanTimeout(room, player, expiredPhase);
    }
  }, 1000);
}

function clearHumanTimer(room) {
  if (room.humanTurnTimer) {
    clearInterval(room.humanTurnTimer);
    room.humanTurnTimer = null;
  }
  room.humanTimerPhase = null;
  room.humanSecondsLeft = 0;
  broadcastToRoom(room, 'turn_timer_cleared', {});
}

function handleHumanTimeout(room, player, phase) {
  if (room.winner) return;

  if (phase === 'roll_move') {
    const current = room.players[room.turnIndex];
    if (!current || current.id !== player.id) return;

    const activePlayers = room.players.filter(p => !p.eliminated);
    if (activePlayers.length === 1) {
      player.eliminated = true;
      broadcastToRoom(room, 'narrative_log', `Tempo de 30s esgotado para o último detetive ${player.name}! Eliminado da investigação.`);
      nextTurn(room);
      return;
    }

    broadcastToRoom(room, 'narrative_log', `Tempo de 30s para lançar o dado esgotado para ${player.name}! Turno pulado.`);
    nextTurn(room);

  } else if (phase === 'move') {
    const current = room.players[room.turnIndex];
    if (!current || current.id !== player.id) return;

    broadcastToRoom(room, 'narrative_log', `Tempo de 30s para movimentação esgotado para ${player.name}! Turno pulado.`);
    nextTurn(room);

  } else if (phase === 'suggestion') {
    const current = room.players[room.turnIndex];
    if (!current || current.id !== player.id) return;

    broadcastToRoom(room, 'narrative_log', `Tempo de 30s para palpite esgotado para ${player.name}! Turno pulado sem realizar palpite.`);
    nextTurn(room);

  } else if (phase === 'refute') {
    if (room.currentRefutation && room.currentRefutation.respondent.id === player.id) {
      broadcastToRoom(room, 'narrative_log', `Tempo de refutação de 30s de ${player.name} esgotado. Revelando carta automaticamente.`);
      const matches = room.currentRefutation.matches;
      const cardToReveal = matches[Math.floor(Math.random() * matches.length)].name;
      resolveRefuteCardChosen(room, player, cardToReveal, room.currentRefutation.suggesterId, room.currentRefutation.suggestionId);
    }
  }
}

// ================= INICIALIZAÇÃO DE PARTIDA =================
function initGame(room, totalPlayers = 8) {
  totalPlayers = Math.max(3, Math.min(8, totalPlayers));
  const available = getAvailableCharacters(room);
  let botNum = 1;

  // Completa as vagas restantes com bots até atingir totalPlayers
  while (room.players.length < totalPlayers && available.length > 0) {
    const char = available.shift();
    room.players.push({
      id: `bot_${room.id}_${botNum}`,
      name: `Bot ${char.name.split(' ')[0]}`,
      isBot: true,
      character: char,
      cards: [],
      inRoom: null,
      tile: { x: char.startPos.x, y: char.startPos.y },
      secretPassageUses: 0,
      wasDraggedBySuggestion: false,
      eliminated: false,
      notebook: [],
      envelopeConfirmed: { suspect: null, weapon: null, location: null },
      hotSuspicion: null,
      visitedRooms: [],
      lastSuggestedRoom: null
    });
    botNum++;
  }

  // 1. Envelope Super Secreto
  const secretSuspect = shuffle(CHARACTERS)[0].name;
  const secretWeapon = shuffle(WEAPONS)[0];
  const secretLocation = shuffle(LOCATIONS)[0];
  room.envelope = { suspect: secretSuspect, weapon: secretWeapon, location: secretLocation };

  // 2. Embaralhar cartas restantes e distribuir
  let deck = [
    ...CHARACTERS.map(c => ({ type: 'suspeito', name: c.name })).filter(c => c.name !== secretSuspect),
    ...WEAPONS.map(w => ({ type: 'arma', name: w })).filter(w => w.name !== secretWeapon),
    ...LOCATIONS.map(l => ({ type: 'local', name: l })).filter(l => l.name !== secretLocation)
  ];
  deck = shuffle(deck);

  let p = 0;
  while (deck.length > 0) {
    const card = deck.pop();
    room.players[p].cards.push(card);
    if (room.players[p].isBot) room.players[p].notebook.push(card.name);
    p = (p + 1) % room.players.length;
  }

  // 3. Sorteio aleatório via Roleta de quem inicia a partida
  const starterIndex = Math.floor(Math.random() * room.players.length);
  room.turnIndex = starterIndex;
  const starterPlayer = room.players[starterIndex];
  room.started = true;
  room.diceRolledThisTurn = false;
  room.lastDiceValue = 0;

  // Entrega cartas secretas para cada jogador humano
  room.players.forEach(pl => {
    if (!pl.isBot) io.to(pl.id).emit('your_cards', pl.cards);
  });

  initBotLog(room);

  broadcastToRoom(room, 'game_started', getPublicState(room));

  // Dispara a animação da roleta para todos os clientes na sala
  broadcastToRoom(room, 'roulette_spin', {
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      character: {
        id: p.character.id,
        name: p.character.name,
        role: p.character.role,
        color: p.character.color
      }
    })),
    starterIndex: starterIndex,
    starterName: starterPlayer.name,
    starterCharName: starterPlayer.character.name
  });

  // Aguarda a roleta terminar a rotação antes de ativar o 1º turno
  setTimeout(() => {
    if (room.winner) return;
    broadcastToRoom(room, 'turn_changed', getPublicState(room));

    const current = room.players[room.turnIndex];
    if (current.isBot) {
      checkBotTurn(room);
    } else {
      // 30 segundos para o jogador humano lançar o dado e movimentar ou fazer acusação final
      startHumanTimer(room, current, 'roll_move', 30);
    }
  }, 5200);
}

// ================= GERADOR DE EPÍLOGO NARRATIVO IMERSIVO =================
function generateEpilogue(room, winnerName) {
  const isUnsolved = !winnerName || winnerName.toLowerCase().includes('nenhum');
  const hasWinner = !isUnsolved;
  const { suspect, weapon, location } = room.envelope;

  if (isUnsolved) {
    const detectiveDeduction = `Entre deduções precipitadas, blefes arriscados e acusações sem provas, os investigadores foram caindo em contradições um a um. Conforme as pistas falsas se acumulavam e as teorias desmoronavam, todos os detetives acabaram eliminados da apuração. A delegacia silenciou, os cadernos de anotações foram arquivados em branco e o caso foi tragado pela névoa da cidade sem que nenhum investigador conseguisse apontar o verdadeiro autor do crime.`;

    const crimeResolution = `Com o fracasso dos investigadores e o encerramento forçado do inquérito, o laudo lacrado do envelope finalmente veio à tona: foi ${suspect} quem atraiu Odete Rolemã até o(a) [${location}] e utilizou ${weapon} para dar o golpe fatal na magnata. Sem ninguém capaz de formular uma acusação certeira a tempo, o culpado limpou seus rastros, apoderou-se do que desejava e sumiu para sempre nas sombras da metrópole. O assassino segue livre, e a morte de Odete Rolemã tornou-se mais um mistério urbano sem punição.`;

    return {
      hasWinner: false,
      charName: 'Nenhum',
      charRole: 'Nenhum',
      badgeText: 'CASO NÃO RESOLVIDO',
      modalTitle: 'O Crime Ficou Impune!',
      winnerBanner: 'Nenhum detetive desvendou o mistério — todos foram eliminados',
      deductionTitle: 'Como a Investigação Fracassou:',
      crimeTitle: 'A Resolução do Assassinato:',
      detectiveDeduction,
      crimeResolution,
      fullStory: `${detectiveDeduction}\n\n${crimeResolution}`
    };
  }

  const winnerPlayer = room.players.find(p => p.name === winnerName);
  const charRole = winnerPlayer ? winnerPlayer.character.role : 'Investigador';
  const charName = winnerPlayer ? winnerPlayer.character.name : winnerName.replace(/^Bot\s+/i, '');

  let detectiveDeduction = '';
  switch (charName) {
    case 'Fahur':
      detectiveDeduction = `Com seu inabalável instinto policial militar e um faro implacável para contradições, o Sargento Fahur bateu firme na mesa, cruzou os relatórios das patrulhas noturnas e encontrou a evidência crucial que desmoronou o álibi do assassino. "Com a lei e a verdade não se brinca!", bradou Fahur ao algemar o culpado.`;
      break;
    case 'Toguro':
      detectiveDeduction = `Aplicando sua lendária 'disciplina monstra' e analisando a biomecânica da cena do crime com olhar cirúrgico de anatomista, Toguro concluiu que apenas uma postura e empunhadura específicas poderiam manusear a arma naquele ângulo. O gigante ergueu a prova decisiva diante de todos e pôs um ponto final no mistério.`;
      break;
    case 'Jacão':
      detectiveDeduction = `Acostumado à pressão insana de cozinhas estreladas e à precisão de cada tempero e corte, Jacão percebeu na hora o detalhe fora de lugar que todos ignoraram. Com sua autoridade ríspida e inquestionável, apontou o dedo para o assassino: "Você achou que ia me enganar? Isso aqui é um desastre de mentiras!".`;
      break;
    case 'Moraes':
      detectiveDeduction = `Com a oratória fulminante de quem domina os códigos e a psicologia do réu, o Advogado Moraes desmontou cada brecha do depoimento forjado. Conduziu uma sustentação oral brilhante que encurralou o algoz diante dos fatos, transformando indícios soltos em prova material irrefutável.`;
      break;
    case 'Carminha':
      detectiveDeduction = `Como uma diva consagrada dos palcos que reconhece qualquer encenação falsa a quilômetros de distância, Carminha flagrou a respiração vacilante e o olhar trêmulo do assassino. Em um monólogo triunfal e dramático digno de aplausos em pé, ela desmascarou o teatro farsesco do algoz perante a cidade inteira.`;
      break;
    case 'Peçanha':
      detectiveDeduction = `Conhecedor veterano de cada ponto cego de vigilância, beco escuro e atalho secreto da cidade, o Segurança Peçanha reconstituiu o trajeto exato da fuga. Ele encontrou vestígios ocultos que o assassino julgava estarem apagados e apresentou a peça-chave definitiva para o caso.`;
      break;
    case 'Jailson':
      detectiveDeduction = `Com a sabedoria prática de quem compreende a fundo o funcionamento de cada engrenagem, o Mecânico Jailson examinou os danos materiais e ranhuras milimétricas deixadas na cena. Ajustando a verdade peça por peça com precisão cirúrgica, ele não deixou escapar nenhum detalhe da execução.`;
      break;
    case 'Tadalafila':
      detectiveDeduction = `Com seu olhar clínico apurado e profundo domínio forense, o Doutor Tadalafila analisou os laudos periciais e identificou a assinatura do ataque sem deixar margem para dúvidas. Um diagnóstico irretocável que curou a cidade da incerteza e apontou o verdadeiro culpado.`;
      break;
    default:
      detectiveDeduction = `Com uma sagacidade ímpar e raciocínio lógico brilhante, ${winnerName} cruzou cada pista, confrontou cada contradição e montou o quebra-cabeça que assombrava a cidade, desmascarando o autor do crime de forma triunfal!`;
      break;
  }

  const crimeResolution = `Ficou cabalmente provado que ${suspect} atraiu a magnata Odete Rolemã até o(a) [${location}]. Tomado pelo desespero de suas dívidas, chantagens e temendo a exposição iminente de seus segredos, ${suspect} empunhou ${weapon} para ceifar a vida da bilionária e tentar sumir com seu testamento milionário. Diante da dedução magistral apresentada pelo investigador, o assassino desabou em confissão e foi imediatamente conduzido à prisão, devolvendo a tranquilidade à cidade!`;

  return {
    hasWinner: true,
    charName,
    charRole,
    badgeText: 'CASO RESOLVIDO',
    modalTitle: 'Justiça por Odete Rolemã!',
    winnerBanner: `Detetive Vencedor(a): ${winnerName}`,
    deductionTitle: 'Como o Caso Foi Solucionado:',
    crimeTitle: 'A Resolução do Assassinato:',
    detectiveDeduction,
    crimeResolution,
    fullStory: `${detectiveDeduction}\n\n${crimeResolution}`
  };
}

function endGame(room, winnerName) {
  room.winner = winnerName;
  clearHumanTimer(room);

  const epilogue = generateEpilogue(room, winnerName);
  const logMsg = epilogue.hasWinner
    ? `[FIM DE JOGO] Vitória de ${winnerName}! Solução do envelope: [${room.envelope.suspect}] com [${room.envelope.weapon}] no(a) [${room.envelope.location}].`
    : `[FIM DE JOGO] Partida encerrada sem vencedor! Solução do envelope: [${room.envelope.suspect}] com [${room.envelope.weapon}] no(a) [${room.envelope.location}]. O assassino segue livre.`;
  logBotAction(room, logMsg);

  broadcastToRoom(room, 'game_over', {
    winner: winnerName,
    envelope: room.envelope,
    epilogue: epilogue
  });

  // Reseta a sala para nova partida
  setTimeout(() => {
    room.started = false;
    room.players = [];
    room.envelope = {};
    room.turnIndex = 0;
    room.diceRolledThisTurn = false;
    room.lastDiceValue = 0;
    room.winner = null;
    room.currentSuggestion = null;
    room.currentRefutation = null;

    broadcastToRoom(room, 'initial_character_list', {
      roomId: room.id,
      allCharacters: CHARACTERS,
      available: CHARACTERS,
      roomsConfig: ROOMS_CONFIG,
      secretPassages: SECRET_PASSAGES,
      gridMatrix: GRID_MATRIX,
      doorsByCell: DOORS_BY_CELL,
      boardData: BOARD_DATA
    });
    broadcastToRoom(room, 'lobby_update', { roomId: room.id, players: [], availableCharacters: CHARACTERS });
  }, 2000);
}

// Avança para o próximo turno da mesa
function nextTurn(room) {
  if (room.winner) return;
  clearHumanTimer(room);

  const active = room.players.filter(p => !p.eliminated);
  if (active.length === 0) {
    endGame(room, 'Nenhum jogador (todos foram eliminados)');
    return;
  }

  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
  } while (room.players[room.turnIndex].eliminated);

  room.diceRolledThisTurn = false;
  room.lastDiceValue = 0;
  room.currentSuggestion = null;
  room.currentRefutation = null;

  broadcastToRoom(room, 'turn_changed', getPublicState(room));

  const current = room.players[room.turnIndex];
  if (current.isBot) {
    checkBotTurn(room);
  } else {
    if (active.length === 1) {
      broadcastToRoom(room, 'narrative_log', `Atenção: ${current.name} é o último detetive restante na mesa e deve fazer sua acusação final agora com as pistas que possui!`);
    }
    // Regra: 30 segundos para o jogador humano lançar o dado e movimentar ou fazer acusação final
    startHumanTimer(room, current, 'roll_move', 30);
  }
}

// Acusação formal por bot
function executeBotAccusation(room, bot, suspect, weapon, location) {
  const speed = getBotSpeedConfig(room);
  logBotAction(room, `[ACUSAÇÃO FORMAL] ${bot.name} reuniu pistas suficientes e fez uma ACUSAÇÃO: [${suspect}] com [${weapon}] no(a) [${location}].`);
  broadcastToRoom(room, 'narrative_log', `${bot.name} reuniu todas as pistas e fez uma ACUSAÇÃO FORMAL: ${suspect} com ${weapon} no(a) [${location}]!`);

  setTimeout(() => {
    const isCorrect =
      room.envelope.suspect === suspect &&
      room.envelope.weapon === weapon &&
      room.envelope.location === location;

    if (isCorrect) {
      logBotAction(room, `[ACUSAÇÃO CORRETA] ${bot.name} ACERTOU o mistério e venceu o jogo!`);
      endGame(room, bot.name);
    } else {
      logBotAction(room, `[ACUSAÇÃO ERRADA] ${bot.name} errou o envelope e foi ELIMINADO! Suas cartas foram redistribuídas.`);
      bot.eliminated = true;
      bot.inRoom = null;
      broadcastToRoom(room, 'narrative_log', `${bot.name} errou a acusação e foi ELIMINADO!`);
      redistributeCards(room, bot);
      broadcastToRoom(room, 'board_sync', getPublicState(room));
      setTimeout(() => nextTurn(room), speed.corridorTurnDelay);
    }
  }, speed.accusationDelay);
}

// Inteligência e comportamento dos bots
function checkBotTurn(room) {
  const current = room.players[room.turnIndex];
  if (!current || !current.isBot || current.eliminated) return;

  const speed = getBotSpeedConfig(room);

  setTimeout(() => {
    if (room.winner) return;

    const activePlayers = room.players.filter(p => !p.eliminated);

    // Regra 1 contra 1: se for o ÚLTIMO detetive restante na mesa (penúltimo errou),
    // é OBRIGADO a dar a acusação final imediatamente com base nas informações obtidas até o momento!
    if (activePlayers.length === 1) {
      const unknownSuspects = CHARACTERS.map(c => c.name).filter(n => !current.notebook.includes(n));
      const unknownWeapons = WEAPONS.filter(w => !current.notebook.includes(w));
      const unknownLocations = LOCATIONS.filter(l => !current.notebook.includes(l));

      const targetSuspect = (current.envelopeConfirmed && current.envelopeConfirmed.suspect) ||
        (unknownSuspects.length > 0 ? unknownSuspects[Math.floor(Math.random() * unknownSuspects.length)] : CHARACTERS[0].name);

      const targetWeapon = (current.envelopeConfirmed && current.envelopeConfirmed.weapon) ||
        (unknownWeapons.length > 0 ? unknownWeapons[Math.floor(Math.random() * unknownWeapons.length)] : WEAPONS[0]);

      const targetLocation = (current.envelopeConfirmed && current.envelopeConfirmed.location) ||
        (unknownLocations.length > 0 ? unknownLocations[Math.floor(Math.random() * unknownLocations.length)] : LOCATIONS[0]);

      logBotAction(room, `[ÚLTIMO INVESTIGADOR] ${current.name} é o único detetive restante e é obrigado a fazer a acusação final com base nas informações obtidas até agora! Acusa: [${targetSuspect}] com [${targetWeapon}] no(a) [${targetLocation}].`);
      broadcastToRoom(room, 'narrative_log', `${current.name} é o último detetive restante e faz sua acusação final: [${targetSuspect}] com [${targetWeapon}] no(a) [${targetLocation}]!`);
      executeBotAccusation(room, current, targetSuspect, targetWeapon, targetLocation);
      return;
    }

    // 1. O Bot tem certeza da solução para acusar?
    const unknownSuspects = CHARACTERS.map(c => c.name).filter(n => !current.notebook.includes(n));
    const unknownWeapons = WEAPONS.filter(w => !current.notebook.includes(w));
    const unknownLocations = LOCATIONS.filter(l => !current.notebook.includes(l));

    const targetSuspect = (current.envelopeConfirmed && current.envelopeConfirmed.suspect) ||
      (unknownSuspects.length === 1 ? unknownSuspects[0] : null);
    const targetWeapon = (current.envelopeConfirmed && current.envelopeConfirmed.weapon) ||
      (unknownWeapons.length === 1 ? unknownWeapons[0] : null);
    const targetLocation = (current.envelopeConfirmed && current.envelopeConfirmed.location) ||
      (unknownLocations.length === 1 ? unknownLocations[0] : null);

    if (targetSuspect && targetWeapon && targetLocation) {
      logBotAction(room, `[RESOLUÇÃO ANTECIPADA] ${current.name} confirmou todos os 3 alvos do envelope: [${targetSuspect} + ${targetWeapon} + ${targetLocation}] e parte para a vitória!`);
      executeBotAccusation(room, current, targetSuspect, targetWeapon, targetLocation);
      return;
    }

    // 2. Verificar passagem secreta vantajosa
    if (current.inRoom && SECRET_PASSAGES[current.inRoom] && current.secretPassageUses < 3) {
      const secretDest = SECRET_PASSAGES[current.inRoom];
      const neverVisited = !current.visitedRooms.includes(secretDest);
      const notInNotebook = !current.notebook.includes(secretDest);

      if (neverVisited && notInNotebook) {
        current.secretPassageUses++;
        current.inRoom = secretDest;
        current.tile = { x: ROOMS_CONFIG[secretDest].x + 2, y: ROOMS_CONFIG[secretDest].y + 2 };
        current.wasDraggedBySuggestion = false;

        logBotAction(room, `[PASSAGEM SECRETA] ${current.name} usou passagem secreta para [${secretDest}].`);
        broadcastToRoom(room, 'narrative_log', `${current.name} usou a passagem secreta para [${secretDest}]!`);
        broadcastToRoom(room, 'board_sync', getPublicState(room));
        botMakeSuggestion(room, current, secretDest);
        return;
      }
    }

    // 3. O Bot gira o dado
    const dice = rollDice();
    room.diceRolledThisTurn = true;
    room.lastDiceValue = dice;

    broadcastToRoom(room, 'dice_rolled', { roller: current.name, value: dice });
    broadcastToRoom(room, 'narrative_log', `${current.name} girou o dado e tirou [ ${dice} ]!`);

    setTimeout(() => {
      if (room.winner) return;

      // 4. Calcular alcance real com BFS no grid 20x20
      const { reachableRooms, reachableTiles } = calculateReachablePositionsForBot(room, current, dice);
      const fromLoc = current.inRoom ? `[${current.inRoom}]` : `corredor (${current.tile.x}, ${current.tile.y})`;

      if (reachableRooms.length > 0) {
        const chosenRoom = pickBestRoom(room, current, reachableRooms);
        const targetConf = ROOMS_CONFIG[chosenRoom];
        current.inRoom = chosenRoom;
        current.tile = { x: targetConf.x + 2, y: targetConf.y + 2 };

        logBotAction(room, `[MOVIMENTO] ${current.name} tirou [${dice}] no dado e entrou no(a) [${chosenRoom}].`);
        broadcastToRoom(room, 'narrative_log', `${current.name} tirou ${dice}, saiu do ${fromLoc} e entrou no(a) [${chosenRoom}].`);
        broadcastToRoom(room, 'board_sync', getPublicState(room));
        botMakeSuggestion(room, current, chosenRoom);
      } else {
        if (reachableTiles.length > 0) {
          const targetDest = pickBestDestination(room, current);
          const targetDoor = ROOMS_CONFIG[targetDest].doors[0];

          let bestTile = reachableTiles[0];
          let minDistance = Infinity;

          reachableTiles.forEach(t => {
            const dist = Math.abs(t.x - targetDoor.x) + Math.abs(t.y - targetDoor.y);
            if (dist < minDistance) {
              minDistance = dist;
              bestTile = t;
            }
          });

          current.inRoom = null;
          current.tile = { x: bestTile.x, y: bestTile.y };
          logBotAction(room, `[MOVIMENTO] ${current.name} tirou [${dice}] no dado e parou no corredor (${bestTile.x}, ${bestTile.y}) rumo a [${targetDest}].`);
          broadcastToRoom(room, 'narrative_log', `${current.name} tirou ${dice}, saiu do ${fromLoc} e parou no corredor (${bestTile.x}, ${bestTile.y}). Rumo a [${targetDest}].`);
        } else {
          logBotAction(room, `[BLOQUEADO] ${current.name} tirou [${dice}] no dado, mas as casas estavam bloqueadas.`);
          broadcastToRoom(room, 'narrative_log', `${current.name} tirou ${dice}, mas o caminho estava bloqueado. Aguarda a próxima rodada.`);
        }

        broadcastToRoom(room, 'board_sync', getPublicState(room));
        setTimeout(() => nextTurn(room), speed.corridorTurnDelay);
      }
    }, speed.diceDelay);
  }, speed.startDelay);
}

function pickBestRoom(room, bot, reachableRooms) {
  if (bot.hotSuspicion && bot.hotSuspicion.location && !bot.notebook.includes(bot.hotSuspicion.location) && reachableRooms.includes(bot.hotSuspicion.location)) {
    return bot.hotSuspicion.location;
  }

  const unvisitedInNotebook = reachableRooms.filter(r => !bot.visitedRooms.includes(r) && !bot.notebook.includes(r));
  if (unvisitedInNotebook.length > 0) {
    return unvisitedInNotebook[Math.floor(Math.random() * unvisitedInNotebook.length)];
  }

  const notInNotebook = reachableRooms.filter(r => !bot.notebook.includes(r));
  if (notInNotebook.length > 0) {
    return notInNotebook[Math.floor(Math.random() * notInNotebook.length)];
  }

  const unvisitedAny = reachableRooms.filter(r => !bot.visitedRooms.includes(r));
  if (unvisitedAny.length > 0) {
    return unvisitedAny[Math.floor(Math.random() * unvisitedAny.length)];
  }

  return reachableRooms[Math.floor(Math.random() * reachableRooms.length)];
}

function pickBestDestination(room, bot) {
  if (bot.hotSuspicion && bot.hotSuspicion.location && !bot.notebook.includes(bot.hotSuspicion.location)) {
    return bot.hotSuspicion.location;
  }

  const unvisitedUnconfirmed = LOCATIONS.filter(l => !bot.visitedRooms.includes(l) && !bot.notebook.includes(l));
  if (unvisitedUnconfirmed.length > 0) {
    return unvisitedUnconfirmed[Math.floor(Math.random() * unvisitedUnconfirmed.length)];
  }

  const unconfirmed = LOCATIONS.filter(l => !bot.notebook.includes(l));
  if (unconfirmed.length > 0) {
    return unconfirmed[Math.floor(Math.random() * unconfirmed.length)];
  }

  return LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
}

function botMakeSuggestion(room, bot, roomName) {
  const speed = getBotSpeedConfig(room);

  if (!bot.visitedRooms.includes(roomName)) {
    bot.visitedRooms.push(roomName);
  }
  bot.lastSuggestedRoom = roomName;

  const unknownSuspects = CHARACTERS.map(c => c.name).filter(n => !bot.notebook.includes(n));
  const unknownWeapons = WEAPONS.filter(w => !bot.notebook.includes(w));

  let suspect = null;
  let weapon = null;
  let isTestingBluff = false;

  if (bot.hotSuspicion && bot.hotSuspicion.location === roomName) {
    isTestingBluff = true;
    suspect = !bot.notebook.includes(bot.hotSuspicion.suspect)
      ? bot.hotSuspicion.suspect
      : (unknownSuspects.length > 0 ? unknownSuspects[Math.floor(Math.random() * unknownSuspects.length)] : CHARACTERS[0].name);

    weapon = !bot.notebook.includes(bot.hotSuspicion.weapon)
      ? bot.hotSuspicion.weapon
      : (unknownWeapons.length > 0 ? unknownWeapons[Math.floor(Math.random() * unknownWeapons.length)] : WEAPONS[0]);
  } else {
    const isBluffing = Math.random() < 0.3;
    const handSuspects = bot.cards.filter(c => c.type === 'suspeito').map(c => c.name);
    const handWeapons = bot.cards.filter(c => c.type === 'arma').map(c => c.name);

    if (isBluffing) {
      suspect = (handSuspects.length > 0 && Math.random() > 0.5)
        ? handSuspects[Math.floor(Math.random() * handSuspects.length)]
        : (unknownSuspects.length > 0 ? unknownSuspects[Math.floor(Math.random() * unknownSuspects.length)] : CHARACTERS[0].name);

      weapon = (handWeapons.length > 0 && Math.random() > 0.5)
        ? handWeapons[Math.floor(Math.random() * handWeapons.length)]
        : (unknownWeapons.length > 0 ? unknownWeapons[Math.floor(Math.random() * unknownWeapons.length)] : WEAPONS[0]);
    } else {
      suspect = unknownSuspects.length > 0
        ? unknownSuspects[Math.floor(Math.random() * unknownSuspects.length)]
        : CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].name;

      weapon = unknownWeapons.length > 0
        ? unknownWeapons[Math.floor(Math.random() * unknownWeapons.length)]
        : WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
    }
  }

  const hasSuspectInHand = bot.cards.some(c => c.name === suspect);
  const hasWeaponInHand = bot.cards.some(c => c.name === weapon);
  const hasRoomInHand = bot.cards.some(c => c.name === roomName);
  const isActualBluff = hasSuspectInHand || hasWeaponInHand || hasRoomInHand;

  if (isTestingBluff) {
    logBotAction(room, `[TESTE DE BLEFE] ${bot.name} palpitou [${suspect} + ${weapon} + ${roomName}] para testar se ${bot.hotSuspicion.suggesterName} blefou no palpite anterior.`);
  } else if (isActualBluff) {
    bot.bluffCount = (bot.bluffCount || 0) + 1;
    const cardsBluffed = [];
    if (hasSuspectInHand) cardsBluffed.push(`Suspeito (${suspect})`);
    if (hasWeaponInHand) cardsBluffed.push(`Arma (${weapon})`);
    if (hasRoomInHand) cardsBluffed.push(`Local (${roomName})`);
    logBotAction(room, `[BLEFE #${bot.bluffCount}] ${bot.name} palpitou [${suspect} + ${weapon} + ${roomName}]. Cartas que já tem na mão: ${cardsBluffed.join(', ')}. Conhecimento: ${bot.notebook.length}/27.`);
  } else {
    logBotAction(room, `[PALPITE] ${bot.name} palpitou [${suspect} + ${weapon} + ${roomName}] (Busca genuína por cartas). Conhecimento: ${bot.notebook.length}/27.`);
  }

  setTimeout(() => {
    executeSuggestion(room, bot.id, suspect, weapon, roomName);
  }, speed.suggestionDelay);
}

// Execução de palpite (humano ou bot)
function executeSuggestion(room, suggesterId, suspect, weapon, location) {
  const suggester = room.players.find(p => p.id === suggesterId);
  if (!suggester) return;

  clearHumanTimer(room);

  const suggestionId = 'sugg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  room.currentSuggestion = {
    suggestionId,
    suggesterId: suggester.id,
    cardsSuggested: [suspect, weapon, location]
  };

  broadcastToRoom(room, 'suggestion_broadcast', {
    suggestionId,
    suggesterId: suggester.id,
    suggesterName: suggester.name,
    suspect,
    weapon,
    location,
    players: getPublicState(room).players
  });

  const sIdx = room.players.findIndex(p => p.id === suggesterId);
  const queue = [];
  for (let i = 1; i < room.players.length; i++) {
    queue.push(room.players[(sIdx + i) % room.players.length]);
  }

  resolveRefutation(room, suggester, queue, [suspect, weapon, location], suggestionId);
}

// Resolução de refutação em cadeia
function resolveRefutation(room, suggester, queue, cardsSuggested, suggestionId) {
  const speed = getBotSpeedConfig(room);

  if (queue.length === 0) {
    if (suggester.isBot) {
      cardsSuggested.forEach(cardName => {
        const hasInHand = suggester.cards.some(c => c.name === cardName);
        if (!hasInHand) {
          if (CHARACTERS.some(c => c.name === cardName)) {
            suggester.envelopeConfirmed.suspect = cardName;
            logBotAction(room, `[PISTA DE OURO] ${suggester.name} confirmou que o Suspeito [${cardName}] está no envelope (palpitou e ninguém na mesa possuía a carta)!`);
          } else if (WEAPONS.includes(cardName)) {
            suggester.envelopeConfirmed.weapon = cardName;
            logBotAction(room, `[PISTA DE OURO] ${suggester.name} confirmou que a Arma [${cardName}] está no envelope (palpitou e ninguém na mesa possuía a carta)!`);
          } else if (LOCATIONS.includes(cardName)) {
            suggester.envelopeConfirmed.location = cardName;
            logBotAction(room, `[PISTA DE OURO] ${suggester.name} confirmou que o Local [${cardName}] está no envelope (palpitou e ninguém na mesa possuía a carta)!`);
          }
        }
      });
    }

    room.players.forEach(p => {
      if (p.isBot && p.id !== suggester.id) {
        p.hotSuspicion = {
          suggesterId: suggester.id,
          suggesterName: suggester.name,
          suspect: cardsSuggested[0],
          weapon: cardsSuggested[1],
          location: cardsSuggested[2]
        };
        logBotAction(room, `[PISTA QUENTE] ${p.name} registrou que ninguém refutou [${cardsSuggested.join(' + ')}]. Objetivo: averiguar se ${suggester.name} blefou ou se este é o envelope!`);
      }
    });

    broadcastToRoom(room, 'narrative_log', `Ninguém tinha cartas para refutar o palpite de ${suggester.name}!`);
    broadcastToRoom(room, 'suggestion_resolved', {
      suggestionId,
      suggesterId: suggester.id,
      suggesterName: suggester.name,
      hasRefuted: false,
      respondentId: null,
      respondentName: null
    });

    setTimeout(() => nextTurn(room), speed.refuteDelay);
    return;
  }

  const respondent = queue.shift();
  if (respondent.id === suggester.id || respondent.eliminated) {
    resolveRefutation(room, suggester, queue, cardsSuggested, suggestionId);
    return;
  }

  const matches = respondent.cards.filter(c => cardsSuggested.includes(c.name));

  if (matches.length > 0) {
    if (respondent.isBot) {
      const cardRevealed = matches[Math.floor(Math.random() * matches.length)].name;
      logBotAction(room, `[REFUTAÇÃO] ${respondent.name} possuía cartas do palpite e mostrou [${cardRevealed}] secretamente para ${suggester.name}.`);

      if (!suggester.isBot) {
        io.to(suggester.id).emit('card_revealed_private', { from: respondent.name, card: cardRevealed, suggestionId });
      } else {
        if (!suggester.notebook.includes(cardRevealed)) {
          suggester.notebook.push(cardRevealed);
          logBotAction(room, `[INFO OBTIDA] ${suggester.name} anotou a carta revelada [${cardRevealed}]. Caderno: ${suggester.notebook.length}/27.`);
        }
      }

      // Desmascaramento de blefe por outros bots
      room.players.forEach(p => {
        if (p.isBot && p.hotSuspicion && p.hotSuspicion.suggesterId === respondent.id) {
          if ([p.hotSuspicion.suspect, p.hotSuspicion.weapon, p.hotSuspicion.location].includes(cardRevealed)) {
            if (!p.notebook.includes(cardRevealed)) p.notebook.push(cardRevealed);
            logBotAction(room, `[DESMASCAROU BLEFE] ${p.name} descobriu que ${respondent.name} possuía [${cardRevealed}] na mão! Carta descartada do envelope.`);
          }
        }
      });

      // Dedução passiva para outros bots observadores
      room.players.forEach(p => {
        if (p.isBot && p.id !== respondent.id && p.id !== suggester.id) {
          const knownCards = cardsSuggested.filter(c => p.notebook.includes(c));
          if (knownCards.length === 2) {
            const unknownCard = cardsSuggested.find(c => !p.notebook.includes(c));
            if (unknownCard && !p.notebook.includes(unknownCard)) {
              p.notebook.push(unknownCard);
              logBotAction(room, `[DEDUÇÃO PASSIVA] ${p.name} observou refutação de ${respondent.name} a ${suggester.name}. Conhecia 2 cartas e deduziu a 3ª: [${unknownCard}]! Caderno: ${p.notebook.length}/27.`);
            }
          }
        }
      });

      broadcastToRoom(room, 'narrative_log', `${respondent.name} refutou o palpite mostrando 1 carta secretamente para ${suggester.name}.`);
      broadcastToRoom(room, 'suggestion_resolved', {
        suggestionId,
        suggesterId: suggester.id,
        suggesterName: suggester.name,
        hasRefuted: true,
        respondentId: respondent.id,
        respondentName: respondent.name
      });
      const delay = (suggester && !suggester.isBot) ? 4500 : speed.refuteDelay;
      setTimeout(() => nextTurn(room), delay);

    } else {
      // Jogador humano tem cartas: salva estado e abre opção para ele escolher (com timer de 20s)
      room.currentRefutation = {
        respondent,
        suggesterId: suggester.id,
        suggestionId,
        matches
      };

      broadcastToRoom(room, 'narrative_log', `Aguardando ${respondent.name} verificar suas cartas para refutar...`);
      io.to(respondent.id).emit('must_refute', {
        cards: matches,
        suggesterName: suggester.name,
        suggesterId: suggester.id,
        suggestionId
      });

      startHumanTimer(room, respondent, 'refute', 30);
    }
  } else {
    // Se o jogador NÃO possui carta para refutar:
    // Avança automaticamente para o próximo jogador/bot da vez até possuir a carta (conforme solicitado)
    if (respondent.isBot) {
      logBotAction(room, `[SEM CARTAS] ${respondent.name} não possuía nenhuma das cartas do palpite [${cardsSuggested.join(', ')}].`);
    }

    room.players.forEach(p => {
      if (p.isBot && p.hotSuspicion && p.hotSuspicion.suggesterId === respondent.id) {
        ['suspect', 'weapon', 'location'].forEach(type => {
          const cardName = p.hotSuspicion[type];
          if (cardName && cardsSuggested.includes(cardName) && !p.envelopeConfirmed[type]) {
            p.envelopeConfirmed[type] = cardName;
            logBotAction(room, `[CONFIRMAÇÃO DO ENVELOPE] ${p.name} comprovou que ${respondent.name} NÃO possui [${cardName}] na mão. Logo, [${cardName}] pertence ao envelope!`);
          }
        });
      }
    });

    broadcastToRoom(room, 'narrative_log', `${respondent.name} não possui nenhuma das cartas. Perguntando ao próximo...`);
    setTimeout(() => {
      resolveRefutation(room, suggester, queue, cardsSuggested, suggestionId);
    }, speed.refuteDelay / 2);
  }
}

// Resolução quando o humano seleciona qual carta mostrar (ou por timeout de 20s)
function resolveRefuteCardChosen(room, respondent, cardName, suggesterId, suggestionId) {
  clearHumanTimer(room);
  room.currentRefutation = null;

  const suggester = room.players.find(p => p.id === suggesterId);
  const speed = getBotSpeedConfig(room);

  if (suggester) {
    if (!suggester.isBot) {
      io.to(suggester.id).emit('card_revealed_private', { from: respondent.name, card: cardName, suggestionId });
    } else {
      if (!suggester.notebook.includes(cardName)) {
        suggester.notebook.push(cardName);
        logBotAction(room, `[INFO OBTIDA] ${suggester.name} recebeu a carta [${cardName}] de ${respondent.name} (humano) e anotou no caderno. Total: ${suggester.notebook.length}/27.`);
      }
    }
  }

  const cardsSuggested = (room.currentSuggestion && room.currentSuggestion.suggestionId === suggestionId)
    ? room.currentSuggestion.cardsSuggested
    : [];

  if (cardsSuggested && cardsSuggested.length === 3) {
    room.players.forEach(p => {
      if (p.isBot && p.id !== respondent.id && p.id !== (suggester ? suggester.id : suggesterId)) {
        const knownCards = cardsSuggested.filter(c => p.notebook.includes(c));
        if (knownCards.length === 2) {
          const unknownCard = cardsSuggested.find(c => !p.notebook.includes(c));
          if (unknownCard && !p.notebook.includes(unknownCard)) {
            p.notebook.push(unknownCard);
            logBotAction(room, `[DEDUÇÃO PASSIVA] ${p.name} observou refutação de ${respondent.name} (humano). Deduziu a 3ª carta: [${unknownCard}]! Caderno: ${p.notebook.length}/27.`);
          }
        }
      }
    });
  }

  room.players.forEach(p => {
    if (p.isBot && p.hotSuspicion && p.hotSuspicion.suggesterId === respondent.id) {
      if ([p.hotSuspicion.suspect, p.hotSuspicion.weapon, p.hotSuspicion.location].includes(cardName)) {
        if (!p.notebook.includes(cardName)) p.notebook.push(cardName);
        logBotAction(room, `[DESMASCAROU BLEFE] ${p.name} descobriu que ${respondent.name} (humano) possuía [${cardName}] na mão! Carta descartada do envelope.`);
      }
    }
  });

  broadcastToRoom(room, 'narrative_log', `${respondent.name} mostrou 1 carta secretamente para ${suggester ? suggester.name : 'o investigador'}.`);
  broadcastToRoom(room, 'suggestion_resolved', {
    suggestionId,
    suggesterId: suggester ? suggester.id : suggesterId,
    suggesterName: suggester ? suggester.name : 'o investigador',
    hasRefuted: true,
    respondentId: respondent.id,
    respondentName: respondent.name
  });
  const delay = (suggester && !suggester.isBot) ? 4500 : speed.refuteDelay;
  setTimeout(() => nextTurn(room), delay);
}

// ================= GERENCIAMENTO DE SOCKETS E ROTAS =================
io.on('connection', (socket) => {
  let userRoomId = 'sala-principal';

  // O cliente requisita entrar ou registrar sala
  socket.on('join_room_request', ({ roomId }) => {
    if (roomId && typeof roomId === 'string') {
      userRoomId = roomId.trim();
    }
    socket.roomId = userRoomId;
    socket.join(userRoomId);
    const room = getRoom(userRoomId);

    // Se a partida anterior já terminou e não há humanos
    if (room.winner || (room.started && room.players.filter(p => !p.isBot).length === 0)) {
      room.started = false;
      room.players = [];
      room.winner = null;
    }

    socket.emit('initial_character_list', {
      roomId: room.id,
      allCharacters: CHARACTERS,
      available: getAvailableCharacters(room),
      roomsConfig: ROOMS_CONFIG,
      secretPassages: SECRET_PASSAGES,
      gridMatrix: GRID_MATRIX,
      doorsByCell: DOORS_BY_CELL,
      boardData: BOARD_DATA
    });

    socket.emit('lobby_update', {
      roomId: room.id,
      hostId: room.hostId,
      players: room.players,
      availableCharacters: getAvailableCharacters(room)
    });
  });

  socket.on('join_lobby', ({ name, characterId, roomId }) => {
    const rId = roomId || socket.roomId || userRoomId;
    socket.roomId = rId;
    socket.join(rId);
    const room = getRoom(rId);

    // Permitir até 8 jogadores humanos na sala
    if (room.started || room.players.length >= 8) {
      socket.emit('error_message', 'A sala já está cheia ou a partida já foi iniciada!');
      return;
    }

    const available = getAvailableCharacters(room);
    const chosen = available.find(c => c.id === characterId);
    if (!chosen) {
      socket.emit('error_message', 'Esse personagem já foi escolhido por outro detetive!');
      return;
    }

    const isFirstHuman = room.players.filter(p => !p.isBot).length === 0;
    if (isFirstHuman || !room.hostId) {
      room.hostId = socket.id;
    }

    const player = {
      id: socket.id,
      name: (name && name.trim()) ? name.trim() : `Investigador ${room.players.length + 1}`,
      isBot: false,
      isHost: (room.hostId === socket.id),
      character: chosen,
      cards: [],
      inRoom: null,
      tile: { x: chosen.startPos.x, y: chosen.startPos.y },
      secretPassageUses: 0,
      wasDraggedBySuggestion: false,
      eliminated: false,
      notebook: []
    };

    room.players.push(player);
    socket.emit('player_assigned', player);
    broadcastToRoom(room, 'lobby_update', {
      roomId: room.id,
      hostId: room.hostId,
      players: room.players,
      availableCharacters: getAvailableCharacters(room)
    });
  });

  socket.on('request_start_game', (data) => {
    const room = getRoom(socket.roomId);
    const hostPlayer = room.players.find(p => !p.isBot && p.isHost) || room.players.find(p => !p.isBot);
    if (!hostPlayer || hostPlayer.id !== socket.id) {
      socket.emit('error_message', 'Apenas o anfitrião da sala tem permissão para iniciar a partida.');
      return;
    }
    const playerCount = (data && data.playerCount) ? parseInt(data.playerCount) : 8;
    if (!room.started && room.players.length >= 1) {
      initGame(room, playerCount);
    }
  });

  socket.on('roll_dice', () => {
    const room = getRoom(socket.roomId);
    const current = room.players[room.turnIndex];
    if (!current || current.id !== socket.id || room.diceRolledThisTurn) return;

    const dice = rollDice();
    room.diceRolledThisTurn = true;
    room.lastDiceValue = dice;

    broadcastToRoom(room, 'dice_rolled', { roller: current.name, value: dice });
    socket.emit('dice_roll_result', { dice });

    // Inicia timer de 30s dedicado exclusivamente para a movimentação do peão
    startHumanTimer(room, current, 'move', 30);
  });

  socket.on('use_secret_passage', () => {
    const room = getRoom(socket.roomId);
    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.players[room.turnIndex].id !== socket.id) return;

    const targetRoom = SECRET_PASSAGES[player.inRoom];
    if (!targetRoom || player.secretPassageUses >= 3) {
      socket.emit('error_message', 'Passagem indisponível ou limite de 3 usos excedido!');
      return;
    }

    clearHumanTimer(room);

    const fromLoc = player.inRoom;
    player.secretPassageUses++;
    player.inRoom = targetRoom;
    player.tile = { x: ROOMS_CONFIG[targetRoom].x + 2, y: ROOMS_CONFIG[targetRoom].y + 2 };
    player.wasDraggedBySuggestion = false;

    broadcastToRoom(room, 'narrative_log', `${player.name} usou a passagem secreta saindo de [${fromLoc}] para [${targetRoom}]!`);
    broadcastToRoom(room, 'board_sync', getPublicState(room));
    socket.emit('ready_for_suggestion', { room: targetRoom });

    // 30 segundos para o jogador humano dar o palpite
    startHumanTimer(room, player, 'suggestion', 30);
  });

  socket.on('stay_and_suggest', () => {
    const room = getRoom(socket.roomId);
    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.players[room.turnIndex].id !== socket.id) return;
    if (!player.wasDraggedBySuggestion || !player.inRoom) return;

    clearHumanTimer(room);
    player.wasDraggedBySuggestion = false;
    socket.emit('ready_for_suggestion', { room: player.inRoom });

    // 30 segundos para o jogador humano dar o palpite
    startHumanTimer(room, player, 'suggestion', 30);
  });

  socket.on('move_to_tile_or_room', ({ tile, roomName }) => {
    const room = getRoom(socket.roomId);
    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.players[room.turnIndex].id !== socket.id || !room.diceRolledThisTurn) return;

    clearHumanTimer(room);

    const fromLoc = player.inRoom ? `[${player.inRoom}]` : `corredor (${player.tile.x}, ${player.tile.y})`;

    if (roomName) {
      player.inRoom = roomName;
      const rConf = ROOMS_CONFIG[roomName];
      player.tile = { x: rConf.x + 2, y: rConf.y + 2 };
      player.wasDraggedBySuggestion = false;

      broadcastToRoom(room, 'narrative_log', `${player.name} saiu do ${fromLoc} e entrou no(a) [${roomName}].`);
      broadcastToRoom(room, 'board_sync', getPublicState(room));
      socket.emit('ready_for_suggestion', { room: roomName });

      // 30 segundos para o jogador humano dar o palpite
      startHumanTimer(room, player, 'suggestion', 30);
    } else if (tile) {
      player.inRoom = null;
      player.tile = { x: tile.x, y: tile.y };

      broadcastToRoom(room, 'narrative_log', `${player.name} saiu do ${fromLoc} e parou no corredor (${tile.x}, ${tile.y}).`);
      broadcastToRoom(room, 'board_sync', getPublicState(room));
      setTimeout(() => nextTurn(room), 1500);
    }
  });

  socket.on('submit_suggestion', ({ suspect, weapon, location }) => {
    const room = getRoom(socket.roomId);
    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.players[room.turnIndex].id !== socket.id) return;

    executeSuggestion(room, socket.id, suspect, weapon, location);
  });

  socket.on('refute_card_chosen', ({ cardName, suggesterId, suggestionId }) => {
    const room = getRoom(socket.roomId);
    const respondent = room.players.find(p => p.id === socket.id);
    if (!respondent) return;

    resolveRefuteCardChosen(room, respondent, cardName, suggesterId, suggestionId);
  });

  // Alteração de velocidade: afeta apenas os bots caso estejam na partida
  socket.on('set_bot_speed', ({ speed }) => {
    const room = getRoom(socket.roomId);
    if (BOT_SPEEDS[speed]) {
      room.botSpeed = speed;
      broadcastToRoom(room, 'bot_speed_updated', { botSpeed: speed });
      const label = speed === 'fast' ? 'Rápido' : speed === 'slow' ? 'Lento' : 'Padrão (4s)';
      broadcastToRoom(room, 'narrative_log', `Velocidade dos bots alterada para: ${label}.`);
    }
  });

  socket.on('submit_accusation', ({ suspect, weapon, location }) => {
    const room = getRoom(socket.roomId);
    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.players[room.turnIndex].id !== socket.id) return;

    clearHumanTimer(room);

    const isCorrect =
      room.envelope.suspect === suspect &&
      room.envelope.weapon === weapon &&
      room.envelope.location === location;

    if (isCorrect) {
      endGame(room, player.name);
    } else {
      player.eliminated = true;
      player.inRoom = null;
      socket.emit('accusation_failed', { message: 'Acusação incorreta! Você foi eliminado.' });
      broadcastToRoom(room, 'narrative_log', `${player.name} errou a acusação e foi ELIMINADO!`);
      redistributeCards(room, player);
      broadcastToRoom(room, 'board_sync', getPublicState(room));
      setTimeout(() => nextTurn(room), 2500);
    }
  });

  socket.on('disconnect', () => {
    if (!socket.roomId) return;
    const room = getRoom(socket.roomId);

    room.players = room.players.filter(p => p.id !== socket.id);
    const humanPlayers = room.players.filter(p => !p.isBot);

    if (humanPlayers.length === 0) {
      clearHumanTimer(room);
      room.started = false;
      room.players = [];
      room.winner = null;
      room.hostId = null;
      rooms.delete(socket.roomId);
    } else {
      if (room.hostId === socket.id) {
        humanPlayers[0].isHost = true;
        room.hostId = humanPlayers[0].id;
      }
      broadcastToRoom(room, 'lobby_update', {
        roomId: room.id,
        hostId: room.hostId,
        players: room.players,
        availableCharacters: getAvailableCharacters(room)
      });
      // Se era a vez de quem desconectou
      if (room.started && room.players[room.turnIndex] && room.players[room.turnIndex].id === socket.id) {
        clearHumanTimer(room);
        nextTurn(room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});