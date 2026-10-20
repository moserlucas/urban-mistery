// public/client.js
const socket = io();

// Parse da Sala a partir dos parâmetros de URL (?sala=... ou ?room=...)
const urlParams = new URLSearchParams(window.location.search);
let currentRoomId = urlParams.get('sala') || urlParams.get('room') || 'sala-principal';

function syncRoomConnection() {
  socket.emit('join_room_request', { roomId: currentRoomId });
  const roomTag = document.getElementById('room-code-tag');
  if (roomTag) roomTag.innerText = currentRoomId;
}

socket.on('connect', syncRoomConnection);
if (socket.connected) syncRoomConnection();

let myPlayer = null;
let currentGameState = null;
let reachableTiles = []; // Casas de corredor onde o peão pode pisar
let reachableRooms = []; // Salas que o dado consegue alcançar
let reachableDoors = []; // Coordenadas (x, y) das portas alcançáveis com valor 2 na matriz (onde tem a seta)

const GRID_SIZE = 20;
const TILE_SIZE = 33; // 660px Canvas / 20

// Configuração completa oficial das 11 salas conforme gemini-code-1790744670078.json
const DEFAULT_ROOMS = {
  'Batalhão': {
    id: 'batalhao', name: 'Batalhão', x: 0, y: 0, w: 5, h: 5, width: 5, height: 5,
    doors: [{ x: 4, y: 2, cell: { x: 4, y: 2 }, direction: 'RIGHT', exitTo: { x: 5, y: 2 } }],
    secretPassageTo: 'Mecânica'
  },
  'Academia': {
    id: 'academia', name: 'Academia', x: 7, y: 0, w: 6, h: 4, width: 6, height: 4,
    doors: [
      { x: 12, y: 1, cell: { x: 12, y: 1 }, direction: 'RIGHT', exitTo: { x: 13, y: 1 } },
      { x: 9, y: 3, cell: { x: 9, y: 3 }, direction: 'DOWN', exitTo: { x: 9, y: 4 } }
    ]
  },
  'Bistrô de Esquina': {
    id: 'bistro_esquina', name: 'Bistrô de Esquina', x: 15, y: 0, w: 5, h: 5, width: 5, height: 5,
    doors: [{ x: 15, y: 2, cell: { x: 15, y: 2 }, direction: 'LEFT', exitTo: { x: 14, y: 2 } }]
  },
  'UPA 24H': {
    id: 'upa_24h', name: 'UPA 24H', x: 0, y: 6, w: 5, h: 4, width: 5, height: 4,
    doors: [{ x: 4, y: 7, cell: { x: 4, y: 7 }, direction: 'RIGHT', exitTo: { x: 5, y: 7 } }],
    secretPassageTo: 'Metrô'
  },
  'Praça do Único Poder': {
    id: 'praca_unico_poder', name: 'Praça do Único Poder', x: 7, y: 6, w: 6, h: 7, width: 6, height: 7,
    doors: [
      { x: 9, y: 6, cell: { x: 9, y: 6 }, direction: 'UP', exitTo: { x: 9, y: 5 } },
      { x: 7, y: 9, cell: { x: 7, y: 9 }, direction: 'LEFT', exitTo: { x: 6, y: 9 } },
      { x: 12, y: 9, cell: { x: 12, y: 9 }, direction: 'RIGHT', exitTo: { x: 13, y: 9 } },
      { x: 9, y: 12, cell: { x: 9, y: 12 }, direction: 'DOWN', exitTo: { x: 9, y: 13 } }
    ]
  },
  'Praça Único Poder': {
    id: 'praca_unico_poder', name: 'Praça do Único Poder', x: 7, y: 6, w: 6, h: 7, width: 6, height: 7,
    doors: [
      { x: 9, y: 6, cell: { x: 9, y: 6 }, direction: 'UP', exitTo: { x: 9, y: 5 } },
      { x: 7, y: 9, cell: { x: 7, y: 9 }, direction: 'LEFT', exitTo: { x: 6, y: 9 } },
      { x: 12, y: 9, cell: { x: 12, y: 9 }, direction: 'RIGHT', exitTo: { x: 13, y: 9 } },
      { x: 9, y: 12, cell: { x: 9, y: 12 }, direction: 'DOWN', exitTo: { x: 9, y: 13 } }
    ]
  },
  'Museu': {
    id: 'museu', name: 'Museu', x: 15, y: 6, w: 5, h: 4, width: 5, height: 4,
    doors: [{ x: 15, y: 7, cell: { x: 15, y: 7 }, direction: 'LEFT', exitTo: { x: 14, y: 7 } }]
  },
  'Banco Master': {
    id: 'banco_master', name: 'Banco Master', x: 0, y: 11, w: 5, h: 4, width: 5, height: 4,
    doors: [{ x: 4, y: 12, cell: { x: 4, y: 12 }, direction: 'RIGHT', exitTo: { x: 5, y: 12 } }]
  },
  'Palace Hotel': {
    id: 'palace_hotel', name: 'Palace Hotel', x: 15, y: 11, w: 5, h: 4, width: 5, height: 4,
    doors: [{ x: 15, y: 12, cell: { x: 15, y: 12 }, direction: 'LEFT', exitTo: { x: 14, y: 12 } }]
  },
  'Metrô': {
    id: 'metro', name: 'Metrô', x: 0, y: 16, w: 5, h: 4, width: 5, height: 4,
    doors: [{ x: 4, y: 17, cell: { x: 4, y: 17 }, direction: 'RIGHT', exitTo: { x: 5, y: 17 } }],
    secretPassageTo: 'UPA 24H'
  },
  'Teatro Regional': {
    id: 'teatro_regional', name: 'Teatro Regional', x: 7, y: 16, w: 6, h: 4, width: 6, height: 4,
    doors: [
      { x: 9, y: 16, cell: { x: 9, y: 16 }, direction: 'UP', exitTo: { x: 9, y: 15 } },
      { x: 7, y: 18, cell: { x: 7, y: 18 }, direction: 'LEFT', exitTo: { x: 6, y: 18 } }
    ]
  },
  'Mecânica': {
    id: 'mecanica', name: 'Mecânica', x: 15, y: 16, w: 5, h: 4, width: 5, height: 4,
    doors: [{ x: 16, y: 16, cell: { x: 16, y: 16 }, direction: 'UP', exitTo: { x: 16, y: 15 } }],
    secretPassageTo: 'Batalhão'
  }
};

let roomsConfig = Object.assign({}, DEFAULT_ROOMS);
let secretPassages = {
  'Batalhão': 'Mecânica',
  'Mecânica': 'Batalhão',
  'UPA 24H': 'Metrô',
  'Metrô': 'UPA 24H'
};

// Matriz oficial 20x20 conforme gemini-code-1790744670078.json
// 0: Colisão (paredes e salas)
// 1: Corredor transitável
// 2: Porta / transição para salas
let GRID_MATRIX = [
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 2, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 2, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 2, 1, 1, 0, 0, 2, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 2, 0, 0, 0, 1, 1, 0, 2, 0, 0, 0],
  [0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]
];

let DOORS_BY_CELL = {
  "4,2": { roomName: "Batalhão", exitTo: { x: 5, y: 2 } },
  "12,1": { roomName: "Academia", exitTo: { x: 13, y: 1 } },
  "9,3": { roomName: "Academia", exitTo: { x: 9, y: 4 } },
  "15,2": { roomName: "Bistrô de Esquina", exitTo: { x: 14, y: 2 } },
  "4,7": { roomName: "UPA 24H", exitTo: { x: 5, y: 7 } },
  "9,6": { roomName: "Praça do Único Poder", exitTo: { x: 9, y: 5 } },
  "7,9": { roomName: "Praça do Único Poder", exitTo: { x: 6, y: 9 } },
  "12,9": { roomName: "Praça do Único Poder", exitTo: { x: 13, y: 9 } },
  "9,12": { roomName: "Praça do Único Poder", exitTo: { x: 9, y: 13 } },
  "15,7": { roomName: "Museu", exitTo: { x: 14, y: 7 } },
  "4,12": { roomName: "Banco Master", exitTo: { x: 5, y: 12 } },
  "15,12": { roomName: "Palace Hotel", exitTo: { x: 14, y: 12 } },
  "4,17": { roomName: "Metrô", exitTo: { x: 5, y: 17 } },
  "9,16": { roomName: "Teatro Regional", exitTo: { x: 9, y: 15 } },
  "7,18": { roomName: "Teatro Regional", exitTo: { x: 6, y: 18 } },
  "16,16": { roomName: "Mecânica", exitTo: { x: 16, y: 15 } }
};

// Calibração milimétrica dos quadrantes do mapa Gemini (660x660 canvas - 20 colunas e 20 linhas)
const COL_POINTS = [
  0, 35.5, 71, 106.5, 142, 177, // Col 0..4 (Salas da esquerda: 0..177)
  208.5, 240,                   // Col 5..6 (Corredor vertical 1: 177..240)
  272.5, 305, 337.5, 370, 402.5, 435, // Col 7..12 (Salas centrais: 240..435)
  465, 495,                     // Col 13..14 (Corredor vertical 2: 435..495)
  528, 561, 594, 627, 660       // Col 15..19 (Salas da direita: 495..660)
];

const ROW_POINTS = [
  0, 34, 68, 102, 136, 170,     // Linhas 0..4 (Batalhão / Bistrô: 0..170; Academia: 0..136)
  200,                          // Linha 5 (Corredor horizontal 1: 170..200)
  232.5, 265, 297.5, 330,       // Linhas 6..9 (UPA / Museu: 200..330; Praça: 200..424)
  357,                          // Linha 10 (Corredor horizontal 2: 330..357)
  390.5, 424, 457.5, 491,       // Linhas 11..14 (Banco Master / Palace Hotel: 357..491)
  519,                          // Linha 15 (Corredor horizontal 3: 491..519)
  554, 589, 624.5, 660          // Linhas 16..19 (Metrô / Teatro / Mecânica: 519..660)
];

function tileToRect(tileX, tileY) {
  const px = COL_POINTS[tileX] !== undefined ? COL_POINTS[tileX] : tileX * TILE_SIZE;
  const py = ROW_POINTS[tileY] !== undefined ? ROW_POINTS[tileY] : tileY * TILE_SIZE;
  const nextX = COL_POINTS[tileX + 1] !== undefined ? COL_POINTS[tileX + 1] : px + TILE_SIZE;
  const nextY = ROW_POINTS[tileY + 1] !== undefined ? ROW_POINTS[tileY + 1] : py + TILE_SIZE;
  return { x: px, y: py, w: nextX - px, h: nextY - py };
}

