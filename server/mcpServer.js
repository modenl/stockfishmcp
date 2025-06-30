import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, InitializeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { gameStateManager } from './gameStateManager.js';
import { ChessTrainerServer } from './index.js';
import { parsePgn } from 'chessops/pgn.js';
import { Chess } from 'chessops/chess.js';
import { parseFen } from 'chessops/fen.js';
import { makeSan } from 'chessops/san.js';

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

    this.serverInstance = null; // Store the Chess Trainer server instance
    this.gameStateManager = gameStateManager; // Store reference to game state manager
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
        name: 'setup_game',
        description: 'Setup the chess game with specific settings',
        inputSchema: zodToJsonSchema(
          z.object({
            mode: z.enum(['human_vs_human', 'human_vs_ai']).default('human_vs_ai').describe('Game mode'),
            player_color: z.enum(['white', 'black']).default('white').describe('Player color when playing against AI'),
            ai_elo: z.number().min(800).max(2800).default(1500).describe('AI strength in ELO rating (800-2800)'),
            ai_time_limit: z.number().min(200).max(5000).default(1000).describe('AI thinking time in milliseconds')
          })
        )
      },
      {
        name: 'get_game_state',
        description: 'Get the current chess game state',
        inputSchema: zodToJsonSchema(z.object({}))
      },
      {
        name: 'reset_game',
        description: 'Reset the game to the starting position',
        inputSchema: zodToJsonSchema(z.object({}))
      },

      // Game Interaction Tools
      {
        name: 'make_move',
        description: 'Make a move in the current chess game',
        inputSchema: zodToJsonSchema(
          z.object({
            move: z.string().describe('Move in algebraic notation (e.g., "e2e4", "Nf3", "O-O")')
          })
        )
      },
      {
        name: 'suggest_best_move',
        description: 'Get the best move suggestion for the current position',
        inputSchema: zodToJsonSchema(
          z.object({
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
        description: 'Get an embeddable URL for iframe integration of the current active game',
        inputSchema: zodToJsonSchema(
          z.object({
            mode: z.enum(['full', 'board-only', 'minimal']).default('minimal').describe('UI mode for embedded view'),
            width: z.number().min(300).max(1200).default(600).describe('Width of the embedded view'),
            height: z.number().min(300).max(1200).default(600).describe('Height of the embedded view'),
            allow_moves: z.boolean().default(true).describe('Allow making moves in embedded view'),
            show_controls: z.boolean().default(false).describe('Show game controls in embedded view')
          })
        )
      },
      
      // PGN Loading Tools
      {
        name: 'load_pgn_for_replay',
        description: 'Load a PGN file or text and trigger UI replay mode',
        inputSchema: zodToJsonSchema(
          z.object({
            pgn: z.string().describe('PGN content as text'),
            auto_play: z.boolean().default(true).describe('Automatically start playing through the moves'),
            delay_ms: z.number().min(500).max(5000).default(2000).describe('Delay between moves in milliseconds')
          })
        )
      }
    ];
  }

  setupHandlers() {
    // Handle initialization - start chess server automatically
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      console.error('🚀 MCP Server initializing...');
      
      try {
        // Start the chess server automatically during initialization
        if (!this.serverInstance) {
          this.serverInstance = new ChessTrainerServer();
          await this.serverInstance.initialize();
          await this.serverInstance.start(3456);
          console.error('✅ Chess server started on port 3456');
        }
        console.error('✅ MCP Server initialized with chess server running');
        
        // Return standard initialization response
        return {
          protocolVersion: request.params.protocolVersion,
          capabilities: this.server.getCapabilities(),
          serverInfo: {
            name: 'chess-trainer-mcp',
            version: '1.0.11'
          },
          instructions: 'Chess Trainer MCP Server is ready. The chess server has been automatically started on port 3456.'
        };
      } catch (error) {
        console.error('❌ Failed to initialize MCP server:', error);
        throw new Error(`Initialization failed: ${error.message}`);
      }
    });

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

    // Handle server shutdown
    this.setupShutdownHandlers();
  }

  // Check if there's an active game
  hasActiveGame() {
    try {
      const gameState = gameStateManager.getGameState();
      return gameState && gameState.active;
    } catch (error) {
      console.error('Failed to check active game:', error);
      return false;
    }
  }

  setupShutdownHandlers() {
    // Handle graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.error(`🛑 MCP Server received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop the chess server if we have an instance
        if (this.serverInstance) {
          this.serverInstance.shutdown();
          console.error('✅ Chess server stopped successfully');
        }
      } catch (error) {
        console.error('⚠️ Error stopping chess server:', error);
      }
      
      // Close MCP server
      try {
        this.server.close();
        console.error('✅ MCP server closed successfully');
      } catch (error) {
        console.error('⚠️ Error closing MCP server:', error);
      }
      
      process.exit(0);
    };

    // Register shutdown handlers for various signals
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error);
      await gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      await gracefulShutdown('unhandledRejection');
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
      case 'setup_game':
        return await this.setupGame(arguments_);
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
      
      case 'load_pgn_for_replay':
        return await this.loadPgnForReplay(arguments_);

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
                    `The server is already running. You can:\n` +
                    `• Open http://localhost:${port} in your browser\n` +
                    `• Use 'setup_game' to configure a new game\n` +
                    `• Use 'get_game_state' to see current position`
            }]
          };
        }
      } catch (e) {
        // Server not running, continue to start it
      }

      // Start the server
      if (!this.serverInstance) {
        this.serverInstance = new ChessTrainerServer();
        await this.serverInstance.initialize();
        await this.serverInstance.start(port);
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
                `• Use 'setup_game' to configure a new game\n` +
                `• Visit http://localhost:${port} in your browser`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to launch Chess Trainer: ${error.message}`);
    }
  }

  async stopChessTrainer(args = {}) {
    try {
      const { port = 3456 } = args;
      
      if (this.serverInstance) {
        this.serverInstance.shutdown();
        this.serverInstance = null;
        return {
          content: [{
            type: 'text',
            text: `✅ Chess Trainer server stopped successfully\n\n` +
                  `The server on port ${port} has been shut down.`
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `⚠️ No server instance found\n\n` +
                  `The server may not be running or was started externally.`
          }]
        };
      }
    } catch (error) {
      throw new Error(`Failed to stop Chess Trainer: ${error.message}`);
    }
  }

  async setupGame(args) {
    try {
      const {
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
                `🎯 Mode: ${mode === 'human_vs_ai' ? 'Human vs AI' : 'Human vs Human'}\n` +
                (mode === 'human_vs_ai' ? 
                  `🎨 Your Color: ${player_color}\n` +
                  `🤖 AI Strength: ${ai_elo} ELO\n` +
                  `⏱️ AI Think Time: ${ai_time_limit/1000}s\n` : '') +
                `\n🌐 Play at: http://localhost:3456\n` +
                `\nNext steps:\n` +
                `• Use 'make_move <move>' to play\n` +
                `• Use 'get_game_state' to see the board\n` +
                `• Use 'suggest_best_move' for help`
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
        mode = 'minimal',
        width = 600,
        height = 600,
        allow_moves = true,
        show_controls = false
      } = args;

      // Ensure game exists
      const gameState = this.gameStateManager.getGameState();
      if (!gameState) {
        console.error('🎯 No game state found, setting up default game...');
        
        // Setup a default game
        await this.setupGame({
          mode: 'human_vs_ai',
          player_color: 'white',
          ai_elo: 1500,
          ai_time_limit: 1000
        });
        
        console.error(`✅ Default game setup completed`);
      }

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

      // Generate URL based on mode
      let url;
      if (mode === 'full') {
        // For full mode, return the normal web page URL
        url = `http://localhost:${port}/`;
      } else {
        // For other modes, return embed URL with parameters
        const params = new URLSearchParams({
          mode,
          width: width.toString(),
          height: height.toString(),
          allow_moves: allow_moves.toString(),
          show_controls: show_controls.toString()
        });
        url = `http://localhost:${port}/embed?${params.toString()}`;
      }
      
      const embedUrl = url;
      
      // Generate iframe code
      const iframeCode = `<iframe 
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="fullscreen"
  style="border: 1px solid #ccc; border-radius: 8px;"
></iframe>`;

      // 检查是否是在本次调用中自动创建的游戏
      const gameStatusMessage = `🎯 Using current active chess game.`;

      return {
        content: [{
          type: 'text',
          text: `🎮 Embeddable Chess Board URL\n\n` +
                `🖼️ Mode: ${mode}\n` +
                `📐 Size: ${width}x${height}\n` +
                `🎯 Interactive: ${allow_moves ? 'Yes' : 'View Only'}\n` +
                `🎛️ Controls: ${show_controls ? 'Visible' : 'Hidden'}\n\n` +
                `🔗 Embed URL:\n${embedUrl}\n\n` +
                `📋 IFrame Code:\n\`\`\`html\n${iframeCode}\n\`\`\`\n\n` +
                `💡 This URL can be embedded in any web application that supports iframes.\n` +
                `${gameStatusMessage}`
        }],
        // Include structured data for programmatic access
        data: {
          url: embedUrl,
          iframe_code: iframeCode,
          parameters: {
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
  
  async loadPgnForReplay(args) {
    try {
      const { pgn, auto_play, delay_ms } = args;
      
      console.log('📄 Received PGN for replay:');
      console.log(pgn.substring(0, 200) + '...');
      
      // Parse PGN to extract moves
      const moves = this.parsePgnToMoves(pgn);
      
      console.log(`🎯 Parsed ${moves.length} moves from PGN`);
      if (moves.length > 0) {
        console.log('First 5 moves:', moves.slice(0, 5));
      }
      
      if (moves.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `❌ Failed to parse PGN\n\nNo valid moves found in the provided PGN.`
          }]
        };
      }
      
      // Send to web server to trigger replay
      const response = await this.proxyToWebServer('load_pgn_replay', {
        pgn,
        moves,
        auto_play,
        delay_ms
      });
      
      return {
        content: [{
          type: 'text',
          text: `🎬 PGN Loaded for Replay\n\n` +
                `♟️  Moves: ${moves.length}\n` +
                `▶️  Auto-play: ${auto_play ? 'Yes' : 'No'}\n` +
                `⏱️  Delay: ${delay_ms}ms\n\n` +
                `${response.message || '✅ The game has been loaded and will start replaying in the UI.'}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `❌ Failed to load PGN: ${error.message}`
        }]
      };
    }
  }
  
  parsePgnToMoves(pgn) {
    // Simple PGN parser - extract moves
    const moves = [];
    
    // Remove comments and variations
    let cleanPgn = pgn.replace(/\{[^}]*\}/g, ''); // Remove comments
    cleanPgn = cleanPgn.replace(/\([^)]*\)/g, ''); // Remove variations
    
    // Remove headers
    cleanPgn = cleanPgn.replace(/\[[^\]]*\]/g, '');
    
    // Extract moves - split by spaces and filter
    const tokens = cleanPgn.split(/\s+/);
    
    for (let token of tokens) {
      // Skip empty tokens and results
      if (!token || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) {
        continue;
      }
      
      // Handle tokens that have move number attached (like "1.Nf3")
      if (/^\d+\./.test(token)) {
        // Extract the move part after the number and dot
        token = token.replace(/^\d+\./, '');
        if (!token) continue;
      }
      
      // This looks like a move - improved regex to catch more move formats
      // Includes: piece moves, pawn moves, captures, promotions, castling, check/checkmate
      if (/^([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|O-O(-O)?[+#]?)$/.test(token)) {
        moves.push(token);
        console.log(`  ✓ Parsed move ${moves.length}: ${token}`);
      } else if (token.length > 1 && token.length < 10) {
        // Log tokens that might be moves but didn't match
        console.log(`  ? Skipped token: "${token}"`);
      }
    }
    
    return moves;
  }

  async listTools() {
    return {
      tools: this.tools
    };
  }

  async run() {
    // Ensure Chess Trainer server is running before accepting requests
    try {
      await this.launchChessTrainer({ auto_open_browser: false });
    } catch (error) {
      console.error('⚠️  Failed to launch Chess Trainer server on startup:', error.message);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Chess Trainer MCP Server running on stdio');
    
    // Handle transport close event
    transport.onclose = async () => {
      console.error('🔌 MCP transport closed, shutting down...');
      if (this.serverInstance) {
        this.serverInstance.shutdown();
      }
    };
  }
}

// Run server if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MCPServer();
  server.run().catch(console.error);
}