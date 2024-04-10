const express = require('express');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.static(__dirname));
app.use(express.static('images'));

app.use('/images', express.static('images', {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Access-Control-Allow-Origin', '*');
  }
}));


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

const rooms = {};

const HEARTBEAT_INTERVAL = 30000;

function checkWinConditions(roomId) {
  const room = rooms[roomId];
  if (!room || !room.gameState) return;

  const alivePlayers = room.gameState.filter(p => p.isAlive);
  const aliveRoles = alivePlayers.map(p => p.role);

  const sheriffAlive = aliveRoles.includes("Шериф");
  const banditsAlive = aliveRoles.includes("Бандит");
  const renegadeAlive = aliveRoles.includes("Ренегат");

  let winner = null;
  let winConditionMet = false;

  if (!sheriffAlive) {
    winner = "Бандиты";
    winConditionMet = true;
    console.log(`[GAME OVER] Победили Бандиты (Шериф мертв).`);
  }
  else if (sheriffAlive && !banditsAlive && !renegadeAlive) {
    const otherAlivePlayers = alivePlayers.filter(p => p.role !== "Шериф" && p.role !== "Помощник");
    if (otherAlivePlayers.length === 0) {
      winner = "Шериф и Помощники";
      winConditionMet = true;
      console.log(`[GAME OVER] Победили Шериф и Помощники (все Бандиты и Ренегат мертвы).`);
    }
  }
  else if (alivePlayers.length === 1 && renegadeAlive) {
    winner = "Ренегат";
    winConditionMet = true;
    console.log(`[GAME OVER] Победил Ренегат (остался последним живым).`);
  }
  else if (alivePlayers.length === 1 && !renegadeAlive && sheriffAlive) {
    winner = "Шериф и Помощники";
    winConditionMet = true;
    console.log(`[GAME OVER] Победили Шериф и Помощники (Шериф остался последним живым).`);
  }


  if (winConditionMet) {
    room.gameStarted = false;
    room.currentTurn = null;
    room.turnOrder = [];

    broadcastToRoom(roomId, {
      type: "game_over",
      winner: winner,
      players: room.gameState
    });
  }
}


