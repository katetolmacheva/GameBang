let playedBang = false;
let gameDeck = [];
let remainingDeck = [];
let currentTurn = "";
let isMyTurn = false;
let initialTurnHardcodeApplied = false;

let username = sessionStorage.getItem("username");
const roomId = sessionStorage.getItem("roomId");
let players = JSON.parse(sessionStorage.getItem("players")) || [];

const socket = new WebSocket("ws://localhost:3000");
let currentPlayerIndex = -1;

function updatePlayerIndex() {
  currentPlayerIndex = players.findIndex(p => p.username === username);
}

socket.onopen = () => {
  console.log("Соединение с игрой установлено");
  socket.send(JSON.stringify({
    type: "join_room",
    roomId,
    username
  }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "greeting") {
    console.log(data.message);
  }

  if (data.type === "room_update") {
    if (window.location.pathname.includes("lobby.html")) {
      updateLobbyUI(data.players);
    }
  }

  if (data.type === "game_start" || data.type === "game_update") {
    const clientUsername = sessionStorage.getItem("username");
    if (!clientUsername) {
      console.error("КРИТИЧЕСКАЯ ОШИБКА: Имя пользователя отсутствует в sessionStorage!");
      alert("Критическая ошибка: Имя пользователя не найдено на клиенте. Попробуйте перезайти.");
      return;
    }

    if (username !== clientUsername) {
      console.warn(`Глобальная переменная username ('${username}') отличается от sessionStorage ('${clientUsername}'). Используем значение из sessionStorage.`);
    }

    players = data.players;
    currentTurn = data.currentPlayer;
    isMyTurn = currentTurn === username;
    updatePlayerIndex();

    if (data.type === "game_start") {
      const firstPlayerInReceivedList = players[0];
      if (firstPlayerInReceivedList && firstPlayerInReceivedList.username === username) {
        isMyTurn = true;
        console.log(`Установлен в true для игрока ${username} (индекс 0 в полученном списке).`);
      } else {
        isMyTurn = false;
      }
    } else if (data.type === "game_update") {
      isMyTurn = currentTurn === username;
    }

    console.log(`[${data.type}] currentTurn: ${currentTurn}, username: ${username}, isMyTurn: ${isMyTurn}`);

    sessionStorage.setItem("players", JSON.stringify(players));
    updateUI();
    updatePlayerInfo();
    updateActionButtons();
    updateDebugInfo();

    if (data.playersCount !== undefined) {
      document.getElementById("players-count").textContent = data.playersCount;
    }
  }

  if (data.type === "error") {
    console.error("Ошибка сервера:", data.message);
  }
};

function drawNewCard() {
  if (!isMyTurn) {
    alert("Сейчас не ваш ход!");
    return;
  }

  const dummyCard = { name: "Бах", img: "images/bah.png", type: "attack" };
  const player = players.find(p => p.username === username);
  if (player && !player.hand.some(card => card.name === dummyCard.name)) {
    player.hand.push(dummyCard);
    console.log(`Игроку ${username} добавлена карта ${dummyCard.name}.`);
    updateUI();
  } else if (player && player.hand.some(card => card.name === dummyCard.name)) {
    alert(`У вас уже есть карта ${dummyCard.name}!`);
  } else {
    alert("Не удалось добавить карту.");
  }

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "draw_card"
  }));
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function attack(targetIndex) {
  if (!isMyTurn) {
    alert("Сейчас не ваш ход!");
    return;
  }

  if (playedBang) {
    alert("Вы уже использовали 'Бах!' в этом ходу!");
    return;
  }

  const player = players[currentPlayerIndex];


  let attackCardIndex = player.hand.findIndex(card => card.type === "attack");
  if (attackCardIndex === -1) {
    alert("У вас нет карты 'Бах'!");
    return;
  }
  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "attack",
    target: players[targetIndex].username
  }));

}

function heal() {
  if (!isMyTurn) {
    alert("Сейчас не ваш ход!");
    return;
  }

  const currentPlayer = players.find(p => p.username === username);
  if (!currentPlayer.hand.some(c => c.type === "heal")) {
    alert("У вас нет карты 'Пиво'!");
    return;
  }

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "heal"
  }));
}

function playDynamite() {
  if (!isMyTurn) {
    alert("Сейчас не ваш ход!");
    return;
  }

  const player = players.find(p => p.username === username);
  if (!player) return;

  const dynamiteCardIndex = player.hand.findIndex(card => card.type === "dynamite");


  if (dynamiteCardIndex === -1) {
    alert("У вас нет 'Динамита'!");
    return;
  }

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "play_dynamite"
  }));
}

function enforceCardLimit() {
  const player = players[currentPlayerIndex];

  while (player.hand.length > player.hp) {
    player.hand.pop();
  }
}

