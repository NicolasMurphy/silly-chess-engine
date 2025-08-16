import { Chessground } from "./chessground.min.js";

let board = null;
let game = new Chess();
let playerColor = "white";
let gameActive = false;

function startNewGame() {
  const selectedColor = document.querySelector(
    'input[name="color"]:checked'
  ).value;

  fetch("/new_game", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ color: selectedColor }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        alert("Error: " + data.error);
        return;
      }

      playerColor = data.player_color;
      game.load(data.fen);
      gameActive = !data.game_over;

      updateBoard();

      clearMoveHistory();

      if (data.engine_move) {
        addMoveToHistory(`Engine: ${data.engine_move.move}`);
      }

      if (data.game_over) {
        handleGameOver(data.result);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      alert("Error starting game");
    });
}

function updateBoard() {
  const config = {
    fen: game.fen(),
    orientation: playerColor,
    turnColor: game.turn() === "w" ? "white" : "black",
    movable: {
      color: gameActive ? playerColor : undefined,
      free: false,
      dests: gameActive ? getValidMoves() : new Map(),
      events: {
        after: onMove,
      },
    },
    premovable: {
      enabled: false,
    },
    draggable: {
      enabled: gameActive,
      showGhost: true,
    },
    selectable: {
      enabled: true,
    },
    events: {
      select: onSquareSelect,
    },
  };

  if (board) {
    board.set(config);
  } else {
    board = Chessground(document.getElementById("chessboard"), config);
  }
}

function getValidMoves() {
  const dests = new Map();
  const moves = game.moves({ verbose: true });

  moves.forEach((move) => {
    if (!dests.has(move.from)) {
      dests.set(move.from, []);
    }
    dests.get(move.from).push(move.to);
  });

  return dests;
}

function onMove(orig, dest) {
  console.log("Move attempted:", orig, "to", dest);

  const move = game.move({
    from: orig,
    to: dest,
    promotion: "q",
  });

  if (move === null) {
    console.log("Invalid move, reverting");
    updateBoard();
    return;
  }

  fetch("/make_move", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ move: move.san }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        alert("Error: " + data.error);
        game.undo();
        updateBoard();
        return;
      }

      game.load(data.fen);
      updateBoard();

      addMoveToHistory(`You: ${move.san}`);

      if (data.engine_move) {
        addMoveToHistory(`Engine: ${data.engine_move.move}`);

        setTimeout(() => {
          const engineMove = data.engine_move;
          if (engineMove.from && engineMove.to) {
            board.set({
              lastMove: [engineMove.from, engineMove.to],
            });
          }
        }, 100);
      }

      if (data.game_over) {
        handleGameOver(data.result);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      game.undo();
      updateBoard();
    });
}

function onSquareSelect(key) {
  console.log("Square selected:", key);
}

function addMoveToHistory(moveText) {
  const historyDiv = document.getElementById("move-history");
  const moveDiv = document.createElement("div");
  moveDiv.className = "move-info";
  moveDiv.textContent = moveText;
  historyDiv.appendChild(moveDiv);
  historyDiv.scrollTop = historyDiv.scrollHeight;
}

function clearMoveHistory() {
  document.getElementById("move-history").innerHTML = "";
}

function handleGameOver(result) {
  gameActive = false;
  updateBoard();

  const moveDiv = document.createElement("div");
  moveDiv.className = "move-info game-over";
  moveDiv.textContent = `Game Over! ${result}`;
  document.getElementById("move-history").appendChild(moveDiv);
  const historyDiv = document.getElementById("move-history");
  historyDiv.scrollTop = historyDiv.scrollHeight;
}

window.startNewGame = startNewGame;

document.addEventListener("DOMContentLoaded", function () {
  console.log("Page loaded, ready to start game");
});