wss.on('connection', (ws) => {
  console.log('Новый игрок подключился');

  const heartbeat = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, HEARTBEAT_INTERVAL);

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

    if (data.type === 'pong') {
      ws.isAlive = true;
      return;
    }

    if (data.type === "create_room" || data.type === "join_room") {
      const roomId = data.roomId;
      const username = data.username;

      if (!rooms[roomId]) {
        rooms[roomId] = {
          players: [],
          sockets: [],
          gameStarted: false,
          currentTurn: null,
          turnOrder: [],
          gameState: null,
          remainingDeck: [],
          discardPile: []
        };
      }

      if (rooms[roomId].players.some(p => p.username === username)) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Имя игрока уже занято"
        }));
        return;
      }

      const player = {
        username,
        id: ws._socket.remotePort,
        isReady: false
      };

      rooms[roomId].players.push(player);
      rooms[roomId].sockets.push(ws);

      ws.roomId = roomId;
      ws.username = username;

      console.log(`Игрок ${username} присоединился к комнате ${roomId}`);
      broadcastToRoom(roomId, {
        type: "room_update",
        players: rooms[roomId].players.map(p => ({
          username: p.username,
          isReady: p.isReady
        }))
      });
    }

    if (data.type === "player_ready") {
      const roomId = ws.roomId;
      if (!roomId || !rooms[roomId]) return;

      const player = rooms[roomId].players.find(p => p.username === ws.username);
      if (player) {
        player.isReady = true;

        const allReady = rooms[roomId].players.every(p => p.isReady);

        broadcastToRoom(roomId, {
          type: "room_update",
          players: rooms[roomId].players.map(p => ({
            username: p.username,
            isReady: p.isReady
          })),
          canStart: allReady && rooms[roomId].players.length >= 2
        });
      }
    }

    if (data.type === "start_game") {
      const roomId = ws.roomId;
      if (!roomId || !rooms[roomId]) return;

      if (!rooms[roomId].players.every(p => p.isReady) || rooms[roomId].players.length < 2) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Не все игроки готовы или недостаточно игроков"
        }));
        return;
      }

      const initialTurnOrder = [...rooms[roomId].players];
      let roles = [];
      switch (initialTurnOrder.length) {
        case 2:
          roles = ["Шериф", "Бандит"];
          break;
        case 3:
          roles = ["Шериф", "Бандит", "Ренегат"];
          break;
        case 4:
          roles = ["Шериф", "Бандит", "Бандит", "Помощник"];
          break;
        case 5:
          roles = ["Шериф", "Бандит", "Бандит", "Помощник", "Ренегат"];
          break;
        case 6:
          roles = ["Шериф", "Бандит", "Бандит", "Бандит", "Помощник", "Ренегат"];
          break;
        case 7:
          roles = ["Шериф", "Бандит", "Бандит", "Бандит", "Помощник", "Помощник", "Ренегат"];
          break;
        case 8:
          roles = ["Шериф", "Бандит", "Бандит", "Бандит", "Помощник", "Помощник", "Ренегат", "Бандит"];
          break;
        default:
          ws.send(JSON.stringify({ type: "error", message: "Неподдерживаемое количество игроков!" }));
          return;
      }

      const sheriffIndex = roles.indexOf("Шериф");
      const sheriffRole = roles.splice(sheriffIndex, 1)[0];
      shuffle(roles);
      roles.unshift(sheriffRole);


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
        { name: "Дилижанс", img: "dillijans.png", type: "stagecoach" },
      ];
      const shuffledDeck = shuffle(fullDeck);
      rooms[roomId].remainingDeck = shuffledDeck;

      rooms[roomId].gameState = initialTurnOrder.map((player, i) => {
        const playerRole = roles[i];
        const startHp = (playerRole === "Шериф") ? (5 + initialTurnOrder.length - 2) : 4;
        const hand = rooms[roomId].remainingDeck.splice(0, startHp);
        return {
          ...player,
          role: playerRole,
          hp: startHp,
          maxHp: startHp,
          hand: hand.map(card => ({
            ...card,
            img: `images/${card.img}`
          })),
          isAlive: true,
          activeDynamite: null,
          isImprisoned: false,
          equippedCards: [],
          playedBang: false,
        };
      });

      rooms[roomId].turnOrder = rooms[roomId].gameState.map(player => ({ username: player.username }));


      const sheriffPlayer = rooms[roomId].gameState.find(p => p.role === "Шериф");
      rooms[roomId].currentTurn = rooms[roomId].turnOrder.findIndex(p => p.username === sheriffPlayer.username);


      const currentPlayerUsername = rooms[roomId].turnOrder[rooms[roomId].currentTurn].username;

      rooms[roomId].gameStarted = true;
      rooms[roomId].discardPile = [];


      console.log(`Игра в комнате ${roomId} началась. Первый ход у игрока: ${currentPlayerUsername}`);

      broadcastToRoom(roomId, {
        type: "game_start",
        players: rooms[roomId].gameState,
        remainingDeckCount: rooms[roomId].remainingDeck.length,
        currentPlayer: currentPlayerUsername,
        playersCount: rooms[roomId].gameState.filter(p => p.isAlive).length
      });
    }

    if (data.type === "game_move") {
      const { roomId, username, move, target, cardName } = data;

      if (!rooms[roomId] || !rooms[roomId].gameStarted || !rooms[roomId].gameState) {
        console.warn(`[WARN] game_move получен для комнаты ${roomId}, но игра не начата или gameState отсутствует.`);
        return;
      }
      const room = rooms[roomId];

      if (room.currentTurn === null || room.turnOrder.length === 0 || room.currentTurn >= room.turnOrder.length) {
        console.error("[ERROR] Некорректное состояние текущего хода.", { currentTurn: room.currentTurn, turnOrderLength: room.turnOrder.length });
        return;
      }

      const currentPlayerInTurnOrder = room.turnOrder[room.currentTurn];
      if (currentPlayerInTurnOrder.username !== username) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Сейчас не ваш ход"
        }));
        console.log(`[WARN] Неверный ход от ${username}, сейчас ходит ${currentPlayerInTurnOrder.username}`);
        return;
      }

      const player = room.gameState.find(p => p.username === username);
      if (!player || !player.isAlive) {
        console.log(`[WARN] Игрок ${username} не найден или не жив в gameState.`);
        return;
      }

      console.log(`[MOVE] ${username} -> ${move}${target ? ' → ' + target : ''}${cardName ? ' (' + cardName + ')' : ''}`);

      let turnEnds = false;

      switch (move) {
        case "draw_card":
          if (room.remainingDeck.length > 0) {
            const numCardsToDraw = 2;
            const drawnCards = room.remainingDeck.splice(0, Math.min(numCardsToDraw, room.remainingDeck.length));
            player.hand.push(...drawnCards);
            console.log(`${username} вытянул ${drawnCards.length} карт.`);
          } else {
            console.log("Колода пуста. TODO: Логика сброса/перемешивания");
          }
          break;

        case "play_card":
          if (!cardName) {
            ws.send(JSON.stringify({ type: "error", message: "Не указано имя карты для розыгрыша." }));
            return;
          }
          const cardIndex = player.hand.findIndex(card => card.name === cardName);
          if (cardIndex === -1) {
            ws.send(JSON.stringify({ type: "error", message: `У вас нет карты '${cardName}'!` }));
            return;
          }
          const cardToPlay = player.hand[cardIndex];

          if (cardToPlay.type === "attack" && player.playedBang) {
            ws.send(JSON.stringify({ type: "error", message: "Вы уже использовали 'Бах!' в этом ходу!" }));
            return;
          }

          switch (cardToPlay.name) {
            case "Бах":
            case "Винчестер":
              const victim = room.gameState.find(p => p.username === target);
              if (victim && victim.isAlive) {
                const missIndex = victim.hand.findIndex(card => card.type === "defense");
                if (missIndex !== -1) {
                  const missedCard = victim.hand.splice(missIndex, 1)[0];
                  console.log(`${username} атаковал ${target}, но тот уклонился с помощью ${missedCard.name}.`);
                  room.discardPile.push(missedCard);
                } else {
                  victim.hp--;
                  console.log(`${username} атаковал ${target}. Урон! HP ${target}: ${victim.hp}`);
                  if (victim.hp <= 0) {
                    victim.isAlive = false;
                    console.log(`${target} выбыл из игры!`);
                    checkWinConditions(roomId);
                  }
                }
                if (cardToPlay.type === "attack") {
                  player.playedBang = true;
                }
                player.hand.splice(cardIndex, 1);
                room.discardPile.push(cardToPlay);

              } else {
                ws.send(JSON.stringify({ type: "error", message: "Цель не найдена или не жива." }));
              }
              break;

            case "Пиво":
              if (player.hp < player.maxHp) {
                player.hp++;
                console.log(`${username} использовал Пиво. HP: ${player.hp}`);
                player.hand.splice(cardIndex, 1);
                room.discardPile.push(cardToPlay);
              } else {
                ws.send(JSON.stringify({ type: "error", message: "Нельзя вылечиться выше максимального HP." }));
              }
              break;

            case "Динамит": 
              if (!player.activeDynamite) {
                player.activeDynamite = cardToPlay;
                player.hand.splice(cardIndex, 1);
                console.log(`${username} заложил Динамит.`);
              } else {
                ws.send(JSON.stringify({ type: "error", message: "У вас уже есть активный Динамит!" }));
              }
              break;


            case "Тюрьма":
              const jailTarget = room.gameState.find(p => p.username === target);
              if (jailTarget && jailTarget.isAlive && jailTarget.role !== "Шериф" && !jailTarget.isImprisoned) {
                jailTarget.isImprisoned = true;
                player.hand.splice(cardIndex, 1);
                console.log(`${username} посадил ${target} в тюрьму.`);
              } else {
                ws.send(JSON.stringify({ type: "error", message: "Неверная цель для Тюрьмы." }));
              }
              break;

            case "Паника":
              const panicTarget = room.gameState.find(p => p.username === target);
              if (panicTarget && panicTarget.isAlive && panicTarget.hand.length > 0) {
                const stolenCard = panicTarget.hand.pop();
                player.hand.push(stolenCard);
                player.hand.splice(cardIndex, 1);
                room.discardPile.push(cardToPlay);
                console.log(`${username} использовал Панику и украл карту у ${target}.`);
              } else {
                ws.send(JSON.stringify({ type: "error", message: "У цели нет карт или цель неверна." }));
              }
              break;

            case "Плутовка":
              const plutovkaTarget = room.gameState.find(p => p.username === target);
              if (plutovkaTarget && plutovkaTarget.isAlive && plutovkaTarget.hand.length > 0) {
                const discardedCard = plutovkaTarget.hand.pop();
                room.discardPile.push(discardedCard);
                player.hand.splice(cardIndex, 1);
                room.discardPile.push(cardToPlay);
                console.log(`${username} использовал Плутовку и заставил ${target} сбросить карту.`);
              } else {
                ws.send(JSON.stringify({ type: "error", message: "У цели нет карт для сброса или цель неверна." }));
              }
              break;

            case "Мустанг":
              const existingHorseIndex = player.equippedCards.findIndex(c => c.type === "horse");
              if (existingHorseIndex !== -1) {
                const oldHorse = player.equippedCards.splice(existingHorseIndex, 1)[0];
                room.discardPile.push(oldHorse);
              }
              player.equippedCards.push(cardToPlay);
              player.hand.splice(cardIndex, 1);
              console.log(`${username} экипировал Мустанга.`);
              break;

            case "Бочка":
              const existingBarrelIndex = player.equippedCards.findIndex(c => c.type === "barrel");
              if (existingBarrelIndex !== -1) {
                const oldBarrel = player.equippedCards.splice(existingBarrelIndex, 1)[0];
                room.discardPile.push(oldBarrel);
              }
              player.equippedCards.push(cardToPlay);
              player.hand.splice(cardIndex, 1);
              console.log(`${username} установил Бочку.`);
              break;

            case "Дилижанс":
              if (room.remainingDeck.length >= 2) {
                const drawnCards = room.remainingDeck.splice(0, 2);
                player.hand.push(...drawnCards);
                player.hand.splice(cardIndex, 1);
                room.discardPile.push(cardToPlay);
                console.log(`${username} использовал Дилижанс и вытянул 2 карты.`);
              } else if (room.remainingDeck.length === 1) {
                const drawnCard = room.remainingDeck.pop();
                player.hand.push(drawnCard);
                player.hand.splice(cardIndex, 1);
                room.discardPile.push(cardToPlay);
                console.log(`${username} использовал Дилижанс и вытянул 1 карту.`);
              } else {
                console.log("Недостаточно карт в колоде для Дилижанса. TODO: Логика сброса/перемешивания");
                ws.send(JSON.stringify({ type: "error", message: "Недостаточно карт в колоде!" }));
              }
              break;


            default:
              console.warn(`[WARN] Неизвестная или необработанная карта разыграна: ${cardToPlay.name}`);
              player.hand.splice(cardIndex, 1);
              room.discardPile.push(cardToPlay);
              break;
          }

          break;


        case "end_turn":
          turnEnds = true;
          console.log(`${username} завершил ход.`);

          while (player.hand.length > player.hp) {
            const discardedCard = player.hand.pop();
            console.log(`${username} сбросил лишнюю карту: ${discardedCard.name}`);
            room.discardPile.push(discardedCard);
          }


          player.playedBang = false; 
          break;

        case "test_action":
          console.log(`[СЕРВЕР] Получено тестовое действие от ${username} (Кнопка: ${data.buttonId})`);
          break;


        default:
          console.log("Неизвестное действие:", move);
          ws.send(JSON.stringify({ type: "error", message: `Неизвестное действие: ${move}` }));
          break;
      }

      let nextPlayerUsername = username;

      if (turnEnds) {
        let nextTurnIndexCandidate = room.currentTurn;
        let nextPlayerInTurnOrderCandidate = null;
        let nextPlayerStateCandidate = null;
        let attempts = 0;
        const initialTurnIndex = nextTurnIndexCandidate;

        do {
          nextTurnIndexCandidate = (nextTurnIndexCandidate + 1) % room.turnOrder.length;
          attempts++;
          if (attempts >= room.turnOrder.length) {
            console.warn("[WARN] Не удалось найти следующего живого игрока в цикле.");
            nextPlayerStateCandidate = null;
            break;
          }

          nextPlayerInTurnOrderCandidate = room.turnOrder[nextTurnIndexCandidate];
          nextPlayerStateCandidate = room.gameState.find(p => p.username === nextPlayerInTurnOrderCandidate.username);

        } while (!nextPlayerStateCandidate || !nextPlayerStateCandidate.isAlive);


        if (nextPlayerStateCandidate && nextPlayerStateCandidate.isAlive) {
          const nextPlayer = nextPlayerStateCandidate;

          if (nextPlayer.isImprisoned) {
            console.log(`[ХОД] Игрок ${nextPlayer.username} находится в Тюрьме.`);
            nextPlayer.isImprisoned = false;
            console.log(`${nextPlayer.username} пропускает ход из-за Тюрьмы.`);
            room.currentTurn = nextTurnIndexCandidate;

          }
          else if (nextPlayer.activeDynamite) {
            console.log(`[ХОД] Игрок ${nextPlayer.username} имеет активный Динамит.`);
            console.log(`Динамит у ${nextPlayer.username} взорвался!`);
            nextPlayer.hp -= 3;
            room.discardPile.push(nextPlayer.activeDynamite);
            nextPlayer.activeDynamite = null;
            console.log(`Урон от Динамита. HP ${nextPlayer.username}: ${nextPlayer.hp}`);

            if (nextPlayer.hp <= 0) {
              nextPlayer.isAlive = false;
              console.log(`${nextPlayer.username} выбыл из игры из-за Динамита!`);
              checkWinConditions(roomId);
              room.currentTurn = nextTurnIndexCandidate;

            } else {
              room.currentTurn = nextTurnIndexCandidate;
              nextPlayerUsername = nextPlayerStateCandidate.username;
              console.log(`Ход передан игроку ${nextPlayerUsername} после взрыва Динамита. Начинает ход.`);
            }
          }
          else {
            room.currentTurn = nextTurnIndexCandidate;
            nextPlayerUsername = nextPlayerStateCandidate.username;
            console.log(`Ход передан игроку ${nextPlayerUsername}. Начинает ход.`);
          }


        } else {
          const alivePlayersCount = room.gameState.filter(p => p.isAlive).length;
          if (alivePlayersCount <= 1) {
            console.log("[GAME OVER] Игра завершена после попытки передать ход (остался 1 или 0 живых).");
            checkWinConditions(roomId);
            nextPlayerUsername = null;
            room.currentTurn = null;
          } else {
            console.error("[КРИТИЧЕСКАЯ ОШИБКА] Не удалось найти следующего живого игрока, хотя живых больше одного!");
            nextPlayerUsername = username;
          }
        }
      }

      broadcastToRoom(roomId, {
        type: "game_update",
        players: room.gameState,
        remainingDeckCount: room.remainingDeck ? room.remainingDeck.length : 0,
        discardPileCount: room.discardPile ? room.discardPile.length : 0,
        currentPlayer: nextPlayerUsername,
        playersCount: room.gameState.filter(p => p.isAlive).length
      });

    }

    if (data.type === 'game_update') {
      console.log("[WARN] Сервер получил сообщение game_update, это unexpected.");
    }

    if (data.type === 'error') {
      console.error("[ERROR] Сервер получил сообщение об ошибке от клиента:", data.message);
    }
    if (data.type === 'test_update') {
      console.log("[СЕРВЕР] Получен тестовый game_update в ответ на тестовое действие.");
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeat);

    const roomId = ws.roomId;
    if (!roomId || !rooms[roomId]) {
      console.log(`[WARN] Игрок отключился, но комната ${roomId} не найдена.`);
      return;
    }

    const room = rooms[roomId];
    const leavingPlayerUsername = ws.username;

    room.sockets = room.sockets.filter(s => s !== ws);

    if (room.gameStarted && room.gameState) {
      const playerInGameState = room.gameState.find(p => p.username === leavingPlayerUsername);
      if (playerInGameState) {
        playerInGameState.isAlive = false;

        console.log(`Игрок ${leavingPlayerUsername} отключился и выбыл из игры.`);

        checkWinConditions(roomId);

        const alivePlayersCount = room.gameState.filter(p => p.isAlive).length;
        const currentPlayerInTurnOrder = room.turnOrder[room.currentTurn];

        if (alivePlayersCount > 0 && currentPlayerInTurnOrder && currentPlayerInTurnOrder.username === leavingPlayerUsername) {
          console.log(`Текущий игрок ${leavingPlayerUsername} отключился. Ищем следующего игрока.`);
          let nextTurnIndex = room.currentTurn;
          let attempts = 0;
          let foundNext = false;

          do {
            nextTurnIndex = (nextTurnIndex + 1) % room.turnOrder.length;
            attempts++;
            if (attempts >= room.turnOrder.length) {
              console.warn("[WARN] Не удалось найти следующего живого игрока после отключения текущего игрока.");
              break;
            }

            const nextPlayerInTurnOrder = room.turnOrder[nextTurnIndex];
            const nextPlayerState = room.gameState.find(p => p.username === nextPlayerInTurnOrder.username);

            if (nextPlayerState && nextPlayerState.isAlive) {
              room.currentTurn = nextTurnIndex;
              const nextPlayerUsername = nextPlayerState.username;
              console.log(`Ход передан игроку ${nextPlayerUsername} после отключения.`);
              broadcastToRoom(roomId, {
                type: "game_update",
                players: room.gameState,
                remainingDeckCount: room.remainingDeck ? room.remainingDeck.length : 0,
                discardPileCount: room.discardPile ? room.discardPile.length : 0,
                currentPlayer: nextPlayerUsername,
                playersCount: room.gameState.filter(p => p.isAlive).length
              });
              foundNext = true;
              break;
            }
          } while (true);

          if (!foundNext) {
            console.log("[INFO] Не найден следующий живой игрок после отключения текущего. Game over или все выбыли.");
          }

        } else if (alivePlayersCount > 0) {
          broadcastToRoom(roomId, {
            type: "game_update",
            players: room.gameState,
            remainingDeckCount: room.remainingDeck ? room.remainingDeck.length : 0,
            discardPileCount: room.discardPile ? room.discardPile.length : 0,
            currentPlayer: currentPlayerInTurnOrder ? currentPlayerInTurnOrder.username : null,
            playersCount: room.gameState.filter(p => p.isAlive).length
          });
        }


      } else {
        room.players = room.players.filter(p => p.username !== leavingPlayerUsername);
        broadcastToRoom(roomId, {
          type: "room_update",
          players: room.players.map(p => ({
            username: p.username,
            isReady: p.isReady
          })),
          canStart: room.players.every(p => p.isReady) && room.players.length >= 2
        });
      }

      if (room.sockets.length === 0) {
        delete rooms[roomId];
        console.log(`Комната ${roomId} удалена.`);
      }
      console.log(`Игрок ${leavingPlayerUsername} отключился. Осталось сокетов в комнате ${roomId}: ${room.sockets.length}`);

    }
  });


  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.isAlive = true;

});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log(`Соединение с игроком ${ws.username || 'неизвестно'} не живо, разрываем.`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);


function broadcastToRoom(roomId, message) {
  if (!rooms[roomId]) {
    console.warn(`[WARN] Попытка отправить сообщение в несуществующую комнату ${roomId}.`);
    return;
  }
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