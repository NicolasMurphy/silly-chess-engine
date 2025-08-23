import { Chessground } from "./chessground.min.js";

let board = null;
let game = new Chess();
let playerColor = "white";
let gameActive = false;
let pendingPromotion = null; // Store pending promotion move

// Promotion modal handling
function showPromotionModal(move, callback) {
  console.log("Showing promotion modal for move:", move); // Debug log

  const modal = document.getElementById("promotion-modal");
  if (!modal) {
    console.error("Modal element not found!");
    return;
  }

  const pieces = modal.querySelectorAll(".promotion-piece");

  // Update piece icons based on player color
  pieces.forEach(piece => {
    const icon = piece.querySelector(".promotion-piece-icon");
    const pieceType = piece.dataset.piece;

    // Set the correct Unicode character based on color and piece
    if (playerColor === "white") {
      switch(pieceType) {
        case 'q': icon.textContent = '♕'; break;
        case 'r': icon.textContent = '♖'; break;
        case 'b': icon.textContent = '♗'; break;
        case 'n': icon.textContent = '♘'; break;
      }
    } else {
      switch(pieceType) {
        case 'q': icon.textContent = '♛'; break;
        case 'r': icon.textContent = '♜'; break;
        case 'b': icon.textContent = '♝'; break;
        case 'n': icon.textContent = '♞'; break;
      }
    }
  });

  modal.style.display = "block";
  console.log("Modal should now be visible"); // Debug log

  // Remove any existing event listeners by cloning nodes
  pieces.forEach(piece => {
    const newPiece = piece.cloneNode(true);
    piece.parentNode.replaceChild(newPiece, piece);
  });

  // Add new event listeners to the fresh nodes
  modal.querySelectorAll(".promotion-piece").forEach(piece => {
    piece.addEventListener("click", () => {
      const promotionPiece = piece.dataset.piece;
      console.log("Promotion piece selected:", promotionPiece); // Debug log
      modal.style.display = "none";
      callback(promotionPiece);
    });
  });
}

function isPromotionMove(from, to) {
  console.log("Checking if promotion move:", from, "to", to); // Debug log

  const piece = game.get(from);
  if (!piece || piece.type !== 'p') {
    console.log("Not a pawn move"); // Debug log
    return false;
  }

  const fromRank = parseInt(from[1]);
  const toRank = parseInt(to[1]);

  console.log("Pawn move from rank", fromRank, "to rank", toRank, "color:", piece.color); // Debug log

  if (piece.color === 'w' && fromRank === 7 && toRank === 8) {
    console.log("White pawn promotion detected!"); // Debug log
    return true;
  }
  if (piece.color === 'b' && fromRank === 2 && toRank === 1) {
    console.log("Black pawn promotion detected!"); // Debug log
    return true;
  }

  return false;
}

function onMove(orig, dest) {
  // Check if this is a promotion move
  if (isPromotionMove(orig, dest)) {
    // Store the pending promotion
    pendingPromotion = { from: orig, to: dest };

    // Show promotion modal
    showPromotionModal({ from: orig, to: dest }, (promotionPiece) => {
      completePromotion(orig, dest, promotionPiece);
    });

    // Don't execute the move yet - wait for promotion selection
    return;
  }

  // Normal move (non-promotion)
  const move = game.move({ from: orig, to: dest });

  if (move === null) {
    updateBoard();
    return;
  }

  addPlayerMove(move.san);
  sendMoveToServer(move.san);
}

function completePromotion(orig, dest, promotionPiece) {
  const move = game.move({ from: orig, to: dest, promotion: promotionPiece });

  if (move === null) {
    updateBoard();
    return;
  }

  // Update the board to show the promoted piece
  updateBoard();

  addPlayerMove(move.san);
  sendMoveToServer(move.san);

  pendingPromotion = null;
}

function sendMoveToServer(moveSan) {
  fetch("/make_move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ move: moveSan }),
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

// Rest of the existing functions remain the same...
function addPlayerMove(moveText) {
  const historyDiv = document.getElementById("move-history");

  if (playerColor === "white") {
    const moveNumber = historyDiv.children.length + 1;
    const moveDiv = document.createElement("div");
    moveDiv.className = "move-info";
    moveDiv.textContent = `${moveNumber}. ${moveText}`;
    historyDiv.appendChild(moveDiv);
  } else {
    const lastMove = historyDiv.querySelector(".move-info:last-child");
    if (lastMove) {
      lastMove.textContent += ` ${moveText}`;
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
    const lastMove = historyDiv.querySelector(".move-info:last-child");
    if (lastMove) {
      lastMove.textContent += ` ${moveText}`;
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
  const selectedColor = document.querySelector(
    'input[name="color"]:checked'
  ).value;

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

window.startNewGame = startNewGame;
