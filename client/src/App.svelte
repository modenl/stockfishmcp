<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import ChessBoard from './components/ChessBoard.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import GameReplay from './components/GameReplay.svelte';
  import { webSocketStore } from './stores/websocket.js';
  import { languageStore } from './stores/language.js';
  import { themeStore } from './stores/theme.js';
  import stockfish, { engineReady, engineStatus } from './lib/stockfish.js';
  import { Chess } from 'chessops/chess';
  import { makeFen, parseFen } from 'chessops/fen';
  import { makeUci, parseUci } from 'chessops/util';
  import { makeSan, parseSan } from 'chessops/san';
  import './App.css';

  // Board size configuration - make it responsive (removed - using computed values instead)
  
  // Track window width for responsive layout
  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  
  // Compute board dimensions based on window width
  let computedBoardWidth = $derived(
    windowWidth < 768 ? Math.min(windowWidth - 32, 400) :
    windowWidth < 1024 ? Math.min(windowWidth * 0.6, 500) : 
    512
  );
  let computedBoardHeight = $derived(computedBoardWidth);
  
  // Reactive style for board layout (responsive)
  let boardGridStyle = $derived(
    // For small screens (mobile), stack vertically
    windowWidth < 768 ? 'grid-template-columns: 1fr; gap: 1.5rem;' :
    // For medium screens (tablet), use smaller side panel  
    windowWidth < 1024 ? 'grid-template-columns: minmax(300px, 1fr) 280px; gap: 1.5rem;' :
    // For large screens (desktop), use full layout
    'grid-template-columns: minmax(320px, 1fr) 350px; gap: 2rem;'
  );

  // New Game Modal state
  let showGameModeModal = $state(false);
  let selectedMode = $state('human_vs_human');
  let selectedPlayerColor = $state('white');
  let aiEloRating = $state(1500);
  let aiTimeLimit = $state(500); // milliseconds - default to fast play
  
  // Language state
  let currentLang = $derived($languageStore);
  let t = $derived(languageStore.translations[currentLang]);

  // Game state - initialize properly
  let gameState = $state({
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
  });

  // Initialize game properly
  let game = $state(null);
  try {
    const setup = parseFen(gameState.fen).unwrap();
    game = Chess.fromSetup(setup).unwrap();
  } catch (e) {
    console.error('Failed to initialize chess game:', e);
    game = Chess.default(); // Fallback to default starting position
  }

  // UI state
  let uiState = $state({
    selectedSquare: null,
    highlightedSquares: [],
  });

  // Engine evaluation
  let evaluation = $state({
    cp: 0,
    mate: null,
    bestMove: null,
  });
  
  // Analysis state
  let analysisResult = $state(null);
  let isAnalyzing = $state(false);
  
  // Replay state
  let showReplayMode = $state(false);
  let replayGameData = $state(null);

  let unsubscribeWS = null;

  // No longer need sessionId - only one game exists
  let clientId = generateClientId(); // Unique client identifier
  let clientName = generateClientName(); // Human-readable client name
  let connectedClients = $state([]); // List of connected clients
  let boardKey = $state(0); // Key to force ChessBoard re-render

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
    // Handle window resize
    const handleResize = () => {
      windowWidth = window.innerWidth;
    };
    window.addEventListener('resize', handleResize);
    
    // App initialization
    
    // Initialize theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.classList.add(savedTheme);
    
    // stockfish service initializes itself automatically.
    unsubscribeWS = webSocketStore.subscribe(({ lastMessage }) => {
      if (lastMessage) handleWebSocketMessage(lastMessage);
    });
    
    // Delay WebSocket connection to ensure WebView is fully loaded
    const connectDelay = window.location.href.includes('file://') ? 2000 : 500; // Longer delay for WebView
    
    setTimeout(() => {
      // Connect to WebSocket server
      // In WebView, hostname might be empty or different, so we use localhost as fallback
      const hostname = window.location.hostname || 'localhost';
      const port = window.location.port || '3456';
      const wsUrl = `ws://${hostname}:${port}/ws`;
      console.log('🔌 Connecting to WebSocket:', wsUrl);
      
      try {
        webSocketStore.connect(wsUrl);
      } catch (error) {
        console.error('❌ Failed to connect WebSocket:', error);
      }
    }, connectDelay);
    
    // Join the session once connected
    // Subscribe to WebSocket state to know when it's connected
    let checkConnectionInterval;
    let connectionCheckCount = 0;
    const maxConnectionChecks = 50; // 5 seconds max
    
    checkConnectionInterval = setInterval(() => {
      connectionCheckCount++;
      const wsState = get(webSocketStore);
      
      if (wsState.isConnected) {
        // WebSocket connected, joining session
        webSocketStore.sendMessage({
          type: 'join_session',
          clientId: clientId,
          clientName: clientName
        });
        
        // Load current game state from server
        loadGameStateFromServer();
        
        clearInterval(checkConnectionInterval);
      } else if (connectionCheckCount >= maxConnectionChecks) {
        console.error('❌ WebSocket connection timeout after 5 seconds');
        clearInterval(checkConnectionInterval);
      }
    }, 100); // Check every 100ms
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (unsubscribeWS) unsubscribeWS();
      stockfish.destroy();
    };
  });

  function handleWebSocketMessage(message) {
    // WebSocket message received
    
    // Only process messages that are objects and have a type
    if (!message || typeof message !== 'object' || !message.type) {
      // Invalid message format
      return;
    }

    switch (message.type) {
      case 'mcp_move':
        // Received mcp_move
        // Only handle moves for the current session/game
        // Handle move from server
        handleServerMove(message);
        break;
      case 'mcp_game_reset':
        // Handle game reset from server
        console.log('🎮 CLIENT: Received mcp_game_reset message:', message);
        handleServerReset(message);
        break;
      case 'client_joined':
        // Handle new client joining
        // Client joined
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
        // Client left
        connectedClients = connectedClients.filter(c => c.clientId !== message.clientId);
        break;
      case 'clients_list':
        // Update list of connected clients
        // Connected clients updated
        connectedClients = message.clients || [];
        break;
      case 'error':
        // Handle error messages from server
        console.error(`[${clientName}] ❌ WebSocket error:`, message.message);
        break;
      case 'stop_replay':
        // Handle stop replay message from server
        // Stop replay message received
        if (showReplayMode) {
          // Closing current replay as requested by server
          showReplayMode = false;
          replayGameData = null;
        }
        break;
      case 'pgn_replay_loaded':
        // Handle PGN replay loaded from MCP
        // PGN replay loaded
        if (!message.gameId || message.gameId === '*') {
          handlePgnReplayLoaded(message.moves, message.autoPlay, message.delayMs);
        }
        break;
      case 'session_ended':
        // Handle game end acknowledgment from server
        // Session ended acknowledgment received
        if (message.result) {
          // Update local game state to reflect the resignation
          if (message.result.reason === 'resignation') {
            gameState.status = 'resigned'; // Use resigned status
            gameState.winner = message.result.winner;
            gameState.aiThinking = false;
            
            // Force update the reactive state
            updateGameState();
            
            // Winner by resignation
          }
        }
        if (message.summary) {
          // Game summary received
        }
        break;
      case 'session_state':
        // Handle session state updates
        // Session state received
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
              
              // Applied session state from server
              
              updateGameState();
              
              // Check if game is in replay mode
              if (serverGameState.mode === 'replay' && serverGameState.replayData) {
                // Game is in replay mode, loading replay data
                const replayData = serverGameState.replayData;
                handlePgnReplayLoaded(replayData.moves, replayData.autoPlay, replayData.delayMs);
              }
              
              // Check if AI should move (if it's AI's turn)
              if (
                gameState.mode === 'human_vs_ai' &&
                gameState.status === 'playing' &&
                gameState.turn !== gameState.playerColor &&
                !gameState.aiThinking
              ) {
                // AI turn detected in session state
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
        // Unhandled WebSocket message type
        break;
    }
  }

  function handleServerReset(resetData) {
    console.log('🔄 CLIENT: handleServerReset called with data:', resetData);
    // Received game reset from server
    
    // Close any open modals first
    showGameModeModal = false;
    showReplayMode = false;
    replayGameData = null;
    
    // Reset the game engine to starting position
    game = Chess.default();
    
    // Create a new gameState object to ensure Svelte detects the change
    gameState = {
      fen: resetData.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: resetData.turn || 'white',
      moves: [],
      currentMoveIndex: -1,
      status: 'playing',
      inCheck: false,
      winner: null,
      aiThinking: false,
      // Apply game settings from server if provided
      mode: resetData.gameSettings?.mode || 'human_vs_human',
      playerColor: resetData.gameSettings?.playerColor || 'white',
      aiEloRating: resetData.gameSettings?.aiEloRating || 1500,
      aiTimeLimit: resetData.gameSettings?.aiTimeLimit || 500
    };
    
    // Reset UI state (clear highlighted squares and selections)
    uiState = {
      selectedSquare: null,
      highlightedSquares: []
    };
    
    // Force ChessBoard to re-render by changing key
    boardKey = boardKey + 1;
    
    // Game reset applied locally
    console.log('🔄 CLIENT: Game state after reset:', gameState);
    console.log('🔄 CLIENT: Game mode:', gameState.mode);
    console.log('🔄 CLIENT: Player color:', gameState.playerColor);
    console.log('🔄 CLIENT: Board key:', boardKey);
    
    // Check if AI should move first (if player chose black)
    if (
      gameState.mode === 'human_vs_ai' &&
      gameState.status === 'playing' &&
      gameState.turn !== gameState.playerColor &&
      !gameState.aiThinking
    ) {
      console.log('🤖 CLIENT: AI should move first after reset');
      setTimeout(() => makeAIMove(), 500);
    }
  }

  function handleServerMove(moveData) {
    // Received move from server
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
          // Updating game state to server position
          
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
            // Highlighted server move squares
          }
          
          // Update UI
          updateGameState();
          
          // Game state synchronized with server
          
          // Check if it's AI's turn after this move
          if (
            gameState.mode === 'human_vs_ai' &&
            gameState.status === 'playing' &&
            gameState.turn !== gameState.playerColor &&
            !gameState.aiThinking
          ) {
            // AI turn detected after server move
            setTimeout(() => makeAIMove(), 300);
          }
          
        } catch (fenError) {
          console.error('Failed to parse server FEN:', moveData.fen, fenError);
          // Fallback: try to apply the move to current position
          if (game.isLegal(uciMove)) {
            // Fallback: applying move to current position
            game.play(uciMove);
            updateGameState();
          } else {
            // Move is illegal in current position
          }
        }
      } else {
        // Fallback if no FEN provided - validate against current state
        if (game.isLegal(uciMove)) {
          // Applying move from server (no FEN provided)
          game.play(uciMove);
          updateGameState();
        } else {
          // Received illegal move from server
        }
      }
    } catch (e) {
      console.error('Error processing remote move:', e);
    }
  }

  function parseServerMoveHistory(moveHistoryText, finalFen) {
    // Parsing server move history
    
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
          
          // Parsed move successfully
        } else {
          // Could not parse move
        }
      } catch (error) {
        // Error parsing move
      }
    }
    
    // Successfully parsed moves from server history
    return moves;
  }

  async function loadGameStateFromServer() {
    try {
      // Loading game state from server
      const response = await fetch('/api/mcp/get_game_state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          client_id: clientId,
          client_name: clientName
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        // Server game state loaded
        
        // Parse the game state from server response
        // The server returns a text message, we need to extract the FEN and moves
        if (result.message && result.message.includes('Current FEN:')) {
          const fenMatch = result.message.match(/Current FEN: ([^\n]+)/);
          const movesMatch = result.message.match(/Move History:\n([^\n]+)/);
          
          if (fenMatch) {
            const serverFen = fenMatch[1].trim();
            // Server FEN received
            
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
                // Server move history
                
                // Parse the move history and reconstruct gameState.moves
                if (moveHistory && moveHistory !== 'No moves yet') {
                  try {
                    gameState.moves = parseServerMoveHistory(moveHistory, serverFen);
                    gameState.currentMoveIndex = gameState.moves.length - 1;
                    // Parsed moves from server
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
              
              // Game state synchronized with server
              
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
      // Syncing move to server via WebSocket
      
      // Send move via WebSocket instead of HTTP
      webSocketStore.sendMessage({
        type: 'sync_move',
        clientId: clientId,
        clientName: clientName,
        move: {
          san: sanNotation,
          uci: uciMove
        },
        fen: newFen,
        turn: newFen.includes(' w ') ? 'white' : 'black'
      });
      
      // Move sent via WebSocket
    } catch (error) {
      console.error(`[${clientName}] ❌ Error syncing move to server:`, error);
    }
  }

  async function syncNewGameToServer() {
    console.log('📤 CLIENT: syncNewGameToServer called');
    console.log('📤 CLIENT: Current gameState:', gameState);
    console.log('📤 CLIENT: WebSocket state:', get(webSocketStore));
    
    // Check if WebSocket is connected
    const wsState = get(webSocketStore);
    if (!wsState.isConnected) {
      console.error('❌ WebSocket not connected, cannot sync new game');
      // Try to reconnect
      const hostname = window.location.hostname || 'localhost';
      const port = window.location.port || '3456';
      const wsUrl = `ws://${hostname}:${port}/ws`;
      webSocketStore.connect(wsUrl);
      
      // Wait a bit and retry
      setTimeout(() => syncNewGameToServer(), 1000);
      return;
    }
    
    try {
      // Send reset via WebSocket instead of HTTP
      webSocketStore.sendMessage({
        type: 'reset_game',
        clientId: clientId,
        clientName: clientName,
        gameSettings: {
          mode: gameState.mode,
          playerColor: gameState.playerColor,
          aiEloRating: gameState.aiEloRating,
          aiTimeLimit: gameState.aiTimeLimit
        }
      });
      
      console.log('✅ CLIENT: Reset request sent via WebSocket');
    } catch (error) {
      console.error('❌ Error syncing new game to server:', error);
    }
  }

  function handleMove(move) {
    // Processing move
    if (!game) return;
    
    const oldFen = gameState.fen;
    
    // Get SAN notation before applying the move
    const sanNotation = move.san || makeSan(game, move);
    
    // Apply the move locally first
    // Applying move locally
    game.play(move);
    
    // Update local game state
    const setup = game.toSetup();
    const newFen = makeFen(setup);
    
    // Force reactivity by creating new gameState object
    gameState = {
      ...gameState,
      fen: newFen,
      turn: game.turn
    };
    
    // Add to move history
    const moveRecord = {
      san: sanNotation,
      uci: makeUci(move),
      ply: gameState.moves.length + 1,
      timestamp: new Date().toISOString()
    };
    
    // Update gameState with new moves array for reactivity
    gameState = {
      ...gameState,
      moves: [...gameState.moves, moveRecord],
      currentMoveIndex: gameState.moves.length
    };
    
    // Highlight the move squares
    const uci = makeUci(move);
    if (uci && uci.length >= 4) {
      uiState.highlightedSquares = [uci.substring(0, 2), uci.substring(2, 4)];
      // Highlighted move squares
    }
    
    // Update UI
    updateGameState();
    
    // Move applied locally
    
    // Then sync to server (this will broadcast to other clients)
    syncMoveToServer(move, oldFen, newFen, sanNotation);
    
    // Check if AI should move after human move
    if (
      gameState.mode === 'human_vs_ai' &&
      gameState.status === 'playing' &&
      gameState.turn !== gameState.playerColor &&
      !gameState.aiThinking
    ) {
      setTimeout(() => makeAIMove(), 300);
    }
  }
  
  function checkGameStatus() {
    if (!game) return;

    // Don't override status if game was resigned
    if (gameState.status === 'resigned' && gameState.winner) {
      // Game already ended (resignation), keeping status
      return;
    }

    if (game.isCheckmate()) {
      gameState.status = 'checkmate';
      gameState.winner = game.turn === 'white' ? 'black' : 'white';
      // Checkmate detected
    } else if (game.isStalemate()) {
      gameState.status = 'stalemate';
      gameState.winner = 'draw';
      // Stalemate detected
    } else if (game.isInsufficientMaterial()) {
      gameState.status = 'insufficient_material';
      gameState.winner = 'draw';
      // Insufficient material detected
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
      return;
    }

    try {
      // Check if engine is available
      if (!$engineReady) {
        // Chess engine not ready
        gameState.aiThinking = false;
        updateGameState();
        return;
      }
      
      // AI starting to think
      gameState.aiThinking = true;
      updateGameState();

      const aiResult = await stockfish.getBestMove(gameState.fen, gameState.aiEloRating, gameState.aiTimeLimit);

      if (aiResult && aiResult.move) {
        // AI found best move

        // Store evaluation if provided
        if (aiResult.evaluation) {
          evaluation = aiResult.evaluation;
        }

        const uciMove = parseUci(aiResult.move);
        if (uciMove && game.isLegal(uciMove)) {
          // AI making move
          // Reset aiThinking BEFORE making the move
          gameState.aiThinking = false;
          // AI moves also go through the same flow - sync to server
          handleMove(uciMove);
        } else {
          console.error('❌ AI generated an illegal move:', aiResult.move);
          gameState.aiThinking = false;
          updateGameState();
        }
      } else {
        // AI has no move to make
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
    
    // Force reactivity with new object
    gameState = {
      ...gameState,
      fen: newFen,
      turn: game.turn
    };
    
    checkGameStatus();
  }
  
  function getColorDisplayName(color) {
    return color === 'white' ? t.white : t.black;
  }

  async function handleNewGame(mode, playerColor, aiElo, aiTime, syncToServer = true) {
    console.log('🎮 CLIENT: handleNewGame called with:', { mode, playerColor, aiElo, aiTime, syncToServer });
    // Starting new game
    
    // Immediately clear UI state for better user experience
    uiState.selectedSquare = null;
    uiState.highlightedSquares = [];
    
    // Update local settings first - create new gameState to ensure reactivity
    gameState = {
      ...gameState,
      mode: mode,
      playerColor: playerColor,
      aiEloRating: aiElo,
      aiTimeLimit: aiTime
    };
    
    console.log('🎮 CLIENT: Updated gameState before sync:', gameState);
    
    // If we need to sync to server, do that and wait for server broadcast
    if (syncToServer) {
      await syncNewGameToServer();
      // Server will broadcast the reset, and we'll handle it in handleWebSocketMessage
      console.log('🎮 CLIENT: Sync to server completed, waiting for broadcast');
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
        aiTimeLimit: aiTime,
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
    // handleEndGame called
    
    if (reason === 'resign') {
      // Processing resignation
      
      // Set the winner to the opponent
      const resigningColor = gameState.turn;
      gameState.winner = resigningColor === 'white' ? 'black' : 'white';
      gameState.status = 'resigned'; // Use resigned status
      
      // Winner set by resignation
      
      // Clear any AI thinking state
      gameState.aiThinking = false;
      
      // Send resignation to server via WebSocket
      // Sending resignation to server
      
      try {
        webSocketStore.sendMessage({
          type: 'end_session',
          result: {
            winner: gameState.winner,
            reason: 'resignation'
          }
        });
        // Resignation message sent successfully
      } catch (error) {
        console.error('🏁 Error sending resignation:', error);
      }
      
      // Update the game state
      updateGameState();
      
      // Ensure we're not in replay mode
      showReplayMode = false;
      replayGameData = null;
    }
  }
  
  function handleResetAI() {
    // Resetting AI thinking state
    gameState.aiThinking = false;
  }

  async function analyzePosition() {
    // Starting position analysis
    isAnalyzing = true;
    analysisResult = null;
    
    try {
      const result = await stockfish.getBestMove(gameState.fen, 2600, 1000); // Use max ELO for analysis, 1 second
      // Analysis result received
      
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
        
        // Analysis complete
        
        // Highlight the best move on the board
        if (move) {
          uiState.highlightedSquares = [move.from, move.to];
          // Highlighted best move squares
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
    // Loading current game for replay
    
    if (gameState.moves.length === 0) {
      // No moves to replay
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
          // Using SAN for replay
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
            // Using UCI for replay (no SAN)
            return {
              uci: move.uci,
              from: from,
              to: to,
              promotion: move.uci.length > 4 ? move.uci.substring(4) : null,
              ply: move.ply || index + 1
            };
          }
        }
        
        // Invalid move found
        return null;
      } catch (error) {
        console.error('Error converting move for replay:', move, error);
        return null; // Skip problematic moves
      }
    }).filter(move => move !== null); // Remove null moves
    
    if (replayMoves.length === 0) {
      // No valid moves to replay
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
    // Closing replay mode
    showReplayMode = false;
    replayGameData = null;
  }
  
  function handleShowNewGameModal() {
    showGameModeModal = true;
  }
  
  function startNewGame() {
    console.log('🚀 CLIENT: startNewGame called');
    console.log('🚀 CLIENT: Modal settings:', { selectedMode, selectedPlayerColor, aiEloRating, aiTimeLimit });
    
    // Immediately clear UI state for better user experience
    uiState.selectedSquare = null;
    uiState.highlightedSquares = [];
    
    // Close the modal first
    showGameModeModal = false;
    
    // Reset any existing game over status
    gameState.status = 'playing';
    gameState.winner = null;
    
    console.log('🚀 CLIENT: Calling handleNewGame with:', selectedMode, selectedPlayerColor, aiEloRating, aiTimeLimit);
    handleNewGame(selectedMode, selectedPlayerColor, aiEloRating, aiTimeLimit);
  }
  
  function handleLoadSampleGame(gameType) {
    // Loading sample game
    
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

  function handlePgnReplayLoaded(moves, autoPlay, delayMs) {
    // Starting PGN replay
    
    if (!moves || !Array.isArray(moves) || moves.length === 0) {
      console.error('❌ No moves provided for replay');
      return;
    }
    
    // Close any existing replay first
    if (showReplayMode) {
      // Closing existing replay before starting new one
      showReplayMode = false;
      replayGameData = null;
      // Give UI time to cleanup
      setTimeout(() => startNewReplay(moves, autoPlay, delayMs), 100);
      return;
    }
    
    startNewReplay(moves, autoPlay, delayMs);
  }
  
  function startNewReplay(moves, autoPlay, delayMs) {
    // Reset the game to starting position
    game = Chess.default();
    gameState.fen = makeFen(game.toSetup());
    gameState.moves = [];
    gameState.currentMoveIndex = -1;
    gameState.turn = 'white';
    gameState.status = 'playing';
    updateGameState();
    
    // Convert SAN moves to our format
    const replayMoves = [];
    // Converting SAN moves to replay format
    
    for (let i = 0; i < moves.length; i++) {
      const sanMove = moves[i];
      try {
        // Parsing move
        const move = parseSan(game, sanMove);
        if (move) {
          const uci = makeUci(move);
          replayMoves.push({
            san: sanMove,
            uci: uci,
            from: move.from,
            to: move.to
          });
          // Apply move to game to continue parsing
          game.play(move);
          // Successfully parsed move
        } else {
          console.error(`    ❌ Failed to parse move ${i + 1}: "${sanMove}" - move is null`);
        }
      } catch (error) {
        console.error(`    ❌ Error parsing move ${i + 1}: "${sanMove}"`, error.message);
      }
    }
    
    // Converted moves for replay
    
    // Reset game again for replay
    game = Chess.default();
    updateGameState();
    
    // Set up replay data with auto-play settings
    replayGameData = {
      moves: replayMoves,
      title: 'MCP载入的PGN复盘',
      autoPlay: autoPlay,
      delayMs: delayMs
    };
    
    // Enter replay mode
    showReplayMode = true;
    // Replay mode activated
  }
  
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const pgnContent = e.target.result;
        // PGN content loaded
        
        const gameData = parsePGN(pgnContent);
        if (gameData && gameData.moves && gameData.moves.length > 0) {
          replayGameData = gameData;
          showReplayMode = true;
          // PGN loaded successfully
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
    // Parsing PGN content
    
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
      
      // PGN headers and moves extracted
      
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
            
            // Parsed PGN move
          } else {
            // Could not parse PGN move (invalid)
          }
        } catch (error) {
          // Could not parse PGN move
        }
      }
      
      const title = headers.Event || headers.White + ' vs ' + headers.Black || 'PGN Game';
      // PGN parsed successfully
      
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
  
  // Event handlers
  function handleModalClick(e) {
    if (e.target.classList.contains('modal-overlay')) {
      showGameModeModal = false;
    }
  }
  
  function handleModalContentClick(e) {
    e.stopPropagation();
  }
  
  function handlePresetClick(elo, time) {
    aiEloRating = elo;
    aiTimeLimit = time;
  }
  
  function handleTimePresetClick(time) {
    aiTimeLimit = time;
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
          clientName={clientName}
          clientId={clientId}
          connectedClients={connectedClients}
        />
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main-content">
    <div class="board-and-moves" style={boardGridStyle}>
      <div class="board-container">
        <div class="chess-board-wrapper">
          {#key boardKey}
            <ChessBoard
              fen={gameState.fen}
              turn={gameState.turn}
              boardWidth={computedBoardWidth}
              boardHeight={computedBoardHeight}
              onmove={(moveData) => {
                // Move event received
                
                // Don't allow moves if we're in replay mode
                if (showReplayMode) {
                  // Move blocked: in replay mode
                  return;
                }
                
                // ChessBoard sends a move object, but we need the raw move
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
          {/key}
          
          <!-- AI Thinking Overlay -->
          {#if gameState.aiThinking}
            <div class="ai-thinking-overlay">
              <div class="ai-thinking-message">
                <div class="ai-thinking-spinner"></div>
                <span>AI正在思考...</span>
              </div>
            </div>
          {/if}
          
          <!-- Game Over Overlay -->
          {#if gameState.status === 'checkmate' || gameState.status === 'stalemate' || gameState.status === 'draw' || gameState.status === 'resigned'}
            <div class="game-over-overlay">
              <div class="game-over-message">
                {#if gameState.status === 'checkmate' || gameState.status === 'resigned'}
                  <h2>🏆 游戏结束</h2>
                  <p>{getColorDisplayName(gameState.winner)} 获胜！</p>
                  {#if gameState.status === 'resigned'}
                    <p class="resign-info">{getColorDisplayName(gameState.winner === 'white' ? 'black' : 'white')} 认输</p>
                  {/if}
                {:else if gameState.status === 'stalemate'}
                  <h2>🤝 和棋</h2>
                  <p>逼和 - 没有合法着法</p>
                {:else}
                  <h2>🤝 和棋</h2>
                  <p>游戏以平局结束</p>
                {/if}
                <button 
                  class="btn btn-primary"
                  onclick={handleShowNewGameModal}
                >
                  开始新游戏
                </button>
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
            <button class="btn btn-secondary" onclick={handleCloseReplay}>
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
    <div class="modal-overlay" onclick={handleModalClick}>
      <div class="modal" onclick={handleModalContentClick}>
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
                  <button type="button" class="preset-btn" onclick={() => handleTimePresetClick(200)}>
                    {t.instant || 'Instant'} (0.2s)
                  </button>
                  <button type="button" class="preset-btn" onclick={() => handleTimePresetClick(500)}>
                    {t.fast || 'Fast'} (0.5s)
                  </button>
                  <button type="button" class="preset-btn" onclick={() => handleTimePresetClick(1000)}>
                    {t.normal || 'Normal'} (1s)
                  </button>
                  <button type="button" class="preset-btn" onclick={() => handleTimePresetClick(3000)}>
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
                  <button type="button" class="combo-btn" onclick={() => handlePresetClick(1000, 200)}>
                    📚 {t.beginner || 'Beginner'}<br/>
                    <small>1000 ELO • 0.2s</small>
                  </button>
                  <button type="button" class="combo-btn" onclick={() => handlePresetClick(1500, 500)}>
                    🎯 {t.intermediate || 'Intermediate'}<br/>
                    <small>1500 ELO • 0.5s</small>
                  </button>
                  <button type="button" class="combo-btn" onclick={() => handlePresetClick(2000, 1000)}>
                    🏆 {t.advanced || 'Advanced'}<br/>
                    <small>2000 ELO • 1s</small>
                  </button>
                  <button type="button" class="combo-btn" onclick={() => handlePresetClick(2500, 3000)}>
                    👑 {t.master || 'Master'}<br/>
                    <small>2500 ELO • 3s</small>
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="modal-actions">
          <button class="btn btn-secondary" onclick={() => showGameModeModal = false}>
            {t.cancel}
          </button>
          <button class="btn btn-primary" onclick={startNewGame}>
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