function updateUI() {
  const gameTable = document.getElementById("game-table");
  if (!gameTable) return;
  if (window.location.pathname.includes("game.html") && players && players.length > 0 && username === players[0].username && !initialTurnHardcodeApplied) {
    const alivePlayersCount = players.filter(p => p.isAlive).length;
    if (alivePlayersCount > 0) {
      isMyTurn = true;
      currentTurn = username;
      initialTurnHardcodeApplied = true;
      console.log("Первый ход " + username);
    }
  } else {
    isMyTurn = currentTurn === username;
  }

  gameTable.innerHTML = "";

  players.forEach((player) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player-zone";

    if (player.username === currentTurn) {
      playerDiv.classList.add("current-turn");
    }

    playerDiv.innerHTML = `
      <h3>${player.username}: ${player.role}${!player.isAlive ? ' (Выбыл)' : ''}</h3>
      <p>HP: ${player.hp}</p>
       <div class="player-equipped-cards">
          ${player.activeDynamite ? '<span class="status-icon" title="Динамит">💣</span>' : ''}
          ${player.isImprisoned ? '<span class="status-icon" title="В Тюрьма">⛓️</span>' : ''}
          </div>
      <div class="player-cards">
        ${player.hand?.map(card => {
      if (player.username === username) {
        return `<img src="${card.img}" alt="${card.name}" class="card" data-type="${card.type}" title="${card.name}" onclick="handleCardClick(event)">`;
      } else {
        return `<div class="card card-back" title="${player.hand.length} карт(ы)"></div>`;
      }
    }).join('') || ''}
      </div>
    `;
    gameTable.appendChild(playerDiv);
  });

  const currentPlayerInfo = players.find(p => p.username === username);
  if (currentPlayerInfo) {
    document.getElementById("player-role").textContent = `Роль: ${currentPlayerInfo.role}`;
    document.getElementById("player-hp").textContent = `Здоровье: ${currentPlayerInfo.hp}`;
  } else {
    document.getElementById("player-role").textContent = `Роль: Неизвестно`;
    document.getElementById("player-hp").textContent = `Здоровье: 0`;
  }

  updateActionButtons();
  updateDebugInfo();
}


function updateActionButtons() {
  const actions = document.getElementById("action-buttons");
  if (!actions) return;

  actions.innerHTML = '';
  if (!isMyTurn) {
    actions.innerHTML = `<div class="wait-message">Ожидайте хода игрока ${currentTurn}</div>`;
    return;
  }

  const currentPlayer = players.find(p => p.username === username);
  if (!currentPlayer) return;

  const buttons = [
    {
      text: "Вытянуть карту",
      onclick: "drawNewCard()",
      id: "draw-card",
      disabled: false
    },
    {
      text: "Использовать 'Пиво'",
      onclick: "heal()",
      id: "heal-btn",
      disabled: !currentPlayer.hand.some(c => c.type === "heal")
    },
    {
      text: "Атаковать",
      onclick: "chooseTarget()",
      id: "attack-btn",
      disabled: (!currentPlayer.hand.some(c => c.type === "attack") && !currentPlayer.hand.some(c => c.name === "Винчестер")) || playedBang
    },
    {
      text: "Заложить 'Динамит'",
      onclick: "playDynamite()",
      id: "dynamite-btn",
      disabled: !currentPlayer.hand.some(c => c.name === "Динамит")
    },
    {
      text: "Завершить ход",
      onclick: "endTurn()",
      id: "end-turn-btn",
      disabled: false
    }
  ];

  buttons.forEach(btn => {
    const button = document.createElement("button");
    button.textContent = btn.text;
    button.id = btn.id;
    button.onclick = new Function(btn.onclick);
    button.disabled = btn.disabled;
    actions.appendChild(button);
  });
}
function chooseTargetUsername() {
  const availableTargets = players.filter(p =>
    p.username !== username &&
    p.isAlive
  );

  if (availableTargets.length === 0) {
    alert("Нет доступных целей!");
    return null;
  }

  const targetList = availableTargets.map((p, i) => `${i + 1}. ${p.username}`).join('\n');
  const choice = prompt(`Выберите цель:\n${targetList}`);

  if (!choice) return null;

  const targetIndex = parseInt(choice) - 1;
  if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= availableTargets.length) {
    alert("Неверный выбор цели!");
    return null;
  }

  const target = availableTargets[targetIndex];
  return target.username;
}

