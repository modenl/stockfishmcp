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
import { GamePersistence } from './gamePersistence.js';
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
    this.clients = new Set(); // Set of client objects
    this.clientInfo = new Map(); // clientId -> client info
    
    // Initialize game persistence
    this.gamePersistence = new GamePersistence(this);
    
    // Increase max listeners to prevent warning
    this.server.setMaxListeners(20);
    
    // Load persisted game state
    this.loadPersistedGame();
  }

  async initialize() {
    await this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  loadPersistedGame() {
    try {
      const gameState = gameStateManager.getGameState();
      if (gameState) {
        console.log(`Loaded persisted game with ${gameState.moves.length} moves`);
      } else {
        console.log('No persisted game found, starting fresh');
      }
    } catch (error) {
      console.error('Failed to load persisted game:', error);
    }
  }

  async setupMiddleware() {
    // Add headers to enable SharedArrayBuffer for Stockfish WASM
    this.app.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    });

    // Apply helmet
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
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false
    }));
    
    this.app.use(cors({
      origin: true, // Allow all origins
      credentials: true
    }));
    this.app.use(express.json());
    
    // Configure static file serving with proper CORP headers
    // In development, proxy to Vite dev server instead of serving static files
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      // In development mode, proxy requests to Vite dev server
      const { createProxyMiddleware } = await import('http-proxy-middleware');
      
      // Proxy all non-API requests to Vite dev server
      this.app.use('/', createProxyMiddleware({
        target: 'http://localhost:5173',
        changeOrigin: true,
        ws: false, // Don't proxy websockets (we handle those)
        pathFilter: (pathname, req) => {
          // Don't proxy API routes, WebSocket routes, or our specific endpoints
          return !pathname.startsWith('/api') && 
                 !pathname.startsWith('/ws') && 
                 !pathname.startsWith('/socket.io');
        },
        onProxyReq: (proxyReq, req, res) => {
          // Add required headers for SharedArrayBuffer support
          proxyReq.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          proxyReq.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        },
        onProxyRes: (proxyRes, req, res) => {
          // Ensure CORP headers are set on proxied responses
          proxyRes.headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
          proxyRes.headers['Cross-Origin-Opener-Policy'] = 'same-origin';
          proxyRes.headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
        }
      }));
    } else {
      // In production mode, serve built static files
      this.app.use(express.static(path.join(__dirname, '../client/dist'), {
        setHeaders: (res, filepath, stat) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          
          // Special handling for stockfish/WASM files
          if (filepath.includes('/nnue/') || filepath.endsWith('.wasm')) {
            res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          }
          
          
          // Special handling for WASM files
          if (filepath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
          }
          // Special handling for JS files
          if (filepath.endsWith('.js')) {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          }
        }
      }));
    }
  }

  setupRoutes() {
    // API Routes
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Persistence stats endpoint
    this.app.get('/api/persistence-stats', (req, res) => {
      const stats = this.gamePersistence.getStats();
      res.json({
        ...stats,
        persistenceEnabled: true,
        autoSaveInterval: '30 seconds',
        cleanupInterval: '1 hour'
      });
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
    this.app.post('/api/mcp/get_current_game', (req, res) => {
      try {
        const gameState = gameStateManager.getGameState();
        
        if (!gameState || !gameState.active) {
          return res.json({
            message: `📋 No Active Chess Game\n\n` +
                    `🎯 No chess game is currently running.\n` +
                    `💡 Start a new game by opening the web interface.`
          });
        }

        const moveCount = gameState.moves ? gameState.moves.length : 0;
        const lastMove = gameState.moves && gameState.moves.length > 0 ? gameState.moves[gameState.moves.length - 1] : null;
        
        res.json({
          message: `🎮 Current Chess Game\n` +
                  `   📅 Started: ${new Date(gameState.startTime).toLocaleString()}\n` +
                  `   🎯 Mode: ${gameState.mode || 'play'}\n` +
                  `   ♟️  Moves: ${moveCount}\n` +
                  `   🎲 Current turn: ${gameState.turn || 'white'}\n` +
                  `   ${lastMove ? `🏃 Last move: ${lastMove.san || lastMove.move}` : '🆕 No moves yet'}\n` +
                  `   📍 Position: ${gameState.fen ? gameState.fen.substring(0, 20) + '...' : 'starting position'}\n\n` +
                  `💡 Use get_game_state for detailed information\n` +
                  `💡 Use make_move <move> to make a move`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/get_game_state', (req, res) => {
      try {
        console.log('\n=== 📊 GET_GAME_STATE REQUEST ===');
        console.log('⏰ Timestamp:', new Date().toISOString());
        
        const gameState = gameStateManager.getGameState();

        if (!gameState) {
          console.log('❌ No game state found');
          console.log('=== ❌ GET_GAME_STATE FAILED ===\n');
          return res.json({
            message: `❌ No Game Found\n\n` +
                    `🎯 No chess game exists.\n` +
                    `💡 Start a new game to begin playing.`
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
          message: `🎮 Current Game State\n\n` +
                  `📅 Started: ${new Date(gameState.startTime).toLocaleString()}\n` +
                  `🎯 Mode: ${gameState.mode || 'play'}\n` +
                  `🎲 Current turn: ${gameState.turn || 'white'}\n` +
                  `♟️  Move count: ${gameState.moves ? gameState.moves.length : 0}\n` +
                  `📍 Current FEN: ${gameState.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}\n` +
                  `📊 Status: ${gameState.active ? '🟢 Active' : '🔴 Ended'}\n\n` +
                  `📝 Move History:\n${moveHistory}\n\n` +
                  `💡 Use make_move <move> to make a move\n` +
                  `💡 Use suggest_move for AI suggestions`
        });
      } catch (error) {
        console.error('❌ Get game state error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/make_move', async (req, res) => {
      try {
        const { move } = req.body;
        
        console.log('\n=== 📥 MAKE_MOVE REQUEST ===');
        console.log('♟️  Move:', move);
        console.log('⏰ Timestamp:', new Date().toISOString());
        
        // 获取游戏状态
        let gameState = gameStateManager.getGameState();
        if (!gameState) {
          console.log('🆕 Creating new game state');
          // 创建新游戏状态
          gameState = gameStateManager.resetGame();
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
        gameStateManager.saveGameState(gameState);

        console.log('💾 Updated game state saved:');
        console.log('   ♟️  Total moves:', gameState.moves.length);
        console.log('   📝 Full move history:', gameState.moves.map(m => m.san || m.move).join(' '));
        console.log('   📍 Current FEN:', gameState.fen);
        console.log('   🎲 Current turn:', gameState.turn);

        // 通过WebSocket广播更新到所有客户端
        console.log('📡 Broadcasting move to all clients via WebSocket:', {
          type: 'mcp_move',
          ...moveData
        });
        
        this.broadcastToAll({
          type: 'mcp_move',
          ...moveData
        });

        console.log('=== ✅ MAKE_MOVE COMPLETED ===\n');

        res.json({
          message: `✅ Move Made Successfully!\n\n` +
                  `♟️  Move: ${san} (${move})\n` +
                  `🎲 Next turn: ${turn}\n` +
                  `📍 New position: ${newFen}\n\n` +
                  `💡 Move has been applied and broadcasted to web interface\n` +
                  `💡 Use get_game_state to see updated state`
        });
      } catch (error) {
        console.error('❌ Make move error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/suggest_move', async (req, res) => {
      try {
        const { depth = 12 } = req.body;
        const gameState = gameStateManager.getGameState();
        
        if (!gameState) {
          return res.json({
            message: `❌ No Game Found\n\n` +
                    `🎯 No chess game exists.\n` +
                    `💡 Start a new game to begin playing.`
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
          message: `🤖 Move Suggestion\n\n` +
                  `📍 Current position: ${currentFen}\n` +
                  `🎲 Turn: ${gameState.turn || 'white'}\n` +
                  `🎯 Depth: ${depth}\n\n` +
                  `💡 Recommended move: ${suggestion.move}\n` +
                  `📊 Evaluation: ${suggestion.eval}\n` +
                  `💭 Description: ${suggestion.description}\n\n` +
                  `💡 To make this move: make_move ${suggestion.move}`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/load_pgn_replay', (req, res) => {
      try {
        const { pgn, moves, auto_play, delay_ms } = req.body;
        
        console.log('🎬 LOAD_PGN_REPLAY REQUEST');
        console.log('♟️  Moves:', moves.length);
        console.log('▶️  Auto-play:', auto_play);
        console.log('⏱️  Delay:', delay_ms);
        
        // First, notify clients to stop any existing replay
        const currentGameState = gameStateManager.getGameState();
        if (currentGameState && currentGameState.mode === 'replay') {
          console.log('🛑 Stopping existing replay before starting new one');
          this.broadcastToAll({
            type: 'stop_replay',
            message: 'Stopping current replay to load new one'
          });
        }
        
        // Reset game state
        const gameState = {
          active: true,
          startTime: new Date().toISOString(),
          mode: 'replay',
          moves: [],
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'white',
          lastUpdated: new Date().toISOString(),
          replayData: {
            pgn,
            moves,
            autoPlay: auto_play,
            delayMs: delay_ms,
            currentMoveIndex: -1
          }
        };
        
        gameStateManager.saveGameState(gameState);
        
        // Broadcast to all clients to start replay
        this.broadcastToAll({
          type: 'pgn_replay_loaded',
          moves,
          autoPlay: auto_play,
          delayMs: delay_ms,
          gameId: '*' // Broadcast to all sessions
        });
        
        res.json({
          message: `✅ PGN loaded successfully! ${moves.length} moves ready for replay.`
        });
      } catch (error) {
        console.error('❌ Load PGN replay error:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/mcp/reset_game', (req, res) => {
      try {
        const { gameSettings } = req.body;
        
        console.log('\n=== 🔄 RESET_GAME REQUEST ===');
        console.log('⚙️ Game Settings:', gameSettings);
        console.log('⏰ Timestamp:', new Date().toISOString());
        
        // 记录重置前的状态
        const oldGameState = gameStateManager.getGameState();
        if (oldGameState) {
          console.log('📊 Game state before reset:');
          console.log('   📍 FEN:', oldGameState.fen);
          console.log('   🎲 Turn:', oldGameState.turn);
          console.log('   ♟️  Move count:', oldGameState.moves ? oldGameState.moves.length : 0);
          console.log('   🎯 Game mode:', oldGameState.gameMode);
          if (oldGameState.moves && oldGameState.moves.length > 0) {
            console.log('   📝 Move history:', oldGameState.moves.map(m => m.san || m.move).join(' '));
          }
        } else {
          console.log('📊 No existing game state found, creating new game');
        }
        
        // 重置游戏状态，保留客户端传来的设置
        const gameState = {
          active: true,
          startTime: new Date().toISOString(),
          mode: 'play',
          moves: [],
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          turn: 'white',
          lastUpdated: new Date().toISOString(),
          // Use client-provided settings or fallback to defaults
          gameMode: gameSettings?.mode || 'human_vs_human',
          playerColor: gameSettings?.playerColor || 'white',
          aiEloRating: gameSettings?.aiEloRating || 1500,
          aiTimeLimit: gameSettings?.aiTimeLimit || 500
        };

        gameStateManager.saveGameState(gameState);

        console.log('💾 New game state after reset:');
        console.log('   📍 FEN:', gameState.fen);
        console.log('   🎲 Turn:', gameState.turn);
        console.log('   ♟️  Move count:', gameState.moves.length);
        console.log('   🎯 Game mode:', gameState.gameMode);
        console.log('   🎨 Player color:', gameState.playerColor);
        console.log('   🤖 AI ELO:', gameState.aiEloRating);

        // 广播重置到所有客户端
        const resetMessage = {
          type: 'mcp_game_reset',
          fen: gameState.fen,
          turn: gameState.turn,
          gameSettings: {
            mode: gameState.gameMode,
            playerColor: gameState.playerColor,
            aiEloRating: gameState.aiEloRating,
            aiTimeLimit: gameState.aiTimeLimit
          }
        };

        console.log('📡 Broadcasting reset to all clients:', resetMessage);

        this.broadcastToAll(resetMessage);

        console.log('=== ✅ RESET_GAME COMPLETED ===\n');

        res.json({
          message: `✅ Game Reset Successfully!\n\n` +
                  `📍 Position reset to starting position\n` +
                  `🎲 Turn: White to move\n` +
                  `⏳ Reset has been applied and broadcasted to web interface\n\n` +
                  `💡 Check game state with: get_game_state\n` +
                  `💡 Make the first move with: make_move e2e4`
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
        // Clean up client mappings
        let removedClient = null;
        
        // Find and remove the client
        for (const client of this.clients) {
          if (client.ws === ws) {
            removedClient = client;
            this.clients.delete(client);
            
            // Remove from client info
            this.clientInfo.delete(client.clientId);
            
            // Broadcast client left to remaining clients
            this.broadcastToAll({
              type: 'client_left',
              clientId: client.clientId,
              clientName: client.clientName
            });
            
            break;
          }
        }
        
        console.log('WebSocket connection closed');
      });
    });
  }

  async handleWebSocketMessage(ws, message) {
    console.log('📨 SERVER: Received WebSocket message:', message);
    const { type, clientId, clientName } = message;

    console.log(`📨 SERVER: Processing message type: ${type}`);
    
    switch (type) {
      case 'join_session':
        // Create client object
        const client = {
          ws: ws,
          clientId: clientId,
          clientName: clientName,
          joinedAt: new Date().toISOString()
        };
        
        // Add to clients set
        this.clients.add(client);
        
        // Store client info
        this.clientInfo.set(clientId, client);
        
        console.log(`👋 Client joined: ${clientName} (${clientId})`);
        
        // Broadcast to other clients
        this.broadcastToAll({
          type: 'client_joined',
          clientId: clientId,
          clientName: clientName
        }, ws);
        
        // Get existing game state
        let gameState = gameStateManager.getGameState();
        
        // Only create new game state if none exists
        if (!gameState) {
          console.log(`Creating new game state`);
          gameState = gameStateManager.resetGame();
        } else {
          console.log(`Found existing game state, moves: ${gameState.moves?.length || 0}`);
        }
        
        console.log('📤 Sending session_state with gameState:', {
          gameMode: gameState.gameMode,
          playerColor: gameState.playerColor,
          aiEloRating: gameState.aiEloRating,
          moves: gameState.moves?.length || 0
        });
        
        // Get current clients
        const connectedClients = this.getAllClients();
        
        ws.send(JSON.stringify({
          type: 'session_state',
          gameState: gameState
        }));
        
        // Send clients list to the joining client
        ws.send(JSON.stringify({
          type: 'clients_list',
          clients: connectedClients
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
    const { move, fenBefore, fenAfter, evalCp, depth, timeMs } = message;
    
    // 同步到游戏状态管理器
    let gameState = gameStateManager.getGameState();
    if (!gameState) {
      gameState = gameStateManager.resetGame();
    }

    gameState.moves.push({
      san: move.san,
      uci: move.uci,
      ply: gameState.moves.length + 1,
      timestamp: new Date().toISOString(),
      evalCp,
      depth,
      timeMs
    });
    gameState.fen = fenAfter;
    gameState.turn = fenAfter.includes(' w ') ? 'white' : 'black';
    gameState.lastUpdated = new Date().toISOString();

    gameStateManager.saveGameState(gameState);

    // Broadcast move to all clients
    const updateMessage = {
      type: 'move_update',
      move: {
        san: move.san,
        uci: move.uci,
        ply: gameState.moves.length
      },
      fen: fenAfter
    };
    
    this.broadcastToAll(updateMessage);

    // Send MCP action for significant moves (every 3rd move or eval change > 50cp)
    if (gameState.moves.length % 3 === 0 || Math.abs(evalCp) > 50) {
      await this.mcpClient.sendEvaluateMove({
        ply: gameState.moves.length,
        move: move.uci,
        fenBefore,
        fenAfter,
        evalCp,
        depth,
        timeMs
      });
    }
  }

  async handleAnalysisRequest(ws, message) {
    const { fen, depth = 15 } = message;
    
    // In a real implementation, this might trigger deeper analysis
    // For now, just acknowledge the request
    ws.send(JSON.stringify({
      type: 'analysis_started',
      fen,
      depth
    }));
  }

  async handleEndSession(ws, message) {
    console.log('🏁 SERVER: handleEndSession called with message:', message);
    const { result } = message;
    
    console.log('🏁 SERVER: Ending game with result:', result);
    
    // Update game state to reflect the end
    let gameState = gameStateManager.getGameState();
    console.log('🏁 SERVER: Current game state:', gameState);
    
    if (gameState) {
      gameState.status = result.reason === 'resignation' ? 'resigned' : 'ended';
      gameState.winner = result.winner;
      gameState.endReason = result.reason;
      gameState.lastUpdated = new Date().toISOString();
      gameStateManager.saveGameState(gameState);
      console.log('🏁 SERVER: Updated game state:', gameState);
      
      // Send game summary via MCP
      console.log('🏁 SERVER: Sending game summary via MCP...');
      const summary = {
        moves: gameState.moves,
        result: result,
        duration: Date.now() - new Date(gameState.startTime).getTime()
      };
      await this.mcpClient.sendGameSummary(summary);
    }
    
    // Broadcast session ended to all clients
    const broadcastMessage = {
      type: 'session_ended',
      result
    };
    console.log('🏁 SERVER: Broadcasting to all clients:', broadcastMessage);
    this.broadcastToAll(broadcastMessage);
    console.log('🏁 SERVER: Broadcast complete');
  }

  async handleUpdateGameMode(ws, message) {
    const { gameMode, playerColor, aiEloRating, aiTimeLimit } = message;
    
    console.log(`Updating game mode:`, {
      gameMode, playerColor, aiEloRating, aiTimeLimit
    });
    
    // Get or create game state
    let gameState = gameStateManager.getGameState();
    if (!gameState) {
      gameState = gameStateManager.resetGame();
    }
    
    // Update game mode information
    gameState.gameMode = gameMode;
    gameState.playerColor = playerColor;
    gameState.aiEloRating = aiEloRating;
    gameState.aiTimeLimit = aiTimeLimit;
    gameState.lastUpdated = new Date().toISOString();
    
    gameStateManager.saveGameState(gameState);
    
    // Send confirmation back to client
    ws.send(JSON.stringify({
      type: 'game_mode_updated',
      gameMode,
      playerColor,
      aiEloRating,
      aiTimeLimit
    }));
  }

  async handleSyncMove(ws, message) {
    const { move, fen, turn } = message;
    
    console.log(`🎯 SYNC_MOVE received:`, {
      move: move.san,
      uci: move.uci,
      fen,
      turn
    });
    
    // Get or create game state
    let gameState = gameStateManager.getGameState();
    if (!gameState) {
      gameState = gameStateManager.resetGame();
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
    
    gameStateManager.saveGameState(gameState);
    
    console.log(`✅ Move synced to server: ${move.san} (${move.uci}), total moves: ${gameState.moves.length}`);
    
    // Broadcast the move to ALL clients
    console.log(`📡 Broadcasting move to all clients`);
    this.broadcastToAll({
      type: 'mcp_move',
      move: move.san,
      uci: move.uci,
      fen,
      turn,
      moveRecord
    }); // All clients should receive the same message for consistency
  }

  async handleResetGame(ws, message) {
    const { gameSettings } = message;
    
    console.log('🔄 SERVER: Resetting game with settings:', gameSettings);
    
    // Reset game state with provided settings
    const gameState = {
      active: true,
      startTime: new Date().toISOString(),
      mode: 'play',
      moves: [],
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      lastUpdated: new Date().toISOString(),
      // Use client-provided settings or fallback to defaults
      gameMode: gameSettings?.mode || 'human_vs_human',
      playerColor: gameSettings?.playerColor || 'white',
      aiEloRating: gameSettings?.aiEloRating || 1500,
      aiTimeLimit: gameSettings?.aiTimeLimit || 500
    };

    gameStateManager.saveGameState(gameState);
    
    console.log('✅ SERVER: Game reset with new settings');
    
    // Broadcast reset to all clients (including the sender)
    const resetMessage = {
      type: 'mcp_game_reset',
      fen: gameState.fen,
      turn: gameState.turn,
      gameSettings: {
        mode: gameState.gameMode,
        playerColor: gameState.playerColor,
        aiEloRating: gameState.aiEloRating,
        aiTimeLimit: gameState.aiTimeLimit
      }
    };
    
    this.broadcastToAll(resetMessage);
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
      
      // Start game persistence (auto-save and cleanup)
      this.gamePersistence.start();
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
    
    // Stop game persistence (saves all games)
    this.gamePersistence.stop();
    
    // Clear client mappings
    this.clients.clear();
    
    // Close HTTP server
    this.server.close((err) => {
      if (err) {
        console.error('Error closing HTTP server:', err);
      } else {
        console.log('HTTP server closed');
      }
    });
  }

  // Helper method to broadcast message to all clients
  broadcastToAll(message, excludeWs = null) {
    console.log(`🔍 DEBUG: Attempting to broadcast to all clients`);
    
    if (this.clients.size === 0) {
      console.log(`❌ No clients connected`);
      return;
    }
    
    console.log(`📊 Found ${this.clients.size} total clients`);
    
    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;
    let excludedCount = 0;
    
    for (const client of this.clients) {
      console.log(`🔍 Checking client: ${client.clientName} (${client.clientId})`);
      
      // Skip the excluded WebSocket connection (usually the sender)
      if (excludeWs && client.ws === excludeWs) {
        console.log(`⏭️  Skipping sender: ${client.clientName}`);
        excludedCount++;
        continue;
      }
      
      try {
        console.log(`📤 Sending message to: ${client.clientName} (${client.clientId})`);
        client.ws.send(messageStr);
        broadcastCount++;
        console.log(`✅ Successfully sent to: ${client.clientName}`);
      } catch (error) {
        console.error(`❌ Error broadcasting to client ${client.clientName}:`, error);
      }
    }
    
    console.log(`📡 Broadcast summary: sent to ${broadcastCount} clients, excluded ${excludedCount} clients`);
  }

  // Helper method to get all connected clients
  getAllClients() {
    return Array.from(this.clients).map(client => ({
      clientId: client.clientId,
      clientName: client.clientName,
      joinedAt: client.joinedAt
    }));
  }
}

// Check if running as MCP server (stdio mode) 
if (process.argv.includes('--mcp') || process.env.MCP_STDIO_MODE === 'true') {
  // Import and start MCP server
  import('../bin/mcp-server.js');
} else if (import.meta.url === `file://${process.argv[1]}`) {
  // Start regular HTTP server
  (async () => {
    const port = process.env.PORT || 3456;
    const server = new ChessTrainerServer();
    await server.initialize();
    server.start(port);
  })();
}

export { ChessTrainerServer }; 