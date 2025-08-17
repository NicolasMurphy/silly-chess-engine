import { Chessground } from "./chessground.min.js";

let board = null;
let game = new Chess();
let playerColor = "white";
let gameActive = false;

function addPlayerMove(moveText) {
  const historyDiv = document.getElementById("move-history");

  if (playerColor === "white") {
    const moveNumber = historyDiv.children.length + 1;
    const moveDiv = document.createElement("div");
    moveDiv.className = "move-info";
    moveDiv.textContent = `${moveNumber}. ${moveText}`;
    historyDiv.appendChild(moveDiv);
  } else {
    const lastMove = historyDiv.querySelector('.move-info:last-child');
    if (lastMove && lastMove.textContent.split(' ').length === 2) {
      lastMove.textContent += ` ${moveText}`;
    } else {
      const moveNumber = historyDiv.children.length + 1;
      const moveDiv = document.createElement("div");
      moveDiv.className = "move-info";
      moveDiv.textContent = `${moveNumber}. ... ${moveText}`;
      historyDiv.appendChild(moveDiv);
    }
  }

  historyDiv.scrollTop = historyDiv.scrollHeight;
}

function addEngineMove(moveText) {
  const historyDiv = document.getElementById("move-history");

  if (playerColor === "black") {
    const moveNumber = historyDiv.children.length + 1;
    const moveDiv = document.createElement("div");
    moveDiv.className = "move-info";
    moveDiv.textContent = `${moveNumber}. ${moveText}`;
    historyDiv.appendChild(moveDiv);
  } else {
    const lastMove = historyDiv.querySelector('.move-info:last-child');
    if (lastMove && lastMove.textContent.split(' ').length === 2) {
      lastMove.textContent += ` ${moveText}`;
    } else {
      const moveNumber = historyDiv.children.length + 1;
      const moveDiv = document.createElement("div");
      moveDiv.className = "move-info";
      moveDiv.textContent = `${moveNumber}. ... ${moveText}`;
      historyDiv.appendChild(moveDiv);
    }
  }

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

function startNewGame() {
  const selectedColor = document.querySelector('input[name="color"]:checked').value;

  fetch("/new_game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
        addEngineMove(data.engine_move.move);
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
      events: { after: onMove },
    },
    premovable: { enabled: false },
    draggable: { enabled: gameActive, showGhost: true },
    selectable: { enabled: true },
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
  const move = game.move({ from: orig, to: dest, promotion: "q" });

  if (move === null) {
    updateBoard();
    return;
  }

  fetch("/make_move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

      addPlayerMove(move.san);

      if (data.engine_move) {
        addEngineMove(data.engine_move.move);

        setTimeout(() => {
          const engineMove = data.engine_move;
          if (engineMove.from && engineMove.to) {
            board.set({ lastMove: [engineMove.from, engineMove.to] });
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

window.startNewGame = startNewGame;