function tileToCenter(tileX, tileY) {
  const rect = tileToRect(tileX, tileY);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function roomToRect(conf) {
  const rx = COL_POINTS[conf.x] !== undefined ? COL_POINTS[conf.x] : conf.x * TILE_SIZE;
  const ry = ROW_POINTS[conf.y] !== undefined ? ROW_POINTS[conf.y] : conf.y * TILE_SIZE;
  const endX = COL_POINTS[conf.x + conf.w] !== undefined ? COL_POINTS[conf.x + conf.w] : (conf.x + conf.w) * TILE_SIZE;
  const endY = ROW_POINTS[conf.y + conf.h] !== undefined ? ROW_POINTS[conf.y + conf.h] : (conf.y + conf.h) * TILE_SIZE;
  return { x: rx, y: ry, w: endX - rx, h: endY - ry };
}

function pixelToTile(clickX, clickY) {
  let tileX = 0;
  for (let x = 0; x < GRID_SIZE; x++) {
    if (clickX >= COL_POINTS[x] && clickX < COL_POINTS[x + 1]) {
      tileX = x;
      break;
    }
  }
  let tileY = 0;
  for (let y = 0; y < GRID_SIZE; y++) {
    if (clickY >= ROW_POINTS[y] && clickY < ROW_POINTS[y + 1]) {
      tileY = y;
      break;
    }
  }
  return { tileX, tileY };
}

const canvas = document.getElementById('board-canvas');

// Globais Three.js
let scene, camera, renderer, raycaster, mouse;
let boardGroup, pawnsGroup, highlightsGroup;
let roomMeshes = {};
let tileMeshes = {};
let pawnMeshes = {};
// Listas Oficiais Ordenadas Alfabeticamente
const SUSPECTS = [
  'Carminha', 'Fahur', 'Jacão', 'Jailson',
  'Moraes', 'Peçanha', 'Tadalafila', 'Toguro'
];

const WEAPONS = [
  'Arame Farpado', 'Barra de Ferro', 'Bisturi', 'Chave de Roda',
  'Enxada Enferrujada', 'Estátua de Bronze', 'Faca AK47', 'Maleta'
];

const LOCATIONS = [
  'Academia', 'Banco Master', 'Batalhão', 'Bistrô de Esquina',
  'Mecânica', 'Metrô', 'Museu', 'Palace Hotel',
  'Praça do Único Poder', 'Teatro Regional', 'UPA 24H'
];

// Utilitários de Armazenamento Seguro (resistente a restrições de IP/modo anônimo)
function getSafeStorage(key, defaultVal) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function setSafeStorage(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {}
}

// ===========================
// EFEITOS SONOROS (WEB AUDIO API - 100% NATIVO SEM DEPENDÊNCIAS EXTERNAS)
// ===========================
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}
document.addEventListener('click', () => getAudioContext(), { once: true });

// Efeito Sonoro 1: Vez do Jogador (Chime suave de mistério / sino de investigação)
function playTurnSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.14); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(440, now); // A4
    osc2.frequency.exponentialRampToValueAtTime(659.25, now + 0.14); // E5

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.9);
    osc2.stop(now + 0.9);
  } catch (e) {
    console.warn('Erro ao tocar som de turno:', e);
  }
}

// Efeito Sonoro 2: Refutação de Carta (Acorde de revelação / suspense para humanos)
function playRefuteSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(739.99, now); // F#5
    osc.frequency.setValueAtTime(880.00, now + 0.08); // A5
    osc.frequency.setValueAtTime(1108.73, now + 0.16); // C#6

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.22, now + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.85);
  } catch (e) {
    console.warn('Erro ao tocar som de refutação:', e);
  }
}

// Efeito Sonoro 3: Clique mecânico da roleta girando
function playRouletteTickSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.025);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  } catch (e) {}
}

// Efeito Sonoro 4: Fanfarra de vitória da roleta inicial
function playRouletteWinSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.18, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.36);
    });
  } catch (e) {}
}

// Utilitário para cálculo de luz e sombra em cores hexadecimais
function shadeColor(color, percent) {
  let num = parseInt(color.replace('#', ''), 16);
  let amt = Math.round(2.55 * percent);
  let R = (num >> 16) + amt;
  let B = ((num >> 8) & 0x00FF) + amt;
  let G = (num & 0x0000FF) + amt;

  return '#' + (0x1000000 + (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (B < 255 ? (B < 1 ? 0 : B) : 255) * 0x100 +
    (G < 255 ? (G < 1 ? 0 : G) : 255)).toString(16).slice(1);
}

// ===========================
// MAPA DE IMAGENS DAS CARTAS (TODAS AS 27 CARTAS COM PADRÃO NOIR E BORDA DOURADA)
// ===========================
const CARD_IMAGES = {
  // Suspeitos — imagens .jpg locais em public/cards/suspect/
  'Fahur':              'cards/suspect/fahur.jpg',
  'Toguro':             'cards/suspect/toguro.jpg',
  'Jacão':              'cards/suspect/jacao.jpg',
  'Moraes':             'cards/suspect/moraes.jpg',
  'Carminha':           'cards/suspect/carminha.jpg',
  'Peçanha':            'cards/suspect/pecanha.jpg',
  'Jailson':            'cards/suspect/jailson.jpg',
  'Tadalafila':         'cards/suspect/tadalafila.jpg',
  // Armas — imagens .jpg locais em public/cards/weapons/
  'Enxada Enferrujada': 'cards/weapons/enxada enferrujada.jpg',
  'Barra de Ferro':     'cards/weapons/barra de ferro.jpg',
  'Faca AK47':          'cards/weapons/faca ak47.jpg',
  'Maleta':             'cards/weapons/maleta.jpg',
  'Chave de Roda':      'cards/weapons/chave de roda.jpg',
  'Estátua de Bronze':  'cards/weapons/estatua de bronze.jpg',
  'Arame Farpado':      'cards/weapons/arame farpado.jpg',
  'Bisturi':            'cards/weapons/bisturi.jpg',
  // Locais — imagens .jpg locais em public/cards/locations/
  'Batalhão':             'cards/locations/batalhao.jpg',
  'Academia':             'cards/locations/academia.jpg',
  'Bistrô de Esquina':    'cards/locations/bistro.jpg',
  'Mecânica':             'cards/locations/mecanica.jpg',
  'UPA 24H':              'cards/locations/upa24h.jpg',
  'Teatro Regional':      'cards/locations/teatro.jpg',
  'Museu':                'cards/locations/museu.jpg',
  'Praça do Único Poder': 'cards/locations/praça.jpg',
  'Metrô':                'cards/locations/metro.jpg',
  'Palace Hotel':         'cards/locations/palace hotel.jpg',
  'Banco Master':         'cards/locations/banco.jpg',
  // Variações de busca sem acento ou abreviadas
  'Batalhao':             'cards/locations/batalhao.jpg',
  'Bistro':               'cards/locations/bistro.jpg',
  'Bistro de Esquina':    'cards/locations/bistro.jpg',
  'Mecanica':             'cards/locations/mecanica.jpg',
  'Teatro':               'cards/locations/teatro.jpg',
  'Praca':                'cards/locations/praça.jpg',
  'Praça':                'cards/locations/praça.jpg',
  'Praca do Unico Poder': 'cards/locations/praça.jpg',
  'Metro':                'cards/locations/metro.jpg',
  'Banco':                'cards/locations/banco.jpg',
  'UPA':                  'cards/locations/upa24h.jpg',
};

const CARD_ICONS = {
  suspect: 'cards/icons/user.svg',
  weapon: 'cards/icons/card.svg',
  location: 'cards/icons/door.svg',
};

function getCardImage(cardName) {
  if (!cardName) return 'cards/card_back.svg';
  let path = null;
  if (cardName in CARD_IMAGES) {
    path = CARD_IMAGES[cardName];
  } else {
    const key = Object.keys(CARD_IMAGES).find(k => k.toLowerCase() === cardName.toLowerCase());
    path = key ? CARD_IMAGES[key] : 'cards/card_back.svg';
  }
  return encodeURI(path);
}

function getCardType(cardName) {
  if (SUSPECTS.includes(cardName)) return 'suspect';
  if (WEAPONS.includes(cardName)) return 'weapon';
  return 'location';
}

function getCardIcon(cardName) {
  return CARD_ICONS[getCardType(cardName)] || 'cards/icons/card.svg';
}

// ===========================
// HISTÓRICO DE PALPITES (APENAS PALPITES COM BORDA AMARELA)
// ===========================
let gameHistory = [];
let historyMaxEntries = 3; // ajustado dinamicamente pela quantidade de jogadores

function addHistoryEntry(icon, text, type = 'normal', meta = null) {
  // O usuário solicitou registrar APENAS palpites (identificação lateral amarela)
  if (type !== 'suggestion') return null;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  const entry = { icon: 'cards/icons/search.svg', text, type, time: timeStr, meta };
  gameHistory.unshift(entry);
  if (gameHistory.length > historyMaxEntries) {
    gameHistory.pop();
  }
  renderHistory();
  return entry;
}

function updateHistorySuggestionOutcome(suggestionId, hasRefuted, respondentName, privateCard = null) {
  if (!suggestionId) return;
  const entry = gameHistory.find(e => e.meta && e.meta.suggestionId === suggestionId);
  if (entry && entry.meta) {
    if (privateCard) {
      entry.meta.hasPrivateCard = true;
      entry.meta.badge = `Revelou para você: [${privateCard}]`;
      entry.meta.badgeClass = 'badge-private';
    } else if (entry.meta.hasPrivateCard) {
      // Já registrou a carta privada, não sobrescreve com mensagem genérica
      return;
    } else if (hasRefuted) {
      entry.meta.badge = `${respondentName.toUpperCase()} MOSTROU CARTA`;
      entry.meta.badgeClass = 'badge-refuted';
    } else {
      entry.meta.badge = `NINGUÉM REFUTOU`;
      entry.meta.badgeClass = 'badge-unrefuted';
    }
    renderHistory();
  }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const countSpan = document.getElementById('history-count');
  const maxSpan = document.getElementById('history-max');
  if (countSpan) countSpan.innerText = gameHistory.length;
  if (maxSpan) maxSpan.innerText = historyMaxEntries;
  if (!list) return;

  if (gameHistory.length === 0) {
    list.innerHTML = '<li class="history-empty">Nenhum palpite registrado ainda.</li>';
    return;
  }

  list.innerHTML = gameHistory.map(entry => `
    <li class="history-item ${entry.type}">
      <span class="history-time">${entry.time}</span>
      <img src="cards/icons/search.svg" class="ui-icon-xs" alt="" />
      <div class="history-body">
        <span class="history-text">${entry.text}</span>
        ${entry.meta && entry.meta.badge ? `<span class="history-badge-outcome ${entry.meta.badgeClass}">${entry.meta.badge}</span>` : ''}
      </div>
    </li>
  `).join('');
}


function initHistoryToggle() {
  const btnToggleHistory = document.getElementById('btn-toggle-history');
  const historyContent = document.getElementById('history-content');
  const historyHeader = document.getElementById('history-header');
  const toggleIcon = document.getElementById('history-toggle-icon');
  const toggleText = document.getElementById('history-toggle-text');

  function toggleHistoryView() {
    if (!historyContent) return;
    const isHidden = historyContent.style.display === 'none';
    historyContent.style.display = isHidden ? 'block' : 'none';
    if (toggleText) toggleText.innerText = isHidden ? 'Minimizar' : 'Ver histórico';
  }

  if (btnToggleHistory) btnToggleHistory.onclick = (e) => { e.stopPropagation(); toggleHistoryView(); };
  if (historyHeader) historyHeader.onclick = toggleHistoryView;
}

// Sistema de Posições e Animações 3D dos Peões
const pawnVisuals = {};
let isAnimatingPawns = false;

function getPawnTargetCoords(player, occIdx = 0, occTotal = 1) {
  if (player.inRoom && roomsConfig[player.inRoom]) {
    const conf = roomsConfig[player.inRoom];
    const { x: rx, y: ry, w: rw, h: rh } = roomToRect(conf);

    const cx = rx + rw / 2;
    const cy = ry + rh / 2;

    // Distribuição elegante de peões dentro das salas
    const spacing = 16;
    const totalW = (occTotal - 1) * spacing;
    const startX = cx - totalW / 2;
    const px = startX + occIdx * spacing;
    let py = cy + 12;

    if (player.inRoom === 'Praça do Único Poder') {
      py = cy + 24; // Caminho de pedra ao sul do chafariz
    } else if (player.inRoom === 'Batalhão') {
      py = cy + 15; // Piso tático limpo
    } else if (player.inRoom === 'Academia') {
      py = cy + 14; // Próximo ao botão de treino
    } else if (player.inRoom === 'Bistrô de Esquina') {
      py = cy + 12; // Piso central
    } else if (player.inRoom === 'Teatro Regional') {
      py = cy + 18; // Corredor da plateia
    }
    return { x: px, y: py };
  } else {
    // No corredor: se houver mais de um peão no mesmo quadrante, afasta lado a lado
    const center = tileToCenter(player.tile.x, player.tile.y);
    if (occTotal > 1) {
      const spacing = 10;
      const startX = center.x - ((occTotal - 1) * spacing) / 2;
      return {
        x: startX + occIdx * spacing,
        y: center.y
      };
    }
    return {
      x: center.x,
      y: center.y
    };
  }
}

function syncPawnPositions(state) {
  if (!state || !state.players) return;

  const roomOccupants = {};
  const corridorOccupants = {};

  state.players.forEach(p => {
    if (p.eliminated) return;
    if (p.inRoom) {
      if (!roomOccupants[p.inRoom]) roomOccupants[p.inRoom] = [];
      roomOccupants[p.inRoom].push(p);
    } else if (p.tile) {
      const key = `${p.tile.x},${p.tile.y}`;
      if (!corridorOccupants[key]) corridorOccupants[key] = [];
      corridorOccupants[key].push(p);
    }
  });

  let needsAnimation = false;

  state.players.forEach(p => {
    let occIdx = 0;
    let occTotal = 1;
    if (p.inRoom && roomOccupants[p.inRoom]) {
      occIdx = roomOccupants[p.inRoom].indexOf(p);
      occTotal = roomOccupants[p.inRoom].length;
    } else if (!p.inRoom && p.tile && corridorOccupants[`${p.tile.x},${p.tile.y}`]) {
      const occupants = corridorOccupants[`${p.tile.x},${p.tile.y}`];
      occIdx = occupants.indexOf(p);
      occTotal = occupants.length;
    }

    const target = getPawnTargetCoords(p, occIdx, occTotal);

    if (!pawnVisuals[p.id]) {
      pawnVisuals[p.id] = {
        curX: target.x,
        curY: target.y,
        targetX: target.x,
        targetY: target.y,
        startX: target.x,
        startY: target.y,
        startTime: 0,
        duration: 650,
        isMoving: false,
        elevation: 0
      };
    } else {
      const pv = pawnVisuals[p.id];
      const dist = Math.hypot(pv.targetX - target.x, pv.targetY - target.y);
      if (dist > 2) {
        pv.startX = pv.curX;
        pv.startY = pv.curY;
        pv.targetX = target.x;
        pv.targetY = target.y;
        pv.startTime = performance.now();
        pv.duration = 650;
        pv.isMoving = true;
        needsAnimation = true;
      }
    }
  });

  if (needsAnimation && !isAnimatingPawns) {
    isAnimatingPawns = true;
    requestAnimationFrame(animationLoop);
  } else {
    drawBoard();
  }
}

function animationLoop(timestamp) {
  let stillMoving = false;

  for (const [id, pv] of Object.entries(pawnVisuals)) {
    if (pv.isMoving) {
      const elapsed = timestamp - pv.startTime;
      const progress = Math.min(elapsed / pv.duration, 1);
      // easeInOutSine
      const ease = 0.5 - Math.cos(progress * Math.PI) / 2;

      pv.curX = pv.startX + (pv.targetX - pv.startX) * ease;
      pv.curY = pv.startY + (pv.targetY - pv.startY) * ease;
      // Salto parabólico suave (peão se ergue e pousa na casa)
      pv.elevation = Math.sin(progress * Math.PI) * 18;

      if (progress < 1) {
        stillMoving = true;
      } else {
        pv.isMoving = false;
        pv.elevation = 0;
        pv.curX = pv.targetX;
        pv.curY = pv.targetY;
      }
    }
  }

  drawBoard();

  if (stillMoving) {
    requestAnimationFrame(animationLoop);
  } else {
    isAnimatingPawns = false;
  }
}

socket.on('initial_character_list', (data) => {
  if (data.roomsConfig && data.roomsConfig['Praça do Único Poder'] && data.roomsConfig['Praça do Único Poder'].doors && data.roomsConfig['Praça do Único Poder'].doors[0] && data.roomsConfig['Praça do Único Poder'].doors[0].exitTo) {
    Object.assign(roomsConfig, data.roomsConfig);
  }
  if (data.secretPassages) Object.assign(secretPassages, data.secretPassages);
  if (data.gridMatrix && Array.isArray(data.gridMatrix) && data.gridMatrix.length === 20 && data.gridMatrix[0] && data.gridMatrix[0].length === 20) {
    GRID_MATRIX = data.gridMatrix;
  }
  if (data.doorsByCell && Object.keys(data.doorsByCell).length >= 16) {
    Object.assign(DOORS_BY_CELL, data.doorsByCell);
  }
  renderCharacterOptions(data.available);
});

const CHARACTER_ROLES = {
  'Fahur': 'Sargento',
  'Toguro': 'Fisiculturista',
  'Jacão': 'Chef',
  'Moraes': 'Advogado',
  'Carminha': 'Atriz',
  'Peçanha': 'Segurança',
  'Jailson': 'Mecânico',
  'Tadalafila': 'Doutor'
};

const LOBBY_MATCH_SEQUENCE = [
  'Fahur', 'Toguro', 'Jacão', 'Moraes',
  'Carminha', 'Peçanha', 'Jailson', 'Tadalafila'
];

function renderCharacterOptions(available) {
  const select = document.getElementById('select-character');
  const grid = document.getElementById('lobby-character-cards-grid');
  if (select) select.innerHTML = '';
  if (grid) grid.innerHTML = '';

  LOBBY_MATCH_SEQUENCE.forEach(name => {
    const availChar = available.find(c => c.name.toLowerCase() === name.toLowerCase());
    const isAvail = !!availChar;
    const charId = availChar ? availChar.id : name.toLowerCase();

    if (availChar && select) {
      const opt = document.createElement('option');
      opt.value = availChar.id;
      opt.innerText = `${availChar.name} (${availChar.role})`;
      select.appendChild(opt);
    }

    if (grid) {
      const cardItem = document.createElement('div');
      cardItem.className = `character-card-item ${isAvail ? '' : 'taken-card'}`;
      cardItem.dataset.id = charId;
      cardItem.dataset.name = name;

      const imgSrc = getCardImage(name);
      const role = CHARACTER_ROLES[name] || 'Suspeito';

      cardItem.innerHTML = `
        <img src="${imgSrc}" alt="${name}" class="character-card-img" />
        <div class="character-card-info">
          <div class="character-card-name">${name}</div>
          <div class="character-card-role">${role}</div>
        </div>
        ${!isAvail ? '<span class="character-card-taken-tag">OCUPADO</span>' : ''}
      `;

      if (isAvail) {
        cardItem.onclick = () => {
          document.querySelectorAll('.character-card-item').forEach(el => el.classList.remove('selected-card'));
          cardItem.classList.add('selected-card');
          if (select) select.value = charId;
        };
      }

      grid.appendChild(cardItem);
    }
  });

  // Se nada selecionado ainda, seleciona o primeiro disponível
  if (select && select.options.length > 0 && (!select.value || select.value === '')) {
    select.selectedIndex = 0;
  }
  if (select && select.value && grid) {
    const activeCard = grid.querySelector(`.character-card-item[data-id="${select.value}"]`);
    if (activeCard) activeCard.classList.add('selected-card');
  }
}

// Sistema de Link de Convite para Sala Multiplayer
function initInviteLinkSystem() {
  const btnInvite = document.getElementById('btn-generate-invite');
  const roomTag = document.getElementById('room-code-tag');
  const feedbackMsg = document.getElementById('invite-feedback-msg');
  const btnText = document.getElementById('btn-invite-text');

  if (roomTag) roomTag.innerText = currentRoomId;

  if (btnInvite) {
    btnInvite.onclick = () => {
      if (currentRoomId === 'sala-principal') {
        const randId = 'sala-' + Math.random().toString(36).substring(2, 6);
        currentRoomId = randId;
        window.history.replaceState({}, '', '?sala=' + encodeURIComponent(currentRoomId));
        if (roomTag) roomTag.innerText = currentRoomId;
        socket.emit('join_room_request', { roomId: currentRoomId });
      }

      const inviteUrl = window.location.origin + window.location.pathname + '?sala=' + encodeURIComponent(currentRoomId);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inviteUrl).then(() => {
          showInviteFeedback();
        }).catch(() => {
          fallbackCopyText(inviteUrl);
        });
      } else {
        fallbackCopyText(inviteUrl);
      }
    };
  }

  function fallbackCopyText(text) {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
      showInviteFeedback();
    } catch (e) {
      alert('Link da sala: ' + text);
    }
    document.body.removeChild(tempInput);
  }

  function showInviteFeedback() {
    if (btnText) btnText.innerText = 'Link Copiado!';
    if (feedbackMsg) {
      feedbackMsg.style.display = 'block';
      setTimeout(() => {
        if (feedbackMsg) feedbackMsg.style.display = 'none';
        if (btnText) btnText.innerText = 'Gerar Link de Convite';
      }, 3500);
    }
  }
}

