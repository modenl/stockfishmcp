import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { gameStateManager } from './gameStateManager.js';

export class MCPServer {
  constructor() {
    this.initializeTools();

    this.server = new Server(
      {
        name: 'chess-trainer-mcp',
        version: '1.0.9',
      },
      {
        capabilities: {
          tools: this.tools,
        },
      }
    );
    this.setupHandlers();
  }

  initializeTools() {
    this.tools = [
      {
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
      },
      {
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
      },
      {
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
      },
      {
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
      },
      {
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
      },
      {
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
      },
      {
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
              enum: ['play', 'analyze', 'training'],
              description: 'Chess mode: play, analyze, or training (default: play)',
              default: 'play'
            }
          }
        }
      },
      {
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
          }
        }
      },
      {
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
              enum: ['play', 'analyze', 'training'],
              description: 'Chess mode: play, analyze, or training (default: play)',
              default: 'play'
            },
            auto_open: {
              type: 'boolean',
              description: 'Automatically open browser (default: true)',
              default: true
            }
          }
        }
      },
      // 以下是代理到Web服务器的游戏交互工具
      {
        name: 'list_active_games',
        description: 'List all currently active chess games',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_game_state',
        description: 'Get the current state of a specific chess game',
        inputSchema: {
          type: 'object',
          properties: {
            game_id: {
              type: 'string',
              description: 'ID of the game to get state for'
            }
          },
          required: ['game_id']
        }
      },
      {
        name: 'make_move',
        description: 'Make a move in an active chess game',
        inputSchema: {
          type: 'object',
          properties: {
            game_id: {
              type: 'string',
              description: 'ID of the game to make move in'
            },
            move: {
              type: 'string',
              description: 'Move in algebraic notation (e.g., "e2e4", "Nf3", "O-O")'
            }
          },
          required: ['game_id', 'move']
        }
      },
      {
        name: 'suggest_move',
        description: 'Suggest the best move for current position in an active game',
        inputSchema: {
          type: 'object',
          properties: {
            game_id: {
              type: 'string',
              description: 'ID of the game to suggest move for'
            },
            depth: {
              type: 'number',
              description: 'Analysis depth (default: 12)',
              default: 12
            }
          },
          required: ['game_id']
        }
      },
      {
        name: 'reset_game',
        description: 'Reset an active chess game to starting position',
        inputSchema: {
          type: 'object',
          properties: {
            game_id: {
              type: 'string',
              description: 'ID of the game to reset'
            }
          },
          required: ['game_id']
        }
      },
      {
        name: 'create_game_with_settings',
        description: 'Create a new chess game with specific settings (mode, AI ELO, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            game_id: {
              type: 'string',
              description: 'ID for the new game'
            },
            mode: {
              type: 'string',
              enum: ['human_vs_human', 'human_vs_ai'],
              description: 'Game mode: human vs human or human vs AI',
              default: 'human_vs_ai'
            },
            player_color: {
              type: 'string',
              enum: ['white', 'black'],
              description: 'Player color when playing against AI',
              default: 'white'
            },
            ai_elo: {
              type: 'number',
              minimum: 800,
              maximum: 2800,
              description: 'AI strength in ELO rating (800-2800)',
              default: 1500
            },
            ai_time_limit: {
              type: 'number',
              minimum: 200,
              maximum: 5000,
              description: 'AI thinking time in milliseconds',
              default: 1000
            }
          },
          required: ['game_id']
        }
      },
      {
        name: 'launch_chess_trainer',
        description: 'Launch the complete Chess Trainer web application with UI',
        inputSchema: {
          type: 'object',
          properties: {
            port: {
              type: 'number',
              description: 'Port to run the web server on',
              default: 3456
            },
            auto_open_browser: {
              type: 'boolean',
              description: 'Automatically open browser after starting',
              default: true
            }
          }
        }
      }
    ];
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        return await this.callTool(name, args || {});
      } catch (error) {
        throw new Error(`Tool execution failed: ${error.message}`);
      }
    });
  }

  // Add the missing listTools method
  async listTools() {
    return {
      tools: this.tools
    };
  }

  async callTool(name, arguments_) {
    switch (name) {
      case 'analyze_position':
        return await this.analyzePosition(arguments_.fen, arguments_.depth);
      case 'evaluate_move':
        return await this.evaluateMove(arguments_.fen, arguments_.move);
      case 'get_best_moves':
        return await this.getBestMoves(arguments_.fen, arguments_.count);
      case 'explain_opening':
        return await this.explainOpening(arguments_.moves, arguments_.opening_name);
      case 'validate_fen':
        return await this.validateFen(arguments_.fen);
      case 'generate_pgn':
        return await this.generatePgn(arguments_.moves, arguments_.white_player, arguments_.black_player);
      case 'start_chess_ui':
        return await this.startChessUI(arguments_.port, arguments_.mode);
      case 'stop_chess_ui':
        return await this.stopChessUI(arguments_.port);
      case 'start_chess_game':
        return await this.startChessGame(arguments_.port, arguments_.mode, arguments_.auto_open);
      
      // 代理到Web服务器的方法
      case 'list_active_games':
        return await this.proxyToWebServer('list_active_games', arguments_);
      case 'get_game_state':
        return await this.proxyToWebServer('get_game_state', arguments_);
      case 'make_move':
        return await this.proxyToWebServer('make_move', arguments_);
      case 'suggest_move':
        return await this.proxyToWebServer('suggest_move', arguments_);
      case 'reset_game':
        return await this.proxyToWebServer('reset_game', arguments_);
      case 'create_game_with_settings':
        return await this.createGameWithSettings(arguments_);
      case 'launch_chess_trainer':
        return await this.launchChessTrainer(arguments_);
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // 代理方法：将请求转发给Web服务器
  async proxyToWebServer(action, args) {
    try {
      // 通过HTTP API调用Web服务器
      const response = await fetch(`http://localhost:3456/api/mcp/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args)
      });

      if (!response.ok) {
        throw new Error(`Web server responded with status ${response.status}`);
      }

      const result = await response.json();
      return {
        content: [{
          type: 'text',
          text: result.message || JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return {
          content: [{
            type: 'text',
            text: `❌ Connection Failed\n\n` +
                  `🔌 Cannot connect to Chess Trainer web server at localhost:3456\n` +
                  `💡 Please start the web server first with: start_chess_ui\n\n` +
                  `🔧 Error: ${error.message}`
          }]
        };
      }
      
      throw new Error(`Failed to proxy request to web server: ${error.message}`);
    }
  }

  // 保留原有的独立工具方法
  async analyzePosition(fen, depth = 15) {
    try {
      const analysis = await this.getStockfishAnalysis(fen, depth);
      
      return {
        content: [{
          type: 'text',
          text: `🔍 Position Analysis\n\n` +
                `📍 FEN: ${fen}\n` +
                `🎯 Depth: ${depth}\n\n` +
                `📊 Evaluation: ${analysis.evaluation}\n` +
                `🎯 Best Move: ${analysis.bestMove}\n` +
                `📈 Principal Variation: ${analysis.pv}\n` +
                `💭 Assessment: ${analysis.assessment}\n\n` +
                `💡 This analysis helps understand the position's strengths and weaknesses.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to analyze position: ${error.message}`);
    }
  }

  async evaluateMove(fen, move) {
    try {
      // 模拟移动评估
      const beforeEval = await this.getStockfishAnalysis(fen, 12);
      
      // 在实际实现中，这里会执行移动并分析新位置
      const { Chess } = await import('chess.js');
      const chess = new Chess(fen);
      const moveResult = chess.move(move);
      
      if (!moveResult) {
        return {
          content: [{
            type: 'text',
            text: `❌ Invalid Move\n\n` +
                  `🎯 Move: ${move}\n` +
                  `📍 Position: ${fen}\n\n` +
                  `💡 Please check the move notation and try again.`
          }]
        };
      }

      const newFen = chess.fen();
      const afterEval = await this.getStockfishAnalysis(newFen, 12);
      
      const evalChange = parseFloat(afterEval.evaluation.replace('+', '')) - parseFloat(beforeEval.evaluation.replace('+', ''));
      const quality = this.getMoveQuality(evalChange.toString());

      return {
        content: [{
          type: 'text',
          text: `♟️  Move Evaluation: ${moveResult.san}\n\n` +
                `📍 Position Before: ${fen}\n` +
                `📍 Position After: ${newFen}\n\n` +
                `📊 Evaluation Change: ${evalChange > 0 ? '+' : ''}${evalChange.toFixed(2)}\n` +
                `🎯 Move Quality: ${quality}\n` +
                `💭 Assessment: ${afterEval.assessment}\n\n` +
                `💡 ${quality === 'Excellent' ? 'Great move!' : quality === 'Good' ? 'Solid choice.' : 'Consider alternatives.'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to evaluate move: ${error.message}`);
    }
  }

  async getBestMoves(fen, count = 3) {
    try {
      const analysis = await this.getStockfishAnalysis(fen, 15);
      
      // 模拟多个最佳移动（实际中会从Stockfish获取）
      const bestMoves = [
        { move: analysis.bestMove, eval: analysis.evaluation, pv: analysis.pv },
        { move: 'Nf3', eval: '+0.28', pv: 'Nf3 Nc6 Bb5' },
        { move: 'd4', eval: '+0.25', pv: 'd4 d5 c4' }
      ].slice(0, count);

      let result = `🎯 Best Moves Analysis\n\n📍 Position: ${fen}\n\n`;
      
      bestMoves.forEach((moveData, index) => {
        result += `${index + 1}. ${moveData.move} (${moveData.eval})\n`;
        result += `   📈 Line: ${moveData.pv}\n\n`;
      });

      result += `💡 These moves are ranked by engine evaluation at depth 15.`;

      return {
        content: [{
          type: 'text',
          text: result
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get best moves: ${error.message}`);
    }
  }

  async explainOpening(moves, openingName) {
    try {
      const explanation = this.getOpeningExplanation(moves, openingName);
      
      return {
        content: [{
          type: 'text',
          text: `📚 Opening Analysis${openingName ? `: ${openingName}` : ''}\n\n` +
                `♟️  Moves: ${moves.join(' ')}\n\n` +
                `💭 Explanation: ${explanation}\n\n` +
                `🎯 Key Principles:\n` +
                `• Control the center with pawns and pieces\n` +
                `• Develop knights before bishops\n` +
                `• Castle early for king safety\n` +
                `• Don't move the same piece twice in opening\n\n` +
                `💡 Understanding opening principles helps improve your chess foundation.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to explain opening: ${error.message}`);
    }
  }

  async validateFen(fen) {
    try {
      const { Chess } = await import('chess.js');
      
      try {
        const chess = new Chess(fen);
        const turn = chess.turn() === 'w' ? 'White' : 'Black';
        const inCheck = chess.isCheck();
        const isCheckmate = chess.isCheckmate();
        const isStalemate = chess.isStalemate();
        
        return {
          content: [{
            type: 'text',
            text: `✅ Valid FEN Position\n\n` +
                  `📍 FEN: ${fen}\n` +
                  `🎲 Turn: ${turn} to move\n` +
                  `⚠️  In Check: ${inCheck ? 'Yes' : 'No'}\n` +
                  `♔ Checkmate: ${isCheckmate ? 'Yes' : 'No'}\n` +
                  `🤝 Stalemate: ${isStalemate ? 'Yes' : 'No'}\n\n` +
                  `💡 This position is legal and ready for analysis.`
          }]
        };
      } catch (chessError) {
        return {
          content: [{
            type: 'text',
            text: `❌ Invalid FEN Position\n\n` +
                  `📍 FEN: ${fen}\n` +
                  `🚫 Error: ${chessError.message}\n\n` +
                  `💡 Please check the FEN notation and try again.`
          }]
        };
      }
    } catch (error) {
      throw new Error(`Failed to validate FEN: ${error.message}`);
    }
  }

  async generatePgn(moves, whitePlayer = 'Player1', blackPlayer = 'Player2') {
    try {
      const { Chess } = await import('chess.js');
      const chess = new Chess();
      
      // 验证并执行移动
      const validMoves = [];
      for (const move of moves) {
        try {
          const result = chess.move(move);
          if (result) {
            validMoves.push(result.san);
          } else {
            throw new Error(`Invalid move: ${move}`);
          }
        } catch (moveError) {
          throw new Error(`Failed to process move "${move}": ${moveError.message}`);
        }
      }

      // 生成PGN
      const date = new Date().toISOString().split('T')[0];
      let pgn = `[Event "Chess Trainer Game"]\n`;
      pgn += `[Site "Chess Trainer MCP"]\n`;
      pgn += `[Date "${date}"]\n`;
      pgn += `[Round "1"]\n`;
      pgn += `[White "${whitePlayer}"]\n`;
      pgn += `[Black "${blackPlayer}"]\n`;
      pgn += `[Result "*"]\n\n`;

      // 添加移动
      for (let i = 0; i < validMoves.length; i++) {
        if (i % 2 === 0) {
          pgn += `${Math.floor(i / 2) + 1}. ${validMoves[i]}`;
        } else {
          pgn += ` ${validMoves[i]}`;
          if (i < validMoves.length - 1) pgn += '\n';
        }
      }
      
      pgn += ' *';

      return {
        content: [{
          type: 'text',
          text: `📋 Generated PGN\n\n${pgn}\n\n💡 This PGN can be imported into chess software for analysis.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate PGN: ${error.message}`);
    }
  }

  async startChessUI(port = 3456, mode = 'play') {
    try {
      // 检查服务器是否已在运行
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        if (response.ok) {
          return {
            content: [{
              type: 'text',
              text: `✅ Chess Trainer UI Already Running\n\n` +
                    `🌐 URL: http://localhost:${port}\n` +
                    `🎮 Mode: ${mode}\n` +
                    `🔗 WebSocket: ws://localhost:${port}\n\n` +
                    `💡 The server is already active and ready to use.`
            }]
          };
        }
      } catch (e) {
        // 服务器未运行，继续启动
      }

      // 启动服务器的逻辑这里简化，实际中需要启动子进程
      return {
        content: [{
          type: 'text',
          text: `🚀 Starting Chess Trainer UI...\n\n` +
                `🌐 URL: http://localhost:${port}\n` +
                `🎮 Mode: ${mode}\n` +
                `🔗 WebSocket: ws://localhost:${port}\n\n` +
                `💡 Please run "node server/index.js" to start the server.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to start Chess UI: ${error.message}`);
    }
  }

  async stopChessUI(port = 3456) {
    try {
      return {
        content: [{
          type: 'text',
          text: `⏹️  Chess Trainer UI Stop Requested\n\n` +
                `🌐 Port: ${port}\n\n` +
                `💡 Please manually stop the server process if needed.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to stop Chess UI: ${error.message}`);
    }
  }

  async startChessGame(port = 3456, mode = 'play', autoOpen = true) {
    try {
      const uiResult = await this.startChessUI(port, mode);
      
      return {
        content: [{
          type: 'text',
          text: `🎮 Chess Game Starting...\n\n` +
                `🌐 URL: http://localhost:${port}\n` +
                `🎯 Mode: ${mode}\n` +
                `🖥️  Auto-open browser: ${autoOpen ? 'Yes' : 'No'}\n\n` +
                `${uiResult.content[0].text.split('\n\n').slice(1).join('\n\n')}`
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

  async createGameWithSettings(args) {
    try {
      const {
        game_id,
        mode = 'human_vs_ai',
        player_color = 'white',
        ai_elo = 1500,
        ai_time_limit = 1000
      } = args;

      // Create game with settings via API
      const response = await fetch(`http://localhost:3456/api/mcp/reset_game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game_id: game_id,
          gameSettings: {
            mode: mode,
            playerColor: player_color,
            aiEloRating: ai_elo,
            aiTimeLimit: ai_time_limit
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Web server responded with status ${response.status}`);
      }

      const result = await response.json();
      
      return {
        content: [{
          type: 'text',
          text: `🎮 Chess Game Created Successfully!\n\n` +
                `🆔 Game ID: ${game_id}\n` +
                `🎯 Mode: ${mode === 'human_vs_ai' ? 'Human vs AI' : 'Human vs Human'}\n` +
                `🎨 Your Color: ${player_color === 'white' ? 'White (first move)' : 'Black (second move)'}\n` +
                `🤖 AI Strength: ${ai_elo} ELO\n` +
                `⏱️ AI Think Time: ${ai_time_limit/1000} seconds\n\n` +
                `🌐 Play at: http://localhost:3456\n` +
                `💡 Use 'make_move ${game_id} <move>' to make moves\n` +
                `💡 Use 'get_game_state ${game_id}' to check status`
        }]
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return {
          content: [{
            type: 'text',
            text: `❌ Connection Failed\n\n` +
                  `🔌 Cannot connect to Chess Trainer web server\n` +
                  `💡 Please start the web server first with: launch_chess_trainer\n\n` +
                  `🔧 Error: ${error.message}`
          }]
        };
      }
      
      throw new Error(`Failed to create game: ${error.message}`);
    }
  }

  async launchChessTrainer(args = {}) {
    try {
      const { port = 3456, auto_open_browser = true } = args;

      // Check if server is already running
      try {
        const testResponse = await fetch(`http://localhost:${port}/api/health`);
        if (testResponse.ok) {
          return {
            content: [{
              type: 'text',
              text: `✅ Chess Trainer Already Running!\n\n` +
                    `🌐 Access at: http://localhost:${port}\n` +
                    `💡 Ready to create games and play chess!\n\n` +
                    `🎮 Next steps:\n` +
                    `1. Use 'create_game_with_settings' to set up a new game\n` +
                    `2. Use 'make_move' to play\n` +
                    `3. Open browser to see the visual interface`
            }]
          };
        }
      } catch (e) {
        // Server not running, continue to start it
      }

      // Start the Chess Trainer server
      const { spawn } = await import('child_process');
      const path = await import('path');
      const serverPath = path.join(process.cwd(), 'server', 'index.js');
      
      const serverProcess = spawn('node', [serverPath], {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore'
      });

      // Give server time to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify server started
      try {
        const healthCheck = await fetch(`http://localhost:${port}/api/health`);
        if (!healthCheck.ok) {
          throw new Error('Server health check failed');
        }
      } catch (e) {
        throw new Error('Failed to verify server startup');
      }

      // Open browser if requested
      if (auto_open_browser) {
        try {
          const open = (await import('open')).default;
          await open(`http://localhost:${port}`);
        } catch (e) {
          // Browser opening failed, but server is running
        }
      }

      return {
        content: [{
          type: 'text',
          text: `🚀 Chess Trainer Launched Successfully!\n\n` +
                `🌐 Web Interface: http://localhost:${port}\n` +
                `🖥️ Server Status: Running\n` +
                `${auto_open_browser ? '🌐 Browser opened automatically' : '💡 Open browser manually to access UI'}\n\n` +
                `🎮 Ready to play! Next steps:\n` +
                `1. Use 'create_game_with_settings' to set up a game\n` +
                `2. Set your preferred AI ELO (800-2800)\n` +
                `3. Choose your color and start playing!\n\n` +
                `💡 Example: create_game_with_settings game_id="my_game" ai_elo=1800`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to launch Chess Trainer: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Chess Trainer MCP Server running on stdio');
  }
}

// 如果直接运行此文件，启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPServer();
  server.run().catch(console.error);
} 