const express = require('express');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');

const app = express();

app.use(express.static('images'));

app.use('/images', express.static('images', {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

app.get('/', (req, res) => {
  res.send(`
    <h1>Сервер игры "Бэнг!"</h1>
    <p>WebSocket: ws://localhost:3000</p>
  `);
});

const server = app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});

const wss = new WebSocketServer({ server });

mongoose.connect('mongodb://127.0.0.1:27017/bang-game?directConnection=true')
  .then(() => console.log('MongoDB подключён!'))
  .catch(err => console.error('Ошибка:', err));

const playerSchema = new mongoose.Schema({
  name: String,
  role: { type: String, enum: ['Шериф', 'Бандит', 'Помощник', 'Ренегат'] },
  hp: Number,
  cards: [String]
});

const Player = mongoose.model('Player', playerSchema);

async function createTestPlayer() {
  const player = new Player({
    name: "Тестовый игрок",
    role: "Шериф",
    hp: 5,
    cards: ["Бах!", "Пиво"]
  });

  await player.save();
  console.log("Игрок создан с ID:", player._id);
}
createTestPlayer();

const rooms = {};

wss.on('connection', (ws) => {
  console.log('Новый игрок подключился');
  ws.send(JSON.stringify({
    type: "greeting",
    message: 'Добро пожаловать в игру "Бэнг!"'
  }));

  ws.on('message', (msg) => {
    let data = {};
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("Ошибка парсинга JSON:", e);
      return;
    }

    if (data.type === "create_room" || data.type === "join_room") {
      const roomId = data.roomId;
      const username = data.username;

      if (!rooms[roomId]) {
        rooms[roomId] = { players: [], sockets: [], gameStarted: false };
      }

      const player = { username, id: ws._socket.remotePort };
      rooms[roomId].players.push(player);
      rooms[roomId].sockets.push(ws);

      ws.roomId = roomId;
      ws.username = username;

      console.log(`Игрок ${username} присоединился к комнате ${roomId}`);
      broadcastToRoom(roomId, {
        type: "room_update",
        players: rooms[roomId].players
      });
    }

    if (data.type === "start_game") {
      const roomId = ws.roomId;
      if (!roomId || !rooms[roomId]) return;

      const roles = ["Шериф", "Помощник", "Преступник", "Маньяк"];
      const shuffledPlayers = shuffle([...rooms[roomId].players]);

      const fullDeck = [
        { name: "Бах", img: "bah.png", type: "attack" },
        { name: "Промах", img: "promah.png", type: "defense" },
        { name: "Пиво", img: "beer.png", type: "heal" },
        { name: "Динамит", img: "tnt.png", type: "dynamite" },
        { name: "Винчестер", img: "vinchester.png", type: "weapon", range: 5 },
        { name: "Мустанг", img: "mystang.png", type: "horse" },
        { name: "Бочка", img: "bochka.png", type: "barrel" },
        { name: "Тюрьма", img: "prison.png", type: "jail" },
        { name: "Паника", img: "panica.png", type: "panic" },
        { name: "Плутовка", img: "plutovka.png", type: "cat_balou" },
        { name: "Дилижанс", img: "dillijans.png", type: "stagecoach" }
      ];

      const shuffledDeck = shuffle(fullDeck);

      rooms[roomId].gameState = shuffledPlayers.map((player, i) => {
        const hand = shuffledDeck.slice(i * 3, (i + 1) * 3);
        return {
          ...player,
          role: roles[i],
          hp: roles[i] === "Шериф" ? 5 : 4,
          hand: hand.map(card => ({
            ...card,
            img: `images/${card.img}`
          })),
          isAlive: true
        };
      });

      broadcastToRoom(roomId, {
        type: "game_start",
        players: rooms[roomId].gameState,
        remainingDeck: shuffledDeck.slice(shuffledPlayers.length * 3) 
      });
    }

      if (data.type === "game_move") {
        const { roomId, username, move, target, card } = data;


      if (!rooms[roomId]) return;
      const room = rooms[roomId];

      const player = room.gameState.find(p => p.username === username);
      if (!player || !player.isAlive) return;

        console.log(`[MOVE] ${username} -> ${move}${target ? ' → ' + target.username : ''}`);
      switch (move) {
        case "draw_card":
          player.hand.push(card || "Бах!");
          break;

        case "heal":
          player.hp++;
          break;

        case "attack":
          const victim = room.gameState.find(p => p.username === target);
          if (victim && victim.isAlive) {
            const hasMiss = victim.hand.some(c => c.type === "defense");
            if (hasMiss) {
              victim.hand = victim.hand.filter(c => c.type !== "defense");
            } else {
              victim.hp--;
              if (victim.hp <= 0) victim.isAlive = false;
            }
          }
          break;

        case "panic":
          const t1 = room.gameState.find(p => p.username === target);
          if (t1 && t1.hand.length > 0) {
            const stolen = t1.hand.pop();
            player.hand.push(stolen);
          }
          break;

        case "plutovka":
          const t2 = room.gameState.find(p => p.username === target);
          if (t2 && t2.hand.length > 0) {
            t2.hand.pop();
          }
          break;

        case "dynamite":
          player.hand = player.hand.filter(c => c !== "Динамит");
          player.activeDynamite = "Динамит";
          break;

        case "end_turn":
          break;

        default:
          console.log("Неизвестное действие:", move);
      }

        broadcastToRoom(roomId, {
          type: "game_update",
          players: rooms[roomId].gameState
        });
      
      }
  });

  ws.on('close', () => {
    const roomId = ws.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    room.players = room.players.filter(p => p.username !== ws.username);
    room.sockets = room.sockets.filter(s => s !== ws);

    broadcastToRoom(roomId, {
      type: "room_update",
      players: room.players
    });
  });
});

function broadcastToRoom(roomId, message) {
  if (!rooms[roomId]) return;
  rooms[roomId].sockets.forEach(socket => {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  });
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