document.addEventListener('DOMContentLoaded', initInviteLinkSystem);
initInviteLinkSystem();

function updateLobbyUI() {
  const btnJoin = document.getElementById('btn-join');
  const btnStart = document.getElementById('btn-start');
  const guestWaiting = document.getElementById('guest-waiting-box');
  const inputName = document.getElementById('input-name');
  const selectChar = document.getElementById('select-character');
  const selectPlayerCount = document.getElementById('select-player-count');

  if (!myPlayer) {
    // Visitante/Jogador que ainda NÃO entrou: exibe botão azul "Entrar no Jogo"
    if (btnJoin) btnJoin.style.display = 'inline-flex';
    if (btnStart) btnStart.style.display = 'none';
    if (guestWaiting) guestWaiting.style.display = 'none';
    if (inputName) inputName.disabled = false;
    if (selectChar) selectChar.disabled = false;
    if (selectPlayerCount) selectPlayerCount.disabled = false;
  } else {
    // Jogador já entrou na sala: oculta "Entrar no Jogo" e trava nome/personagem
    if (btnJoin) btnJoin.style.display = 'none';
    if (inputName) inputName.disabled = true;
    if (selectChar) selectChar.disabled = true;

    if (myPlayer.isHost) {
      // Anfitrião vê botão verde "Iniciar Partida" no mesmo local
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (guestWaiting) guestWaiting.style.display = 'none';
      if (selectPlayerCount) selectPlayerCount.disabled = false;
    } else {
      // Convidado vê indicador de espera no mesmo local
      if (btnStart) btnStart.style.display = 'none';
      if (guestWaiting) guestWaiting.style.display = 'inline-flex';
      if (selectPlayerCount) selectPlayerCount.disabled = true;
    }
  }
}

document.addEventListener('DOMContentLoaded', updateLobbyUI);
updateLobbyUI();

document.getElementById('btn-join').onclick = () => {
  const name = document.getElementById('input-name').value.trim();
  const characterId = document.getElementById('select-character').value;
  if (!name) {
    alert('Por favor, informe seu nome de detetive para entrar no jogo!');
    document.getElementById('input-name').focus();
    return;
  }
  if (!characterId) return alert('Escolha um suspeito para representar!');
  socket.emit('join_lobby', { name, characterId, roomId: currentRoomId });
};

document.getElementById('btn-start').onclick = () => {
  const playerCountSel = document.getElementById('select-player-count');
  const playerCount = playerCountSel ? parseInt(playerCountSel.value) : 8;
  socket.emit('request_start_game', { playerCount });
};

socket.on('player_assigned', (player) => {
  myPlayer = player;
  updateLobbyUI();
  document.getElementById('my-name').innerText = player.name;
  document.getElementById('my-char').innerText = `${player.character.name}`;
});

