from flask import Flask, render_template, request, jsonify, session
import chess
import chess.engine
import chess.pgn
import random
import uuid
import os
import shutil


class SillyChessEngine:
    def __init__(
        self,
        stockfish_path="/usr/games/stockfish",  # Debian installs to /usr/games/
        player_color=chess.WHITE,
    ):
        self.board = chess.Board()
        self.game = chess.pgn.Game()
        self.node = self.game
        self.stockfish_path = stockfish_path
        self.engine = None
        self.player_color = player_color
        self.engine_color = chess.BLACK if player_color == chess.WHITE else chess.WHITE

        # Check if stockfish is available
        stockfish_location = shutil.which(stockfish_path)
        print(f"Looking for Stockfish at: {stockfish_path}")
        print(f"Found Stockfish at: {stockfish_location}")

        try:
            self.engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
            print("✅ Stockfish loaded successfully!")
        except Exception as e:
            print(f"❌ Stockfish failed: {e}")
            self.engine = None

    def get_stockfish_move(self):
        if not self.engine:
            return None

        try:
            result = self.engine.play(self.board, chess.engine.Limit(depth=15))
            return result.move
        except Exception:
            return None

    def get_random_move(self):
        legal_moves = list(self.board.legal_moves)
        if legal_moves:
            return random.choice(legal_moves)
        return None

    def get_engine_move(self):
        if random.random() < 0.8:
            move = self.get_stockfish_move()
            move_type = "SMART"
            print("SMART move attempted")
        else:
            move = self.get_random_move()
            move_type = "SILLY"
            print("SILLY move chosen")

        if move is None:
            move = self.get_random_move()
            move_type = "RANDOM (fallback)"
            print("FALLBACK: Stockfish failed, using random move")

        return move, move_type

    def make_engine_move(self):
        if self.board.turn == self.engine_color:
            move, move_type = self.get_engine_move()
            if move:
                move_san = self.board.san(move)
                self.board.push(move)
                self.node = self.node.add_variation(move)
                return move, move_san, move_type
        return None, None, None

    def make_player_move(self, move_str):
        try:
            move = self.board.parse_san(move_str)
            if move in self.board.legal_moves:
                self.board.push(move)
                self.node = self.node.add_variation(move)
                return True
            else:
                return False
        except ValueError:
            return False

    def is_game_over(self):
        return self.board.is_game_over()

    def get_game_result(self):
        if self.board.is_checkmate():
            if self.board.turn == chess.WHITE:
                return "0-1 (Black wins by checkmate)"
            else:
                return "1-0 (White wins by checkmate)"
        elif self.board.is_stalemate():
            return "1/2-1/2 (Stalemate)"
        elif self.board.is_insufficient_material():
            return "1/2-1/2 (Insufficient material)"
        elif self.board.is_seventyfive_moves():
            return "1/2-1/2 (75-move rule)"
        elif self.board.is_fivefold_repetition():
            return "1/2-1/2 (Fivefold repetition)"
        return "Game in progress"


app = Flask(__name__)

# Use environment variable or secure fallback
app.secret_key = os.environ.get(
    "SECRET_KEY",
    "sk_prod_8f2e9d1c6b4a3f7e5d8c2a9b1f6e4d7c3a5b8e1f9d2c6a4b7e3f8d1c5a9b2e6f",
)

games = {}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/new_game", methods=["POST"])
def new_game():
    data = request.get_json()
    player_color = data.get("color", "white")

    if player_color == "white":
        player_chess_color = chess.WHITE
    elif player_color == "black":
        player_chess_color = chess.BLACK
    else:
        player_chess_color = random.choice([chess.WHITE, chess.BLACK])

    game_id = str(uuid.uuid4())
    engine = SillyChessEngine(player_color=player_chess_color)
    games[game_id] = engine

    session["game_id"] = game_id

    print(f"Created new game: {game_id}")
    print(f"Session game_id: {session.get('game_id')}")
    print(f"Total games: {len(games)}")

    engine_move_info = None
    if engine.board.turn == engine.engine_color:
        move, move_san, move_type = engine.make_engine_move()
        if move:
            engine_move_info = {
                "move": move_san,
                "from": chess.square_name(move.from_square),
                "to": chess.square_name(move.to_square),
            }

    return jsonify(
        {
            "game_id": game_id,
            "player_color": "white" if player_chess_color == chess.WHITE else "black",
            "fen": engine.board.fen(),
            "engine_move": engine_move_info,
            "game_over": engine.is_game_over(),
        }
    )


@app.route("/make_move", methods=["POST"])
def make_move():
    game_id = session.get("game_id")

    print(f"Move request - Session game_id: {game_id}")
    print(f"Available games: {list(games.keys())}")

    if not game_id or game_id not in games:
        return jsonify({"error": "No active game"}), 400

    engine = games[game_id]
    data = request.get_json()
    move_san = data.get("move")

    if not engine.make_player_move(move_san):
        return jsonify({"error": "Invalid move"}), 400

    if engine.is_game_over():
        return jsonify(
            {
                "fen": engine.board.fen(),
                "game_over": True,
                "result": engine.get_game_result(),
            }
        )

    engine_move_info = None
    move, move_san, move_type = engine.make_engine_move()
    if move:
        engine_move_info = {
            "move": move_san,
            "from": chess.square_name(move.from_square),
            "to": chess.square_name(move.to_square),
        }

    return jsonify(
        {
            "fen": engine.board.fen(),
            "engine_move": engine_move_info,
            "game_over": engine.is_game_over(),
            "result": engine.get_game_result() if engine.is_game_over() else None,
        }
    )


if __name__ == "__main__":
    # For local development
    app.run(host="0.0.0.0", debug=True, port=5000)
