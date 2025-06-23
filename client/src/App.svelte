<script>
  import { onMount, onDestroy } from 'svelte';
  import ChessBoard from './components/ChessBoard.svelte';
  import EvaluationBar from './components/EvaluationBar.svelte';

  import ControlPanel from './components/ControlPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import GameReplay from './components/GameReplay.svelte';
  import { webSocketStore } from './stores/websocket.js';
  import stockfish, { engineReady, engineStatus } from './lib/stockfish.js';
  import { Chess } from 'chessops/chess';
  import { makeFen, parseFen } from 'chessops/fen';
  import { makeUci, parseUci } from 'chessops/util';
  import './App.css';

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

  let sessionId = 'test_game_123'; // Default, update if your app uses a different session mechanism

  onMount(() => {
    // stockfish service initializes itself automatically.
    unsubscribeWS = webSocketStore.subscribe(({ lastMessage }) => {
      if (lastMessage) handleWebSocketMessage(lastMessage);
    });
    
    // Connect to WebSocket server
    const wsUrl = `ws://${window.location.hostname}:3456`;
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    webSocketStore.connect(wsUrl);
    
    // Join the session once connected
    setTimeout(() => {
      console.log('🔗 Joining WebSocket session: test_game_123');
      webSocketStore.sendMessage({
        type: 'join_session',
        sessionId: 'test_game_123'
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
    console.log('WebSocket message received in App.svelte:', message);
    // Only process messages that are objects and have a type
    if (!message || typeof message !== 'object' || !message.type) return;

    switch (message.type) {
      case 'mcp_move':
        // Only handle moves for the current session/game
        if (message.sessionId === 'test_game_123') {
          handleServerMove(message);
        }
        break;
      case 'mcp_game_reset':
        // Handle game reset from server
        if (message.gameId === 'test_game_123') {
          handleServerReset(message);
        }
        break;
      // You can add more cases for other message types if needed
      default:
        console.log('🤷 Unhandled WebSocket message type:', message.type);
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
      if (game.isLegal(uciMove)) {
        // Apply the move to local game state
        game.play(uciMove);
        updateGameState();
        
        console.log('✅ Move applied from server broadcast');
        
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
      }
    } catch (e) {
      console.error('Error processing remote move:', e);
    }
  }

  async function loadGameStateFromServer() {
    try {
      console.log('🔄 Loading game state from server...');
      const response = await fetch('/api/mcp/get_game_state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ game_id: 'test_game_123' })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('📊 Server game state loaded:', result);
        
        // Parse the game state from server response
        // The server returns a text message, we need to extract the FEN and moves
        if (result.message && result.message.includes('Current FEN:')) {
          const fenMatch = result.message.match(/Current FEN: ([^\n]+)/);
          const movesMatch = result.message.match(/Move History:\n([^\n]+)/);
          
          if (fenMatch) {
            const serverFen = fenMatch[1].trim();
            console.log('🎯 Server FEN:', serverFen);
            
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
                console.log('📝 Server move history:', moveHistory);
                // TODO: Parse and apply move history to gameState.moves
              }
              
              // Ensure UI is updated with the loaded state
              updateGameState();
              
              console.log('✅ Game state synchronized with server');
              
            } catch (e) {
              console.error('❌ Failed to parse server FEN:', e);
            }
          }
        }
      } else {
        console.error('❌ Failed to load game state from server');
      }
    } catch (error) {
      console.error('❌ Error loading game state from server:', error);
    }
  }

  async function syncMoveToServer(move, oldFen, newFen) {
    try {
      console.log('💾 Syncing move to server:', { move: move.san, uci: makeUci(move) });
      
      const response = await fetch('/api/mcp/make_move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          game_id: 'test_game_123', 
          move: makeUci(move)
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Move synced to server successfully');
      } else {
        console.error('❌ Failed to sync move to server');
      }
    } catch (error) {
      console.error('❌ Error syncing move to server:', error);
    }
  }

  async function syncNewGameToServer() {
    try {
      console.log('🎮 Syncing new game to server...');
      
      const response = await fetch('/api/mcp/reset_game', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ game_id: 'test_game_123' })
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

  async function handleMove(move) {
    console.log('🎯 Processing move:', move);
    if (!game) return;

    const oldFen = gameState.fen;
    
    // Calculate what the new FEN would be after this move
    const tempGame = game.clone();
    tempGame.play(move);
    const newFen = makeFen(tempGame.toSetup());
    
    // Always sync to server first, don't apply locally yet
    // The server will broadcast back and we'll apply it then
    await syncMoveToServer(move, oldFen, newFen);
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
        } else {
          console.error('❌ AI generated an illegal move:', aiResult.move);
        }
      } else {
        console.log('🤔 AI has no move to make.');
      }
    } catch (error) {
      console.error('❌ Error during AI move:', error);
    } finally {
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
      updateGameState();
    }
  }

  function handleBoardReset() {
    handleNewGame(gameState.mode, gameState.playerColor, gameState.aiEloRating, gameState.aiTimeLimit, true);
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
    if (gameState.moves.length === 0) {
      console.log('⚠️ No moves to replay');
      alert('当前游戏没有棋步可以复盘');
      return;
    }
    
    // Convert moves to format expected by replay
    const replayMoves = gameState.moves.map((move, index) => {
      try {
        const uci = makeUci(move);
        return {
          uci: uci,
          from: uci.substring(0, 2),
          to: uci.substring(2, 4),
          promotion: uci.length > 4 ? uci.substring(4) : null
        };
      } catch (error) {
        console.error('Error converting move for replay:', move, error);
        return {
          uci: 'e2e4',
          from: 'e2',
          to: 'e4'
        };
      }
    });
    
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
  

</script>

<main class="app-container">
  <div class="board-and-moves">
    <div class="board-container">
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
      <EvaluationBar evaluation={evaluation} />
    </div>
    <div class="side-panel">
      <!-- Only show ControlPanel when NOT in replay mode -->
      {#if !showReplayMode}
        <ControlPanel 
          {gameState}
          {analysisResult}
          {isAnalyzing}
          onNewGame={handleNewGame}
          onRequestAnalysis={analyzePosition}
          onLoadCurrentGame={handleLoadCurrentGame}
          onLoadSampleGame={handleLoadSampleGame}
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
  <StatusBar
    connectionStatus={$webSocketStore.connectionStatus}
    engineReady={$engineReady}
    engineStatus={$engineStatus}
    gameStatus={gameState.status}
    turn={gameState.turn}
    aiThinking={gameState.aiThinking}
    inCheck={gameState.inCheck}
    sessionId={sessionId}
  />

  
  <!-- Game Replay Modal -->
  {#if showReplayMode && replayGameData}
    <GameReplay 
      gameData={replayGameData}
      onClose={handleCloseReplay}
    />
  {/if}
</main>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 1rem;
    box-sizing: border-box;
    background-color: #2c2f33;
    color: white;
  }
  .board-and-moves {
    display: flex;
    gap: 1rem;
    flex-grow: 1;
    min-height: 0;
  }
  .board-container {
    flex-basis: 70%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    flex-grow: 1;
    flex-shrink: 1;
  }
  .side-panel {
    flex-basis: 30%;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background-color: #23272a;
    padding: 1rem;
    border-radius: 8px;
    overflow-y: auto;
  }
  
  .replay-info {
    background: var(--surface-secondary, #2c2f33);
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
  }
  
  .replay-info h3 {
    margin: 0 0 1rem 0;
    color: var(--primary, #5865f2);
  }
  
  .replay-info p {
    margin: 0 0 1.5rem 0;
    color: var(--text-secondary, #ccc);
  }
  
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s ease;
  }
  
  .btn-secondary {
    background: var(--surface-hover, #3a3d42);
    color: white;
  }
  
  .btn-secondary:hover {
    background: var(--border, #444);
  }

  main {
    flex-grow: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
</style>