socket.on('lobby_update', (data) => {
  if (data.roomId) {
    currentRoomId = data.roomId;
    const roomTag = document.getElementById('room-code-tag');
    if (roomTag) roomTag.innerText = data.roomId;
  }
  document.getElementById('player-count').innerText = data.players.length;

  if (myPlayer) {
    const isHost = (data.hostId && data.hostId === myPlayer.id) || (data.players.length > 0 && data.players[0].id === myPlayer.id && !data.players[0].isBot);
    myPlayer.isHost = isHost;
  }
  updateLobbyUI();

  document.getElementById('lobby-players-list').innerHTML = data.players.map((p) => {
    const isHostPlayer = (data.hostId && p.id === data.hostId) || p.isHost;
    return `
      <li class="badge-item" style="background-color: ${p.character.color}">
        ${p.name} - ${p.character.name} ${p.isBot ? '(Bot)' : '(Investigador)'}${isHostPlayer ? ' [Anfitrião]' : ''}
      </li>
    `;
  }).join('');

  const btnStart = document.getElementById('btn-start');
  if (btnStart) {
    if (data.players.length >= 8) {
      btnStart.innerText = 'Iniciar Partida (8 Jogadores Humanos)';
    } else {
      btnStart.innerText = `Iniciar Partida (${data.players.length} Humanos + Bots)`;
    }
  }

  if (!myPlayer) renderCharacterOptions(data.availableCharacters);
});

// ================= TEMPORIZADORES DE TURNO HUMANOS (30s Padrão para Tudo) =================
socket.on('turn_timer_update', (data) => {
  const hudBadge = document.getElementById('hud-timer-badge');
  const hudText = document.getElementById('hud-timer-text');
  const turnBadge = document.getElementById('turn-timer-badge');
  const turnText = document.getElementById('turn-timer-text');
  const suggBadge = document.getElementById('suggestion-timer-badge');
  const suggText = document.getElementById('suggestion-timer-text');

  if (hudBadge) {
    hudBadge.style.display = 'inline-flex';
    hudBadge.title = `Turno de ${data.playerName}`;
  }
  if (hudText) hudText.innerText = `${data.secondsLeft}s`;

  if (data.phase === 'roll_move' || data.phase === 'move') {
    if (turnText) turnText.innerText = `${data.secondsLeft}s`;
    if (turnBadge) turnBadge.classList.remove('timer-urgent');
  } else if (data.phase === 'suggestion') {
    if (suggText) suggText.innerText = `${data.secondsLeft}s`;
    if (suggBadge) suggBadge.classList.remove('timer-urgent');
  }

  const isUrgent = data.secondsLeft <= 7;
  if (isUrgent) {
    if (hudBadge) hudBadge.classList.add('timer-urgent');
    if (turnBadge) turnBadge.classList.add('timer-urgent');
    if (suggBadge) suggBadge.classList.add('timer-urgent');
  } else {
    if (hudBadge) hudBadge.classList.remove('timer-urgent');
    if (turnBadge) turnBadge.classList.remove('timer-urgent');
    if (suggBadge) suggBadge.classList.remove('timer-urgent');
  }
});

socket.on('turn_timer_tick', (data) => {
  const hudBadge = document.getElementById('hud-timer-badge');
  const hudText = document.getElementById('hud-timer-text');
  const turnBadge = document.getElementById('turn-timer-badge');
  const turnText = document.getElementById('turn-timer-text');
  const suggBadge = document.getElementById('suggestion-timer-badge');
  const suggText = document.getElementById('suggestion-timer-text');

  if (hudText) hudText.innerText = `${data.secondsLeft}s`;
  if ((data.phase === 'roll_move' || data.phase === 'move') && turnText) turnText.innerText = `${data.secondsLeft}s`;
  if (data.phase === 'suggestion' && suggText) suggText.innerText = `${data.secondsLeft}s`;

  const isUrgent = data.secondsLeft <= 7;
  if (isUrgent) {
    if (hudBadge) hudBadge.classList.add('timer-urgent');
    if (turnBadge) turnBadge.classList.add('timer-urgent');
    if (suggBadge) suggBadge.classList.add('timer-urgent');
  } else {
    if (hudBadge) hudBadge.classList.remove('timer-urgent');
    if (turnBadge) turnBadge.classList.remove('timer-urgent');
    if (suggBadge) suggBadge.classList.remove('timer-urgent');
  }
});

socket.on('turn_timer_cleared', () => {
  const hudBadge = document.getElementById('hud-timer-badge');
  const turnBadge = document.getElementById('turn-timer-badge');
  const suggBadge = document.getElementById('suggestion-timer-badge');

  if (hudBadge) {
    hudBadge.style.display = 'none';
    hudBadge.classList.remove('timer-urgent');
  }
  if (turnBadge) turnBadge.classList.remove('timer-urgent');
  if (suggBadge) suggBadge.classList.remove('timer-urgent');
});

socket.on('your_cards', (cards) => {
  buildCardFan(cards);
  buildNotebook(cards);
});

// Cartas privadas do jogador (grid em alta definição sem leque, com empilhamento parcial se > 8 cartas)
let myHandCards = [];

function createCardElement(card) {
  const typeLabels = { suspect: 'Suspeito', weapon: 'Arma', location: 'Local' };
  const el = document.createElement('div');
  el.className = 'hand-grid-card fan-card';

  const imgSrc = getCardImage(card.name);
  const typeKey = card.type || 'suspect';
  const typeLabel = typeLabels[typeKey] || typeKey;

  el.innerHTML = `
    <img src="${imgSrc}" alt="${card.name}" class="hand-grid-card-img" />
    <div class="hand-grid-card-overlay">
      <span class="hand-grid-card-type hand-badge-${typeKey}">${typeLabel}</span>
      <span class="hand-grid-card-name" title="${card.name}">${card.name}</span>
    </div>
  `;

  const img = el.querySelector('img');
  if (img) {
    img.onerror = () => { img.src = 'cards/card_back.svg'; };
  }

  el.title = `${card.name} (${typeLabel}) - Clique para expandir`;
  el.addEventListener('click', () => openCardZoom(card));
  return el;
}

function buildCardFan(cards) {
  myHandCards = cards;
  const container = document.getElementById('my-hand-fan-inner');
  const hint = document.getElementById('cards-fan-hint');
  if (!container) return;
  container.innerHTML = '';

  const n = cards.length;

  if (n <= 8) {
    // Até 8 cartas: exibição direta na grid de 3 colunas
    cards.forEach((card) => {
      container.appendChild(createCardElement(card));
    });
  } else {
    // Mais de 8 cartas: primeiras 6 cartas nas linhas 1 e 2
    for (let i = 0; i < 6; i++) {
      container.appendChild(createCardElement(cards[i]));
    }
    // Na 3ª linha: empilha de forma visual/parcial todas as demais cartas
    const stackedRow = document.createElement('div');
    stackedRow.className = 'hand-stacked-row';
    const remainingCards = cards.slice(6);
    const count = remainingCards.length;
    const overlap = Math.min(52, Math.max(16, Math.round(86 - (320 - 86) / Math.max(1, count - 1))));

    remainingCards.forEach((card, idx) => {
      const cardEl = createCardElement(card);
      cardEl.classList.add('stacked-card');
      if (idx > 0) {
        cardEl.style.marginLeft = `-${overlap}px`;
      }
      cardEl.style.zIndex = idx + 1;
      stackedRow.appendChild(cardEl);
    });
    container.appendChild(stackedRow);
  }

  if (hint) {
    hint.style.display = n > 0 ? 'block' : 'none';
    hint.innerText = `${n} carta${n > 1 ? 's' : ''} em mãos (alta definição)`;
  }
}

function buildFallbackCardContent(card) {
  const div = document.createElement('div');
  div.className = 'fan-card-fallback';
  div.innerHTML = `
    <div class="fan-card-fallback-icon">${getCardIcon(card.name)}</div>
    <div class="fan-card-fallback-name">${card.name}</div>
  `;
  return div;
}

function openCardZoom(card) {
  const overlay = document.getElementById('card-zoom-overlay');
  const img = document.getElementById('card-zoom-img');
  const nameEl = document.getElementById('card-zoom-name');
  const typeEl = document.getElementById('card-zoom-type');
  if (!overlay) return;

  const imgSrc = getCardImage(card.name);
  const typeLabels = { suspect: 'Suspeito', weapon: 'Arma', location: 'Local' };
  
  img.style.display = imgSrc ? 'block' : 'none';
  if (imgSrc) {
    img.src = imgSrc;
    img.alt = card.name;
    img.onerror = () => { img.style.display = 'none'; };
  }
  nameEl.innerText = card.name;
  typeEl.innerText = typeLabels[card.type] || card.type;
  overlay.style.display = 'flex';
}

document.getElementById('btn-close-card-zoom').addEventListener('click', () => {
  document.getElementById('card-zoom-overlay').style.display = 'none';
});

// Sincroniza a altura dos flancos com o tabuleiro renderizado
function syncFlankHeights() {
  const canvasWrapper = document.querySelector('.canvas-wrapper');
  const leftFlank = document.getElementById('board-flank-left');
  const rightFlank = document.getElementById('board-flank-right');
  if (canvasWrapper && leftFlank && rightFlank) {
    const h = canvasWrapper.offsetHeight;
    if (h > 100) {
      leftFlank.style.height = `${h}px`;
      rightFlank.style.height = `${h}px`;
    }
  }
}
window.addEventListener('resize', syncFlankHeights);

function updateBoardPlayersBar(state) {
  const leftFlank = document.getElementById('board-flank-left');
  const rightFlank = document.getElementById('board-flank-right');
  const legacyBar = document.getElementById('board-players-bar');
  if (!state || !state.players) return;

  const currentTurnPlayerId = state.turnPlayer ? state.turnPlayer.id : null;
  const players = state.players;
  const total = players.length;

  // Em jogo com 8 jogadores: 4 na esquerda (0..3) e 4 na direita (4..7)
  // Em jogos com menos: distribui de forma equilibrada
  const leftCount = Math.min(4, Math.ceil(total / 2));
  const leftPlayers = players.slice(0, leftCount);
  const rightPlayers = players.slice(leftCount, Math.min(total, 8));

  function createPlayerCardEl(p) {
    const isTurn = p.id === currentTurnPlayerId;
    const isMe = myPlayer && p.id === myPlayer.id;
    const cardEl = document.createElement('div');
    cardEl.className = `flank-player-card player-board-card ${isTurn ? 'player-active-turn' : ''} ${p.eliminated ? 'player-eliminated' : ''}`;
    cardEl.id = `player-board-card-${p.id}`;

    const charName = p.character ? p.character.name : 'Fahur';
    const charColor = (p.character && p.character.color) ? p.character.color : '#f1c40f';
    const imgSrc = getCardImage(charName);

    if (isTurn) {
      cardEl.style.setProperty('--turn-char-color', charColor);
      cardEl.style.setProperty('--turn-char-glow', `${charColor}88`);
      cardEl.style.borderColor = charColor;
      cardEl.style.boxShadow = `0 0 16px ${charColor}, 0 0 28px ${charColor}88`;
    }

    const badgeTextColor = ['#ecf0f1', '#f1c40f', '#29b6f6'].includes(charColor) ? '#111' : '#fff';

    cardEl.innerHTML = `
      <div class="flank-card-art-wrap">
        <img src="${imgSrc}" alt="${charName}" class="flank-card-img" />
        ${isTurn ? `<div class="flank-turn-badge" style="background: ${charColor}; color: ${badgeTextColor}; border-color: ${charColor};">VEZ ATUAL</div>` : ''}
        ${p.eliminated ? '<div class="flank-eliminated-badge">ELIMINADO</div>' : ''}
      </div>
      <div class="flank-card-meta">
        <span class="flank-card-player-name" title="${p.name}">${p.name}${isMe ? ' (Você)' : ''}</span>
        <span class="flank-card-char-name">${charName}</span>
      </div>
    `;
    return cardEl;
  }

  function createEmptySlot() {
    const slot = document.createElement('div');
    slot.className = 'flank-player-card flank-slot-empty';
    slot.innerHTML = '<span class="flank-empty-lbl">VAGO</span>';
    return slot;
  }

  if (leftFlank && rightFlank) {
    leftFlank.innerHTML = '';
    rightFlank.innerHTML = '';

    for (let i = 0; i < 4; i++) {
      if (i < leftPlayers.length) {
        leftFlank.appendChild(createPlayerCardEl(leftPlayers[i]));
      } else {
        leftFlank.appendChild(createEmptySlot());
      }
    }

    for (let i = 0; i < 4; i++) {
      if (i < rightPlayers.length) {
        rightFlank.appendChild(createPlayerCardEl(rightPlayers[i]));
      } else {
        rightFlank.appendChild(createEmptySlot());
      }
    }
    syncFlankHeights();
  } else if (legacyBar) {
    legacyBar.innerHTML = '';
    players.forEach(p => legacyBar.appendChild(createPlayerCardEl(p)));
  }
}

