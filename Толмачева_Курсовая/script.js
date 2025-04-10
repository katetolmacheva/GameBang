let playedBang = false;
let gameDeck = [];
let remainingDeck = [];
let currentTurn = "";

const username = sessionStorage.getItem("username");
const roomId = sessionStorage.getItem("roomId");
let players = JSON.parse(sessionStorage.getItem("players")) || [];

const socket = new WebSocket("ws://localhost:3000");

let currentPlayerIndex = players.findIndex(p => p.username === username);

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

  if (data.type === "game_start") {
    sessionStorage.setItem("players", JSON.stringify(data.players));
    window.location.href = "game.html";
  }

  if (data.type === "game_update") {
    if (window.location.pathname.includes("game.html")) {
      updateGameUI(data.players);
    }
  }
};

function drawNewCard() {
  if (remainingDeck.length === 0) {
    alert("Колода пуста!");
    return;
  }

  const card = remainingDeck.pop();
  players[currentPlayerIndex].hand.push(card);
  enforceCardLimit();
  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "draw_card",
    card: card.name
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
  if (playedBang) {
    alert("Вы уже использовали 'Бах!' в этом ходу!");
    return;
  }

  const player = players[currentPlayerIndex];
  const target = players[targetIndex];

  let attackCardIndex = player.hand.findIndex(card => card.type === "attack");
  if (attackCardIndex === -1) {
    alert("У вас нет карты 'Бах'!");
    return;
  }

  const attackCard = player.hand.splice(attackCardIndex, 1)[0];
  playedBang = true;

  const missIndex = target.hand.findIndex(card => card.type === "defense");
  if (missIndex !== -1) {
    target.hand.splice(missIndex, 1);
    alert(`${target.name} уклонился!`);
  } else {
    target.hp--;
    alert(`${target.name} получил урон!`);
  }

  if (target.hp <= 0) {
    target.isAlive = false;
    alert(`${target.name} выбыл из игры!`);
  }

  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "attack",
    target: players[targetIndex].username
  }));
}

function heal() {
  const player = players[currentPlayerIndex];

  let healCardIndex = player.hand.findIndex(card => card.type === "heal");
  if (healCardIndex === -1) {
    alert("У вас нет 'Пива'!");
    return;
  }

  player.hp++;
  player.hand.splice(healCardIndex, 1);
  alert(`${player.name} восстановил здоровье!`);

  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "heal"
  }));
}

function playDynamite() {
  const player = players[currentPlayerIndex];

  let dynamiteIndex = player.hand.findIndex(card => card.type === "dynamite");
  if (dynamiteIndex === -1) {
    alert("У вас нет 'Динамита'!");
    return;
  }

  player.activeDynamite = player.hand.splice(dynamiteIndex, 1)[0];
  alert(`${player.name} заложил 'Динамит'! Теперь все его видят.`);

  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "dynamite"
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

  gameTable.innerHTML = "";

  players.forEach((player, index) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player-zone";

    if (player.username === currentTurn) {
      playerDiv.classList.add("current-turn");
    }

    playerDiv.innerHTML = `
      <h3>${player.username} (${player.role})</h3>
      <p>HP: ${player.hp}</p>
      <div class="player-cards">
        ${player.hand?.map(card => {
      if (player.username === username) {
        return `<img src="${card.img}" alt="${card.name}" class="card" data-type="${card.type}" title="${card.name}">`;
      } else {
        return `<div class="card card-back"></div>`;
      }
    }).join('') || ''}
      </div>
    `;
    gameTable.appendChild(playerDiv);
  });

  const currentPlayer = players.find(p => p.username === username);
  if (currentPlayer) {
    document.getElementById("player-role").textContent = currentPlayer.role;
    document.getElementById("player-hp").textContent = currentPlayer.hp;
  }

  updateActionButtons();
}