function chooseTarget() {
  if (!isMyTurn) {
    alert("Сейчас не ваш ход!");
    return;
  }
  const currentPlayer = players.find(p => p.username === username);
  if (!currentPlayer) return;

  const hasAttackCard = currentPlayer.hand.some(c => c.type === "attack") || currentPlayer.hand.some(c => c.name === "Винчестер");

  if (!hasAttackCard) {
    alert("У вас нет карты для атаки (Бах или Винчестер)!");
    return;
  }

  if (playedBang && !currentPlayer.hand.some(c => c.name === "Винчестер")) {
    alert("Вы уже использовали 'Бах!' в этом ходу! (Но можете использовать Винчестер, если он есть)");
    return;
  }


  const availableTargets = players.filter(p =>
    p.username !== username &&
    p.isAlive
  );

  if (availableTargets.length === 0) {
    alert("Нет доступных целей для атаки!");
    return;
  }

  const targetList = availableTargets.map((p, i) => `${i + 1}. ${p.username}`).join('\n');
  const choice = prompt(`Выберите цель для атаки:\n${targetList}`);

  if (!choice) return;

  const targetIndex = parseInt(choice) - 1;
  if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= availableTargets.length) {
    alert("Неверный выбор цели!");
    return;
  }

  const target = availableTargets[targetIndex];

  let attackMove = "attack";
  if (currentPlayer.hand.some(c => c.name === "Винчестер")) {
    attackMove = "attack_winchester";
  }

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: attackMove,
    target: target.username
  }));
}

function endTurn() {
  if (!isMyTurn) {
    alert("Сейчас не ваш ход!");
    return;
  }
  isMyTurn = false;
  playedBang = false;

  const currentPlayersIndex = players.findIndex(p => p.username === username);
  let nextTurnIndex = currentPlayersIndex;
  let attempts = 0;
  let foundNext = false;
  do {
    nextTurnIndex = (nextTurnIndex + 1) % players.length;
    attempts++;
    if (attempts >= players.length) {
      console.warn(" Не удалось найти следующего игрока на клиенте.");
      break;
    }

    const nextPlayer = players[nextTurnIndex];
    if (nextPlayer && nextPlayer.isAlive) {
      currentTurn = nextPlayer.username;
      console.log(` Ход передан игроку ${currentTurn} на UI.`);
      foundNext = true;
      break;
    }

  } while (!foundNext);

  if (!foundNext) {
    console.warn(" Ход не передан, так как не найден следующий живой игрок.");
    currentTurn = null;
  }

  updateUI();
  updateActionButtons();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "end_turn"
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes("game.html")) {
    updateUI();
    updatePlayerIndex();
    if (players && players[currentPlayerIndex]) {
      updatePlayerInfo();
      updateDebugInfo();
    } else {
    }
  }
});

function getCardImage(cardName) {
  const map = {
    "Бах": "bah.png",
    "Промах": "promah.png",
    "Пиво": "pivo.png",
    "Динамит": "tnt.png",
    "Паника": "panika.png",
    "Плутовка": "plutovka.png",
    "Винчестер": "vinchester.png",
    "Мустанг": "mustang.png",
    "Бочка": "bochka.png",
    "Тюрьма": "prison.png",
    "Дилижанс": "dilijans.png"
  };

  return `images/${map[cardName] || "rubashka.png"}`;
}

function updatePlayerInfo() {
  const playerRole = document.getElementById('player-role');
  const playerHp = document.getElementById('player-hp');
  const currentPlayer = players.find(p => p.username === username);

  if (currentPlayer) {
    playerRole.textContent = `Роль: ${currentPlayer.role}`;
    playerHp.textContent = `Здоровье: ${currentPlayer.hp}`;
  } else {
    playerRole.textContent = `Роль: Неизвестно`;
    playerHp.textContent = `Здоровье: 0`;
  }
}

function startGame() {
  console.log("Кнопка 'Начать игру' нажата на клиенте (вызывается из лобби?).");
}