function showEnvelopeIntroAnimation(callback) {
  const modal = document.getElementById('envelope-intro-modal');
  const btnSkip = document.getElementById('btn-skip-envelope');
  const statusText = document.getElementById('envelope-status-text');
  if (!modal) { if (callback) callback(); return; }

  modal.style.display = 'flex';

  let hasClosed = false;
  const finish = () => {
    if (hasClosed) return;
    hasClosed = true;
    modal.style.display = 'none';
    if (callback) callback();
  };

  if (btnSkip) btnSkip.onclick = finish;

  setTimeout(() => {
    if (statusText) statusText.innerText = 'Suspeito guardado no envelope...';
  }, 700);

  setTimeout(() => {
    if (statusText) statusText.innerText = 'Arma do crime selada...';
  }, 1300);

  setTimeout(() => {
    if (statusText) statusText.innerText = 'Local do assassinato confidencial!';
  }, 1900);

  setTimeout(() => {
    if (statusText) statusText.innerText = 'Dossiê selado com cera vermelha!';
  }, 2400);

  setTimeout(() => {
    finish();
  }, 3200);
}

socket.on('game_started', (state) => {
  currentGameState = state;
  document.body.classList.add('in-game');
  document.getElementById('lobby-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'grid';
  if (state.botSpeed) {
    const sel = document.getElementById('select-bot-speed');
    if (sel) sel.value = state.botSpeed;
  }

  // Ajusta o limite do histórico pelo número de jogadores ativos
  const activePlayers = state.players ? state.players.filter(p => !p.eliminated).length : 8;
  historyMaxEntries = Math.max(activePlayers, 3);
  const maxSpan = document.getElementById('history-max');
  if (maxSpan) maxSpan.innerText = historyMaxEntries;

  initHistoryToggle();
  initNotebook();
  populateDropdowns();
  syncPawnPositions(state);
  updateBoardPlayersBar(state);

  // Animação das 3 cartas sendo envelopadas no início
  showEnvelopeIntroAnimation(() => {
    const storyModal = document.getElementById('story-modal');
    if (storyModal) storyModal.style.display = 'flex';
  });
});

// Eventos de clique para abrir/fechar a história de Odete Rolemã
const btnCloseStory = document.getElementById('btn-close-story');
if (btnCloseStory) {
  btnCloseStory.onclick = () => {
    const storyModal = document.getElementById('story-modal');
    if (storyModal) storyModal.style.display = 'none';
  };
}

const btnViewStory = document.getElementById('btn-view-story');
if (btnViewStory) {
  btnViewStory.onclick = () => {
    const storyModal = document.getElementById('story-modal');
    if (storyModal) storyModal.style.display = 'flex';
  };
}

socket.on('turn_changed', (state) => {
  currentGameState = state;
  const isMyTurn = state.turnPlayer.id === socket.id;
  const me = state.players.find(p => p.id === socket.id);
  const amEliminated = me && me.eliminated;
  const indicator = document.getElementById('turn-indicator');
  const waitingPanel = document.getElementById('action-panel-waiting');
  const activePanel = document.getElementById('action-panel-active');

  indicator.innerText = isMyTurn ? 'É a sua vez de jogar!' : `Vez de: ${state.turnPlayer.name}`;

  // Tocar som de notificação quando for a vez do jogador humano
  if (isMyTurn && !amEliminated) {
    playTurnSound();
  }

  // Fechar avisos residuais de refutação e acusação ao mudar de turno
  const refuteModal = document.getElementById('refute-modal');
  if (refuteModal) refuteModal.style.display = 'none';
  document.getElementById('accusation-modal').style.display = 'none';

  // Atualizar cartas dos jogadores ao redor do tabuleiro com contorno ativo na cor do peão
  updateBoardPlayersBar(state);

  if (isMyTurn && !amEliminated) {
    if (waitingPanel) waitingPanel.style.display = 'none';
    if (activePanel) activePanel.style.display = 'block';
    setupTurnOptions();
  } else {
    if (activePanel) activePanel.style.display = 'none';
    if (waitingPanel) {
      waitingPanel.style.display = 'block';
      const waitTitle = document.getElementById('waiting-title');
      const waitSub = document.getElementById('waiting-status-text');
      if (amEliminated) {
        if (waitTitle) waitTitle.innerText = 'Você foi eliminado!';
        if (waitSub) waitSub.innerText = 'Acompanhe o jogo como espectador.';
      } else {
        if (waitTitle) waitTitle.innerText = `Vez de: ${state.turnPlayer.name}`;
        if (waitSub) {
          waitSub.innerText = state.turnPlayer.isBot
            ? `${state.turnPlayer.name} está analisando o tabuleiro...`
            : `Aguardando a jogada de ${state.turnPlayer.name}...`;
        }
      }
    }
  }

  reachableTiles = [];
  reachableRooms = [];
  reachableDoors = [];
  document.getElementById('movement-guidance').style.display = 'none';
  document.getElementById('suggestion-box').style.display = 'none';

  // Atualizar Fila de Turnos
  const activePlayers = state.players.filter(p => !p.eliminated);
  const currentIdx = activePlayers.findIndex(p => p.id === state.turnPlayer.id);
  const nextPlayer = activePlayers[(currentIdx + 1) % activePlayers.length];
  const queueText = document.getElementById('turn-queue-text');
  if (queueText) {
    queueText.innerHTML = `<strong>Jogando:</strong> ${state.turnPlayer.name}<br><strong>Próximo a jogar:</strong> ${nextPlayer ? nextPlayer.name : ''}`;
  }

  updatePlayerUI();
  syncPawnPositions(state);
});

function updatePlayerUI() {
  const me = currentGameState.players.find((p) => p.id === socket.id);
  if (me) {
    document.getElementById('my-current-pos').innerText = me.inRoom ? me.inRoom : `Corredor (${me.tile.x}, ${me.tile.y})`;
    document.getElementById('secret-passages-left').innerText = 3 - me.secretPassageUses;
  }
}

function setupTurnOptions() {
  const me = currentGameState.players.find((p) => p.id === socket.id);
  const btnPassage = document.getElementById('btn-secret-passage');
  const btnStaySuggest = document.getElementById('btn-stay-suggest');
  const btnRoll = document.getElementById('btn-roll-dice');
  const btnOpenAccuse = document.getElementById('btn-open-accusation-modal');
  const btnCancelAccuse = document.getElementById('btn-cancel-accusation');
  const turnDecDiv = document.getElementById('turn-decision-buttons');

  if (turnDecDiv) turnDecDiv.style.display = 'flex';
  document.getElementById('movement-guidance').style.display = 'none';
  document.getElementById('suggestion-box').style.display = 'none';

  const activePlayers = currentGameState.players.filter(p => !p.eliminated);
  const isSoleSurvivor = activePlayers.length === 1 && activePlayers[0].id === socket.id;

  if (isSoleSurvivor) {
    // Último detetive restante na mesa: é obrigado a fazer a acusação final agora com base nas suas pistas!
    btnRoll.style.display = 'none';
    if (btnPassage) btnPassage.style.display = 'none';
    if (btnStaySuggest) btnStaySuggest.style.display = 'none';
    if (btnOpenAccuse) {
      btnOpenAccuse.style.display = 'block';
      btnOpenAccuse.innerHTML = `<img src="cards/icons/alert.svg" class="ui-icon-xs" alt="" /> Fazer Acusação Final Obrigatória`;
    }
    const accusModal = document.getElementById('accusation-modal');
    if (accusModal) accusModal.style.display = 'flex';
    if (btnCancelAccuse) btnCancelAccuse.style.display = 'none';
    return;
  }

  if (btnCancelAccuse) btnCancelAccuse.style.display = 'inline-block';
  if (btnOpenAccuse) {
    btnOpenAccuse.style.display = 'block';
    btnOpenAccuse.innerHTML = `<img src="cards/icons/alert.svg" class="ui-icon-xs" alt="" /> Fazer Acusação Final`;
  }
  btnRoll.style.display = 'block';

  // Verifica se há passagem secreta disponível no local atual
  if (me.inRoom && secretPassages[me.inRoom] && me.secretPassageUses < 3) {
    btnPassage.style.display = 'block';
    btnPassage.innerHTML = `<img src="cards/icons/door.svg" class="ui-icon-xs" alt="" /> Passagem Secreta para ${secretPassages[me.inRoom]} (Sem Dado)`;
  } else {
    btnPassage.style.display = 'none';
  }

  // Verifica se foi arrastado por palpite de outro jogador
  if (me.wasDraggedBySuggestion && me.inRoom) {
    btnStaySuggest.style.display = 'block';
    btnStaySuggest.innerHTML = `<img src="cards/icons/search.svg" class="ui-icon-xs" alt="" /> Palpitar Aqui em ${me.inRoom} (Sem Dado)`;
  } else {
    btnStaySuggest.style.display = 'none';
  }
}

document.getElementById('btn-roll-dice').onclick = () => {
  socket.emit('roll_dice');
};

// ===========================
// ANIMAÇÃO DO DADO 3D CAINDO SOBRE O TABULEIRO
// ===========================
const DICE_DOT_PATTERNS = {
  1: [{ top: '50%', left: '50%' }],
  2: [{ top: '20%', left: '20%' }, { top: '80%', left: '80%' }],
  3: [{ top: '20%', left: '20%' }, { top: '50%', left: '50%' }, { top: '80%', left: '80%' }],
  4: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
  5: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '50%', left: '50%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
  6: [{ top: '25%', left: '25%' }, { top: '25%', left: '75%' }, { top: '50%', left: '25%' }, { top: '50%', left: '75%' }, { top: '75%', left: '25%' }, { top: '75%', left: '75%' }],
};

function renderDiceDots(containerId, value) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.style.position = 'relative';
  container.style.width = '68px';
  container.style.height = '68px';
  container.innerHTML = '';
  const dots = DICE_DOT_PATTERNS[value] || DICE_DOT_PATTERNS[1];
  dots.forEach(pos => {
    const dot = document.createElement('div');
    // MADots Stroke de dado.blend: núcleo branco/prata com anel escuro e reflexo especular
    dot.style.cssText = `
      position: absolute;
      width: 14px;
      height: 14px;
      background: radial-gradient(circle at 35% 35%, #ffffff 0%, #f0f0f0 45%, #d5d5d5 80%, #b5b5b5 100%);
      border: 1.8px solid #200205;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      top: ${pos.top};
      left: ${pos.left};
      box-shadow: inset 0 1px 2px rgba(255,255,255,0.95), 0 1px 3px rgba(0,0,0,0.85), 0 0 5px rgba(255,255,255,0.3);
    `;
    container.appendChild(dot);
  });
}

