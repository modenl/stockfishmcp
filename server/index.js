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
    this.clients = new Map(); // sessionId -> Set of client objects
    this.clientInfo = new Map(); // clientId -> client info
    this.gameStates = new Map(); // gameId -> game state
    
    // Initialize game persistence
    this.gamePersistence = new GamePersistence(this);
    
    // Increase max listeners to prevent warning
    this.server.setMaxListeners(20);
    
    // Load persisted game states
    this.loadPersistedGames();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  loadPersistedGames() {
    try {
      const activeGames = gameStateManager.getAllActiveGames();
      console.log(`Loading ${activeGames.length} persisted games...`);
      
      activeGames.forEach(game => {
        const { gameId, ...gameState } = game;
        this.gameStates.set(gameId, gameState);
        console.log(`Loaded game: ${gameId} (${gameState.moves.length} moves)`);
      });
    } catch (error) {
      console.error('Failed to load persisted games:', error);
    }
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
                    `🎯 Game ID "${game_id}" does not exist or is no longer active.\n` +
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

        // 通过WebSocket广播更新到所有客户端
        console.log('📡 Broadcasting move to all clients via WebSocket:', {
          type: 'mcp_move',
          sessionId: game_id,
          ...moveData
        });
        
        this.broadcastToSession(game_id, {
          type: 'mcp_move',
          sessionId: game_id,
          ...moveData
        });

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
        const { game_id, gameSettings } = req.body;
        
        console.log('\n=== 🔄 RESET_GAME REQUEST ===');
        console.log('🎮 Game ID:', game_id);
        console.log('⚙️ Game Settings:', gameSettings);
        console.log('⏰ Timestamp:', new Date().toISOString());
        
        // 记录重置前的状态
        const oldGameState = gameStateManager.getGameState(game_id);
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
          gameId: game_id,
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

        gameStateManager.saveGameState(game_id, gameState);

        console.log('💾 New game state after reset:');
        console.log('   📍 FEN:', gameState.fen);
        console.log('   🎲 Turn:', gameState.turn);
        console.log('   ♟️  Move count:', gameState.moves.length);
        console.log('   🎯 Game mode:', gameState.gameMode);
        console.log('   🎨 Player color:', gameState.playerColor);
        console.log('   🤖 AI ELO:', gameState.aiEloRating);

        // 广播重置到会话中的所有客户端
        const resetMessage = {
          type: 'mcp_game_reset',
          gameId: game_id,
          fen: gameState.fen,
          turn: gameState.turn,
          gameSettings: {
            mode: gameState.gameMode,
            playerColor: gameState.playerColor,
            aiEloRating: gameState.aiEloRating,
            aiTimeLimit: gameState.aiTimeLimit
          }
        };

        console.log('📡 Broadcasting reset to all clients in session:', resetMessage);

        this.broadcastToSession(game_id, resetMessage);

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

    // Embed route for iframe integration
    this.app.get('/embed', (req, res) => {
      const { 
        game_id, 
        mode = 'minimal', 
        width = 600, 
        height = 600,
        allow_moves = 'true',
        show_controls = 'false'
      } = req.query;

      // Generate the embedded HTML page
      const embedHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chess Trainer - Embedded</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #chess-container {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: #f5f5f5;
    }
    #board-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
    }
    #chessboard {
      width: 100%;
      height: 100%;
      max-width: ${parseInt(width)}px;
      max-height: ${parseInt(height)}px;
    }
    .controls {
      background: #fff;
      border-top: 1px solid #ddd;
      padding: 8px;
      display: ${show_controls === 'true' ? 'flex' : 'none'};
      gap: 8px;
      justify-content: center;
    }
    .control-btn {
      padding: 6px 12px;
      border: 1px solid #ddd;
      background: #fff;
      cursor: pointer;
      border-radius: 4px;
      font-size: 14px;
    }
    .control-btn:hover {
      background: #f0f0f0;
    }
    .status-bar {
      background: #333;
      color: #fff;
      padding: 4px 8px;
      font-size: 14px;
      text-align: center;
      display: ${mode === 'minimal' ? 'none' : 'block'};
    }
    .error-message {
      color: #d32f2f;
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div id="chess-container">
    <div class="status-bar" id="status">
      <span id="turn-indicator">Loading...</span>
    </div>
    <div id="board-wrapper">
      <div id="chessboard"></div>
    </div>
    <div class="controls" id="controls">
      <button class="control-btn" onclick="resetGame()">New Game</button>
      <button class="control-btn" onclick="flipBoard()">Flip Board</button>
      <button class="control-btn" onclick="getHint()">Get Hint</button>
    </div>
  </div>

  <script type="module">
    // Import necessary chess libraries
    import { Chessground } from '/chessground/chessground.js';
    import { Chess } from '/chess.js/chess.js';
    
    // Configuration from query params
    const config = {
      gameId: '${game_id}',
      mode: '${mode}',
      allowMoves: ${allow_moves === 'true'},
      showControls: ${show_controls === 'true'}
    };

    let board = null;
    let chess = new Chess();
    let ws = null;
    let orientation = 'white';

    // Initialize WebSocket connection
    function initWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${protocol}//\${window.location.host}/ws\`);

      ws.onopen = () => {
        console.log('WebSocket connected');
        // Join the game session
        ws.send(JSON.stringify({
          type: 'join_session',
          sessionId: config.gameId,
          clientId: 'embed_' + Math.random().toString(36).substr(2, 9),
          clientName: 'Embedded Viewer'
        }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('Connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateStatus('Disconnected - Reconnecting...');
        // Try to reconnect after 2 seconds
        setTimeout(initWebSocket, 2000);
      };
    }

    // Handle WebSocket messages
    function handleWebSocketMessage(message) {
      switch (message.type) {
        case 'session_state':
          // Initialize board with current game state
          if (message.gameState) {
            loadGameState(message.gameState);
          }
          break;

        case 'move':
        case 'mcp_move':
          // Update board with new move
          if (message.move) {
            makeMove(message.move, message.san);
          }
          break;

        case 'game_reset':
        case 'mcp_game_reset':
          // Reset the board
          resetBoard();
          break;

        case 'game_state_update':
          // Update game state
          if (message.gameState) {
            loadGameState(message.gameState);
          }
          break;
      }
    }

    // Initialize the chess board
    function initBoard() {
      const boardEl = document.getElementById('chessboard');
      
      const boardConfig = {
        orientation: orientation,
        movable: {
          free: false,
          color: config.allowMoves ? 'both' : undefined,
          events: {
            after: config.allowMoves ? afterMove : undefined
          }
        },
        draggable: {
          enabled: config.allowMoves
        },
        premovable: {
          enabled: false
        }
      };

      board = Chessground(boardEl, boardConfig);
      updateBoard();
    }

    // After move handler
    function afterMove(orig, dest) {
      const move = orig + dest;
      
      // Validate move with chess.js
      const chessMove = chess.move({
        from: orig,
        to: dest,
        promotion: 'q' // Always promote to queen for simplicity
      });

      if (chessMove) {
        // Send move to server
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'move',
            sessionId: config.gameId,
            move: move,
            san: chessMove.san,
            fen: chess.fen()
          }));
        }

        // Notify parent window
        window.parent.postMessage({
          type: 'chess_move',
          gameId: config.gameId,
          move: move,
          san: chessMove.san,
          fen: chess.fen()
        }, '*');
      } else {
        // Invalid move, reset board
        updateBoard();
      }
    }

    // Update board display
    function updateBoard() {
      if (!board) return;

      board.set({
        fen: chess.fen(),
        turnColor: chess.turn() === 'w' ? 'white' : 'black',
        movable: {
          color: config.allowMoves ? (chess.turn() === 'w' ? 'white' : 'black') : undefined,
          dests: config.allowMoves ? getLegalMoves() : new Map()
        },
        check: chess.inCheck()
      });

      updateStatus(\`\${chess.turn() === 'w' ? 'White' : 'Black'} to move\`);

      // Check game over conditions
      if (chess.isGameOver()) {
        let status = 'Game Over - ';
        if (chess.isCheckmate()) {
          status += \`Checkmate! \${chess.turn() === 'w' ? 'Black' : 'White'} wins.\`;
        } else if (chess.isDraw()) {
          status += 'Draw!';
        } else if (chess.isStalemate()) {
          status += 'Stalemate!';
        }
        updateStatus(status);
      }
    }

    // Get legal moves for the current position
    function getLegalMoves() {
      const dests = new Map();
      const moves = chess.moves({ verbose: true });

      moves.forEach(move => {
        if (!dests.has(move.from)) {
          dests.set(move.from, []);
        }
        dests.get(move.from).push(move.to);
      });

      return dests;
    }

    // Load game state
    function loadGameState(gameState) {
      if (gameState.fen) {
        chess.load(gameState.fen);
      } else {
        chess.reset();
      }

      // Replay moves if provided
      if (gameState.moves && gameState.moves.length > 0) {
        chess.reset();
        gameState.moves.forEach(move => {
          chess.move(move.san || move.move);
        });
      }

      updateBoard();
    }

    // Make a move
    function makeMove(move, san) {
      const chessMove = chess.move(san || move);
      if (chessMove) {
        updateBoard();
      }
    }

    // Reset board
    function resetBoard() {
      chess.reset();
      updateBoard();
    }

    // Update status display
    function updateStatus(text) {
      const statusEl = document.getElementById('turn-indicator');
      if (statusEl) {
        statusEl.textContent = text;
      }
    }

    // Control functions
    window.resetGame = function() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'reset_game',
          sessionId: config.gameId
        }));
      }
      resetBoard();
    };

    window.flipBoard = function() {
      orientation = orientation === 'white' ? 'black' : 'white';
      if (board) {
        board.set({ orientation });
      }
    };

    window.getHint = function() {
      // Request hint from parent
      window.parent.postMessage({
        type: 'request_hint',
        gameId: config.gameId,
        fen: chess.fen()
      }, '*');
    };

    // Listen for messages from parent window
    window.addEventListener('message', (event) => {
      if (event.data.type === 'chess_command') {
        switch (event.data.command) {
          case 'reset':
            resetBoard();
            break;
          case 'flip':
            flipBoard();
            break;
          case 'move':
            if (event.data.move) {
              makeMove(event.data.move, event.data.san);
            }
            break;
          case 'load_fen':
            if (event.data.fen) {
              chess.load(event.data.fen);
              updateBoard();
            }
            break;
        }
      }
    });

    // Initialize everything
    initBoard();
    initWebSocket();
  </script>
</body>
</html>
      `;

      res.setHeader('Content-Type', 'text/html');
      res.send(embedHtml);
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
        
        // Find and remove the client from all sessions
        for (const [sessionId, clientSet] of this.clients.entries()) {
          for (const client of clientSet) {
            if (client.ws === ws) {
              removedClient = client;
              clientSet.delete(client);
              
              // Remove empty session sets
              if (clientSet.size === 0) {
                this.clients.delete(sessionId);
              }
              
              // Remove from client info
              this.clientInfo.delete(client.clientId);
              
              // Broadcast client left to remaining clients in session
              this.broadcastToSession(sessionId, {
                type: 'client_left',
                clientId: client.clientId,
                clientName: client.clientName,
                sessionId: sessionId
              });
              
              break;
            }
          }
          if (removedClient) break;
        }
        
        console.log('WebSocket connection closed');
      });
    });
  }

  async handleWebSocketMessage(ws, message) {
    const { type, sessionId, clientId, clientName } = message;

    switch (type) {
      case 'join_session':
        // Create client object
        const client = {
          ws: ws,
          clientId: clientId,
          clientName: clientName,
          sessionId: sessionId,
          joinedAt: new Date().toISOString()
        };
        
        // Add to session clients
        if (!this.clients.has(sessionId)) {
          this.clients.set(sessionId, new Set());
        }
        this.clients.get(sessionId).add(client);
        
        // Store client info
        this.clientInfo.set(clientId, client);
        
        console.log(`👋 Client joined: ${clientName} (${clientId}) in session ${sessionId}`);
        
        // Broadcast to other clients in session
        this.broadcastToSession(sessionId, {
          type: 'client_joined',
          clientId: clientId,
          clientName: clientName,
          sessionId: sessionId
        });
        
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
        
        // Get current clients in session
        const connectedClients = this.getSessionClients(sessionId);
        
        ws.send(JSON.stringify({
          type: 'session_state',
          session: session || null,
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
    
    // Broadcast the move to ALL clients in the session (including the sender)
    console.log(`📡 Broadcasting move to all clients in session ${sessionId}`);
    this.broadcastToSession(sessionId, {
      type: 'mcp_move',
      sessionId,
      move: move.san,
      uci: move.uci,
      fen,
      turn,
      moveRecord
    }); // All clients should receive the same message for consistency
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
    this.gameStates.clear();
    
    // Close HTTP server
    this.server.close((err) => {
      if (err) {
        console.error('Error closing HTTP server:', err);
      } else {
        console.log('HTTP server closed');
      }
    });
  }

  // Helper method to broadcast message to all clients in a session
  broadcastToSession(sessionId, message, excludeWs = null) {
    console.log(`🔍 DEBUG: Attempting to broadcast to session ${sessionId}`);
    const clientSet = this.clients.get(sessionId);
    
    if (!clientSet) {
      console.log(`❌ No client set found for session ${sessionId}`);
      return;
    }
    
    console.log(`📊 Found ${clientSet.size} total clients in session ${sessionId}`);
    
    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;
    let excludedCount = 0;
    
    for (const client of clientSet) {
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
    
    console.log(`📡 Broadcast summary for session ${sessionId}: sent to ${broadcastCount} clients, excluded ${excludedCount} clients`);
  }

  // Helper method to get connected clients list for a session
  getSessionClients(sessionId) {
    const clientSet = this.clients.get(sessionId);
    if (!clientSet) return [];
    
    return Array.from(clientSet).map(client => ({
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
  const port = process.env.PORT || 3456;
  const server = new ChessTrainerServer();
  server.start(port);
}

export { ChessTrainerServer }; 