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
      board.position(data.fen);

      board.orientation(playerColor);

      gameActive = !data.game_over;
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

function onDragStart(source, piece, position, orientation) {
  if (!gameActive) return false;

  if (
    (playerColor === "white" && piece.search(/^b/) !== -1) ||
    (playerColor === "black" && piece.search(/^w/) !== -1)
  ) {
    return false;
  }

  if (
    (playerColor === "white" && game.turn() === "b") ||
    (playerColor === "black" && game.turn() === "w")
  ) {
    return false;
  }
}

function onDrop(source, target) {
  const move = game.move({
    from: source,
    to: target,
    promotion: "q",
  });

  if (move === null) return "snapback";

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
        board.position(game.fen());
        return;
      }

      game.load(data.fen);
      board.position(data.fen);

      addMoveToHistory(`You: ${move.san}`);

      if (data.engine_move) {
        addMoveToHistory(`Engine: ${data.engine_move.move}`);
      }

      if (data.game_over) {
        handleGameOver(data.result);
      }
    })
    .catch((error) => {
      console.error("Error:", error);
      game.undo();
      board.position(game.fen());
    });
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
  const moveDiv = document.createElement("div");
  moveDiv.className = "move-info game-over";
  moveDiv.textContent = `Game Over! ${result}`;
  document.getElementById("move-history").appendChild(moveDiv);
  const historyDiv = document.getElementById("move-history");
  historyDiv.scrollTop = historyDiv.scrollHeight;
}

$(document).ready(function () {
  const config = {
    draggable: true,
    position: "start",
    onDragStart: onDragStart,
    onDrop: onDrop,
    pieceTheme:
      "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png",
  };
  board = Chessboard("chessboard", config);
});