function showDiceAnimation(rollerName, value, callback) {
  const overlay = document.getElementById('dice-animation-overlay');
  const dice3d = document.getElementById('dice-3d');
  const resultDisplay = document.getElementById('dice-result-display');
  const resultNumber = document.getElementById('dice-result-number');
  if (!overlay || !dice3d) { if (callback) callback(); return; }

  // Configura as faces do dado
  const faceValues = [value, 7 - value, Math.ceil(Math.random()*6), Math.ceil(Math.random()*6), Math.ceil(Math.random()*6), Math.ceil(Math.random()*6)];
  ['front','back','top','bottom','left','right'].forEach((face, i) => {
    renderDiceDots(`dice-dots-${face}`, Math.max(1, Math.min(6, faceValues[i])));
  });

  // Reinicia a animação sobre o tabuleiro
  dice3d.classList.remove('dice-landing');
  resultDisplay.style.display = 'none';
  overlay.style.display = 'flex';

  // Força reflow para reiniciar a animação CSS
  dice3d.style.animation = 'none';
  void dice3d.offsetWidth;
  dice3d.style.animation = '';

  setTimeout(() => {
    dice3d.classList.add('dice-landing');
    setTimeout(() => {
      if (resultNumber) resultNumber.innerText = value;
      resultDisplay.style.display = 'block';
      setTimeout(() => {
        overlay.style.display = 'none';
        if (callback) callback();
      }, 500);
    }, 250);
  }, 450);
}

let pendingDiceCallback = null;

socket.on('dice_rolled', (data) => {
  document.getElementById('narrative-bar').innerText = `${data.roller} rolou o dado e tirou [ ${data.value} ]!`;
  const indicator = document.getElementById('turn-indicator');
  if (indicator) {
    indicator.innerText = `Vez de: ${data.roller} | Dado: [ ${data.value} ]`;
  }
  showDiceAnimation(data.roller, data.value, null);
});

socket.on('dice_roll_result', ({ dice }) => {
  // Atualiza o valor visível no painel lateral
  document.getElementById('dice-result-val').innerText = dice;

  // Mostra imediatamente o guia de movimento, oculta botões iniciais e ilumina as casas alcançáveis
  document.getElementById('movement-guidance').style.display = 'block';
  document.getElementById('btn-roll-dice').style.display = 'none';
  document.getElementById('btn-secret-passage').style.display = 'none';
  document.getElementById('btn-stay-suggest').style.display = 'none';
  calculateReachablePositions(dice);
  drawBoard();
});


document.getElementById('btn-secret-passage').onclick = () => {
  socket.emit('use_secret_passage');
};

document.getElementById('btn-stay-suggest').onclick = () => {
  socket.emit('stay_and_suggest');
};

socket.on('ready_for_suggestion', ({ room }) => {
  document.getElementById('turn-decision-buttons').style.display = 'none';
  document.getElementById('movement-guidance').style.display = 'none';
  document.getElementById('current-room-name').innerText = room;
  document.getElementById('suggestion-box').style.display = 'block';
  reachableTiles = [];
  reachableRooms = [];
  reachableDoors = [];
  drawBoard();
});

// ================= LÓGICA DE MOVIMENTAÇÃO E TABULEIRO =================

function isInsideRoom(x, y) {
  for (const [rName, conf] of Object.entries(roomsConfig)) {
    if (x >= conf.x && x < conf.x + conf.w && y >= conf.y && y < conf.y + conf.h) {
      return rName;
    }
  }
  return null;
}

function getDoorRoom(x, y) {
  const d = DOORS_BY_CELL[`${x},${y}`];
  return d ? d.roomName : null;
}

// Algoritmo BFS para cálculo de posições e salas alcançáveis usando diretamente grid_matrix
// Algoritmo BFS para cálculo de posições e salas alcançáveis usando diretamente grid_matrix
// 0: Colisão (paredes e salas)
// 1: Corredor transitável
// 2: Porta / transição para salas
function calculateReachablePositions(dice) {
  const me = currentGameState.players.find((p) => p.id === socket.id);
  if (!me) return;

  reachableTiles = [];
  reachableRooms = [];
  reachableDoors = [];

  const visited = new Map();
  const queue = [];

  // Outros peões no corredor bloqueiam passagem (regra oficial)
  const occupiedTiles = currentGameState.players
    .filter((p) => p.id !== socket.id && !p.inRoom && !p.eliminated)
    .map((p) => `${p.tile.x},${p.tile.y}`);

  function searchReachable(ignorePawns) {
    const rTiles = [];
    const rRooms = [];
    const rDoors = [];
    const vMap = new Map();
    const q = [];

    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    if (me.inRoom) {
      const canonicalRoomName = (me.inRoom === 'Praça Único Poder' || me.inRoom === 'Praça do Único Poder')
        ? 'Praça do Único Poder'
        : me.inRoom;
      const rConf = DEFAULT_ROOMS[canonicalRoomName] || DEFAULT_ROOMS[me.inRoom] || roomsConfig[canonicalRoomName] || roomsConfig[me.inRoom];
      if (rConf && rConf.doors) {
        rConf.doors.forEach((door) => {
          // Obtenção robusta da coordenada de saída (exitTo)
          const doorX = (door.cell && door.cell.x !== undefined) ? door.cell.x : door.x;
          const doorY = (door.cell && door.cell.y !== undefined) ? door.cell.y : door.y;
          let exit = door.exitTo;
          if (!exit) {
            const dInfo = DOORS_BY_CELL[`${doorX},${doorY}`];
            if (dInfo && dInfo.exitTo) exit = dInfo.exitTo;
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
            // Ao sair de um cômodo, peões na frente da porta não bloqueiam a saída
            const isBlocked = !ignorePawns && !me.inRoom && occupiedTiles.includes(exitKey);
            if (GRID_MATRIX[exit.y][exit.x] === 1 && !isBlocked && dice >= 1) {
              const stepsLeft = dice - 1;
              q.push({ x: exit.x, y: exit.y, stepsLeft });
              vMap.set(exitKey, stepsLeft);
              if (stepsLeft === 0) {
                if (!rTiles.some((t) => t.x === exit.x && t.y === exit.y)) {
                  rTiles.push({ x: exit.x, y: exit.y });
                }
              }
            }
          }
        });
      }
    } else {
      // Está no corredor
      const startKey = `${me.tile.x},${me.tile.y}`;
      q.push({ x: me.tile.x, y: me.tile.y, stepsLeft: dice });
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

        // 2 = Porta de transição para uma sala (onde fica a seta de entrada)
        if (cellVal === 2) {
          const doorInfo = DOORS_BY_CELL[`${nx},${ny}`];
          if (doorInfo) {
            const targetRoom = doorInfo.roomName;
            if (!me.inRoom || targetRoom !== me.inRoom) {
              if (!rRooms.some((r) => r.name === targetRoom)) {
                rRooms.push({ name: targetRoom });
              }
              if (!rDoors.some((d) => d.x === nx && d.y === ny)) {
                rDoors.push({ x: nx, y: ny, roomName: targetRoom });
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
              if (!rTiles.some((t) => t.x === nx && t.y === ny)) {
                rTiles.push({ x: nx, y: ny });
              }
            }
          }
        }
      }
    }

    // Salvaguarda: se estiver encurralado e sem salas com stepsLeft === 0, permite a casa mais distante alcançada
    if (rTiles.length === 0 && rRooms.length === 0 && vMap.size > 0) {
      let minSteps = Infinity;
      vMap.forEach((steps) => {
        if (steps < minSteps) minSteps = steps;
      });
      vMap.forEach((steps, key) => {
        if (steps === minSteps) {
          const [vx, vy] = key.split(',').map(Number);
          if (!me.inRoom || (vx !== me.tile.x || vy !== me.tile.y)) {
            if (!rTiles.some((t) => t.x === vx && t.y === vy)) {
              rTiles.push({ x: vx, y: vy });
            }
          }
        }
      });
    }

    return { rTiles, rRooms, rDoors };
  }

  // 1ª tentativa: busca respeitando peões
  let result = searchReachable(false);

  // 2ª tentativa: se o peão estiver dentro de um local e ficou "preso" (sem opções de casas ou salas válidas),
  // desconsidera os outros peões bloqueadores e permite sair do local livremente!
  if (result.rTiles.length === 0 && result.rRooms.length === 0) {
    result = searchReachable(true);
  }

  reachableTiles = result.rTiles;
  reachableRooms = result.rRooms;
  reachableDoors = result.rDoors;
}

const ctx = canvas.getContext('2d');

// ================= MAPA GRÁFICO OFICIAL (ARTE GEMINI CALIBRADA) =================
const boardMapImg = new Image();
let boardMapLoaded = false;
boardMapImg.src = 'board_map.png';
boardMapImg.onload = () => {
  boardMapLoaded = true;
  drawBoard();
};

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Renderiza o mapa da cidade em alta resolução (com portas e cômodos integrados na arte)
  if (boardMapLoaded) {
    ctx.drawImage(boardMapImg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#0d1522';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. Iluminação das Casas Alcançáveis de Movimento (Verde fluorescente perfeitamente sobre as linhas do mapa)
  reachableTiles.forEach((t) => {
    const { x, y, w, h } = tileToRect(t.x, t.y);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  });

  // 3. Iluminação das Portas Alcançáveis em verde sobre a seta (valor 2 da matriz)
  reachableDoors.forEach((d) => {
    const { x, y, w, h } = tileToRect(d.x, d.y);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.65)';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

    ctx.save();
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
    ctx.restore();
  });

  // 4. Peões 3D no estilo Pawn.stl com sombras de contato
  if (currentGameState && currentGameState.players) {
    currentGameState.players.forEach((player) => {
      if (player.eliminated) return;
      const pv = pawnVisuals[player.id];
      if (pv) {
        draw3DPawn(pv.curX, pv.curY, player, pv.elevation || 0);
      } else {
        const coords = getPawnTargetCoords(player);
        draw3DPawn(coords.x, coords.y, player, 0);
      }
    });
  }
}

// ================= DESENHO DO PEÃO 3D (MODELO PAWN.STL CENTRALIZADO) =================

