<script>
  import { onMount, onDestroy } from 'svelte';
  import ChessBoard from './components/ChessBoard.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import GameReplay from './components/GameReplay.svelte';
  import { webSocketStore } from './stores/websocket.js';
  import { languageStore } from './stores/language.js';
  import stockfish, { engineReady, engineStatus } from './lib/stockfish.js';
  import { Chess } from 'chessops/chess';
  import { makeFen, parseFen } from 'chessops/fen';
  import { makeUci, parseUci } from 'chessops/util';
  import { makeSan, parseSan } from 'chessops/san';
  import './App.css';
  
  // New Game Modal state
  let showGameModeModal = false;
  let selectedMode = 'human_vs_human';
  let selectedPlayerColor = 'white';
  let aiEloRating = 1500;
  let aiTimeLimit = 500; // milliseconds - default to fast play
  
  $: currentLang = $languageStore;
  $: t = languageStore.translations[currentLang];

  // Game state - initialize properly
  let game;
  let gameState = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // Starting position
    moves: [],
    currentMoveIndex: -1,
    turn: 'white',
    status: 'playing',
    mode: 'human_vs_human',
    playerColor: 'white',
    aiThinking: false,
    aiEloRating: 1500,
    aiTimeLimit: 500, // Default to 0.5 seconds for fast play
    inCheck: false,
    winner: null,
  };

  // Initialize game properly
  try {
    const setup = parseFen(gameState.fen).unwrap();
    game = Chess.fromSetup(setup).unwrap();
  } catch (e) {
    console.error('Failed to initialize chess game:', e);
    game = Chess.default(); // Fallback to default starting position
  }

  // UI state
  let uiState = {
    selectedSquare: null,
    highlightedSquares: [],
  };
  
  // Force reactive update when uiState changes
  $: uiState && (uiState = uiState);

  // Engine evaluation
  let evaluation = {
    cp: 0,
    mate: null,
    bestMove: null,
  };
  
  // Analysis state
  let analysisResult = null;
  let isAnalyzing = false;
  
  // Replay state
  let showReplayMode = false;
  let replayGameData = null;

  let unsubscribeWS;

  let sessionId = 'test_game_123'; // Default game session
  let clientId = generateClientId(); // Unique client identifier
  let clientName = generateClientName(); // Human-readable client name
  let connectedClients = []; // List of connected clients

  // Generate unique client ID
  function generateClientId() {
    return 'client_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  }

  // Generate random client name
  function generateClientName() {
    const adjectives = ['Swift', 'Clever', 'Bold', 'Wise', 'Quick', 'Sharp', 'Bright', 'Noble', 'Brave', 'Smart'];
    const nouns = ['Knight', 'Bishop', 'Rook', 'Queen', 'King', 'Pawn', 'Player', 'Master', 'Champion', 'Warrior'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}${noun}`;
  }

  onMount(() => {
    // stockfish service initializes itself automatically.
    unsubscribeWS = webSocketStore.subscribe(({ lastMessage }) => {
      if (lastMessage) handleWebSocketMessage(lastMessage);
    });
    
    // Connect to WebSocket server
    const wsUrl = `ws://${window.location.hostname}:3456`;
    console.log('🔌 Connecting to WebSocket:', wsUrl, 'as', clientName, `(${clientId})`);
    webSocketStore.connect(wsUrl);
    
    // Join the session once connected
    setTimeout(() => {
      console.log('🔗 Joining WebSocket session:', sessionId, 'as', clientName);
      webSocketStore.sendMessage({
        type: 'join_session',
        sessionId: sessionId,
        clientId: clientId,
        clientName: clientName
      });
      
      // Load current game state from server
      loadGameStateFromServer();
    }, 1000); // Wait 1 second for connection to establish
    
    // Optionally you can run a self-test, but doing so can interfere with live searches.
    // If you really need to test the engine start-up, run it once after the initial page load—
    // but never while a game is in progress. For now, we disable it to avoid overlapping
    // search requests that cancel each other.
  });

  onDestroy(() => {
    if (unsubscribeWS) unsubscribeWS();
    stockfish.destroy();
  });

  function handleWebSocketMessage(message) {
    console.log(`[${clientName}] 📨 WebSocket message received:`, message);
    console.log(`[${clientName}] 🔍 Message type: "${message.type}", SessionId: "${message.sessionId}", Current SessionId: "${sessionId}"`);
    
    // Only process messages that are objects and have a type
    if (!message || typeof message !== 'object' || !message.type) {
      console.log(`[${clientName}] ❌ Invalid message format:`, message);
      return;
    }

    switch (message.type) {
      case 'mcp_move':
        console.log(`[${clientName}] 🎯 Received mcp_move for session: ${message.sessionId}`);
        // Only handle moves for the current session/game
        if (message.sessionId === sessionId) {
          console.log(`[${clientName}] ✅ SessionId matches, handling move`);
          handleServerMove(message);
        } else {
          console.log(`[${clientName}] ⏭️  SessionId mismatch, ignoring move`);
        }
        break;
      case 'mcp_game_reset':
        // Handle game reset from server
        if (message.gameId === sessionId) {
          handleServerReset(message);
        }
        break;
      case 'client_joined':
        // Handle new client joining
        console.log(`👋 Client joined: ${message.clientName} (${message.clientId})`);
        if (!connectedClients.find(c => c.clientId === message.clientId)) {
          connectedClients = [...connectedClients, {
            clientId: message.clientId,
            clientName: message.clientName,
            joinedAt: new Date().toISOString()
          }];
        }
        break;
      case 'client_left':
        // Handle client leaving
        console.log(`👋 Client left: ${message.clientName} (${message.clientId})`);
        connectedClients = connectedClients.filter(c => c.clientId !== message.clientId);
        break;
      case 'clients_list':
        // Update list of connected clients
        console.log('👥 Connected clients updated:', message.clients);
        connectedClients = message.clients || [];
        break;
      case 'error':
        // Handle error messages from server
        console.error(`[${clientName}] ❌ WebSocket error:`, message.message);
        break;
      case 'session_state':
        // Handle session state updates
        console.log(`[${clientName}] 📊 Session state received:`, message);
        if (message.gameState) {
          // Apply game state from server
          const serverGameState = message.gameState;
          
          // Load position from server FEN
          if (serverGameState.fen) {
            try {
              const setup = parseFen(serverGameState.fen).unwrap();
              game = Chess.fromSetup(setup).unwrap();
              
              gameState.fen = serverGameState.fen;
              gameState.turn = serverGameState.turn || 'white';
              gameState.moves = serverGameState.moves || [];
              gameState.currentMoveIndex = gameState.moves.length - 1;
              gameState.status = 'playing';
              gameState.inCheck = false;
              gameState.winner = null;
              gameState.aiThinking = false;
              
              // Apply game settings from server
              gameState.mode = serverGameState.gameMode || 'human_vs_human';
              gameState.playerColor = serverGameState.playerColor || 'white';
              gameState.aiEloRating = serverGameState.aiEloRating || 1500;
              gameState.aiTimeLimit = serverGameState.aiTimeLimit || 500;
              
              console.log('✅ Applied session state from server:', {
                fen: gameState.fen,
                turn: gameState.turn,
                moves: gameState.moves.length,
                mode: gameState.mode,
                playerColor: gameState.playerColor,
                aiEloRating: gameState.aiEloRating,
                aiTimeLimit: gameState.aiTimeLimit
              });
              
              updateGameState();
              
              // Check if AI should move (if it's AI's turn)
              if (
                gameState.mode === 'human_vs_ai' &&
                gameState.status === 'playing' &&
                gameState.turn !== gameState.playerColor &&
                !gameState.aiThinking
              ) {
                console.log('🤖 AI turn detected in session state, scheduling AI move...');
                setTimeout(() => makeAIMove(), 500);
              }
              
            } catch (error) {
              console.error('Failed to parse session state FEN:', error);
            }
          }
        }
        break;
      // You can add more cases for other message types if needed
      default:
        console.log(`[${clientName}] 🤷 Unhandled WebSocket message type:`, message.type);
        break;
    }
  }

  function handleServerReset(resetData) {
    console.log('🔄 Received game reset from server:', resetData);
    
    // Reset the game engine to starting position
    game = Chess.default();
    
    // Reset game state
    gameState.fen = resetData.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    gameState.turn = resetData.turn || 'white';
    gameState.moves = [];
    gameState.currentMoveIndex = -1;
    gameState.status = 'playing';
    gameState.inCheck = false;
    gameState.winner = null;
    gameState.aiThinking = false;
    
    // Apply game settings from server if provided
    if (resetData.gameSettings) {
      gameState.mode = resetData.gameSettings.mode;
      gameState.playerColor = resetData.gameSettings.playerColor;
      gameState.aiEloRating = resetData.gameSettings.aiEloRating;
      gameState.aiTimeLimit = resetData.gameSettings.aiTimeLimit;
      
      console.log('✅ Applied game settings from server:', {
        mode: gameState.mode,
        playerColor: gameState.playerColor,
        aiEloRating: gameState.aiEloRating,
        aiTimeLimit: gameState.aiTimeLimit
      });
    }
    
    // Reset UI state (clear highlighted squares and selections)
    uiState.selectedSquare = null;
    uiState.highlightedSquares = [];
    
    updateGameState();
    
    console.log('✅ Game reset applied locally');
    
    // Check if AI should move first (if player chose black)
    if (
      gameState.mode === 'human_vs_ai' &&
      gameState.status === 'playing' &&
      gameState.turn !== gameState.playerColor &&
      !gameState.aiThinking
    ) {
      console.log('🤖 AI should move first after reset, scheduling AI move...');
      setTimeout(() => makeAIMove(), 500);
    }
  }

  function handleServerMove(moveData) {
    console.log('📡 Received move from server:', moveData);
    if (!game) return;
    
    try {
      const uciMove = parseUci(moveData.uci);
      if (!uciMove) {
        console.error('Failed to parse UCI move:', moveData.uci);
        return;
      }
      
      // Instead of validating against current client state, trust the server's FEN
      // and update our game state to match the server's position
      if (moveData.fen) {
        try {
          console.log('🎯 Updating game state to server position:', moveData.fen);
          
          // Parse the server's FEN and update our game state
          const setup = parseFen(moveData.fen).unwrap();
          game = Chess.fromSetup(setup).unwrap();
          
          // Update game state with the server's position
          gameState.fen = moveData.fen;
          gameState.turn = moveData.turn;
          
          // Add move to local move history if not already present
          if (moveData.moveRecord) {
            const existingMove = gameState.moves.find(m => 
              m.ply === moveData.moveRecord.ply && m.uci === moveData.moveRecord.uci
            );
            if (!existingMove) {
              gameState.moves.push(moveData.moveRecord);
              gameState.currentMoveIndex = gameState.moves.length - 1;
            }
          }
          
          // Highlight the move squares
          if (moveData.uci && moveData.uci.length >= 4) {
            uiState.highlightedSquares = [moveData.uci.substring(0, 2), moveData.uci.substring(2, 4)];
            console.log('🎯 Highlighted server move squares:', uiState.highlightedSquares);
          }
          
          // Update UI
          updateGameState();
          
          console.log('✅ Game state synchronized with server, turn is now:', gameState.turn);
          
          // Check if it's AI's turn after this move
          if (
            gameState.mode === 'human_vs_ai' &&
            gameState.status === 'playing' &&
            gameState.turn !== gameState.playerColor &&
            !gameState.aiThinking
          ) {
            console.log('🤖 AI turn detected after server move, scheduling AI move...');
            setTimeout(() => makeAIMove(), 300);
          }
          
        } catch (fenError) {
          console.error('Failed to parse server FEN:', moveData.fen, fenError);
          // Fallback: try to apply the move to current position
          if (game.isLegal(uciMove)) {
            console.log('🔄 Fallback: applying move to current position');
            game.play(uciMove);
            updateGameState();
          } else {
            console.warn('Move is illegal in current position and cannot parse server FEN');
          }
        }
      } else {
        // Fallback if no FEN provided - validate against current state
        if (game.isLegal(uciMove)) {
          console.log('🎯 Applying move from server (no FEN provided):', moveData.move, moveData.uci);
          game.play(uciMove);
          updateGameState();
        } else {
          console.warn('Received illegal move from server:', moveData.uci);
        }
      }
    } catch (e) {
      console.error('Error processing remote move:', e);
    }
  }

  function parseServerMoveHistory(moveHistoryText, finalFen) {
    console.log('🔍 Parsing server move history:', moveHistoryText);
    
    if (!moveHistoryText || moveHistoryText === 'No moves yet') {
      return [];
    }
    
    // Parse the move text (format: "1.e4 e5 2.Nf3 Nc6")
    const moves = [];
    const tokens = moveHistoryText.split(/\s+/).filter(token => token.length > 0);
    
    // Start from the initial position
    let tempGame = Chess.default();
    let ply = 1;
    
    for (const token of tokens) {
      // Skip move numbers (like "1.", "2.", etc.)
      if (token.match(/^\d+\.$/)) {
        continue;
      }
      
      try {
        // Try to parse as SAN
        const move = parseSan(tempGame, token);
        if (move) {
          const uci = makeUci(move);
          const moveRecord = {
            san: token,
            uci: uci,
            ply: ply,
            timestamp: new Date().toISOString()
          };
          
          // Apply the move to temp game for next iteration
          tempGame.play(move);
          moves.push(moveRecord);
          ply++;
          
          console.log(`✅ Parsed move ${ply-1}: ${token} (${uci})`);
        } else {
          console.warn(`⚠️ Could not parse move: ${token}`);
        }
      } catch (error) {
        console.warn(`⚠️ Error parsing move ${token}:`, error);
      }
    }
    
    console.log(`✅ Successfully parsed ${moves.length} moves from server history`);
    return moves;
  }

  async function loadGameStateFromServer() {
    try {
      console.log(`[${clientName}] 🔄 Loading game state from server...`);
      const response = await fetch('/api/mcp/get_game_state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          game_id: sessionId,
          client_id: clientId,
          client_name: clientName
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[${clientName}] 📊 Server game state loaded:`, result);
        
        // Parse the game state from server response
        // The server returns a text message, we need to extract the FEN and moves
        if (result.message && result.message.includes('Current FEN:')) {
          const fenMatch = result.message.match(/Current FEN: ([^\n]+)/);
          const movesMatch = result.message.match(/Move History:\n([^\n]+)/);
          
          if (fenMatch) {
            const serverFen = fenMatch[1].trim();
            console.log(`[${clientName}] 🎯 Server FEN:`, serverFen);
            
            // Load this position into the client
            try {
              const setup = parseFen(serverFen).unwrap();
              game = Chess.fromSetup(setup).unwrap();
              
              // Update all game state properly
              gameState.fen = serverFen;
              gameState.turn = game.turn; // Use game engine's turn, not FEN parsing
              
              // Parse move history if available
              if (movesMatch) {
                const moveHistory = movesMatch[1].trim();
                console.log(`[${clientName}] 📝 Server move history:`, moveHistory);
                
                // Parse the move history and reconstruct gameState.moves
                if (moveHistory && moveHistory !== 'No moves yet') {
                  try {
                    gameState.moves = parseServerMoveHistory(moveHistory, serverFen);
                    gameState.currentMoveIndex = gameState.moves.length - 1;
                    console.log(`[${clientName}] ✅ Parsed ${gameState.moves.length} moves from server`);
                  } catch (error) {
                    console.error(`[${clientName}] ❌ Failed to parse move history:`, error);
                    gameState.moves = [];
                    gameState.currentMoveIndex = -1;
                  }
                } else {
                  gameState.moves = [];
                  gameState.currentMoveIndex = -1;
                }
              } else {
                gameState.moves = [];
                gameState.currentMoveIndex = -1;
              }
              
              // Ensure UI is updated with the loaded state
              updateGameState();
              
              console.log(`[${clientName}] ✅ Game state synchronized with server`);
              
            } catch (e) {
              console.error(`[${clientName}] ❌ Failed to parse server FEN:`, e);
            }
          }
        }
      } else {
        console.error(`[${clientName}] ❌ Failed to load game state from server`);
      }
    } catch (error) {
      console.error(`[${clientName}] ❌ Error loading game state from server:`, error);
    }
  }

  function syncMoveToServer(move, oldFen, newFen, sanNotation) {
    try {
      const uciMove = makeUci(move);
      console.log(`[${clientName}] 💾 Syncing move to server via WebSocket:`, { san: sanNotation, uci: uciMove });
      
      // Send move via WebSocket instead of HTTP
      webSocketStore.sendMessage({
        type: 'sync_move',
        sessionId: sessionId,
        clientId: clientId,
        clientName: clientName,
        move: {
          san: sanNotation,
          uci: uciMove
        },
        fen: newFen,
        turn: newFen.includes(' w ') ? 'white' : 'black'
      });
      
      console.log(`[${clientName}] ✅ Move sent via WebSocket`);
    } catch (error) {
      console.error(`[${clientName}] ❌ Error syncing move to server:`, error);
    }
  }

  async function syncNewGameToServer() {
    try {
      console.log('🎮 Syncing new game to server with settings:', {
        mode: gameState.mode,
        playerColor: gameState.playerColor,
        aiEloRating: gameState.aiEloRating,
        aiTimeLimit: gameState.aiTimeLimit
      });
      
      const response = await fetch('/api/mcp/reset_game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          game_id: sessionId,  // Use sessionId instead of hardcoded value
          gameSettings: {
            mode: gameState.mode,
            playerColor: gameState.playerColor,
            aiEloRating: gameState.aiEloRating,
            aiTimeLimit: gameState.aiTimeLimit
          }
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ New game synced to server successfully');
      } else {
        console.error('❌ Failed to sync new game to server');
      }
    } catch (error) {
      console.error('❌ Error syncing new game to server:', error);
    }
  }

  function handleMove(move) {
    console.log(`[${clientName}] 🎯 Processing move:`, move);
    if (!game) return;

    const oldFen = gameState.fen;
    
    // Get SAN notation before applying the move
    const sanNotation = move.san || makeSan(game, move);
    
    // Apply the move locally first
    console.log(`[${clientName}] 🎯 Applying move locally:`, sanNotation);
    game.play(move);
    
    // Update local game state
    const newFen = makeFen(game.toSetup());
    gameState.fen = newFen;
    gameState.turn = game.turn;
    
    // Add to move history
    const moveRecord = {
      san: sanNotation,
      uci: makeUci(move),
      ply: gameState.moves.length + 1,
      timestamp: new Date().toISOString()
    };
    gameState.moves.push(moveRecord);
    gameState.currentMoveIndex = gameState.moves.length - 1;
    
    // Highlight the move squares
    const uci = makeUci(move);
    if (uci && uci.length >= 4) {
      uiState.highlightedSquares = [uci.substring(0, 2), uci.substring(2, 4)];
      console.log('🎯 Highlighted move squares:', uiState.highlightedSquares);
    }
    
    // Update UI
    updateGameState();
    
    console.log(`[${clientName}] ✅ Move applied locally, turn is now:`, gameState.turn);
    
    // Then sync to server (this will broadcast to other clients)
    syncMoveToServer(move, oldFen, newFen, sanNotation);
  }
  
  function checkGameStatus() {
    if (!game) return;

    if (game.isCheckmate()) {
      gameState.status = 'checkmate';
      gameState.winner = game.turn === 'white' ? 'black' : 'white';
      console.log(`🏁 Checkmate! ${gameState.winner} wins.`);
    } else if (game.isStalemate()) {
      gameState.status = 'stalemate';
      gameState.winner = 'draw';
      console.log('🏁 Stalemate! The game is a draw.');
    } else if (game.isInsufficientMaterial()) {
      gameState.status = 'insufficient_material';
      gameState.winner = 'draw';
      console.log('🏁 Insufficient material! The game is a draw.');
    } else {
      gameState.status = 'playing';
      gameState.winner = null;
    }

    gameState.inCheck = game.isCheck();
  }

  async function makeAIMove() {
    // Guard against unexpected calls
    if (
      gameState.mode !== 'human_vs_ai' ||
      gameState.status !== 'playing' ||
      gameState.turn === gameState.playerColor ||
      gameState.aiThinking
    ) {
      console.log('🚫 AI move blocked:', {
        mode: gameState.mode,
        status: gameState.status,
        turn: gameState.turn,
        playerColor: gameState.playerColor,
        aiThinking: gameState.aiThinking
      });
      return;
    }

    try {
      console.log('🤖 AI starting to think...');
      gameState.aiThinking = true;
      updateGameState();

      const aiResult = await stockfish.getBestMove(gameState.fen, gameState.aiEloRating, gameState.aiTimeLimit);

      if (aiResult && aiResult.move) {
        console.log('🤖 AI found best move:', aiResult);

        // Store evaluation if provided
        if (aiResult.evaluation) {
          evaluation = aiResult.evaluation;
        }

        const uciMove = parseUci(aiResult.move);
        if (uciMove && game.isLegal(uciMove)) {
          console.log('🤖 AI making move:', aiResult.move);
          // AI moves also go through the same flow - sync to server
          await handleMove(uciMove);
          // Set aiThinking to false immediately after the move is processed
          gameState.aiThinking = false;
          updateGameState();
        } else {
          console.error('❌ AI generated an illegal move:', aiResult.move);
          gameState.aiThinking = false;
          updateGameState();
        }
      } else {
        console.log('🤔 AI has no move to make.');
        gameState.aiThinking = false;
        updateGameState();
      }
    } catch (error) {
      console.error('❌ Error during AI move:', error);
      gameState.aiThinking = false;
      updateGameState();
    }
  }

  function updateGameState() {
    if (!game) return;
    const newFen = makeFen(game.toSetup());
    gameState.fen = newFen;
    gameState.turn = game.turn;
    checkGameStatus();
  }

  async function handleNewGame(mode, playerColor, aiElo, aiTimeLimit, syncToServer = true) {
    console.log('🎮 Starting new game:', { mode, playerColor, aiElo, aiTimeLimit });
    
    // Immediately clear UI state for better user experience
    uiState.selectedSquare = null;
    uiState.highlightedSquares = [];
    
    // Update local settings first
    gameState.mode = mode;
    gameState.playerColor = playerColor;
    gameState.aiEloRating = aiElo;
    gameState.aiTimeLimit = aiTimeLimit;
    
    // If we need to sync to server, do that and wait for server broadcast
    if (syncToServer) {
      await syncNewGameToServer();
      // Server will broadcast the reset, and we'll handle it in handleWebSocketMessage
    } else {
      // Only for local resets (shouldn't happen in new architecture)
      game = Chess.default();
      gameState = {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [],
        currentMoveIndex: -1,
        turn: 'white',
        status: 'playing',
        mode,
        playerColor,
        aiThinking: false,
        aiEloRating: aiElo,
        aiTimeLimit: aiTimeLimit,
        inCheck: false,
        winner: null,
      };
      
      // Reset UI state (clear highlighted squares and selections)
      uiState.selectedSquare = null;
      uiState.highlightedSquares = [];
      
      updateGameState();
    }
  }

  function handleBoardReset() {
    // Immediately clear UI state for better user experience
    uiState.selectedSquare = null;
    uiState.highlightedSquares = [];
    
    handleNewGame(gameState.mode, gameState.playerColor, gameState.aiEloRating, gameState.aiTimeLimit, true);
  }

  function handleEndGame(reason) {
    console.log('🏁 Ending game:', reason);
    
    if (reason === 'resign') {
      // Set the winner to the opponent
      const resigningColor = gameState.turn;
      gameState.winner = resigningColor === 'white' ? 'black' : 'white';
      gameState.status = 'checkmate'; // Use checkmate status for resign
      
      console.log(`👑 ${gameState.winner} wins by resignation!`);
      
      // Clear any AI thinking state
      gameState.aiThinking = false;
      
      // Force update the reactive state
      gameState = gameState;
      
      // Update the game state
      updateGameState();
    }
  }
  
  function handleResetAI() {
    console.log('🔄 Resetting AI thinking state');
    gameState.aiThinking = false;
    gameState = gameState; // Force reactive update
  }

  async function analyzePosition() {
    console.log('🔍 Starting position analysis...');
    isAnalyzing = true;
    analysisResult = null;
    
    try {
      const result = await stockfish.getBestMove(gameState.fen, 2600, 1000); // Use max ELO for analysis, 1 second
      console.log('🔍 Analysis result:', result);
      
      if (result && result.move) {
        // Parse the move for display
        const move = parseUci(result.move);
        
        // Update analysis result
        analysisResult = {
          bestMove: result.move,
          bestMoveSan: move ? `${move.from}-${move.to}` : result.move,
          fen: gameState.fen,
          turn: gameState.turn,
          timestamp: new Date().toLocaleTimeString()
        };
        
        // Update evaluation display
        evaluation = result.evaluation || { cp: 0, mate: null };
        evaluation.bestMove = result.move;
        
        console.log('✅ Analysis complete. Best move:', result.move);
        
        // Highlight the best move on the board
        if (move) {
          uiState.highlightedSquares = [move.from, move.to];
          console.log('🎯 Highlighted best move squares:', [move.from, move.to]);
        }
      } else {
        console.error('❌ No move returned from analysis');
        analysisResult = {
          error: 'No move returned from engine',
          timestamp: new Date().toLocaleTimeString()
        };
      }
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      analysisResult = {
        error: error.message,
        timestamp: new Date().toLocaleTimeString()
      };
    } finally {
      isAnalyzing = false;
    }
  }
  

  
    function handleLoadCurrentGame() {
    console.log('🎬 Loading current game for replay');
    console.log('🔍 Current gameState.moves:', gameState.moves);
    
    if (gameState.moves.length === 0) {
      console.log('⚠️ No moves to replay');
      alert('当前游戏没有棋步可以复盘');
      return;
    }
    
    // Sort moves by ply to ensure correct order
    const sortedMoves = [...gameState.moves].sort((a, b) => (a.ply || 0) - (b.ply || 0));
    
    // Convert moves to format expected by replay
    // Since GameReplay.svelte can handle SAN directly and chessops supports it perfectly,
    // we should prioritize SAN over UCI for replay
    const replayMoves = sortedMoves.map((move, index) => {
      try {
        // Prioritize SAN since it's more reliable and directly supported by chessops
        if (move.san && move.san.length > 0) {
          console.log(`✅ Using SAN for replay: ${move.san}`);
          return {
            san: move.san,
            uci: move.uci || null, // Include UCI as fallback if available
            ply: move.ply || index + 1
          };
        }
        
        // Fallback to UCI if SAN is not available
        if (move.uci && move.uci.length >= 4 && move.uci !== 'a1a1') {
          const from = move.uci.substring(0, 2);
          const to = move.uci.substring(2, 4);
          if (/^[a-h][1-8]$/.test(from) && /^[a-h][1-8]$/.test(to)) {
            console.log(`⚠️ Using UCI for replay (no SAN): ${move.uci}`);
            return {
              uci: move.uci,
              from: from,
              to: to,
              promotion: move.uci.length > 4 ? move.uci.substring(4) : null,
              ply: move.ply || index + 1
            };
          }
        }
        
        console.warn('Invalid move found (no valid SAN or UCI):', move);
        return null;
      } catch (error) {
        console.error('Error converting move for replay:', move, error);
        return null; // Skip problematic moves
      }
    }).filter(move => move !== null); // Remove null moves
    
    if (replayMoves.length === 0) {
      console.log('⚠️ No valid moves to replay');
      alert('当前游戏没有有效的棋步可以复盘');
      return;
    }
    
    replayGameData = {
      moves: replayMoves,
      title: '当前游戏复盘'
    };
    
    showReplayMode = true;
  }
  
  function handleCloseReplay() {
    console.log('🚫 Closing replay mode');
    showReplayMode = false;
    replayGameData = null;
  }
  
  function handleShowNewGameModal() {
    showGameModeModal = true;
  }
  
  function startNewGame() {
    // Immediately clear UI state for better user experience
    uiState.selectedSquare = null;
    uiState.highlightedSquares = [];
    
    handleNewGame(selectedMode, selectedPlayerColor, aiEloRating, aiTimeLimit);
    showGameModeModal = false;
  }
  
  function handleLoadSampleGame(gameType) {
    console.log('🎬 Loading sample game:', gameType);
    
    // Define sample games with their moves in UCI format
    const sampleGames = {
      scholarsMate: {
        title: "学者将死 (Scholar's Mate)",
        moves: [
          { uci: 'e2e4', from: 'e2', to: 'e4' },      // 1. e4
          { uci: 'e7e5', from: 'e7', to: 'e5' },      // 1... e5
          { uci: 'f1c4', from: 'f1', to: 'c4' },      // 2. Bc4
          { uci: 'b8c6', from: 'b8', to: 'c6' },      // 2... Nc6
          { uci: 'd1h5', from: 'd1', to: 'h5' },      // 3. Qh5
          { uci: 'g8f6', from: 'g8', to: 'f6' },      // 3... Nf6??
          { uci: 'h5f7', from: 'h5', to: 'f7' }       // 4. Qxf7# 1-0
        ]
      },
      italianGame: {
        title: "意大利开局 (Italian Game)",
        moves: [
          { uci: 'e2e4', from: 'e2', to: 'e4' },      // 1. e4
          { uci: 'e7e5', from: 'e7', to: 'e5' },      // 1... e5
          { uci: 'g1f3', from: 'g1', to: 'f3' },      // 2. Nf3
          { uci: 'b8c6', from: 'b8', to: 'c6' },      // 2... Nc6
          { uci: 'f1c4', from: 'f1', to: 'c4' },      // 3. Bc4
          { uci: 'f8c5', from: 'f8', to: 'c5' },      // 3... Bc5
          { uci: 'c2c3', from: 'c2', to: 'c3' },      // 4. c3
          { uci: 'f7f5', from: 'f7', to: 'f5' },      // 4... f5
          { uci: 'd2d3', from: 'd2', to: 'd3' },      // 5. d3
          { uci: 'f5e4', from: 'f5', to: 'e4' },      // 5... fxe4
          { uci: 'd3e4', from: 'd3', to: 'e4' },      // 6. dxe4
          { uci: 'g8f6', from: 'g8', to: 'f6' }       // 6... Nf6
        ]
      },
      sicilianDefense: {
        title: "西西里防御 (Sicilian Defense)",
        moves: [
          { uci: 'e2e4', from: 'e2', to: 'e4' },      // 1. e4
          { uci: 'c7c5', from: 'c7', to: 'c5' },      // 1... c5
          { uci: 'g1f3', from: 'g1', to: 'f3' },      // 2. Nf3
          { uci: 'd7d6', from: 'd7', to: 'd6' },      // 2... d6
          { uci: 'd2d4', from: 'd2', to: 'd4' },      // 3. d4
          { uci: 'c5d4', from: 'c5', to: 'd4' },      // 3... cxd4
          { uci: 'f3d4', from: 'f3', to: 'd4' },      // 4. Nxd4
          { uci: 'g8f6', from: 'g8', to: 'f6' },      // 4... Nf6
          { uci: 'b1c3', from: 'b1', to: 'c3' },      // 5. Nc3
          { uci: 'a7a6', from: 'a7', to: 'a6' },      // 5... a6
          { uci: 'c1e3', from: 'c1', to: 'e3' },      // 6. Be3
          { uci: 'e7e6', from: 'e7', to: 'e6' },      // 6... e6
          { uci: 'f2f3', from: 'f2', to: 'f3' },      // 7. f3
          { uci: 'b7b5', from: 'b7', to: 'b5' }       // 7... b5
        ]
      }
    };
    
    const gameData = sampleGames[gameType];
    if (!gameData) {
      console.error('Unknown sample game type:', gameType);
      alert('未知的示例游戏类型');
      return;
    }
    
    replayGameData = gameData;
    showReplayMode = true;
  }

  function handleFileUpload(event) {
    console.log('📁 File upload event:', event);
    const file = event.target.files[0];
    if (!file) {
      console.log('No file selected');
      return;
    }

    console.log('📁 Selected file:', file.name, file.type, file.size);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const pgnContent = e.target.result;
        console.log('📁 PGN content loaded:', pgnContent.substring(0, 200) + '...');
        
        const gameData = parsePGN(pgnContent);
        if (gameData && gameData.moves && gameData.moves.length > 0) {
          replayGameData = gameData;
          showReplayMode = true;
          console.log('✅ PGN loaded successfully:', gameData.title);
        } else {
          alert('无法解析PGN文件。请确保文件格式正确。');
        }
      } catch (error) {
        console.error('❌ Error reading PGN file:', error);
        alert('读取PGN文件时出错：' + error.message);
      }
    };

    reader.onerror = (error) => {
      console.error('❌ FileReader error:', error);
      alert('读取文件时出错');
    };

    reader.readAsText(file);
  }

  function parsePGN(pgnContent) {
    console.log('🔍 Parsing PGN content...');
    
    try {
      // Simple PGN parser - extract moves
      const lines = pgnContent.split('\n');
      let moveText = '';
      let headers = {};
      
      // Parse headers and extract move text
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          // Header line like [Event "Game"]
          const match = trimmed.match(/\[(\w+)\s+"([^"]+)"\]/);
          if (match) {
            headers[match[1]] = match[2];
          }
        } else if (trimmed.length > 0 && !trimmed.startsWith('[')) {
          // Move text
          moveText += ' ' + trimmed;
        }
      }
      
      console.log('📋 PGN headers:', headers);
      console.log('♟️ PGN moves text:', moveText.trim());
      
      // Parse moves from text
      const moves = [];
      const tokens = moveText.trim().split(/\s+/);
      let tempGame = Chess.default();
      
      for (const token of tokens) {
        // Skip move numbers, result markers, and comments
        if (token.match(/^\d+\./) || token.match(/^[01\/2\-\*]+$/) || token.startsWith('{') || token.startsWith('(')) {
          continue;
        }
        
        try {
          // Try to parse as SAN
          const move = parseSan(tempGame, token);
          if (move) {
            const uci = makeUci(move);
            moves.push({
              san: token,
              uci: uci,
              from: uci.substring(0, 2),
              to: uci.substring(2, 4),
              promotion: uci.length > 4 ? uci.substring(4) : null,
              ply: moves.length + 1,
              timestamp: new Date().toISOString()
            });
            
            // Apply the move to the temporary game
            const playResult = tempGame.play(move);
            if (!playResult) {
              throw new Error(`Failed to apply move: ${token}`);
            }
            
            console.log(`✅ Parsed PGN move: ${token} (${uci})`);
          } else {
            console.warn(`⚠️ Could not parse PGN move (invalid): ${token}`);
          }
        } catch (error) {
          console.warn(`⚠️ Could not parse PGN move: ${token}`, error);
        }
      }
      
      const title = headers.Event || headers.White + ' vs ' + headers.Black || 'PGN Game';
      console.log(`✅ PGN parsed successfully: ${moves.length} moves`);
      
      return {
        title: title,
        moves: moves,
        headers: headers
      };
      
    } catch (error) {
      console.error('❌ PGN parsing error:', error);
      throw new Error('PGN解析失败: ' + error.message);
    }
  }
  

</script>

<div class="app-container">
  <!-- Header -->
  <header class="app-header">
    <div class="header-content">
      <h1 class="app-title">Chess Trainer MCP</h1>
      <div class="header-status">
        <StatusBar
          connectionStatus={$webSocketStore.connectionStatus}
          engineReady={$engineReady}
          engineStatus={$engineStatus}
          gameStatus={gameState.status}
          turn={gameState.turn}
          aiThinking={gameState.aiThinking}
          inCheck={gameState.inCheck}
          sessionId={sessionId}
          clientName={clientName}
          clientId={clientId}
          connectedClients={connectedClients}
        />
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main-content">
    <div class="board-and-moves">
      <div class="board-container">
        <div class="chess-board-wrapper">
          <ChessBoard
            fen={gameState.fen}
            turn={gameState.turn}
            on:move={event => {
              console.log('📥 Move event received:', event.detail);
              
              // Don't allow moves if we're in replay mode
              if (showReplayMode) {
                console.log('🚫 Move blocked: in replay mode');
                return;
              }
              
              // ChessBoard sends a move object, but we need the raw move
              const moveData = event.detail;
              const move = parseUci(moveData.uci);
              if (move) {
                handleMove(move);
              } else {
                console.error('Failed to parse move from ChessBoard:', moveData);
              }
            }}
            selectedSquare={uiState.selectedSquare}
            highlightedSquares={uiState.highlightedSquares}
            playerColor={gameState.mode === 'human_vs_ai' ? gameState.playerColor : 'white'}
            gameMode={gameState.mode}
            aiThinking={gameState.aiThinking}
            gameStatus={gameState.status}
            replayMode={showReplayMode}
          />
          
          <!-- AI Thinking Overlay -->
          {#if gameState.aiThinking}
            <div class="ai-thinking-overlay">
              <div class="ai-thinking-message">
                <div class="ai-thinking-spinner"></div>
                <span>AI正在思考...</span>
              </div>
            </div>
          {/if}
        </div>
      </div>
      
      <div class="side-panel">
        <!-- Only show ControlPanel when NOT in replay mode -->
        {#if !showReplayMode}
          <ControlPanel 
            {gameState}
            {analysisResult}
            {isAnalyzing}
            onNewGame={handleNewGame}
            onEndGame={handleEndGame}
            onRequestAnalysis={analyzePosition}
            onLoadCurrentGame={handleLoadCurrentGame}
            onLoadSampleGame={handleLoadSampleGame}
            onFileUpload={handleFileUpload}
            onShowNewGameModal={handleShowNewGameModal}
            onResetAI={handleResetAI}
          />
        {:else}
          <!-- Show simple replay info when in replay mode -->
          <div class="replay-info">
            <h3>🎬 复盘模式</h3>
            <p>正在复盘: {replayGameData?.title || '游戏'}</p>
            <button class="btn btn-secondary" on:click={handleCloseReplay}>
              返回游戏
            </button>
          </div>
        {/if}
      </div>
    </div>
  </main>

  <!-- Game Replay Modal -->
  {#if showReplayMode && replayGameData}
    <GameReplay 
      gameData={replayGameData}
      onClose={handleCloseReplay}
    />
  {/if}
  
  <!-- New Game Modal -->
  {#if showGameModeModal}
    <div class="modal-overlay" on:click={() => showGameModeModal = false}>
      <div class="modal" on:click|stopPropagation>
        <h3>{t.selectGameMode}</h3>
        
        <div class="mode-selection">
          <label class="mode-option">
            <input 
              type="radio" 
              bind:group={selectedMode} 
              value="human_vs_human"
            />
            <span>{t.humanVsHuman}</span>
            <small>{t.twoPlayersAlternate}</small>
          </label>
          
          <label class="mode-option">
            <input 
              type="radio" 
              bind:group={selectedMode} 
              value="human_vs_ai"
            />
            <span>{t.humanVsAi}</span>
            <small>{t.playAgainstAi}</small>
          </label>
        </div>

        {#if selectedMode === 'human_vs_ai'}
          <div class="ai-settings">
            <div class="color-selection">
              <h4>{t.selectYourColor}</h4>
              <label class="color-option">
                <input 
                  type="radio" 
                  bind:group={selectedPlayerColor} 
                  value="white"
                />
                <span>{t.whiteFirst}</span>
              </label>
              <label class="color-option">
                <input 
                  type="radio" 
                  bind:group={selectedPlayerColor} 
                  value="black"
                />
                <span>{t.blackSecond}</span>
              </label>
            </div>

            <div class="ai-strength">
              <h4>{t.aiSettings}</h4>
              
              <!-- AI Strength Setting -->
              <div class="setting-item">
                <label for="elo-range">
                  <strong>{t.aiStrength || 'AI Strength'}</strong>: {aiEloRating} ELO
                </label>
                <input 
                  id="elo-range"
                  type="range" 
                  min="800" 
                  max="2800" 
                  step="100"
                  bind:value={aiEloRating}
                  class="slider"
                />
                <div class="elo-labels">
                  <span>{t.beginner} (800)</span>
                  <span>{t.master} (2800)</span>
                </div>
                <div class="setting-description">
                  {t.strengthDescription || 'Controls how strong the AI plays (chess skill level)'}
                </div>
              </div>

              <!-- Thinking Time Setting -->
              <div class="setting-item">
                <label for="time-range">
                  <strong>{t.thinkingTime || 'Thinking Time'}</strong>: {aiTimeLimit/1000}{t.seconds}
                </label>
                <input 
                  id="time-range"
                  type="range" 
                  min="200" 
                  max="5000" 
                  step="200"
                  bind:value={aiTimeLimit}
                  class="slider"
                />
                <div class="time-labels">
                  <span>{t.instant || 'Instant'} (0.2{t.seconds})</span>
                  <span>{t.deepThinking} (5{t.seconds})</span>
                </div>
                <div class="quick-presets">
                  <button type="button" class="preset-btn" on:click={() => aiTimeLimit = 200}>
                    {t.instant || 'Instant'} (0.2s)
                  </button>
                  <button type="button" class="preset-btn" on:click={() => aiTimeLimit = 500}>
                    {t.fast || 'Fast'} (0.5s)
                  </button>
                  <button type="button" class="preset-btn" on:click={() => aiTimeLimit = 1000}>
                    {t.normal || 'Normal'} (1s)
                  </button>
                  <button type="button" class="preset-btn" on:click={() => aiTimeLimit = 3000}>
                    {t.deep || 'Deep'} (3s)
                  </button>
                </div>
                <div class="setting-description">
                  {t.timeDescription || 'Controls how long AI thinks per move (response speed)'}
                </div>
              </div>

              <!-- Quick Preset Combinations -->
              <div class="setting-item">
                <h5>{t.quickPresets || 'Quick Presets'}</h5>
                <div class="combo-presets">
                  <button type="button" class="combo-btn" on:click={() => {aiEloRating = 1000; aiTimeLimit = 200;}}>
                    📚 {t.beginner || 'Beginner'}<br/>
                    <small>1000 ELO • 0.2s</small>
                  </button>
                  <button type="button" class="combo-btn" on:click={() => {aiEloRating = 1500; aiTimeLimit = 500;}}>
                    🎯 {t.intermediate || 'Intermediate'}<br/>
                    <small>1500 ELO • 0.5s</small>
                  </button>
                  <button type="button" class="combo-btn" on:click={() => {aiEloRating = 2000; aiTimeLimit = 1000;}}>
                    🏆 {t.advanced || 'Advanced'}<br/>
                    <small>2000 ELO • 1s</small>
                  </button>
                  <button type="button" class="combo-btn" on:click={() => {aiEloRating = 2500; aiTimeLimit = 3000;}}>
                    👑 {t.master || 'Master'}<br/>
                    <small>2500 ELO • 3s</small>
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="modal-actions">
          <button class="btn btn-secondary" on:click={() => showGameModeModal = false}>
            {t.cancel}
          </button>
          <button class="btn btn-primary" on:click={startNewGame}>
            {t.startGame}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Component-specific styles are now in App.css */
</style>