function updateActionButtons() {
  let actions = document.getElementById("action-buttons");
  if (!actions) {
    actions = document.createElement("div");
    actions.id = "action-buttons";
    actions.className = "action-buttons";
    document.body.appendChild(actions);
  } else {
    actions.innerHTML = '';
  }

  const currentPlayer = players[currentPlayerIndex];
  if (!currentPlayer || currentPlayer.username !== username) {
    actions.innerHTML = "Ваш ход!";
    return;
  }

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
      disabled: !currentPlayer.hand.some(c => c.name === "Пиво")
    },
    {
      text: "Атаковать",
      onclick: "chooseTarget()",
      id: "attack-btn",
      disabled: !currentPlayer.hand.some(c => c.name === "Бах") || playedBang
    },
    {
      text: "Заложить 'Динамит'",
      onclick: "playDynamite()",
      id: "dynamite-btn",
      disabled: !currentPlayer.hand.some(c => c.name === "Динамит")
    },
    {
      text: "Завершить ход",
      onclick: "nextTurn()",
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


function useCard(player, card) {
  if (!card || !players[currentPlayerIndex].hand.some(c => c.name === card.name)) {
    alert("У вас нет этой карты!");
    return;
  }

  let cardIndex = player.hand.findIndex(c => c.name === card.name);
  if (cardIndex === -1) {
    alert("У вас нет этой карты!");
    return;
  }

  switch (card.name) {
    case "Бах":
      attack(chooseTargetIndex());
      removeCardFromHand(player, card);
      break;
    case "Промах":
      alert(`${player.name} использовал Промах и уклонился от атаки!`);
      removeCardFromHand(player, card);
      break;
    case "Пиво":
      useHeal();
      removeCardFromHand(player, card);
      break;
    case "Динамит":
      playDynamite();
      removeCardFromHand(player, card);
      break;
    case "Винчестер":
      useWinchester(player);
      removeCardFromHand(player, card);
      break;
    case "Мустанг":
      useMustang(player);
      removeCardFromHand(player, card);
      break;
    case "Бочка":
      useBarrel(player);
      removeCardFromHand(player, card);
      break;
    case "Тюрьма":
      useJail();
      removeCardFromHand(player, card);
      break;
    case "Паника":
      usePanic();
      removeCardFromHand(player, card);
      break;
    case "Плутовка":
      usePlutovka();
      removeCardFromHand(player, card);
      break;
    default:
      alert("Ошибка: неизвестная карта!");
  }
}
function removeCardFromHand(player, card) {
  let cardIndex = player.hand.findIndex(c => c.name === card.name);
  if (cardIndex !== -1) {
    player.hand.splice(cardIndex, 1);
  }
  updateUI();
}


function useJail() {
  const player = players[currentPlayerIndex];
  let cardIndex = player.hand.findIndex(card => card.name === "Тюрьма");

  if (cardIndex === -1) {
    alert("У вас нет карты 'Тюрьма'!");
    return;
  }

  let targetIndex = chooseTargetIndex();
  if (targetIndex === -1) return;

  let target = players[targetIndex];
  target.isImprisoned = true;
  player.hand.splice(cardIndex, 1);
  alert(`${target.name} попал в тюрьму и пропустит следующий ход!`);
  updateUI();
}


function usePanic() {
  const player = players[currentPlayerIndex];
  let cardIndex = player.hand.findIndex(card => card.name === "Паника");

  if (cardIndex === -1) {
    alert("У вас нет карты 'Паника'!");
    return;
  }

  let targetIndex = chooseTargetIndex();
  if (targetIndex === -1) return;

  let target = players[targetIndex];
  if (target.hand.length === 0) {
    alert(`${target.name} не имеет карт!`);
    return;
  }

  let stolenCard = target.hand.pop();
  player.hand.push(stolenCard);
  player.hand.splice(cardIndex, 1);
  alert(`${player.name} использовал Панику и украл карту у ${target.name}!`);
  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "panic",
    target: target.name
  }));
}

function usePlutovka() {
  const player = players[currentPlayerIndex];
  let cardIndex = player.hand.findIndex(card => card.name === "Плутовка");

  if (cardIndex === -1) {
    alert("У вас нет карты 'Плутовка'!");
    return;
  }

  let targetIndex = chooseTargetIndex();
  if (targetIndex === -1) return;

  let target = players[targetIndex];
  if (target.hand.length === 0) {
    alert(`${target.name} не имеет карт для сброса!`);
    return;
  }

  target.hand.pop();
  player.hand.splice(cardIndex, 1);
  alert(`${player.name} использовал Плутовку и заставил ${target.name} сбросить карту!`);
  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "плутовкаovka",
    target: target.name
  }));
}

function useHeal() {
  const player = players[currentPlayerIndex];
  let healCardIndex = player.hand.findIndex(card => card.name === "Пиво");

  if (healCardIndex === -1) {
    alert("У вас нет 'Пива'!");
    return;
  }

  player.hp++;
  player.hand.splice(healCardIndex, 1);
  alert(`${player.name} восстановил здоровье!`);
  updateUI();
}

function useWinchester() {
  const player = players[currentPlayerIndex];
  let cardIndex = player.hand.findIndex(card => card.name === "Винчестер");

  if (cardIndex === -1) {
    alert("У вас нет карты 'Винчестер'!");
    return;
  }

  player.weaponRange = 5;
  player.hand.splice(cardIndex, 1);
  alert(`${player.name} экипировал Винчестер! Теперь он стреляет дальше.`);
  updateUI();
}

