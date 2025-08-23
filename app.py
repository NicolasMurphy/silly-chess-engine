from flask import Flask, render_template, request, jsonify, session
import chess
import chess.engine
import chess.pgn
import random
import uuid
import os
import shutil


class SillyChessEngine:
    def __init__(self, stockfish_path="/usr/games/stockfish", player_color=chess.WHITE):
        self.board = chess.Board()
        self.game = chess.pgn.Game()
        self.node = self.game
        self.stockfish_path = stockfish_path
        self.engine = None
        self.player_color = player_color
        self.engine_color = chess.BLACK if player_color == chess.WHITE else chess.WHITE

        stockfish_location = shutil.which(stockfish_path)
        if stockfish_location:
            try:
                self.engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
            except Exception:
                self.engine = None

    def get_stockfish_move(self):
        if not self.engine:
            return None
        try:
            result = self.engine.play(self.board, chess.engine.Limit(depth=20))
            return result.move
        except Exception:
            return None

    def get_random_move(self):
        legal_moves = list(self.board.legal_moves)
        return random.choice(legal_moves) if legal_moves else None

    def get_illegal_move(self):
        # Get all pieces of engine's color
        engine_pieces = []
        for square in chess.SQUARES:
            piece = self.board.piece_at(square)
            if piece and piece.color == self.engine_color:
                engine_pieces.append(square)

        if not engine_pieces:
            return None

        # Try multiple times to get a "good" illegal move
        for attempt in range(20):
            # Pick random piece
            from_square = random.choice(engine_pieces)

            # Pick random destination
            to_square = random.choice(list(chess.SQUARES))

            # Filter 1: Don't move to same square (no-op move)
            if from_square == to_square:
                continue

            # Filter 2: Don't capture own pieces
            target_piece = self.board.piece_at(to_square)
            if target_piece and target_piece.color == self.engine_color:
                continue

            # Filter 3: Don't capture the opponent's king (would break the game)
            if target_piece and target_piece.piece_type == chess.KING:
                continue

            # Filter 4: Don't move into check (simulate the move first)
            if self._would_move_into_check(from_square, to_square):
                continue

            # Filter 5: If currently in check, the move should address it somehow
            if self.board.is_check() and not self._addresses_check(
                from_square, to_square
            ):
                continue

            # Make sure it's actually illegal (not just accidentally legal)
            if chess.Move(from_square, to_square) in self.board.legal_moves:
                continue

            return from_square, to_square

        # If we couldn't find a good illegal move, return None
        return None

    def _would_move_into_check(self, from_square, to_square):
        """Check if this move would put the engine's king in check"""
        # Create a temporary board to test the move
        temp_board = self.board.copy()
        piece = temp_board.piece_at(from_square)

        if not piece:
            return False

        # Manually make the move on temp board
        temp_board.set_piece_at(from_square, None)
        temp_board.set_piece_at(to_square, piece)

        # Find the engine's king using built-in method
        king_square = temp_board.king(self.engine_color)

        if king_square is None:
            return False

        # Check if king would be attacked by opponent
        opponent_color = not self.engine_color
        return temp_board.is_attacked_by(opponent_color, king_square)

    def _addresses_check(self, from_square, to_square):
        """Check if this move would address the current check situation"""
        if not self.board.is_check():
            return True

        # Create temp board and make the move
        temp_board = self.board.copy()
        piece = temp_board.piece_at(from_square)

        if not piece:
            return False

        temp_board.set_piece_at(from_square, None)
        temp_board.set_piece_at(to_square, piece)

        # Find our king and check if it's still under attack
        king_square = temp_board.king(self.engine_color)
        if king_square is None:
            return False

        opponent_color = not self.engine_color
        return not temp_board.is_attacked_by(opponent_color, king_square)

    def get_engine_move(self):
        if random.random() < 0.99:
            illegal_move = self.get_illegal_move()
            if illegal_move:
                return illegal_move, "ILLEGAL"

        if random.random() < 0.2:
            move = self.get_stockfish_move()
            move_type = "SMART"
        else:
            move = self.get_random_move()
            move_type = "SILLY"

        if move is None:
            move = self.get_random_move()
            move_type = "RANDOM"

        return move, move_type

    def make_engine_move(self):
        if self.board.turn == self.engine_color:
            move_result, move_type = self.get_engine_move()

            if move_type == "ILLEGAL" and isinstance(move_result, tuple):
                from_square, to_square = move_result
                # Get the piece before moving it
                piece = self.board.piece_at(from_square)
                if piece:
                    # Store original rank for forward move check
                    from_rank = chess.square_rank(from_square)
                    to_rank = chess.square_rank(to_square)

                    # Manually modify board state
                    self.board.set_piece_at(
                        from_square, None
                    )  # Remove from original square
                    self.board.set_piece_at(to_square, piece)  # Place on new square

                    # Check for pawn promotion on illegal moves
                    if piece.piece_type == chess.PAWN and (
                        (
                            piece.color == chess.WHITE
                            and to_rank == 7
                            and to_rank > from_rank
                        )
                        or (
                            piece.color == chess.BLACK
                            and to_rank == 0
                            and to_rank < from_rank
                        )
                    ):

                        # Randomly select promotion piece
                        promotion_pieces = [
                            chess.QUEEN,
                            chess.ROOK,
                            chess.BISHOP,
                            chess.KNIGHT,
                        ]
                        promoted_piece_type = random.choice(promotion_pieces)
                        promoted_piece = chess.Piece(promoted_piece_type, piece.color)
                        self.board.set_piece_at(to_square, promoted_piece)

                    # Switch turn manually since we bypassed normal move logic
                    self.board.turn = not self.board.turn

                    # Create move notation (updated to show promotion if it happened)
                    if piece.piece_type == chess.PAWN and (
                        (piece.color == chess.WHITE and to_rank == 7)
                        or (piece.color == chess.BLACK and to_rank == 0)
                    ):
                        # Get the promoted piece for notation
                        final_piece = self.board.piece_at(to_square)
                        piece_symbols = {
                            chess.QUEEN: "Q",
                            chess.ROOK: "R",
                            chess.BISHOP: "B",
                            chess.KNIGHT: "N",
                        }
                        promotion_symbol = piece_symbols.get(
                            final_piece.piece_type, "Q"
                        )
                        move_san = f"{chess.square_name(from_square)}-{chess.square_name(to_square)}={promotion_symbol}"
                    else:
                        move_san = f"{chess.square_name(from_square)}-{chess.square_name(to_square)}"

                    # Create fake move object for return info
                    class FakeMove:
                        def __init__(self, from_sq, to_sq):
                            self.from_square = from_sq
                            self.to_square = to_sq

                    fake_move = FakeMove(from_square, to_square)
                    return fake_move, move_san, move_type
            else:
                # Normal legal move
                move = move_result
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
            return False
        except ValueError:
            return False

    def is_game_over(self):
        return self.board.is_game_over()

    def get_game_result(self):
        if self.board.is_checkmate():
            return (
                "0-1 (Black wins)"
                if self.board.turn == chess.WHITE
                else "1-0 (White wins)"
            )
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
app.secret_key = os.environ.get("SECRET_KEY")
if not app.secret_key:
    raise ValueError("SECRET_KEY environment variable is required")

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
    app.run(host="0.0.0.0", debug=True, port=5000)