function draw3DPawn(x, y, player, elevation = 0) {
  const pawnColor = player.character.color || '#f1c40f';

  // 1. Sombra de contato no chão (ancorada simetricamente sob a base do peão)
  const shadowY = y + 7.2;
  const shadowRx = 8.5 + elevation * 0.12;
  const shadowRy = 3.0 + elevation * 0.06;
  const shadowAlpha = Math.max(0.12, 0.45 - elevation * 0.018);

  ctx.beginPath();
  ctx.ellipse(x, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.fill();

  // Coordenada vertical do peão no ar
  const py = y - elevation;

  // 2. Base Circular Chanfrada do Peão (Geometria 3D Z=0..1)
  // Disco inferior (chanfro escuro)
  ctx.beginPath();
  ctx.ellipse(x, py + 7.5, 8.0, 2.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = shadeColor(pawnColor, -55);
  ctx.fill();
  ctx.strokeStyle = shadeColor(pawnColor, -70);
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Borda superior da base (reflexo de luz na borda do pé)
  ctx.beginPath();
  ctx.ellipse(x, py + 6.3, 7.2, 2.4, 0, 0, Math.PI * 2);
  const baseGrad = ctx.createLinearGradient(x - 7, py + 6.3, x + 7, py + 6.3);
  baseGrad.addColorStop(0, shadeColor(pawnColor, 20));
  baseGrad.addColorStop(0.35, pawnColor);
  baseGrad.addColorStop(1, shadeColor(pawnColor, -40));
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // 3. Tronco / Corpo Curvo do Peão (Geometria Z=1..4.5)
  ctx.beginPath();
  ctx.moveTo(x - 6.2, py + 6.2);
  ctx.bezierCurveTo(x - 5.0, py + 2.5, x - 2.8, py - 0.5, x - 3.0, py - 3.2);
  ctx.lineTo(x + 3.0, py - 3.2);
  ctx.bezierCurveTo(x + 2.8, py - 0.5, x + 5.0, py + 2.5, x + 6.2, py + 6.2);
  ctx.closePath();

  // Gradiente cilíndrico de volume 3D com luz da esquerda
  const stemGrad = ctx.createLinearGradient(x - 6.2, py, x + 6.2, py);
  stemGrad.addColorStop(0, shadeColor(pawnColor, -25));
  stemGrad.addColorStop(0.25, '#ffffff'); // Brilho especular vertical
  stemGrad.addColorStop(0.45, pawnColor);
  stemGrad.addColorStop(1, shadeColor(pawnColor, -50));
  ctx.fillStyle = stemGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // 4. Anel / Colar de Transição (Geometria Z=4.5..5)
  ctx.beginPath();
  ctx.ellipse(x, py - 3.2, 4.4, 1.4, 0, 0, Math.PI * 2);
  const collarGrad = ctx.createLinearGradient(x - 4.4, py - 3.2, x + 4.4, py - 3.2);
  collarGrad.addColorStop(0, shadeColor(pawnColor, 35));
  collarGrad.addColorStop(0.4, pawnColor);
  collarGrad.addColorStop(1, shadeColor(pawnColor, -45));
  ctx.fillStyle = collarGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // 5. Cabeça Esférica Perfeita (Geometria Z=5..7.4)
  const headRadius = 4.8;
  const headCenterY = py - 8.2;

  ctx.beginPath();
  ctx.arc(x, headCenterY, headRadius, 0, Math.PI * 2);

  // Iluminação 3D Esférica Especular
  const headGrad = ctx.createRadialGradient(
    x - 1.5, headCenterY - 1.8, 0.8,
    x, headCenterY, headRadius
  );
  headGrad.addColorStop(0, '#ffffff');               // Ponto de luz especular forte
  headGrad.addColorStop(0.25, shadeColor(pawnColor, 40));
  headGrad.addColorStop(0.65, pawnColor);            // Cor pura do personagem
  headGrad.addColorStop(0.9, shadeColor(pawnColor, -35));
  headGrad.addColorStop(1, shadeColor(pawnColor, -60)); // Oclusão de sombra na borda
  ctx.fillStyle = headGrad;
  ctx.fill();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // 6. Letra / Insígnia do Personagem
  ctx.font = 'bold 6.5px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 2;
  ctx.fillText(player.character.name.charAt(0), x, headCenterY + 0.4);
  ctx.shadowBlur = 0;
}

// Clique no Canvas
canvas.onclick = (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;

  const { tileX, tileY } = pixelToTile(clickX, clickY);

  // 1. Se clicou diretamente no quadrante de porta com a seta verde (onde tem a seta, valor 2 da matriz)
  const clickedDoor = reachableDoors.find(d => d.x === tileX && d.y === tileY);
  if (clickedDoor) {
    socket.emit('move_to_tile_or_room', { roomName: clickedDoor.roomName });
    return;
  }

  // 2. Se clicou dentro da área retangular de qualquer sala alcançável
  for (const rr of reachableRooms) {
    const conf = roomsConfig[rr.name] || DEFAULT_ROOMS[rr.name];
    if (conf) {
      const { x, y, w, h } = roomToRect(conf);
      if (clickX >= x && clickX < x + w && clickY >= y && clickY < y + h) {
        socket.emit('move_to_tile_or_room', { roomName: rr.name });
        return;
      }
    }
  }

  // 3. Se clicou em uma casa de corredor alcançável
  const isTileValid = reachableTiles.some((t) => t.x === tileX && t.y === tileY);
  if (isTileValid) {
    socket.emit('move_to_tile_or_room', { tile: { x: tileX, y: tileY } });
  }
};

// ================= BLOCO DE NOTAS E FORMULÁRIOS =================

// Guarda o estado de cada item do notebook (0=Vazio, 1=Inocente, 2=Suspeito)
let notebookState = {};

// ===========================
// CADERNO DE DETETIVE (ZERO EMOJIS, MARCAÇÕES SVG)
// Sem pausa no jogo: a partida segue normalmente
// ===========================
function initNotebook() {
  const btnOpen = document.getElementById('btn-notebook-open');
  const btnClose = document.getElementById('btn-notebook-close');
  const overlay = document.getElementById('notebook-overlay');
  if (btnOpen) {
    btnOpen.onclick = () => {
      overlay.style.display = 'flex';
      renderNotebook();
    };
  }
  if (btnClose) {
    btnClose.onclick = () => {
      overlay.style.display = 'none';
    };
  }
  // Fechar clicando no fundo
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.style.display = 'none';
      }
    });
  }
}

function buildNotebook(cards = []) {
  const handNames = cards.map(c => c.name);
  [...SUSPECTS, ...WEAPONS, ...LOCATIONS].forEach(item => {
    if (handNames.includes(item)) {
      notebookState[item] = 1; // cartas na mão = inocente
    } else if (notebookState[item] === undefined) {
      notebookState[item] = 0;
    }
  });
  renderNotebook();
}

function renderNotebook() {
  const handNames = myHandCards.map(c => c.name);
  const sections = [
    { id: 'notebook-suspects', items: [...SUSPECTS].sort((a, b) => a.localeCompare(b, 'pt-BR')) },
    { id: 'notebook-weapons', items: [...WEAPONS].sort((a, b) => a.localeCompare(b, 'pt-BR')) },
    { id: 'notebook-locations', items: [...LOCATIONS].sort((a, b) => a.localeCompare(b, 'pt-BR')) },
  ];

  sections.forEach(({ id, items }) => {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '';

    items.forEach(item => {
      const isLocked = handNames.includes(item);
      const state = notebookState[item] || 0;

      const row = document.createElement('div');
      const stateNames = ['empty', 'innocent', 'suspect'];
      row.className = `notebook-item state-${stateNames[state]}${isLocked ? ' state-locked' : ''}`;
      row.dataset.item = item;

      const nameEl = document.createElement('span');
      nameEl.className = 'notebook-item-name';
      nameEl.textContent = item;

      const markEl = document.createElement('span');
      markEl.className = 'notebook-item-mark';
      const markIcon = document.createElement('span');
      markIcon.className = 'mark-icon';

      // Zero emojis: usa ícones vetoriais SVG
      if (state === 1) {
        markIcon.innerHTML = '<img src="cards/icons/cross.svg" class="nb-mark-icon" alt="" />';
      } else if (state === 2) {
        markIcon.innerHTML = '<img src="cards/icons/check.svg" class="nb-mark-icon" alt="" />';
      } else {
        markIcon.innerHTML = '';
      }
      markEl.appendChild(markIcon);

      row.appendChild(nameEl);
      row.appendChild(markEl);

      if (!isLocked) {
        row.onclick = () => notebookCycle(item);
      }

      container.appendChild(row);
    });
  });
}

function notebookCycle(itemName) {
  const handNames = myHandCards.map(c => c.name);
  if (handNames.includes(itemName)) return;
  notebookState[itemName] = ((notebookState[itemName] || 0) + 1) % 3;
  renderNotebook();
}

function notebookMarkItem(itemName, stateValue) {
  notebookState[itemName] = stateValue;
  renderNotebook();
}

// ===========================
// POP-UP ANIMADO DE CARTA REVELADA
// ===========================
function showCardRevealPopup(fromName, cardName, onClose) {
  const overlay = document.getElementById('card-reveal-overlay');
  const fromText = document.getElementById('card-reveal-from-text');
  const img = document.getElementById('card-reveal-img');
  const nameText = document.getElementById('card-reveal-name-text');
  const frame = document.getElementById('card-reveal-frame');
  const btnNote = document.getElementById('btn-card-reveal-notebook');
  const btnClose = document.getElementById('btn-close-card-reveal');
  const autoOpt = document.getElementById('card-reveal-auto-option');
  const chkAuto = document.getElementById('chk-auto-mark-notebook');
  if (!overlay) { if (onClose) onClose(); return; }

  fromText.innerHTML = `<strong style="color: #ffd700;">${fromName}</strong> revelou secretamente uma carta para refutar seu palpite:`;
  nameText.innerText = cardName;

  const imgSrc = getCardImage(cardName);
  img.src = imgSrc;
  img.alt = cardName;
  img.style.display = 'block';
  img.onerror = () => { img.src = 'cards/card_back.svg'; };
  frame.style.display = 'block';

  if (autoOpt) autoOpt.style.display = 'flex';

  const savedAuto = getSafeStorage('misterio_auto_mark_notebook', 'true');
  const isAutoInitially = (savedAuto === 'true');
  if (chkAuto) chkAuto.checked = isAutoInitially;

  // Se a opção automática estiver marcada, anota imediatamente no caderno (inocente = 1)
  if (isAutoInitially) {
    notebookMarkItem(cardName, 1);
  }

  if (chkAuto) {
    chkAuto.onchange = () => {
      const checked = chkAuto.checked;
      setSafeStorage('misterio_auto_mark_notebook', checked ? 'true' : 'false');
      if (checked) {
        notebookMarkItem(cardName, 1);
      } else {
        notebookMarkItem(cardName, 0);
      }
    };
  }

  function handleClosePopup(openNotebook) {
    overlay.style.display = 'none';
    const isAuto = chkAuto ? chkAuto.checked : true;
    setSafeStorage('misterio_auto_mark_notebook', isAuto ? 'true' : 'false');

    if (isAuto) {
      notebookMarkItem(cardName, 1);
    }

    if (openNotebook) {
      const notebookOverlay = document.getElementById('notebook-overlay');
      if (notebookOverlay) {
        notebookOverlay.style.display = 'flex';
        renderNotebook();
      }
    }
    if (onClose) onClose();
  }

  if (btnNote) {
    btnNote.style.display = 'block';
    btnNote.onclick = () => handleClosePopup(true);
  }

  if (btnClose) {
    btnClose.onclick = () => handleClosePopup(false);
  }

  overlay.style.display = 'flex';
}

socket.on('card_revealed_private', (data) => {
  playRefuteSound(); // Som de revelação de carta
  if (data.suggestionId) {
    updateHistorySuggestionOutcome(data.suggestionId, true, data.from, data.card);
  }
  const narrBar = document.getElementById('narrative-bar');
  if (narrBar) {
    narrBar.innerText = `${data.from} revelou secretamente a carta [ ${data.card} ] para refutar seu palpite!`;
  }
  showCardRevealPopup(data.from, data.card, null);
});

socket.on('narrative_log', (msg) => {
  // Higieniza removendo qualquer caractere emoji
  const cleanMsg = msg.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
  document.getElementById('narrative-bar').innerText = cleanMsg;
});