function useMustang() {
  const player = players[currentPlayerIndex];
  let cardIndex = player.hand.findIndex(card => card.name === "Мустанг");

  if (cardIndex === -1) {
    alert("У вас нет карты 'Мустанг'!");
    return;
  }

  player.isHardToHit = true;
  player.hand.splice(cardIndex, 1);
  alert(`${player.name} использует Мустанга! Теперь его сложнее атаковать.`);
  updateUI();
}


function useBarrel() {
  const player = players[currentPlayerIndex];
  let barrelCardIndex = player.hand.findIndex(card => card.name === "Бочка");

  if (barrelCardIndex === -1) {
    alert("У вас нет карты 'Бочка'!");
    return;
  }

  player.hasBarrel = true;
  player.hand.splice(barrelCardIndex, 1);
  alert(`${player.name} теперь использует Бочку для защиты!`);
  updateUI();
}


function chooseTargetIndex() {
  let availableTargets = players
    .map((player, index) => ({ index, name: player.name, isAlive: player.isAlive }))
    .filter(player => player.index !== currentPlayerIndex && player.isAlive);

  if (availableTargets.length === 0) {
    alert("Нет доступных целей!");
    return -1;
  }

  let targetList = availableTargets.map((player, i) => `${i + 1}. ${player.name}`).join("\n");
  let choice = prompt(`Выберите цель для действия:\n${targetList}`);

  let chosenIndex = parseInt(choice) - 1;
  if (chosenIndex < 0 || chosenIndex >= availableTargets.length || isNaN(chosenIndex)) {
    alert("Неверный выбор цели!");
    return -1;
  }

  return availableTargets[chosenIndex].index;
}

function chooseTarget() {
  let targetOptions = players
    .filter((_, index) => index !== currentPlayerIndex && players[index].isAlive)
    .map((player, index) => `${index + 1}. ${player.name}`)
    .join("\n");

  let choice = prompt(`Выберите цель для атаки:\n${targetOptions}`);

  if (!choice) return;

  let targetIndex = parseInt(choice) - 1;

  if (targetIndex < 0 || targetIndex >= players.length || targetIndex === currentPlayerIndex || !players[targetIndex].isAlive) {
    alert("Неверный выбор цели!");
    return;
  }

  attack(targetIndex);
}

function nextTurn() {
  do {
    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  } while (!players[currentPlayerIndex].isAlive || players[currentPlayerIndex].isImprisoned);

  playedBang = false;
  enforceCardLimit();
  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "end_turn"
  }));
}

function drawNewCard() {
  const card = drawCard();
  players[currentPlayerIndex].hand.push(card);
  enforceCardLimit();
  updateUI();

  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: "draw_card",
    card: card.name
  }));
}



socket.onopen = () => {
  console.log("Соединение с игрой установлено");
};

socket.onmessage = (event) => {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch (e) {
    console.warn("Ошибка JSON:", e);
    return;
  }

  if (data.type === "game_update") {
    players = data.players;
    currentPlayerIndex = players.findIndex(p => p.username === username);
    updateUI();
  }

  if (data.type === "game_start") {
    players = data.players;
    currentTurn = data.currentTurn;
    currentPlayerIndex = players.findIndex(p => p.username === username);
    sessionStorage.setItem("players", JSON.stringify(players));
    updateUI();
  }
};

function endTurn() {
  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: `${username} завершил ход`
  }));
}

const table = document.getElementById("game-table");
players.forEach(player => {
  const div = document.createElement("div");
  div.className = "player-zone";
  div.innerHTML = `
    <h3>${player.username}</h3>
    <p>Роль: ${username === player.username ? player.role : "???"}</p>
    <p>HP: ${player.hp}</p>
<div class="player-cards">
  ${(() => {
      console.log("Current player:", player.username, "Hand:", player.hand);

      if (!player.hand || !Array.isArray(player.hand)) {
        console.error("Invalid hand data for player", player.username);
        return '';
      }

      return player.hand.map(card => {
        if (!card || !card.img) {
          console.warn("Invalid card data in hand:", card);
          return '';
        }

        const isCurrentPlayer = username === player.username;
        const imgPath = `images/${card.img}`;

        console.log(`Rendering ${isCurrentPlayer ? 'open' : 'closed'} card:`, imgPath);

        return isCurrentPlayer
          ? `<img src="${imgPath}" alt="${card.name}" class="card" data-type="${card.type}">`
          : '<div class="card card-back"></div>';
      }).join('');
    })()}
</div>
  `;
  table.appendChild(div);
});


function sendGameMove(type, payload = {}) {
  socket.send(JSON.stringify({
    type: "game_move",
    roomId,
    username,
    move: type,
    ...payload
  }));
}

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

