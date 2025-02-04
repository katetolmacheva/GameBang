let players = [];
let currentPlayerIndex = 0;
let playedBang = false;

document.addEventListener("DOMContentLoaded", function () {
  if (document.body.id === "gamePage") {
    setupGame();
  }
});

function setupGame() {
  players = [
    { id: 0, name: "Шериф", hp: 5, hand: [], role: "Шериф", isAlive: true, activeDynamite: null },
    { id: 1, name: "Помощник", hp: 4, hand: [], role: "Помощник", isAlive: true, activeDynamite: null },
    { id: 2, name: "Преступник", hp: 4, hand: [], role: "Преступник", isAlive: true, activeDynamite: null },
    { id: 3, name: "Маньяк", hp: 4, hand: [], role: "Маньяк", isAlive: true, activeDynamite: null }
  ];

  players.forEach(player => {
    for (let i = 0; i < 3; i++) {
      player.hand.push(drawCard());
    }
  });

  updateUI();
}

function drawCard() {
  const deck = [
    { name: "Бах", img: "images/бах.png", type: "attack" },
    { name: "Промах", img: "images/промах.png", type: "defense" },
    { name: "Пиво", img: "images/пиво.png", type: "heal" },
    { name: "Динамит", img: "images/динамит.png", type: "dynamite" },
    { name: "Винчестер", img: "images/винчестер.png", type: "weapon", effect: "range+5" },
    { name: "Мустанг", img: "images/мустанг.png", type: "defense", effect: "hard_to_hit" },
    { name: "Бочка", img: "images/бочка.png", type: "defense", effect: "dodge_chance" },
    { name: "Тюрьма", img: "images/тюрьма.png", type: "control", effect: "skip_turn" },
    { name: "Паника", img: "images/паника.png", type: "interaction", effect: "steal_card" },
    { name: "Плутовка", img: "images/плутовка.png", type: "interaction", effect: "discard_card" }
  ];

  return deck[Math.floor(Math.random() * deck.length)];
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
}

function enforceCardLimit() {
  const player = players[currentPlayerIndex];

  while (player.hand.length > player.hp) {
    player.hand.pop();
  }
}

function updateUI() {
  const gameTable = document.getElementById("game-table");
  gameTable.innerHTML = "";

  players.forEach((player, index) => {
    if (!player.isAlive) return;

    const playerDiv = document.createElement("div");
    playerDiv.classList.add("player-zone");

    playerDiv.innerHTML = `<h3>${player.name}</h3><p class="hp-text">❤️ ${player.hp}</p>`;

    const cardContainer = document.createElement("div");
    cardContainer.classList.add("player-cards");

    player.hand.forEach((card, cardIndex) => {
      const cardElement = document.createElement("div");
      cardElement.classList.add("card");

      if (index === currentPlayerIndex) {
        cardElement.style.backgroundImage = `url('${card.img}')`;
        cardElement.onclick = () => useCard(players[currentPlayerIndex], card);
      } else {
        cardElement.style.backgroundImage = `url('images/рубашка.png')`;
      }

      cardElement.setAttribute("data-name", card.name);
      cardContainer.appendChild(cardElement);
    });

    if (player.activeDynamite) {
      const dynamiteElement = document.createElement("div");
      dynamiteElement.classList.add("card");
      dynamiteElement.style.backgroundImage = `url('${player.activeDynamite.img}')`;
      cardContainer.appendChild(dynamiteElement);
    }

    playerDiv.appendChild(cardContainer);
    gameTable.appendChild(playerDiv);
  });

  const actions = document.getElementById("action-buttons");
  actions.innerHTML = `
        <button onclick="drawNewCard()">Вытянуть карту</button>
        <button onclick="heal()">Использовать 'Пиво'</button>
        <button onclick="chooseTarget()">Атаковать</button>
        <button onclick="playDynamite()">Заложить 'Динамит'</button>
        <button onclick="nextTurn()">Завершить ход</button>
        <button onclick="useWinchester()">Использовать 'Винчестер'</button>
        <button onclick="useMustang()">Использовать 'Мустанг'</button>
        <button onclick="useBarrel()">Использовать 'Бочку'</button>
        <button onclick="useJail()">Использовать 'Тюрьму'</button>
        <button onclick="usePanic()">Использовать 'Панику'</button>
        <button onclick="usePlutovka()">Использовать 'Плутовку'</button>
  `;
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
}

function drawNewCard() {
  players[currentPlayerIndex].hand.push(drawCard());
  enforceCardLimit();
  updateUI();
}