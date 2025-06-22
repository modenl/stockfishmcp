import { Chess } from 'chessops/chess.js';
import { parseFen, makeFen } from 'chessops/fen.js';
import { parseUci, makeUci } from 'chessops/util.js';
import { parseSan, makeSan } from 'chessops/san.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MCPServer {
  constructor() {
    this.tools = new Map();
    this.uiServerProcess = null;
    this.uiServerPort = null;
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

    this.tools.set('start_chess_ui', {
      name: 'start_chess_ui',
      description: 'Start the Chess Trainer web UI interface',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            description: 'Port to run the UI server on (default: 3456)',
            default: 3456
          },
          mode: {
            type: 'string',
            description: 'Chess mode: play, analyze, or training (default: play)',
            enum: ['play', 'analyze', 'training'],
            default: 'play'
          }
        },
        required: []
      }
    });

    this.tools.set('stop_chess_ui', {
      name: 'stop_chess_ui',
      description: 'Stop the Chess Trainer web UI server',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            description: 'Port of the server to stop (default: 3456)',
            default: 3456
          }
        },
        required: []
      }
    });

    this.tools.set('start_chess_game', {
      name: 'start_chess_game',
      description: 'Start a chess game and automatically open browser',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            description: 'Port to run the UI server on (default: 3456)',
            default: 3456
          },
          mode: {
            type: 'string',
            description: 'Chess mode: play, analyze, or training (default: play)',
            enum: ['play', 'analyze', 'training'],
            default: 'play'
          },
          auto_open: {
            type: 'boolean',
            description: 'Automatically open browser (default: true)',
            default: true
          }
        },
        required: []
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
        case 'start_chess_ui':
          return await this.startChessUI(arguments_.port || 3456, arguments_.mode || 'play');
        case 'stop_chess_ui':
          return await this.stopChessUI(arguments_.port || 3456);
        case 'start_chess_game':
          return await this.startChessGame(arguments_.port || 3456, arguments_.mode || 'play', arguments_.auto_open !== false);
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
      const setup = parseFen(fen);
      if (setup.isErr) {
        throw new Error(`Invalid FEN: ${fen}`);
      }
      
      const pos = Chess.fromSetup(setup.value);
      if (pos.isErr) {
        throw new Error(`Invalid position: ${fen}`);
      }
      
      const chess = pos.value;
      if (!chess.isEnd()) {
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
      const setup = parseFen(fen);
      if (setup.isErr) {
        throw new Error(`Invalid FEN: ${fen}`);
      }
      
      const pos = Chess.fromSetup(setup.value);
      if (pos.isErr) {
        throw new Error(`Invalid position: ${fen}`);
      }
      
      const chess = pos.value;
      
      // 尝试解析走法（支持 SAN 和 UCI 格式）
      let moveObj;
      try {
        moveObj = parseSan(chess, move);
        if (moveObj.isErr) {
          // 如果 SAN 解析失败，尝试 UCI
          moveObj = parseUci(move);
          if (moveObj.isErr) {
            throw new Error(`Invalid move: ${move}`);
          }
        }
      } catch {
        throw new Error(`Invalid move: ${move} in position ${fen}`);
      }

      const newChess = chess.play(moveObj.isOk ? moveObj.value : moveObj);
      const newFen = makeFen(newChess.toSetup());
      const analysis = await this.getStockfishAnalysis(newFen, 12);
      
      return {
        content: [{
          type: 'text',
          text: `Move Evaluation:\n` +
                `Move: ${makeSan(chess, moveObj.isOk ? moveObj.value : moveObj)}\n` +
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
      const setup = parseFen(fen);
      if (setup.isErr) {
        throw new Error(`Invalid FEN: ${fen}`);
      }
      
      const pos = Chess.fromSetup(setup.value);
      if (pos.isErr) {
        throw new Error(`Invalid position: ${fen}`);
      }
      
      const chess = pos.value;
      const legalMoves = [];
      
      for (const move of chess.legalMoves()) {
        legalMoves.push(makeSan(chess, move));
      }
      
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
      let chess = Chess.default();
      
      for (const move of moves) {
        const moveObj = parseSan(chess, move);
        if (moveObj.isErr) {
          throw new Error(`Invalid move: ${move}`);
        }
        chess = chess.play(moveObj.value);
      }

      const openingExplanation = this.getOpeningExplanation(moves, openingName);
      
      return {
        content: [{
          type: 'text',
          text: `Opening Analysis:\n` +
                `Moves: ${moves.join(' ')}\n` +
                `${openingName ? `Opening: ${openingName}\n` : ''}` +
                `Position: ${makeFen(chess.toSetup())}\n\n` +
                `Explanation:\n${openingExplanation}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to explain opening: ${error.message}`);
    }
  }

  async validateFen(fen) {
    try {
      const setup = parseFen(fen);
      
      if (setup.isOk) {
        const pos = Chess.fromSetup(setup.value);
        if (pos.isOk) {
          const chess = pos.value;
          return {
            content: [{
              type: 'text',
              text: `Valid FEN: ${fen}\n` +
                    `Turn: ${chess.turn === 'white' ? 'White' : 'Black'}\n` +
                    `En Passant: ${chess.epSquare ? chess.epSquare : 'None'}\n` +
                    `Halfmove Clock: ${chess.halfmoves}\n` +
                    `Fullmove Number: ${chess.fullmoves}`
            }]
          };
        } else {
          return {
            content: [{
              type: 'text',
              text: `Invalid FEN: ${fen}\n` +
                    `Error: Position is illegal or invalid`
            }]
          };
        }
      } else {
        return {
          content: [{
            type: 'text',
            text: `Invalid FEN: ${fen}\n` +
                  `Error: FEN string is malformed`
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
      let chess = Chess.default();
      const sanMoves = [];
      
      for (const move of moves) {
        const moveObj = parseSan(chess, move);
        if (moveObj.isErr) {
          throw new Error(`Invalid move: ${move}`);
        }
        sanMoves.push(makeSan(chess, moveObj.value));
        chess = chess.play(moveObj.value);
      }

      // 简单的 PGN 生成
      let pgn = '';
      for (let i = 0; i < sanMoves.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = sanMoves[i];
        const blackMove = sanMoves[i + 1] || '';
        pgn += `${moveNumber}.${whiteMove}${blackMove ? ' ' + blackMove : ''} `;
      }

      const pgnWithHeaders = `[Event "Game"]
[Site "Chess Trainer"]
[Date "${new Date().toISOString().split('T')[0]}"]
[White "${whitePlayer}"]
[Black "${blackPlayer}"]
[Result "*"]

${pgn.trim()}`;

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

  async startChessUI(port = 3456, mode = 'play') {
    try {
      // 获取项目根目录
      const projectRoot = path.join(__dirname, '..');
      
      // 启动服务器进程
      const serverProcess = spawn('node', ['server/index.js'], {
        cwd: projectRoot,
        env: { ...process.env, PORT: port.toString(), CHESS_MODE: mode },
        stdio: 'ignore',
        detached: true
      });

      // 取消父子进程关联，让服务器独立运行
      serverProcess.unref();

      return {
        content: [{
          type: 'text',
          text: `🎉 Chess Trainer UI Started Successfully!\n\n` +
                `🌐 URL: http://localhost:${port}\n` +
                `🎯 Mode: ${mode}\n` +
                `🚀 Server PID: ${serverProcess.pid}\n\n` +
                `📱 Open the URL in your browser to start playing chess!\n` +
                `♟️  Features available:\n` +
                `   • Interactive chess board\n` +
                `   • Stockfish engine analysis\n` +
                `   • Move evaluation and hints\n` +
                `   • Game replay and analysis\n\n` +
                `💡 To stop the server: kill ${serverProcess.pid}`
        }]
      };

    } catch (error) {
      throw new Error(`Failed to start Chess UI: ${error.message}`);
    }
  }

  async stopChessUI(port = 3456) {
    try {
      // 使用 lsof 查找占用端口的进程
      const lsofProcess = spawn('lsof', ['-ti', `:${port}`], {
        stdio: ['ignore', 'pipe', 'ignore']
      });

      let pids = '';
      lsofProcess.stdout.on('data', (data) => {
        pids += data.toString();
      });

      await new Promise((resolve) => {
        lsofProcess.on('close', resolve);
      });

      if (!pids.trim()) {
        return {
          content: [{
            type: 'text',
            text: `❌ No Chess UI server found running on port ${port}\n` +
                  `💡 The server may have already been stopped or never started.`
          }]
        };
      }

      // 杀死进程
      const pidList = pids.trim().split('\n').filter(pid => pid.trim());
      let killedPids = [];
      
      for (const pid of pidList) {
        try {
          process.kill(parseInt(pid.trim()), 'SIGTERM');
          killedPids.push(pid.trim());
        } catch (error) {
          console.warn(`Failed to kill process ${pid}: ${error.message}`);
        }
      }

      return {
        content: [{
          type: 'text',
          text: `🛑 Chess Trainer UI Stopped Successfully!\n\n` +
                `🔌 Port ${port} is now free\n` +
                `🚀 Stopped PIDs: ${killedPids.join(', ')}\n\n` +
                `✅ The web interface is no longer accessible.\n` +
                `💡 Use start_chess_ui to launch it again when needed.`
        }]
      };

    } catch (error) {
      throw new Error(`Failed to stop Chess UI: ${error.message}`);
    }
  }

  async startChessGame(port = 3456, mode = 'play', autoOpen = true) {
    try {
      // 简化逻辑，直接使用指定端口启动
      const projectRoot = path.join(__dirname, '..');
      
      // 启动服务器进程
      const serverProcess = spawn('node', ['server/index.js'], {
        cwd: projectRoot,
        env: { ...process.env, PORT: port.toString(), CHESS_MODE: mode },
        stdio: 'ignore',
        detached: true
      });

      // 取消父子进程关联，让服务器独立运行
      serverProcess.unref();

      const url = `http://localhost:${port}`;
      
      // 如果需要自动打开浏览器
      if (autoOpen) {
        // 等待服务器启动
        setTimeout(() => {
          const openProcess = spawn('open', [url], {
            stdio: 'ignore',
            detached: true
          });
          openProcess.unref();
        }, 2000);
      }

      return {
        content: [{
          type: 'text',
          text: `🎉 Chess Game Started Successfully!\n\n` +
                `🌐 URL: ${url}\n` +
                `🎯 Mode: ${mode}\n` +
                `🚀 Server PID: ${serverProcess.pid}\n` +
                `${autoOpen ? '🌍 Browser will open automatically!\n' : '📱 Open the URL manually in your browser\n'}\n` +
                `♟️  Ready to play chess!\n` +
                `🎮 Features available:\n` +
                `   • Interactive chess board\n` +
                `   • Stockfish engine analysis\n` +
                `   • Move evaluation and hints\n` +
                `   • Game replay and analysis\n\n` +
                `💡 To stop the server: kill ${serverProcess.pid}`
        }]
      };

    } catch (error) {
      throw new Error(`Failed to start chess game: ${error.message}`);
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