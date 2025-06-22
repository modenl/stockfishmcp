import { Chess } from 'chess.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MCPServer {
  constructor() {
    this.tools = new Map();
    this.initializeTools();
  }

  initializeTools() {
    // 注册可用的工具
    this.tools.set('analyze_position', {
      name: 'analyze_position',
      description: 'Analyze a chess position using Stockfish engine',
      inputSchema: {
        type: 'object',
        properties: {
          fen: {
            type: 'string',
            description: 'FEN string representing the chess position'
          },
          depth: {
            type: 'number',
            description: 'Analysis depth (default: 15)',
            default: 15
          }
        },
        required: ['fen']
      }
    });

    this.tools.set('evaluate_move', {
      name: 'evaluate_move',
      description: 'Evaluate a chess move and get analysis',
      inputSchema: {
        type: 'object',
        properties: {
          fen: {
            type: 'string',
            description: 'FEN string of the position before the move'
          },
          move: {
            type: 'string',
            description: 'Move in algebraic notation (e.g., "e2-e4" or "Nf3")'
          }
        },
        required: ['fen', 'move']
      }
    });

    this.tools.set('get_best_moves', {
      name: 'get_best_moves',
      description: 'Get the best moves for a given position',
      inputSchema: {
        type: 'object',
        properties: {
          fen: {
            type: 'string',
            description: 'FEN string representing the chess position'
          },
          count: {
            type: 'number',
            description: 'Number of best moves to return (default: 3)',
            default: 3
          }
        },
        required: ['fen']
      }
    });

    this.tools.set('explain_opening', {
      name: 'explain_opening',
      description: 'Explain a chess opening and its principles',
      inputSchema: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of moves in algebraic notation'
          },
          opening_name: {
            type: 'string',
            description: 'Name of the opening (optional)'
          }
        },
        required: ['moves']
      }
    });

    this.tools.set('validate_fen', {
      name: 'validate_fen',
      description: 'Validate a FEN string and provide information about the position',
      inputSchema: {
        type: 'object',
        properties: {
          fen: {
            type: 'string',
            description: 'FEN string to validate'
          }
        },
        required: ['fen']
      }
    });

    this.tools.set('generate_pgn', {
      name: 'generate_pgn',
      description: 'Generate PGN from a list of moves',
      inputSchema: {
        type: 'object',
        properties: {
          moves: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of moves in algebraic notation'
          },
          white_player: {
            type: 'string',
            description: 'White player name',
            default: 'Player1'
          },
          black_player: {
            type: 'string',
            description: 'Black player name',
            default: 'Player2'
          }
        },
        required: ['moves']
      }
    });
  }

  // MCP Protocol Methods
  async listTools() {
    return {
      tools: Array.from(this.tools.values())
    };
  }

  async callTool(name, arguments_) {
    if (!this.tools.has(name)) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      switch (name) {
        case 'analyze_position':
          return await this.analyzePosition(arguments_.fen, arguments_.depth || 15);
        case 'evaluate_move':
          return await this.evaluateMove(arguments_.fen, arguments_.move);
        case 'get_best_moves':
          return await this.getBestMoves(arguments_.fen, arguments_.count || 3);
        case 'explain_opening':
          return await this.explainOpening(arguments_.moves, arguments_.opening_name);
        case 'validate_fen':
          return await this.validateFen(arguments_.fen);
        case 'generate_pgn':
          return await this.generatePgn(arguments_.moves, arguments_.white_player, arguments_.black_player);
        default:
          throw new Error(`Tool ${name} not implemented`);
      }
    } catch (error) {
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  // Tool Implementations
  async analyzePosition(fen, depth = 15) {
    try {
      const chess = new Chess(fen);
      if (!chess.isGameOver()) {
        // 在实际实现中，这里会调用 Stockfish 引擎
        // 现在返回模拟的分析结果
        const analysis = await this.getStockfishAnalysis(fen, depth);
        
        return {
          content: [{
            type: 'text',
            text: `Position Analysis (Depth ${depth}):\n` +
                  `FEN: ${fen}\n` +
                  `Evaluation: ${analysis.evaluation}\n` +
                  `Best Move: ${analysis.bestMove}\n` +
                  `Principal Variation: ${analysis.pv}\n` +
                  `Position Assessment: ${analysis.assessment}`
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `Game Over Position:\n` +
                  `FEN: ${fen}\n` +
                  `Result: ${chess.isCheckmate() ? 'Checkmate' : 'Draw'}`
          }]
        };
      }
    } catch (error) {
      throw new Error(`Failed to analyze position: ${error.message}`);
    }
  }

  async evaluateMove(fen, move) {
    try {
      const chess = new Chess(fen);
      const moveObj = chess.move(move);
      
      if (!moveObj) {
        throw new Error(`Invalid move: ${move} in position ${fen}`);
      }

      const newFen = chess.fen();
      const analysis = await this.getStockfishAnalysis(newFen, 12);
      
      return {
        content: [{
          type: 'text',
          text: `Move Evaluation:\n` +
                `Move: ${moveObj.san}\n` +
                `From: ${moveObj.from} To: ${moveObj.to}\n` +
                `Position After: ${newFen}\n` +
                `Evaluation: ${analysis.evaluation}\n` +
                `Assessment: ${this.getMoveQuality(analysis.evaluation)}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to evaluate move: ${error.message}`);
    }
  }

  async getBestMoves(fen, count = 3) {
    try {
      const chess = new Chess(fen);
      const legalMoves = chess.moves();
      
      if (legalMoves.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No legal moves available - game is over'
          }]
        };
      }

      // 在实际实现中，这里会用引擎分析每个走法
      const bestMoves = legalMoves.slice(0, count).map((move, index) => {
        return `${index + 1}. ${move} (simulated evaluation)`;
      });

      return {
        content: [{
          type: 'text',
          text: `Best ${count} moves for position:\n` +
                `FEN: ${fen}\n` +
                bestMoves.join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get best moves: ${error.message}`);
    }
  }

  async explainOpening(moves, openingName) {
    try {
      const chess = new Chess();
      let pgn = '';
      
      for (const move of moves) {
        const moveObj = chess.move(move);
        if (!moveObj) {
          throw new Error(`Invalid move: ${move}`);
        }
      }

      const openingExplanation = this.getOpeningExplanation(moves, openingName);
      
      return {
        content: [{
          type: 'text',
          text: `Opening Analysis:\n` +
                `Moves: ${moves.join(' ')}\n` +
                `${openingName ? `Opening: ${openingName}\n` : ''}` +
                `Position: ${chess.fen()}\n\n` +
                `Explanation:\n${openingExplanation}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to explain opening: ${error.message}`);
    }
  }

  async validateFen(fen) {
    try {
      const chess = new Chess();
      const isValid = chess.load(fen);
      
      if (isValid) {
        return {
          content: [{
            type: 'text',
            text: `Valid FEN: ${fen}\n` +
                  `Turn: ${chess.turn() === 'w' ? 'White' : 'Black'}\n` +
                  `Castling: ${chess.getCastlingRights(chess.turn())}\n` +
                  `En Passant: ${chess.getEnPassant() || 'None'}\n` +
                  `Halfmove Clock: ${chess.halfmoveClock()}\n` +
                  `Fullmove Number: ${chess.fullmoveNumber()}`
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `Invalid FEN: ${fen}\n` +
                  `Error: FEN string is malformed or represents an invalid position`
          }]
        };
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `FEN Validation Error: ${error.message}`
        }]
      };
    }
  }

  async generatePgn(moves, whitePlayer = 'Player1', blackPlayer = 'Player2') {
    try {
      const chess = new Chess();
      
      for (const move of moves) {
        const moveObj = chess.move(move);
        if (!moveObj) {
          throw new Error(`Invalid move: ${move}`);
        }
      }

      const pgn = chess.pgn({
        maxWidth: 5,
        newline: '\n'
      });

      const pgnWithHeaders = `[Event "Game"]
[Site "Chess Trainer"]
[Date "${new Date().toISOString().split('T')[0]}"]
[White "${whitePlayer}"]
[Black "${blackPlayer}"]
[Result "*"]

${pgn}`;

      return {
        content: [{
          type: 'text',
          text: `Generated PGN:\n\n${pgnWithHeaders}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate PGN: ${error.message}`);
    }
  }

  // Helper Methods
  async getStockfishAnalysis(fen, depth) {
    // 模拟 Stockfish 分析结果
    // 在实际实现中，这里会启动 Stockfish 进程并解析输出
    return {
      evaluation: '+0.34',
      bestMove: 'e2e4',
      pv: 'e2e4 e7e5 Ng1f3',
      assessment: 'Slightly better for White'
    };
  }

  getMoveQuality(evaluation) {
    const numEval = parseFloat(evaluation.replace('+', ''));
    if (Math.abs(numEval) < 0.25) return 'Excellent';
    if (Math.abs(numEval) < 0.75) return 'Good';
    if (Math.abs(numEval) < 1.5) return 'Inaccuracy';
    if (Math.abs(numEval) < 3.0) return 'Mistake';
    return 'Blunder';
  }

  getOpeningExplanation(moves, openingName) {
    // 简化的开局解释
    const commonOpenings = {
      'e4': 'King\'s Pawn opening - Controls the center and develops pieces quickly',
      'd4': 'Queen\'s Pawn opening - Solid central control with potential for queenside expansion',
      'Nf3': 'Réti Opening - Flexible development that can transpose to various openings'
    };

    const firstMove = moves[0];
    return commonOpenings[firstMove] || 'This opening focuses on piece development and central control.';
  }

  // MCP Protocol Handler
  async handleMCPRequest(request) {
    try {
      switch (request.method) {
        case 'tools/list':
          return await this.listTools();
        case 'tools/call':
          return await this.callTool(request.params.name, request.params.arguments);
        default:
          throw new Error(`Unknown method: ${request.method}`);
      }
    } catch (error) {
      return {
        error: {
          code: -1,
          message: error.message
        }
      };
    }
  }
}

export default MCPServer; 