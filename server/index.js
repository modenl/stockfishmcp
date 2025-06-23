import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './sessionManager.js';
import { MCPClient } from './mcpClient.js';
import { validateMessage } from './validation.js';
import { gameStateManager } from './gameStateManager.js';
import { Chess } from 'chessops/chess.js';
import { makeFen, parseFen } from 'chessops/fen.js';
import { makeSan, parseSan } from 'chessops/san.js';
import { makeUci, parseUci } from 'chessops/util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChessTrainerServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.sessionManager = new SessionManager();
    this.mcpClient = new MCPClient();
    this.clients = new Map(); // sessionId -> ws connection
    this.gameStates = new Map(); // gameId -> game state
    
    // Increase max listeners to prevent warning
    this.server.setMaxListeners(20);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    // Add headers to enable SharedArrayBuffer for Stockfish WASM
    this.app.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      // Also set for static files
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    });

    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
          workerSrc: ["'self'", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      },
      crossOriginOpenerPolicy: false, // Disable helmet's COOP to use our custom one
      crossOriginEmbedderPolicy: false // Disable helmet's COEP to use our custom one
    }));
    
    this.app.use(cors());
    this.app.use(express.json());
    
    // Configure static file serving with proper CORP headers
    this.app.use(express.static(path.join(__dirname, '../client/dist'), {
      setHeaders: (res, path) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        // Special handling for WASM files
        if (path.endsWith('.wasm')) {
          res.setHeader('Content-Type', 'application/wasm');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }
        // Special handling for JS files
        if (path.endsWith('.js')) {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }
      }
    }));
  }

  setupRoutes() {
    // API Routes
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    this.app.get('/api/sessions/:id', (req, res) => {
      const session = this.sessionManager.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    });

    this.app.post('/api/sessions', (req, res) => {
      const { mode = 'play' } = req.body;
      const session = this.sessionManager.createSession(mode);
      res.json(session);
    });

    // MCP Inbound endpoint
    this.app.post('/api/mcp/inbound', async (req, res) => {
      try {
        const message = req.body;
        await this.handleInboundMCP(message);
        res.json({ status: 'processed' });
      } catch (error) {
        console.error('MCP inbound error:', error);
        res.status(500).json({ error: 'Failed to process MCP message' });
      }
    });

    // MCP Proxy API endpoints
    this.app.post('/api/mcp/list_active_games', (req, res) => {
      try {
        const activeGames = gameStateManager.getAllActiveGames();
        
        if (activeGames.length === 0) {
          return res.json({
            message: `📋 No Active Chess Games\n\n` +
                    `🎯 No chess games are currently running.\n` +
                    `💡 Start a new game by opening the web interface.`
          });
        }

        const gamesList = activeGames.map(game => {
          const moveCount = game.moves ? game.moves.length : 0;
          const lastMove = game.moves && game.moves.length > 0 ? game.moves[game.moves.length - 1] : null;
          
          return `🎮 Game ID: ${game.gameId}\n` +
                 `   📅 Started: ${new Date(game.startTime).toLocaleString()}\n` +
                 `   🎯 Mode: ${game.mode || 'play'}\n` +
                 `   ♟️  Moves: ${moveCount}\n` +
                 `   🎲 Current turn: ${game.turn || 'white'}\n` +
                 `   ${lastMove ? `🏃 Last move: ${lastMove.san || lastMove.move}` : '🆕 No moves yet'}\n` +
                 `   📍 Position: ${game.fen ? game.fen.substring(0, 20) + '...' : 'starting position'}`;
        }).join('\n\n');

        res.json({
          message: `📋 Active Chess Games (${activeGames.length})\n\n${gamesList}\n\n` +
                  `💡 Use get_game_state <game_id> for detailed information\n` +
                  `💡 Use make_move <game_id> <move> to make a move`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/get_game_state', (req, res) => {
      try {
        const { game_id } = req.body;
        
        console.log('\n=== 📊 GET_GAME_STATE REQUEST ===');
        console.log('🎮 Game ID:', game_id);
        console.log('⏰ Timestamp:', new Date().toISOString());
        
        const gameState = gameStateManager.getGameState(game_id);

        if (!gameState) {
          console.log('❌ Game not found:', game_id);
          console.log('=== ❌ GET_GAME_STATE FAILED ===\n');
          return res.json({
            message: `❌ Game Not Found\n\n` +
                    `�� Game ID "${game_id}" does not exist or is no longer active.\n` +
                    `💡 Use list_active_games to see available games.`
          });
        }

        console.log('📊 Current game state found:');
        console.log('   📍 FEN:', gameState.fen);
        console.log('   🎲 Turn:', gameState.turn);
        console.log('   ♟️  Move count:', gameState.moves ? gameState.moves.length : 0);
        console.log('   🎯 Mode:', gameState.mode);
        console.log('   📅 Started:', gameState.startTime);
        console.log('   🟢 Active:', gameState.active);
        
        const moveHistory = gameState.moves ? gameState.moves.map((move, index) => {
          const moveNumber = Math.floor(index / 2) + 1;
          const isWhite = index % 2 === 0;
          return `${isWhite ? moveNumber + '.' : ''}${move.san || move.move}`;
        }).join(' ') : 'No moves yet';

        console.log('   📝 Move history:', moveHistory);
        console.log('=== ✅ GET_GAME_STATE COMPLETED ===\n');

        res.json({
          message: `🎮 Game State: ${game_id}\n\n` +
                  `📅 Started: ${new Date(gameState.startTime).toLocaleString()}\n` +
                  `🎯 Mode: ${gameState.mode || 'play'}\n` +
                  `🎲 Current turn: ${gameState.turn || 'white'}\n` +
                  `♟️  Move count: ${gameState.moves ? gameState.moves.length : 0}\n` +
                  `📍 Current FEN: ${gameState.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}\n` +
                  `📊 Status: ${gameState.active ? '🟢 Active' : '🔴 Ended'}\n\n` +
                  `📝 Move History:\n${moveHistory}\n\n` +
                  `💡 Use make_move ${game_id} <move> to make a move\n` +
                  `💡 Use suggest_move ${game_id} for AI suggestions`
        });
      } catch (error) {
        console.error('❌ Get game state error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/make_move', async (req, res) => {
      try {
        const { game_id, move } = req.body;
        
        console.log('\n=== 📥 MAKE_MOVE REQUEST ===');
        console.log('🎮 Game ID:', game_id);
        console.log('♟️  Move:', move);
        console.log('⏰ Timestamp:', new Date().toISOString());
        
        // 获取或创建游戏状态
        let gameState = gameStateManager.getGameState(game_id);
        if (!gameState) {
          console.log('🆕 Creating new game state for:', game_id);
          // 创建新游戏状态
          gameState = {
            gameId: game_id,
            active: true,
            startTime: new Date().toISOString(),
            mode: 'play',
            moves: [],
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'white'
          };
        } else {
          console.log('📊 Current game state before move:');
          console.log('   📍 FEN:', gameState.fen);
          console.log('   🎲 Turn:', gameState.turn);
          console.log('   ♟️  Move count:', gameState.moves ? gameState.moves.length : 0);
          if (gameState.moves && gameState.moves.length > 0) {
            console.log('   📝 Move history:', gameState.moves.map(m => m.san || m.move).join(' '));
          }
        }

        // 验证走法
        const setup = parseFen(gameState.fen).unwrap();
        const pos = Chess.fromSetup(setup).unwrap();
        const uciMove = parseUci(move);
        
        let san;
        if (uciMove) {
          const sanMove = makeSan(pos, uciMove);
          if (sanMove) {
            san = sanMove;
            console.log('✅ Move validated - UCI:', move, 'SAN:', san);
          } else {
            console.log('❌ Invalid UCI move:', move);
            return res.json({
              message: `❌ Invalid Move\n\n` +
                      `🎯 The move "${move}" is not legal in the current position.\n` +
                      `💡 Please provide a valid move in UCI or SAN format.`
            });
          }
        } else {
          // Try parsing as SAN if UCI fails
          const sanMove = parseSan(pos, move);
          if (sanMove) {
            san = move;
            console.log('✅ Move validated - SAN:', san);
          } else {
            console.log('❌ Invalid SAN move:', move);
            return res.json({
              message: `❌ Invalid Move\n\n` +
                      `🎯 The move "${move}" is not valid.\n` +
                      `💡 Please provide a move in UCI or SAN format.`
            });
          }
        }
        
        const chess = Chess.fromSetup(setup).unwrap();
        
        try {
          chess.play(uciMove || parseSan(pos, san));
          console.log('✅ Move applied to chess engine successfully');
        } catch (error) {
          console.log('❌ Move application failed:', error);
          return res.json({
            message: `❌ Move application failed: ${error.message}`
          });
        }
        
        const newFen = makeFen(chess.toSetup());
        const turn = chess.turn;
        
        console.log('📊 New position after move:');
        console.log('   📍 New FEN:', newFen);
        console.log('   🎲 New turn:', turn);
        
        // 更新游戏状态
        const moveData = {
          san,
          uci: uciMove ? move : makeUci(parseSan(pos, san)),
          fen: newFen,
          turn
        };
        gameState.moves.push({
          san,
          uci: moveData.uci,
          fen: newFen,
          ply: gameState.moves.length + 1,
          timestamp: new Date().toISOString()
        });
        gameState.fen = newFen;
        gameState.turn = turn;
        gameStateManager.saveGameState(game_id, gameState);

        console.log('💾 Updated game state saved:');
        console.log('   ♟️  Total moves:', gameState.moves.length);
        console.log('   📝 Full move history:', gameState.moves.map(m => m.san || m.move).join(' '));
        console.log('   📍 Current FEN:', gameState.fen);
        console.log('   🎲 Current turn:', gameState.turn);

        // 通过WebSocket广播更新
        const client = this.clients.get(game_id);
        if (client && client.readyState === client.OPEN) {
          console.log('📡 Broadcasting move to client via WebSocket:', {
            type: 'mcp_move',
            sessionId: game_id,
            ...moveData
          });
          client.send(JSON.stringify({
            type: 'mcp_move',
            sessionId: game_id,
            ...moveData
          }));
        } else {
          console.log('⚠️  No WebSocket client found for game:', game_id);
        }

        console.log('=== ✅ MAKE_MOVE COMPLETED ===\n');

        res.json({
          message: `✅ Move Made Successfully!\n\n` +
                  `🎮 Game: ${game_id}\n` +
                  `♟️  Move: ${san} (${move})\n` +
                  `🎲 Next turn: ${turn}\n` +
                  `📍 New position: ${newFen}\n\n` +
                  `💡 Move has been applied and broadcasted to web interface\n` +
                  `💡 Use get_game_state ${game_id} to see updated state`
        });
      } catch (error) {
        console.error('❌ Make move error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/suggest_move', async (req, res) => {
      try {
        const { game_id, depth = 12 } = req.body;
        const gameState = gameStateManager.getGameState(game_id);
        
        if (!gameState) {
          return res.json({
            message: `❌ Game Not Found\n\n` +
                    `🎯 Game ID "${game_id}" does not exist.\n` +
                    `💡 Use list_active_games to see available games.`
          });
        }

        const currentFen = gameState.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        
        // 模拟Stockfish分析（实际中应该调用真正的引擎）
        const suggestions = [
          { move: 'e2e4', eval: '+0.34', description: 'King\'s pawn opening, controls center' },
          { move: 'd2d4', eval: '+0.28', description: 'Queen\'s pawn opening, solid development' },
          { move: 'Ng1f3', eval: '+0.25', description: 'Knight development, flexible opening' }
        ];

        const suggestion = suggestions[0]; // 简化：总是返回第一个建议

        res.json({
          message: `🤖 Move Suggestion for Game ${game_id}\n\n` +
                  `📍 Current position: ${currentFen}\n` +
                  `🎲 Turn: ${gameState.turn || 'white'}\n` +
                  `🎯 Depth: ${depth}\n\n` +
                  `💡 Recommended move: ${suggestion.move}\n` +
                  `📊 Evaluation: ${suggestion.eval}\n` +
                  `💭 Description: ${suggestion.description}\n\n` +
                  `💡 To make this move: make_move ${game_id} ${suggestion.move}`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/reset_game', (req, res) => {
      try {
        const { game_id } = req.body;
        
        console.log('\n=== 🔄 RESET_GAME REQUEST ===');
        console.log('🎮 Game ID:', game_id);
        console.log('⏰ Timestamp:', new Date().toISOString());
        
        // 记录重置前的状态
        const oldGameState = gameStateManager.getGameState(game_id);
        if (oldGameState) {
          console.log('📊 Game state before reset:');
          console.log('   📍 FEN:', oldGameState.fen);
          console.log('   🎲 Turn:', oldGameState.turn);
          console.log('   ♟️  Move count:', oldGameState.moves ? oldGameState.moves.length : 0);
          if (oldGameState.moves && oldGameState.moves.length > 0) {
            console.log('   📝 Move history:', oldGameState.moves.map(m => m.san || m.move).join(' '));
          }
        } else {
          console.log('📊 No existing game state found, creating new game');
        }
        
        // 重置游戏状态
        const gameState = {
          gameId: game_id,
          active: true,
          startTime: new Date().toISOString(),
          mode: 'play',
          moves: [],
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'white',
          lastUpdated: new Date().toISOString(),
          // Initialize with default game mode information
          gameMode: 'human_vs_human',
          playerColor: 'white',
          aiEloRating: 1500,
          aiTimeLimit: 500
        };

        gameStateManager.saveGameState(game_id, gameState);

        console.log('💾 New game state after reset:');
        console.log('   📍 FEN:', gameState.fen);
        console.log('   🎲 Turn:', gameState.turn);
        console.log('   ♟️  Move count:', gameState.moves.length);
        console.log('   🎯 Game mode:', gameState.gameMode);
        console.log('   🎨 Player color:', gameState.playerColor);
        console.log('   🤖 AI ELO:', gameState.aiEloRating);

        // 广播重置到所有连接的客户端
        const resetMessage = JSON.stringify({
          type: 'mcp_game_reset',
          gameId: game_id,
          fen: gameState.fen,
          turn: gameState.turn
        });

        console.log('📡 Broadcasting reset to all clients:', resetMessage);

        this.wss.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(resetMessage);
          }
        });

        console.log('=== ✅ RESET_GAME COMPLETED ===\n');

        res.json({
          message: `✅ Game Reset Successfully!\n\n` +
                  `🎮 Game: ${game_id}\n` +
                  `📍 Position reset to starting position\n` +
                  `🎲 Turn: White to move\n` +
                  `⏳ Reset has been applied and broadcasted to web interface\n\n` +
                  `💡 Check game state with: get_game_state ${game_id}\n` +
                  `💡 Make the first move with: make_move ${game_id} e2e4`
        });
      } catch (error) {
        console.error('❌ Reset game error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Serve Svelte app for all other routes  
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('WebSocket connection established');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          const isValid = validateMessage(message);
          
          if (!isValid) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Invalid message format' 
            }));
            return;
          }

          await this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Failed to process message' 
          }));
        }
      });

      ws.on('close', () => {
        // Clean up client mapping
        for (const [sessionId, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(sessionId);
            break;
          }
        }
        console.log('WebSocket connection closed');
      });
    });
  }

  async handleWebSocketMessage(ws, message) {
    const { type, sessionId } = message;

    switch (type) {
      case 'join_session':
        this.clients.set(sessionId, ws);
        const session = this.sessionManager.getSession(sessionId);
        
        // Get existing game state first
        let gameState = gameStateManager.getGameState(sessionId);
        
        // Only create new game state if none exists
        if (!gameState) {
          console.log(`Creating new game state for session: ${sessionId}`);
          gameState = {
            gameId: sessionId,
            active: true,
            startTime: new Date().toISOString(),
            mode: 'play',
            moves: [],
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            turn: 'white',
            // Initialize with default game mode information
            gameMode: 'human_vs_human',
            playerColor: 'white',
            aiEloRating: 1500,
            aiTimeLimit: 500
          };
          gameStateManager.saveGameState(sessionId, gameState);
        } else {
          console.log(`Found existing game state for session: ${sessionId}, moves: ${gameState.moves?.length || 0}`);
          // Ensure existing game state has mode information (for backward compatibility)
          if (!gameState.gameMode) {
            gameState.gameMode = 'human_vs_human';
            gameState.playerColor = 'white';
            gameState.aiEloRating = 1500;
            gameState.aiTimeLimit = 500;
            gameStateManager.saveGameState(sessionId, gameState);
            console.log(`Added missing game mode info to existing session: ${sessionId}`);
          }
        }
        
        console.log('📤 Sending session_state with gameState:', {
          gameMode: gameState.gameMode,
          playerColor: gameState.playerColor,
          aiEloRating: gameState.aiEloRating,
          moves: gameState.moves?.length || 0
        });
        
        ws.send(JSON.stringify({
          type: 'session_state',
          session: session || null,
          gameState: gameState
        }));
        break;

      case 'move':
        await this.handleMove(ws, message);
        break;

      case 'request_analysis':
        await this.handleAnalysisRequest(ws, message);
        break;

      case 'end_session':
        await this.handleEndSession(ws, message);
        break;

      case 'update_game_mode':
        await this.handleUpdateGameMode(ws, message);
        break;

      case 'sync_move':
        await this.handleSyncMove(ws, message);
        break;

      case 'reset_game':
        await this.handleResetGame(ws, message);
        break;

      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${type}`
        }));
    }
  }

  async handleMove(ws, message) {
    const { sessionId, move, fenBefore, fenAfter, evalCp, depth, timeMs } = message;
    
    const moveRecord = this.sessionManager.addMove(sessionId, {
      san: move.san,
      uci: move.uci,
      fenBefore,
      fenAfter,
      evalCp,
      depth,
      timeMs,
      clock: Date.now()
    });

    if (moveRecord) {
      // 同步到游戏状态管理器
      const gameState = gameStateManager.getGameState(sessionId) || {
        gameId: sessionId,
        active: true,
        startTime: new Date().toISOString(),
        mode: 'play',
        moves: [],
        fen: fenBefore,
        turn: fenBefore.includes(' w ') ? 'white' : 'black',
        // Initialize with default game mode information
        gameMode: 'human_vs_human',
        playerColor: 'white',
        aiEloRating: 1500,
        aiTimeLimit: 500
      };

      gameState.moves.push({
        san: move.san,
        uci: move.uci,
        ply: moveRecord.ply,
        timestamp: new Date().toISOString(),
        evalCp,
        depth,
        timeMs
      });
      gameState.fen = fenAfter;
      gameState.turn = fenAfter.includes(' w ') ? 'white' : 'black';
      gameState.lastUpdated = new Date().toISOString();

      gameStateManager.saveGameState(sessionId, gameState);

      // Broadcast move to all clients in session
      const updateMessage = JSON.stringify({
        type: 'move_update',
        sessionId,
        move: moveRecord,
        fen: fenAfter
      });
      
      const client = this.clients.get(sessionId);
      if (client) {
        client.send(updateMessage);
      }

      // Send MCP action for significant moves (every 3rd move or eval change > 50cp)
      if (moveRecord.ply % 3 === 0 || Math.abs(evalCp) > 50) {
        await this.mcpClient.sendEvaluateMove({
          sessionId,
          ply: moveRecord.ply,
          move: move.uci,
          fenBefore,
          fenAfter,
          evalCp,
          depth,
          timeMs
        });
      }
    }
  }

  async handleAnalysisRequest(ws, message) {
    const { sessionId, fen, depth = 15 } = message;
    
    // In a real implementation, this might trigger deeper analysis
    // For now, just acknowledge the request
    ws.send(JSON.stringify({
      type: 'analysis_started',
      sessionId,
      fen,
      depth
    }));
  }

  async handleEndSession(ws, message) {
    const { sessionId, result } = message;
    
    const summary = this.sessionManager.endSession(sessionId, result);
    if (summary) {
      // Send game summary via MCP
      await this.mcpClient.sendGameSummary(summary);
      
      // Notify client
      ws.send(JSON.stringify({
        type: 'session_ended',
        sessionId,
        summary
      }));
    }
  }

  async handleUpdateGameMode(ws, message) {
    const { sessionId, gameMode, playerColor, aiEloRating, aiTimeLimit } = message;
    
    console.log(`Updating game mode for session ${sessionId}:`, {
      gameMode, playerColor, aiEloRating, aiTimeLimit
    });
    
    // Get or create game state
    let gameState = gameStateManager.getGameState(sessionId);
    if (!gameState) {
      gameState = {
        gameId: sessionId,
        active: true,
        startTime: new Date().toISOString(),
        mode: 'play',
        moves: [],
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'white'
      };
    }
    
    // Update game mode information
    gameState.gameMode = gameMode;
    gameState.playerColor = playerColor;
    gameState.aiEloRating = aiEloRating;
    gameState.aiTimeLimit = aiTimeLimit;
    gameState.lastUpdated = new Date().toISOString();
    
    gameStateManager.saveGameState(sessionId, gameState);
    
    // Send confirmation back to client
    ws.send(JSON.stringify({
      type: 'game_mode_updated',
      sessionId,
      gameMode,
      playerColor,
      aiEloRating,
      aiTimeLimit
    }));
  }

  async handleSyncMove(ws, message) {
    const { sessionId, move, fen, turn } = message;
    
    console.log(`🎯 SYNC_MOVE received for session ${sessionId}:`, {
      move: move.san,
      uci: move.uci,
      fen,
      turn
    });
    
    // Get or create game state
    let gameState = gameStateManager.getGameState(sessionId);
    if (!gameState) {
      gameState = {
        gameId: sessionId,
        active: true,
        startTime: new Date().toISOString(),
        mode: 'play',
        moves: [],
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        turn: 'white',
        // Initialize with default game mode information
        gameMode: 'human_vs_human',
        playerColor: 'white',
        aiEloRating: 1500,
        aiTimeLimit: 500
      };
    }
    
    // Add the move to the game state
    const moveRecord = {
      san: move.san,
      uci: move.uci,
      ply: gameState.moves.length + 1,
      timestamp: new Date().toISOString()
    };
    
    gameState.moves.push(moveRecord);
    gameState.fen = fen;
    gameState.turn = turn;
    gameState.lastUpdated = new Date().toISOString();
    
    gameStateManager.saveGameState(sessionId, gameState);
    
    console.log(`✅ Move synced to server: ${move.san} (${move.uci}), total moves: ${gameState.moves.length}`);
    
    // Send confirmation back to client
    ws.send(JSON.stringify({
      type: 'move_synced',
      sessionId,
      move: moveRecord,
      fen,
      turn
    }));
  }

  async handleResetGame(ws, message) {
    const { sessionId } = message;
    
    console.log(`🔄 Resetting game for session ${sessionId}`);
    
    // Reset game state to starting position
    const gameState = {
      gameId: sessionId,
      active: true,
      startTime: new Date().toISOString(),
      mode: 'play',
      moves: [],
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      lastUpdated: new Date().toISOString(),
      // Keep default game mode information (will be updated by subsequent update_game_mode)
      gameMode: 'human_vs_human',
      playerColor: 'white',
      aiEloRating: 1500,
      aiTimeLimit: 500
    };
    
    // Save reset game state
    gameStateManager.saveGameState(sessionId, gameState);
    
    console.log(`✅ Game reset for session ${sessionId}. State reset to starting position.`);
    
    // Send confirmation back to client
    ws.send(JSON.stringify({
      type: 'game_reset',
      sessionId,
      fen: gameState.fen,
      turn: gameState.turn
    }));
  }

  async handleInboundMCP(message) {
    const { type, sessionId } = message;
    const client = this.clients.get(sessionId);
    
    if (!client) {
      console.warn(`No client found for session ${sessionId}`);
      return;
    }

    switch (type) {
      case 'adaptive_card':
        client.send(JSON.stringify({
          type: 'adaptive_card',
          sessionId,
          card: message.card
        }));
        break;

      case 'action':
        if (message.action === 'highlightSquares') {
          client.send(JSON.stringify({
            type: 'highlight_squares',
            sessionId,
            squares: message.parameters.squares,
            color: message.parameters.color || 'yellow'
          }));
        }
        break;

      default:
        console.warn(`Unknown inbound MCP type: ${type}`);
    }
  }

  start(port = 3456) {
    this.server.listen(port, () => {
      console.log(`Chess Trainer MCP Server running on port ${port}`);
      console.log(`GUI available at http://localhost:${port}`);
      console.log(`WebSocket at ws://localhost:${port}/ws`);
    });
  }

  shutdown() {
    console.log('Shutting down Chess Trainer MCP Server...');
    
    // Close all WebSocket connections
    this.wss.clients.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        ws.close(1000, 'Server shutting down');
      }
    });
    
    // Close WebSocket server
    this.wss.close((err) => {
      if (err) {
        console.error('Error closing WebSocket server:', err);
      } else {
        console.log('WebSocket server closed');
      }
    });
    
    // Clear client mappings
    this.clients.clear();
    this.gameStates.clear();
    
    // Clean up game state manager
    gameStateManager.cleanup();
    
    // Close HTTP server
    this.server.close((err) => {
      if (err) {
        console.error('Error closing HTTP server:', err);
      } else {
        console.log('HTTP server closed');
      }
    });
  }
}

// Check if running as MCP server (stdio mode) 
if (process.argv.includes('--mcp') || process.env.MCP_STDIO_MODE === 'true') {
  // Import and start MCP server
  import('../bin/mcp-server.js');
} else if (import.meta.url === `file://${process.argv[1]}`) {
  // Start regular HTTP server
  const port = process.env.PORT || 3456;
  const server = new ChessTrainerServer();
  server.start(port);
}

export { ChessTrainerServer }; 