// ===========================
// FORMULÁRIOS E DROPDOWNS EM ORDEM ALFABÉTICA
// ===========================
function populateDropdowns() {
  const sortedSuspects = [...SUSPECTS].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sortedWeapons = [...WEAPONS].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sortedLocations = [...LOCATIONS].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  document.getElementById('select-suspect').innerHTML = sortedSuspects.map((s) => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('select-weapon').innerHTML = sortedWeapons.map((w) => `<option value="${w}">${w}</option>`).join('');
  document.getElementById('accuse-suspect').innerHTML = sortedSuspects.map((s) => `<option value="${s}">${s}</option>`).join('');
  document.getElementById('accuse-weapon').innerHTML = sortedWeapons.map((w) => `<option value="${w}">${w}</option>`).join('');
  document.getElementById('accuse-location').innerHTML = sortedLocations.map((l) => `<option value="${l}">${l}</option>`).join('');
}

document.getElementById('btn-submit-suggestion').onclick = () => {
  const suspect = document.getElementById('select-suspect').value;
  const weapon = document.getElementById('select-weapon').value;
  const location = document.getElementById('current-room-name').innerText;

  socket.emit('submit_suggestion', { suspect, weapon, location });
  document.getElementById('suggestion-box').style.display = 'none';
  document.getElementById('turn-decision-buttons').style.display = 'flex';
};

// Acusação Final
document.getElementById('btn-open-accusation-modal').onclick = () => {
  document.getElementById('accusation-modal').style.display = 'flex';
};

document.getElementById('btn-cancel-accusation').onclick = () => {
  document.getElementById('accusation-modal').style.display = 'none';
};

document.getElementById('btn-confirm-accusation').onclick = () => {
  const suspect = document.getElementById('accuse-suspect').value;
  const weapon = document.getElementById('accuse-weapon').value;
  const location = document.getElementById('accuse-location').value;

  if (confirm(`ACUSAÇÃO DEFINITIVA!\n\nSuspeito: ${suspect}\nArma: ${weapon}\nLocal: ${location}\n\nSe errar, você é ELIMINADO!\nTem certeza?`)) {
    socket.emit('submit_accusation', { suspect, weapon, location });
    document.getElementById('accusation-modal').style.display = 'none';
  }
};

// Refutação
socket.on('must_refute', (data) => {
  playRefuteSound(); // Som 2: Notificação de refutação
  const modal = document.getElementById('refute-modal');
  if (!modal) return;
  document.getElementById('refute-suggester').innerText = data.suggesterName;
  const optionsDiv = document.getElementById('refute-options');
  optionsDiv.innerHTML = '';

  data.cards.forEach((card) => {
    const btn = document.createElement('button');
    btn.className = 'btn-refute-option';
    btn.innerHTML = `<img src="cards/icons/card.svg" class="ui-icon-xs" alt="" /> Mostrar: <strong>${card.name}</strong>`;
    btn.onclick = () => {
      socket.emit('refute_card_chosen', {
        cardName: card.name,
        suggesterId: data.suggesterId,
        suggestionId: data.suggestionId
      });
      modal.style.display = 'none';
    };
    optionsDiv.appendChild(btn);
  });

  modal.style.display = 'flex';
});

socket.on('board_sync', (state) => {
  currentGameState = state;
  if (state.botSpeed) {
    const sel = document.getElementById('select-bot-speed');
    if (sel && sel.value !== state.botSpeed) sel.value = state.botSpeed;
  }
  updatePlayerUI();
  updateBoardPlayersBar(state);
  syncPawnPositions(state);
});

socket.on('suggestion_broadcast', (data) => {
  currentGameState.players = data.players;
  document.getElementById('narrative-bar').innerText = `${data.suggesterName} sugeriu: ${data.suspect} com ${data.weapon} no(a) ${data.location}!`;
  // Registra no histórico com identificação lateral amarela
  addHistoryEntry('cards/icons/search.svg', `${data.suggesterName}: ${data.suspect} / ${data.weapon} em ${data.location}`, 'suggestion', {
    suggestionId: data.suggestionId,
    badge: 'AGUARDANDO REFUTAÇÃO...',
    badgeClass: 'badge-waiting'
  });
  updateBoardPlayersBar(currentGameState);
  syncPawnPositions(currentGameState);
});

socket.on('suggestion_resolved', (data) => {
  // Fecha imediatamente a caixa de aviso de refutação na tela do respondedor
  const modal = document.getElementById('refute-modal');
  if (modal) modal.style.display = 'none';

  // Apenas atualiza o resultado dentro do registro amarelo correspondente
  updateHistorySuggestionOutcome(data.suggestionId, data.hasRefuted, data.respondentName);
});

socket.on('accusation_failed', (data) => {
  const cleanMsg = data.message.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
  alert(cleanMsg);
});

socket.on('game_over', (data) => {
  const modal = document.getElementById('epilogue-modal');
  if (modal) {
    const isUnsolved = !data.winner || data.winner.toLowerCase().includes('nenhum');
    const hasWinner = !isUnsolved;

    const badgeEl = document.getElementById('epilogue-badge') || modal.querySelector('.epilogue-badge');
    const titleEl = document.getElementById('epilogue-title');
    const winnerBannerEl = document.getElementById('epilogue-winner-banner');
    const deductionTitleEl = document.getElementById('epilogue-deduction-title');
    const crimeTitleEl = document.getElementById('epilogue-crime-title');

    if (badgeEl) {
      badgeEl.innerText = hasWinner ? 'CASO RESOLVIDO' : 'CASO NÃO RESOLVIDO';
      badgeEl.style.background = hasWinner ? '#7c3a05' : '#5c1d1d';
      badgeEl.style.color = hasWinner ? '#fef3c7' : '#fee2e2';
      badgeEl.style.borderColor = hasWinner ? '#f59e0b' : '#ef4444';
    }

    if (titleEl) {
      titleEl.innerText = hasWinner ? 'Justiça por Odete Rolemã!' : 'O Crime Ficou Impune!';
      titleEl.style.color = hasWinner ? '#ffd700' : '#f87171';
    }

    if (winnerBannerEl) {
      if (hasWinner) {
        winnerBannerEl.innerHTML = `Detetive Vencedor(a): <strong style="color: #ffd700;">${data.winner}</strong>`;
      } else {
        winnerBannerEl.innerHTML = `<span style="color: #f87171; font-weight: bold;">Nenhum Detetive Venceu — Todos os Investigadores Foram Eliminados!</span>`;
      }
    }

    if (deductionTitleEl) {
      deductionTitleEl.innerText = hasWinner ? 'Como o Caso Foi Solucionado:' : 'Como a Investigação Fracassou:';
    }

    if (crimeTitleEl) {
      crimeTitleEl.innerText = 'A Resolução do Assassinato:';
    }

    document.getElementById('epilogue-suspect').innerText = data.envelope.suspect;
    document.getElementById('epilogue-weapon').innerText = data.envelope.weapon;
    document.getElementById('epilogue-location').innerText = data.envelope.location;

    if (data.epilogue) {
      document.getElementById('epilogue-deduction-text').innerText = data.epilogue.detectiveDeduction;
      document.getElementById('epilogue-crime-text').innerText = data.epilogue.crimeResolution;
    } else {
      if (hasWinner) {
        document.getElementById('epilogue-deduction-text').innerText = `O mistério foi brilhantemente elucidado por ${data.winner}, que desvendou todas as pistas e confrontou o culpado!`;
        document.getElementById('epilogue-crime-text').innerText = `Ficou comprovado que ${data.envelope.suspect} assassinou Odete Rolemã com ${data.envelope.weapon} no(a) [${data.envelope.location}].`;
      } else {
        document.getElementById('epilogue-deduction-text').innerText = `Entre deduções precipitadas e pistas falsas, todos os detetives acabaram eliminados sem desvendar o mistério a tempo.`;
        document.getElementById('epilogue-crime-text').innerText = `Ficou revelado no envelope confidencial que ${data.envelope.suspect} usou ${data.envelope.weapon} no(a) [${data.envelope.location}] para ceifar a vida de Odete Rolemã. Sem ninguém para provar o crime a tempo, o assassino segue livre pelas sombras da cidade.`;
      }
    }

    modal.style.display = 'flex';
  } else {
    alert(`FIM DE JOGO!\nResultado: ${data.winner}\nEnvelope Secreto:\n- Culpado: ${data.envelope.suspect}\n- Arma: ${data.envelope.weapon}\n- Local: ${data.envelope.location}`);
    location.reload();
  }
});

const btnPlayAgain = document.getElementById('btn-play-again');
if (btnPlayAgain) {
  btnPlayAgain.onclick = () => {
    location.reload();
  };
}

socket.on('error_message', (m) => alert(m));

const selectBotSpeed = document.getElementById('select-bot-speed');
if (selectBotSpeed) {
  selectBotSpeed.addEventListener('change', (e) => {
    socket.emit('set_bot_speed', { speed: e.target.value });
  });
}

socket.on('bot_speed_updated', ({ botSpeed }) => {
  const sel = document.getElementById('select-bot-speed');
  if (sel && sel.value !== botSpeed) {
    sel.value = botSpeed;
  }
});

// ================= SORTEIO ALEATÓRIO INICIAL VIA ROLETA =================
let rouletteAnimId = null;

socket.on('roulette_spin', (data) => {
  const modal = document.getElementById('roulette-modal');
  const canvas = document.getElementById('roulette-canvas');
  const announcementBox = document.getElementById('roulette-winner-announcement');
  const winnerNameEl = document.getElementById('roulette-winner-name');

  if (!modal || !canvas) return;

  modal.style.display = 'flex';
  if (announcementBox) announcementBox.style.display = 'none';

  const ctx = canvas.getContext('2d');
  const players = data.players || [];
  const numSegments = players.length;
  if (numSegments === 0) return;

  const arc = (2 * Math.PI) / numSegments;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2 - 8;

  // Ponteiro no topo (ângulo = -PI / 2)
  // O centro do segmento targetIndex é em (targetIndex + 0.5) * arc
  // Queremos que: finalAngle = -PI/2 - (targetIndex + 0.5) * arc
  const targetIndex = data.starterIndex;
  const targetOffset = -Math.PI / 2 - (targetIndex + 0.5) * arc;
  const totalRotations = 5;
  const totalAngle = totalRotations * 2 * Math.PI + ((targetOffset % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));

  const duration = 3600; // 3.6 segundos de giro
  const startTime = performance.now();
  let lastTickSegment = -1;

  const CHAR_COLORS = {
    'fahur': '#b7950b',
    'toguro': '#4b5563',
    'jacao': '#78350f',
    'moraes': '#1e3a8a',
    'carminha': '#991b1b',
    'pecanha': '#374151',
    'jailson': '#14532d',
    'tadalafila': '#831843'
  };

  function drawWheel(currentRotation) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < numSegments; i++) {
      const p = players[i];
      const startA = currentRotation + i * arc;
      const endA = startA + arc;
      const charId = (p.character && p.character.id) ? p.character.id.toLowerCase() : '';
      const segColor = CHAR_COLORS[charId] || (i % 2 === 0 ? '#1f2937' : '#111827');

      // Fatia
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startA, endA);
      ctx.closePath();
      ctx.fillStyle = segColor;
      ctx.fill();

      // Borda dourada
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Nome do personagem
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(startA + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12.5px "Cinzel", serif';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 4;
      const label = (p.character && p.character.name) ? p.character.name : p.name;
      ctx.fillText(label, radius - 16, 4);
      ctx.restore();
    }

    // Cubo central da roleta
    ctx.beginPath();
    ctx.arc(centerX, centerY, 24, 0, 2 * Math.PI);
    ctx.fillStyle = '#120d04';
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
  }

  function animateRoulette(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);

    // Easing cúbico desacelerado (easeOutCubic)
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentAngle = easeProgress * totalAngle;

    drawWheel(currentAngle);

    // Detecta mudança de segmento no topo (-PI/2) para tocar tick
    const normAngle = ((-Math.PI / 2 - currentAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const activeSeg = Math.floor(normAngle / arc);
    if (activeSeg !== lastTickSegment) {
      lastTickSegment = activeSeg;
      playRouletteTickSound();
    }

    if (progress < 1) {
      rouletteAnimId = requestAnimationFrame(animateRoulette);
    } else {
      // Roleta parou no vencedor!
      playRouletteWinSound();

      if (announcementBox && winnerNameEl) {
        winnerNameEl.innerText = `${data.starterCharName} (${data.starterName})`;
        announcementBox.style.display = 'block';
      }

      // Aguarda 1.4s de exibição antes de fechar o popup e iniciar a partida
      setTimeout(() => {
        modal.style.display = 'none';
      }, 1400);
    }
  }

  if (rouletteAnimId) cancelAnimationFrame(rouletteAnimId);
  rouletteAnimId = requestAnimationFrame(animateRoulette);
});