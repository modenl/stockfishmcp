<script>
  import { onMount, onDestroy } from 'svelte';
  import ChessBoard from './components/ChessBoard.svelte';
  import EvaluationBar from './components/EvaluationBar.svelte';

  import ControlPanel from './components/ControlPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import GameReplay from './components/GameReplay.svelte';
  import { webSocketStore } from './stores/websocket.js';
  import stockfish, { engineReady, engineStatus } from './lib/stockfish.js';
  import { sessionStore } from './stores/session.js';
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
  let unsubscribeSession;

  onMount(() => {
    // stockfish service initializes itself automatically.
    unsubscribeWS = webSocketStore.subscribe(({ lastMessage }) => {
      if (lastMessage) handleWebSocketMessage(lastMessage);
    });
    unsubscribeSession = sessionStore.subscribe(s => {}); // Keep session logic if needed
    
    // Connect to WebSocket server
    const wsUrl = `ws://${window.location.hostname}:3456`;
    console.log('🔌 Connecting to WebSocket:', wsUrl);
    webSocketStore.connect(wsUrl);
    
    // Test engine when ready
    setTimeout(async () => {
      console.log('🧪 Engine status check...');
      console.log('Engine ready store value:', $engineReady);
      console.log('Engine status store value:', $engineStatus);
      
      if ($engineReady) {
        try {
          await stockfish.testEngine();
        } catch (error) {
          console.error('🧪 Engine test failed:', error);
        }
      }
    }, 3000);
  });

  onDestroy(() => {
    if (unsubscribeWS) unsubscribeWS();
    if (unsubscribeSession) unsubscribeSession();
    stockfish.destroy();
  });

  function handleWebSocketMessage(message) {
    // Handle websocket messages if you have a server component
  }

  function handleMove(move, isAIMove = false) {
    try {
      const newGame = game.clone();
      newGame.play(move);
      
      game = newGame;
      gameState.fen = makeFen(game.toSetup());
      gameState.turn = game.turn === 'white' ? 'white' : 'black';
      gameState.moves = [...gameState.moves, move];
      gameState.currentMoveIndex++;

      // Check for game ending conditions
      checkGameStatus();

      // Check if it's AI's turn to move (but not if this was already an AI move)
      // Also don't trigger AI if we're in replay mode
      if (!isAIMove && !showReplayMode && gameState.mode === 'human_vs_ai' && gameState.turn !== gameState.playerColor && gameState.status === 'playing') {
        console.log('🤖 AI turn detected, making AI move...');
        setTimeout(() => makeAIMove(), 100); // Small delay for UI update
      }
    } catch (e) {
      console.error("Invalid move:", move, e);
      return;
    }
  }
  
  function checkGameStatus() {
    const isInCheck = game.isCheck();
    const isCheckmate = game.isCheckmate();
    const isStalemate = game.isStalemate();
    const isDraw = game.isInsufficientMaterial() || game.isStalemate();
    
    console.log('🔍 Game status check:', {
      inCheck: isInCheck,
      checkmate: isCheckmate,
      stalemate: isStalemate,
      draw: isDraw,
      turn: gameState.turn
    });

    if (isCheckmate) {
      gameState.status = 'checkmate';
      gameState.winner = gameState.turn === 'white' ? 'black' : 'white'; // The other player wins
      console.log('♔ Checkmate! Winner:', gameState.winner);
    } else if (isStalemate) {
      gameState.status = 'stalemate';
      gameState.winner = null;
      console.log('🤝 Stalemate - Draw!');
    } else if (isDraw) {
      gameState.status = 'draw';
      gameState.winner = null;
      console.log('🤝 Draw!');
    } else {
      gameState.status = 'playing';
      gameState.winner = null;
      if (isInCheck) {
        console.log('⚠️ Check!');
      }
    }
    
    gameState.inCheck = isInCheck;
  }

  async function makeAIMove() {
    console.log('🤖 Making AI move...');
    
    // Don't make AI moves if already thinking
    if (gameState.aiThinking) {
      console.log('🚫 AI move blocked: already thinking');
      return;
    }
    
    // Don't make AI moves if we're in replay mode
    if (showReplayMode) {
      console.log('🚫 AI move blocked: in replay mode');
      return;
    }
    
    // Don't make AI moves if game is not in playing state
    if (gameState.status !== 'playing') {
      console.log('🚫 AI move blocked: game not playing');
      return;
    }
    
    console.log('Current game state:', {
      fen: gameState.fen,
      turn: gameState.turn,
      playerColor: gameState.playerColor,
      mode: gameState.mode,
      elo: gameState.aiEloRating
    });
    
    gameState.aiThinking = true;
    try {
      const result = await stockfish.getBestMove(gameState.fen, gameState.aiEloRating, gameState.aiTimeLimit);
      console.log('🎯 AI move result:', result);
      
      if (result && result.move) {
        // Parse the UCI move and apply it
        const uciMove = parseUci(result.move);
        console.log('📝 Parsed UCI move:', uciMove);
        if (uciMove) {
          // Update evaluation with AI's assessment
          if (result.evaluation) {
            evaluation = result.evaluation;
            evaluation.bestMove = result.move;
            console.log('📊 Updated evaluation:', evaluation);
          }
          
          handleMove(uciMove, true); // Mark as AI move to prevent infinite loop
        } else {
          console.error('❌ Failed to parse UCI move:', result.move);
        }
      } else {
        console.error('❌ No move returned from AI');
      }
    } catch (e) {
      console.error("❌ Error getting AI move:", e);
    } finally {
      gameState.aiThinking = false;
    }
  }

  function handleNewGame(mode, playerColor, aiEloRating, aiTimeLimit) {
    console.log('🎮 Starting new game:', { mode, playerColor, aiEloRating, aiTimeLimit });
    
    // Reset to starting position
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const setup = parseFen(startingFen).unwrap();
    game = Chess.fromSetup(setup).unwrap();
    
    gameState = {
      fen: startingFen,
      moves: [],
      currentMoveIndex: -1,
      turn: 'white',
      status: 'playing',
      mode,
      playerColor,
      aiThinking: false,
      aiEloRating,
      aiTimeLimit,
      inCheck: false,
      winner: null,
    };
    
    console.log('🎮 Game state updated:', gameState);
    
    if (mode === 'human_vs_ai' && playerColor === 'black') {
      console.log('🤖 Player chose black, AI should move first');
      setTimeout(() => makeAIMove(), 500); // Give UI time to update
    }
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
</style>