import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { gameStateManager } from './gameStateManager.js';

export class MCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'chess-trainer-mcp',
        version: '1.0.11',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          experimental: {
            embedding: {
              supported: true,
              version: '1.0.0',
              features: ['iframe', 'postMessage']
            }
          }
        },
      }
    );

    this.initializeTools();
    this.setupHandlers();
  }

  initializeTools() {
    this.tools = [
      // Server Management Tools
      {
        name: 'launch_chess_trainer',
        description: 'Launch the Chess Trainer web server with optional browser opening',
        inputSchema: zodToJsonSchema(
          z.object({
            port: z.number().default(3456).describe('Port to run the web server on'),
            auto_open_browser: z.boolean().default(true).describe('Automatically open browser after starting')
          })
        )
      },
      {
        name: 'stop_chess_trainer',
        description: 'Stop the Chess Trainer web server',
        inputSchema: zodToJsonSchema(
          z.object({
            port: z.number().default(3456).describe('Port of the server to stop')
          })
        )
      },
      
      // Game Management Tools
      {
        name: 'create_game',
        description: 'Create a new chess game with specific settings',
        inputSchema: zodToJsonSchema(
          z.object({
            game_id: z.string().describe('Unique identifier for the game'),
            mode: z.enum(['human_vs_human', 'human_vs_ai']).default('human_vs_ai').describe('Game mode'),
            player_color: z.enum(['white', 'black']).default('white').describe('Player color when playing against AI'),
            ai_elo: z.number().min(800).max(2800).default(1500).describe('AI strength in ELO rating (800-2800)'),
            ai_time_limit: z.number().min(200).max(5000).default(1000).describe('AI thinking time in milliseconds')
          })
        )
      },
      {
        name: 'list_active_games',
        description: 'List all currently active chess games',
        inputSchema: zodToJsonSchema(z.object({}))
      },
      {
        name: 'get_game_state',
        description: 'Get the current state of a specific chess game',
        inputSchema: zodToJsonSchema(
          z.object({
            game_id: z.string().describe('ID of the game')
          })
        )
      },
      {
        name: 'reset_game',
        description: 'Reset a game to the starting position',
        inputSchema: zodToJsonSchema(
          z.object({
            game_id: z.string().describe('ID of the game to reset')
          })
        )
      },

      // Game Interaction Tools
      {
        name: 'make_move',
        description: 'Make a move in an active chess game',
        inputSchema: zodToJsonSchema(
          z.object({
            game_id: z.string().describe('ID of the game'),
            move: z.string().describe('Move in algebraic notation (e.g., "e2e4", "Nf3", "O-O")')
          })
        )
      },
      {
        name: 'suggest_best_move',
        description: 'Get the best move suggestion for the current position',
        inputSchema: zodToJsonSchema(
          z.object({
            game_id: z.string().describe('ID of the game'),
            depth: z.number().min(1).max(20).default(12).describe('Analysis depth')
          })
        )
      },

      // Analysis Tools
      {
        name: 'analyze_position',
        description: 'Analyze a chess position (currently returns simulated analysis)',
        inputSchema: zodToJsonSchema(
          z.object({
            fen: z.string().describe('FEN string of the position to analyze'),
            depth: z.number().min(1).max(20).default(15).describe('Analysis depth')
          })
        )
      },
      {
        name: 'evaluate_move',
        description: 'Evaluate the quality of a chess move',
        inputSchema: zodToJsonSchema(
          z.object({
            fen: z.string().describe('FEN string before the move'),
            move: z.string().describe('Move to evaluate in algebraic notation')
          })
        )
      },
      {
        name: 'get_best_moves',
        description: 'Get the top N best moves for a position',
        inputSchema: zodToJsonSchema(
          z.object({
            fen: z.string().describe('FEN string of the position'),
            count: z.number().min(1).max(10).default(3).describe('Number of best moves to return')
          })
        )
      },

      // Utility Tools
      {
        name: 'validate_fen',
        description: 'Validate a FEN string and get position information',
        inputSchema: zodToJsonSchema(
          z.object({
            fen: z.string().describe('FEN string to validate')
          })
        )
      },
      {
        name: 'generate_pgn',
        description: 'Generate PGN notation from a list of moves',
        inputSchema: zodToJsonSchema(
          z.object({
            moves: z.array(z.string()).describe('Array of moves in algebraic notation'),
            white_player: z.string().default('Player1').describe('White player name'),
            black_player: z.string().default('Player2').describe('Black player name'),
            event: z.string().default('Chess Trainer Game').describe('Event name'),
            date: z.string().optional().describe('Game date (YYYY.MM.DD format)')
          })
        )
      },
      {
        name: 'explain_opening',
        description: 'Get explanation and principles of a chess opening',
        inputSchema: zodToJsonSchema(
          z.object({
            moves: z.array(z.string()).describe('Opening moves in algebraic notation'),
            opening_name: z.string().optional().describe('Name of the opening (if known)')
          })
        )
      },

      // Embedding Tools
      {
        name: 'get_embeddable_url',
        description: 'Get an embeddable URL for iframe integration',
        inputSchema: zodToJsonSchema(
          z.object({
            game_id: z.string().describe('Game ID to embed'),
            mode: z.enum(['full', 'board-only', 'minimal']).default('minimal').describe('UI mode for embedded view'),
            width: z.number().min(300).max(1200).default(600).describe('Width of the embedded view'),
            height: z.number().min(300).max(1200).default(600).describe('Height of the embedded view'),
            allow_moves: z.boolean().default(true).describe('Allow making moves in embedded view'),
            show_controls: z.boolean().default(false).describe('Show game controls in embedded view')
          })
        )
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

  async callTool(name, arguments_) {
    switch (name) {
      // Server Management
      case 'launch_chess_trainer':
        return await this.launchChessTrainer(arguments_);
      case 'stop_chess_trainer':
        return await this.stopChessTrainer(arguments_);

      // Game Management
      case 'create_game':
        return await this.createGame(arguments_);
      case 'list_active_games':
        return await this.proxyToWebServer('list_active_games', arguments_);
      case 'get_game_state':
        return await this.proxyToWebServer('get_game_state', arguments_);
      case 'reset_game':
        return await this.proxyToWebServer('reset_game', arguments_);

      // Game Interaction
      case 'make_move':
        return await this.proxyToWebServer('make_move', arguments_);
      case 'suggest_best_move':
        return await this.proxyToWebServer('suggest_move', arguments_);

      // Analysis Tools
      case 'analyze_position':
        return await this.analyzePosition(arguments_.fen, arguments_.depth);
      case 'evaluate_move':
        return await this.evaluateMove(arguments_.fen, arguments_.move);
      case 'get_best_moves':
        return await this.getBestMoves(arguments_.fen, arguments_.count);

      // Utility Tools
      case 'validate_fen':
        return await this.validateFen(arguments_.fen);
      case 'generate_pgn':
        return await this.generatePgn(arguments_);
      case 'explain_opening':
        return await this.explainOpening(arguments_.moves, arguments_.opening_name);

      // Embedding Tools
      case 'get_embeddable_url':
        return await this.getEmbeddableUrl(arguments_);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Proxy method for web server communication
  async proxyToWebServer(action, args) {
    try {
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
            text: `❌ Chess Trainer Server Not Running\n\n` +
                  `The chess trainer web server is not running on port 3456.\n` +
                  `Please start it first using the 'launch_chess_trainer' tool.\n\n` +
                  `Error: ${error.message}`
          }]
        };
      }
      
      throw new Error(`Failed to connect to web server: ${error.message}`);
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
                    `🌐 Web Interface: http://localhost:${port}\n` +
                    `🔗 WebSocket: ws://localhost:${port}/ws\n\n` +
                    `The server is already active. You can:\n` +
                    `• Open http://localhost:${port} in your browser\n` +
                    `• Use 'create_game' to start a new game\n` +
                    `• Use 'list_active_games' to see current games`
            }]
          };
        }
      } catch (e) {
        // Server not running, continue to start it
      }

      // Try direct server start first (more reliable for MCP context)
      try {
        const { startChessTrainerDirectly } = await import('./mcpServer-direct.js');
        const result = await startChessTrainerDirectly(port);
        
        if (result.success) {
          // Open browser if requested
          let browserMessage = '';
          if (auto_open_browser) {
            try {
              const open = (await import('open')).default;
              await open(`http://localhost:${port}`);
              browserMessage = '🌐 Browser opened automatically\n';
            } catch (e) {
              browserMessage = '⚠️  Could not open browser automatically\n';
            }
          }

          return {
            content: [{
              type: 'text',
              text: `🚀 Chess Trainer Started Successfully!\n\n` +
                    `🌐 Web Interface: ${result.url}\n` +
                    `🔗 WebSocket: ws://localhost:${port}/ws\n` +
                    browserMessage +
                    `\nThe server is now running. You can:\n` +
                    `• Use 'create_game' to start a new game\n` +
                    `• Visit ${result.url} in your browser`
            }]
          };
        }
      } catch (directStartError) {
        console.error('Direct start failed:', directStartError);
        // Fall back to spawn method
      }

      // Start the Chess Trainer server
      const { spawn } = await import('child_process');
      const path = await import('path');
      const fs = await import('fs');
      
      const binPath = path.join(process.cwd(), 'bin', 'chess-trainer-mcp');
      
      // Check if binary exists
      if (!fs.existsSync(binPath)) {
        throw new Error(`Chess Trainer binary not found at ${binPath}`);
      }
      
      // Start the server with output capture for debugging
      const serverProcess = spawn('node', [binPath], {
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      // Capture any early errors
      let startupError = '';
      serverProcess.stderr?.on('data', (data) => {
        startupError += data.toString();
      });
      
      serverProcess.on('error', (err) => {
        console.error('Failed to start server process:', err);
      });

      serverProcess.unref();

      // Give server time to start with retry logic
      let serverStarted = false;
      const maxRetries = 10;
      const retryDelay = 1000; // 1 second between retries
      
      for (let i = 0; i < maxRetries; i++) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
        try {
          const healthCheck = await fetch(`http://localhost:${port}/api/health`);
          if (healthCheck.ok) {
            serverStarted = true;
            break;
          }
        } catch (e) {
          // Server not ready yet, continue retrying
          if (i === maxRetries - 1) {
            const errorMsg = `Server failed to start after ${maxRetries} attempts (${maxRetries * retryDelay / 1000} seconds)`;
            if (startupError) {
              throw new Error(`${errorMsg}\nStartup errors: ${startupError}`);
            }
            throw new Error(errorMsg);
          }
        }
      }
      
      if (!serverStarted) {
        throw new Error('Failed to verify server startup');
      }

      // Open browser if requested
      let browserMessage = '';
      if (auto_open_browser) {
        try {
          const open = (await import('open')).default;
          await open(`http://localhost:${port}`);
          browserMessage = '🌐 Browser opened automatically\n';
        } catch (e) {
          browserMessage = '⚠️  Could not open browser automatically\n';
        }
      }

      return {
        content: [{
          type: 'text',
          text: `🚀 Chess Trainer Started Successfully!\n\n` +
                `🌐 Web Interface: http://localhost:${port}\n` +
                `🔗 WebSocket: ws://localhost:${port}/ws\n` +
                browserMessage +
                `\nThe server is now running. You can:\n` +
                `• Use 'create_game' to start a new game\n` +
                `• Visit http://localhost:${port} in your browser\n\n` +
                `Note: First startup may take longer as it builds the client interface.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to launch Chess Trainer: ${error.message}`);
    }
  }

  async stopChessTrainer(args = {}) {
    try {
      const { port = 3456 } = args;
      
      // First try the direct stop method if server was started directly
      try {
        const { stopChessTrainerDirectly } = await import('./mcpServer-direct.js');
        const directResult = stopChessTrainerDirectly();
        if (directResult.success) {
          return {
            content: [{
              type: 'text',
              text: `✅ ${directResult.message}\n\n` +
                    `The Chess Trainer server has been stopped.`
            }]
          };
        }
      } catch (e) {
        // Direct stop failed, try system approach
      }

      // Use system commands to stop server on port
      const { stopChessTrainerServer } = await import('./mcpServer-stop.js');
      const result = await stopChessTrainerServer(port);
      
      if (result.success) {
        return {
          content: [{
            type: 'text',
            text: `✅ ${result.message}\n\n` +
                  `The Chess Trainer server on port ${port} has been stopped.`
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `⚠️ ${result.message}\n\n` +
                  `The server may not be running or may have already been stopped.`
          }]
        };
      }
    } catch (error) {
      throw new Error(`Failed to stop Chess Trainer: ${error.message}`);
    }
  }

  async createGame(args) {
    try {
      const {
        game_id,
        mode = 'human_vs_ai',
        player_color = 'white',
        ai_elo = 1500,
        ai_time_limit = 1000
      } = args;

      // Use the reset_game endpoint with settings
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
        throw new Error(`Server responded with status ${response.status}`);
      }

      const result = await response.json();
      
      return {
        content: [{
          type: 'text',
          text: `🎮 Chess Game Created!\n\n` +
                `🆔 Game ID: ${game_id}\n` +
                `🎯 Mode: ${mode === 'human_vs_ai' ? 'Human vs AI' : 'Human vs Human'}\n` +
                (mode === 'human_vs_ai' ? 
                  `🎨 Your Color: ${player_color}\n` +
                  `🤖 AI Strength: ${ai_elo} ELO\n` +
                  `⏱️ AI Think Time: ${ai_time_limit/1000}s\n` : '') +
                `\n🌐 Play at: http://localhost:3456\n` +
                `\nNext steps:\n` +
                `• Use 'make_move ${game_id} <move>' to play\n` +
                `• Use 'get_game_state ${game_id}' to see the board\n` +
                `• Use 'suggest_best_move ${game_id}' for help`
        }]
      };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return {
          content: [{
            type: 'text',
            text: `❌ Chess Trainer Server Not Running\n\n` +
                  `Please start the server first with 'launch_chess_trainer'.\n` +
                  `Error: ${error.message}`
          }]
        };
      }
      
      throw new Error(`Failed to create game: ${error.message}`);
    }
  }

  // Analysis tool implementations (currently mocked - need real Stockfish integration)
  async analyzePosition(fen, depth = 15) {
    try {
      // TODO: Integrate real Stockfish analysis
      const mockAnalysis = {
        evaluation: '+0.34',
        bestMove: 'e2e4',
        pv: 'e2e4 e7e5 Ng1f3',
        assessment: 'Slightly better for White'
      };
      
      return {
        content: [{
          type: 'text',
          text: `📊 Position Analysis\n\n` +
                `📍 FEN: ${fen}\n` +
                `🔍 Depth: ${depth}\n\n` +
                `📈 Evaluation: ${mockAnalysis.evaluation}\n` +
                `🎯 Best Move: ${mockAnalysis.bestMove}\n` +
                `📋 Principal Variation: ${mockAnalysis.pv}\n` +
                `💭 Assessment: ${mockAnalysis.assessment}\n\n` +
                `⚠️  Note: This is simulated analysis. Real Stockfish integration pending.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to analyze position: ${error.message}`);
    }
  }

  async evaluateMove(fen, move) {
    try {
      const { Chess } = await import('chess.js');
      const chess = new Chess(fen);
      const moveResult = chess.move(move);
      
      if (!moveResult) {
        return {
          content: [{
            type: 'text',
            text: `❌ Invalid Move\n\n` +
                  `Move "${move}" is not legal in the given position.\n` +
                  `Please check the move notation and try again.`
          }]
        };
      }

      // TODO: Real evaluation with Stockfish
      return {
        content: [{
          type: 'text',
          text: `♟️ Move Evaluation: ${moveResult.san}\n\n` +
                `✅ Move is legal\n` +
                `📍 New position: ${chess.fen()}\n\n` +
                `⚠️  Note: Detailed move quality analysis requires Stockfish integration.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to evaluate move: ${error.message}`);
    }
  }

  async getBestMoves(fen, count = 3) {
    try {
      // TODO: Real Stockfish integration
      const mockMoves = [
        { move: 'e2e4', eval: '+0.31', line: 'e2e4 e7e5 Ng1f3 Nb8c6' },
        { move: 'd2d4', eval: '+0.28', line: 'd2d4 d7d5 c2c4 e7e6' },
        { move: 'Ng1f3', eval: '+0.25', line: 'Ng1f3 Ng8f6 c2c4 e7e6' }
      ].slice(0, count);

      let result = `🎯 Best Moves Analysis\n\n`;
      result += `📍 Position: ${fen}\n\n`;
      
      mockMoves.forEach((m, i) => {
        result += `${i + 1}. ${m.move} (${m.eval})\n`;
        result += `   📋 Line: ${m.line}\n\n`;
      });

      result += `⚠️  Note: This shows example moves. Real engine analysis pending.`;

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

  async validateFen(fen) {
    try {
      const { Chess } = await import('chess.js');
      
      try {
        const chess = new Chess(fen);
        const turn = chess.turn() === 'w' ? 'White' : 'Black';
        const inCheck = chess.isCheck();
        const isCheckmate = chess.isCheckmate();
        const isStalemate = chess.isStalemate();
        const isDraw = chess.isDraw();
        const isInsufficientMaterial = chess.isInsufficientMaterial();
        const isThreefoldRepetition = chess.isThreefoldRepetition();
        
        let status = '✅ Valid FEN Position\n\n';
        status += `📍 FEN: ${fen}\n\n`;
        status += `🎯 Turn: ${turn}\n`;
        
        if (inCheck) status += `⚠️ Check: Yes\n`;
        if (isCheckmate) status += `♔ Checkmate: Yes - ${turn === 'White' ? 'Black' : 'White'} wins!\n`;
        if (isStalemate) status += `🤝 Stalemate: Yes - Draw!\n`;
        if (isDraw) status += `🤝 Draw: Yes\n`;
        if (isInsufficientMaterial) status += `📉 Insufficient Material: Yes\n`;
        if (isThreefoldRepetition) status += `🔄 Threefold Repetition: Yes\n`;
        
        return {
          content: [{
            type: 'text',
            text: status
          }]
        };
      } catch (chessError) {
        return {
          content: [{
            type: 'text',
            text: `❌ Invalid FEN Position\n\n` +
                  `The provided FEN string is not valid.\n` +
                  `Error: ${chessError.message}\n\n` +
                  `FEN format: <pieces> <turn> <castling> <en-passant> <halfmove> <fullmove>`
          }]
        };
      }
    } catch (error) {
      throw new Error(`Failed to validate FEN: ${error.message}`);
    }
  }

  async generatePgn(args) {
    try {
      const { 
        moves, 
        white_player = 'Player1', 
        black_player = 'Player2',
        event = 'Chess Trainer Game',
        date = new Date().toISOString().split('T')[0].replace(/-/g, '.')
      } = args;

      const { Chess } = await import('chess.js');
      const chess = new Chess();
      
      // Validate and execute moves
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
          return {
            content: [{
              type: 'text',
              text: `❌ Error in move sequence\n\n` +
                    `Failed at move "${move}"\n` +
                    `${moveError.message}\n\n` +
                    `Valid moves so far: ${validMoves.join(' ')}`
            }]
          };
        }
      }

      // Generate PGN
      let pgn = `[Event "${event}"]\n`;
      pgn += `[Site "Chess Trainer MCP"]\n`;
      pgn += `[Date "${date}"]\n`;
      pgn += `[Round "?"]\n`;
      pgn += `[White "${white_player}"]\n`;
      pgn += `[Black "${black_player}"]\n`;
      pgn += `[Result "*"]\n\n`;

      // Format moves
      for (let i = 0; i < validMoves.length; i++) {
        if (i % 2 === 0) {
          pgn += `${Math.floor(i / 2) + 1}. ${validMoves[i]}`;
        } else {
          pgn += ` ${validMoves[i]}`;
          if (i < validMoves.length - 1) pgn += '\n';
        }
      }
      
      if (validMoves.length > 0) pgn += ' *';

      return {
        content: [{
          type: 'text',
          text: `📋 Generated PGN\n\n${pgn}\n\n` +
                `✅ ${validMoves.length} moves validated and formatted\n` +
                `💡 This PGN can be imported into any chess software`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to generate PGN: ${error.message}`);
    }
  }

  async explainOpening(moves, openingName) {
    try {
      // Enhanced opening database
      const openingDatabase = {
        'e4': { 
          name: "King's Pawn", 
          idea: "Controls center, develops pieces quickly"
        },
        'd4': { 
          name: "Queen's Pawn", 
          idea: "Solid center control, strategic play"
        },
        'Nf3': { 
          name: "Réti Opening", 
          idea: "Flexible development, delays center commitment"
        },
        'c4': { 
          name: "English Opening", 
          idea: "Controls d5, flexible pawn structure"
        },
        'e4,e5,Nf3,Nc6,Bb5': { 
          name: "Ruy Lopez", 
          idea: "Pressures e5 pawn, aims for center control"
        },
        'e4,e5,Nf3,Nc6,Bc4': { 
          name: "Italian Game", 
          idea: "Quick development, targets f7 weakness"
        },
        'e4,c5': { 
          name: "Sicilian Defense", 
          idea: "Asymmetrical, fights for initiative"
        },
        'd4,d5,c4': { 
          name: "Queen's Gambit", 
          idea: "Challenges black's center, gains space"
        },
        'd4,Nf6,c4,g6': { 
          name: "King's Indian Defense", 
          idea: "Flexible setup, counterattack potential"
        }
      };

      const moveString = moves.join(',');
      const opening = openingDatabase[moveString] || 
                      openingDatabase[moves[0]] || 
                      { name: openingName || "Unknown Opening", idea: "Develops pieces and controls center" };

      return {
        content: [{
          type: 'text',
          text: `📚 Opening Analysis\n\n` +
                `🏷️ Opening: ${opening.name}\n` +
                `♟️ Moves: ${moves.join(' ')}\n\n` +
                `💡 Main Idea: ${opening.idea}\n\n` +
                `📋 General Opening Principles:\n` +
                `• Control the center with pawns\n` +
                `• Develop knights before bishops\n` +
                `• Castle early for king safety\n` +
                `• Don't move the same piece twice\n` +
                `• Don't bring queen out too early\n` +
                `• Connect your rooks`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to explain opening: ${error.message}`);
    }
  }

  async getEmbeddableUrl(args) {
    try {
      const {
        game_id,
        mode = 'minimal',
        width = 600,
        height = 600,
        allow_moves = true,
        show_controls = false
      } = args;

      // Check if server is running
      const port = 3456; // Default port, could be made configurable
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        if (!response.ok) {
          throw new Error('Chess Trainer server is not running');
        }
      } catch (e) {
        return {
          content: [{
            type: 'text',
            text: `❌ Chess Trainer server is not running\n\n` +
                  `Please start the server first using 'launch_chess_trainer'`
          }]
        };
      }

      // Generate embed URL with parameters
      const params = new URLSearchParams({
        game_id,
        mode,
        width: width.toString(),
        height: height.toString(),
        allow_moves: allow_moves.toString(),
        show_controls: show_controls.toString()
      });

      const embedUrl = `http://localhost:${port}/embed?${params.toString()}`;
      
      // Generate iframe code
      const iframeCode = `<iframe 
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="fullscreen"
  style="border: 1px solid #ccc; border-radius: 8px;"
></iframe>`;

      return {
        content: [{
          type: 'text',
          text: `🎮 Embeddable Chess Board URL\n\n` +
                `📍 Game ID: ${game_id}\n` +
                `🖼️ Mode: ${mode}\n` +
                `📐 Size: ${width}x${height}\n` +
                `🎯 Interactive: ${allow_moves ? 'Yes' : 'View Only'}\n` +
                `🎛️ Controls: ${show_controls ? 'Visible' : 'Hidden'}\n\n` +
                `🔗 Embed URL:\n${embedUrl}\n\n` +
                `📋 IFrame Code:\n\`\`\`html\n${iframeCode}\n\`\`\`\n\n` +
                `💡 This URL can be embedded in any web application that supports iframes.`
        }],
        // Include structured data for programmatic access
        data: {
          url: embedUrl,
          iframe_code: iframeCode,
          parameters: {
            game_id,
            mode,
            width,
            height,
            allow_moves,
            show_controls
          }
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate embeddable URL: ${error.message}`);
    }
  }

  async listTools() {
    return {
      tools: this.tools
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Chess Trainer MCP Server running on stdio');
  }
}

// Run server if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPServer();
  server.run().catch(console.error);
}