function handleCardClick(event) {
  if (!isMyTurn) {
    return;
  }

  const clickedCardElement = event.target.closest('.card');
  if (!clickedCardElement) return;

  const cardName = clickedCardElement.title;
  const currentPlayer = players.find(p => p.username === username);

  if (!currentPlayer) {
    console.error("Текущий игрок не найден!");
    return;
  }

  const cardToUse = currentPlayer.hand.find(card => card.name === cardName);

  if (cardToUse) {
    let moveType = "play_card";
    let payload = { cardName: cardToUse.name };

    let requiresTarget = false;
    switch (cardToUse.name) {
      case "Бах":
      case "Тюрьма":
      case "Паника":
      case "Плутовка":
        requiresTarget = true;
        break;
      case "Пиво":
      case "Динамит":
      case "Винчестер":
      case "Мустанг":
      case "Бочка":
      case "Дилижанс":
        requiresTarget = false;
        break;
      case "Промах":
        alert("Карту 'Промах' нельзя использовать таким образом.");
        return;
      default:
        console.warn(`Неизвестная или необработанная карта: ${cardToUse.name}`);
        break;
    }
    if (requiresTarget) {
      const targetUsername = chooseTargetUsername();
      if (!targetUsername) {
        console.log("Выбор цели отменен или нет доступных целей.");
        return; 
      }
      payload.target = targetUsername;
    }

    console.log(`${username} использовал карту "${cardName}". Отправляем game_move на сервер.`, payload);
    socket.send(JSON.stringify({
      type: "game_move",
      roomId,
      username,
      move: moveType,
      ...payload
    }));

    if (cardToUse.name === "Бах" || cardToUse.name === "Винчестер") {
      const targetPlayer = players.find(p => p.username === payload.target);
      if (targetPlayer) {
        const hit = confirm(`Игрок ${payload.target}, у вас есть Промах? (Нажмите OK если есть, Отмена если нет)`);
        if (!hit) {
          targetPlayer.hp--;
          console.log(`Снято 1 HP у ${payload.target}. Текущее HP: ${targetPlayer.hp}`);
          alert(`${payload.target} получает урон! HP: ${targetPlayer.hp}`);
          if (targetPlayer.hp <= 0) {
            targetPlayer.isAlive = false;
            alert(`${targetPlayer.username} выбыл из игры!`);
          }
        } else {
          console.log(`${payload.target} использовал Промах.`);
          alert(`${payload.target} использовал Промах!`);
        }
      }

      const cardToRemoveIndex = currentPlayer.hand.findIndex(c => c.name === cardName);
      if (cardToRemoveIndex !== -1) {
        currentPlayer.hand.splice(cardToRemoveIndex, 1);
        console.log(`Удалена карта "${cardName}" из руки ${username}.`);
      }

    } else if (cardToUse.type !== "weapon" && cardToUse.type !== "horse" && cardToUse.type !== "barrel" && cardToUse.name !== "Динамит" && cardToUse.name !== "Тюрьма") {
      const cardToRemoveIndex = currentPlayer.hand.findIndex(c => c.name === cardName);
      if (cardToRemoveIndex !== -1) {
        currentPlayer.hand.splice(cardToRemoveIndex, 1);
        console.log(` Удалена карта "${cardName}" из руки ${username}.`);
      }
    } else {
      const cardToRemoveIndex = currentPlayer.hand.findIndex(c => c.name === cardName);
      if (cardToRemoveIndex !== -1) {
        const equippedCard = currentPlayer.hand.splice(cardToRemoveIndex, 1)[0];
        console.log(` Карта "${cardName}" убрана из руки для экипировки.`);
      }
    }

    updateUI();
    updatePlayerInfo();

  } else {
    console.warn(`Карта "${cardName}" не найдена в руке текущего игрока в локальном состоянии.`);
    alert("У вас нет этой карты!");
  }
}

document.addEventListener('click', function (event) {
  const actionButton = event.target.closest('.action-buttons button');
  if (actionButton && window.location.pathname.includes("game.html") && players && players.length > 0 && username === players[0].username && isMyTurn) {
    console.log(`Клик по кнопке действий: ${actionButton.textContent}. Отправляем тестовый game_move.`);
    socket.send(JSON.stringify({
      type: "game_move",
      roomId: sessionStorage.getItem("roomId"),
      username: sessionStorage.getItem("username"),
      move: "test_action",
      buttonId: actionButton.id
    }));
    event.preventDefault();
    event.stopPropagation();
  }
});

function updateDebugInfo() {
  const debugInfo = document.getElementById('debug-info');
  if (debugInfo) {
    const playersDebug = players ? players.map(p => ({ username: p.username, isMyTurn: p.isMyTurn || false, isAlive: p.isAlive, hp: p.hp })) : [];
    console.log(`Обновление Debug Info: currentTurn='${currentTurn}', isMyTurn=${isMyTurn}, players=${JSON.stringify(playersDebug)}`);

    document.getElementById('current-turn-debug').textContent = currentTurn || '-';
    document.getElementById('my-turn-debug').textContent = isMyTurn ? 'Да' : 'Нет';
    document.getElementById('players-count').textContent = Array.isArray(players) ? players.length : 0;

    console.log('Debug Info:', {
      currentTurn,
      isMyTurn,
      playersCount: Array.isArray(players) ? players.length : 0,
      currentPlayerIndex,
      username
    });
  }
}

function handleCredentialResponse(response) {
  if (response.credential) {
    const decodedToken = jwt_decode(response.credential);
    console.log("Декодированный токен:", decodedToken);

    const username = decodedToken.name || decodedToken.given_name || 'Игрок';

    sessionStorage.setItem("username", username);

    console.log("Авторизация успешна. Перенаправление в лобби.");

    window.location.href = "lobby.html";

  } else {
    console.error("Ошибка получения учетных данных Google.");
    alert("Ошибка при входе через Google. Попробуйте снова.");
  }
}