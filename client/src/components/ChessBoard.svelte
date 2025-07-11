<script>
  import { onMount } from 'svelte';
  import { Chess } from 'chessops/chess';
  import { parseFen, makeFen } from 'chessops/fen';
  import { parseUci, parseSquare } from 'chessops/util';
  import { makeSan } from 'chessops/san';
  import { chessgroundDests } from 'chessops/compat';

  let {
    fen = $bindable('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
    turn = 'white',
    highlightedSquares = [],
    disabled = false,
    gameMode = 'human_vs_human',
    playerColor = 'white',
    aiThinking = false,
    gameStatus = 'playing',
    replayMode = false,
    boardWidth = 512,
    boardHeight = 512,
    onmove = () => {} // Event handler prop for Svelte 5
  } = $props();

  let boardElement = $state();
  let chessground = $state();
  let chess = $state();

  function getMovableColor() {
    if (disabled || aiThinking || gameStatus !== 'playing' || replayMode) {
      return undefined;
    }
    
    if (gameMode === 'human_vs_human') {
      return turn === 'white' ? 'white' : 'black';
    } else if (gameMode === 'human_vs_ai') {
      // Only allow player to move their own pieces
      if (turn === playerColor) {
        return playerColor === 'white' ? 'white' : 'black';
      } else {
        return undefined; // AI's turn, disable moves
      }
    }
    
    return turn === 'white' ? 'white' : 'black';
  }

  onMount(async () => {
    try {
      const { Chessground } = await import('chessground');
      
      // Initialize chess position
      const setup = parseFen(fen).unwrap();
      chess = Chess.fromSetup(setup).unwrap();
      
      chessground = Chessground(boardElement, {
        fen: fen,
        turnColor: turn === 'white' ? 'white' : 'black',
        movable: {
          free: false,
          color: getMovableColor(),
          dests: chessgroundDests(chess),
        },
        events: {
          move: handleMove
        },
        lastMove: highlightedSquares.length >= 2 ? [highlightedSquares[0], highlightedSquares[1]] : undefined
      });
      
      // Add brown theme class to the cg-wrap element
      const cgWrap = boardElement.querySelector('.cg-wrap');
      if (cgWrap) {
        cgWrap.classList.add('brown');
      }
      
      // ResizeObserver is handled internally by chessground
      // No need for manual resize handling

      // Chessground initialized with chessops
    } catch (error) {
      console.error('Failed to load Chessground:', error);
      showTextBoard();
    }

    // Cleanup
    return () => {
      if (chessground) {
        chessground.destroy();
      }
    };
  });

  // Cleanup is now handled in onMount return
  // onDestroy is removed in Svelte 5
  
  // Track previous FEN to avoid unnecessary updates
  let previousFen = $state('');
  
  // Set up reactive updates - must be at component level
  $effect(() => {
    if (chessground && fen && fen !== previousFen) {
      try {
        // Update chess position from FEN if it changed
        const setup = parseFen(fen).unwrap();
        chess = Chess.fromSetup(setup).unwrap();
        
        const movableColor = getMovableColor();
        
        // Update the board with new position and movable state
        chessground.set({
          fen: fen,
          turnColor: turn === 'white' ? 'white' : 'black',  // Use the turn prop, not setup.turn
          movable: {
            color: movableColor,
            dests: chessgroundDests(chess)
          },
          lastMove: highlightedSquares.length >= 2 ? [highlightedSquares[0], highlightedSquares[1]] : undefined
        });
        
        // Update previous FEN to avoid re-running
        previousFen = fen;
      } catch (error) {
        console.error('Error updating board:', error);
      }
    } else if (chessground && fen === previousFen) {
      // FEN hasn't changed, but other props might have (turn, gameMode, etc)
      const movableColor = getMovableColor();
      if (chessground.state.movable.color !== movableColor) {
        chessground.set({
          movable: {
            color: movableColor,
            dests: chess ? chessgroundDests(chess) : new Map()
          }
        });
      }
    }
  });

  function handleMove(orig, dest, metadata) {
    // Move attempted
    
    try {
      // Create basic move object
      let moveUci = orig + dest;
      
      // Check if this is a promotion move and add promotion piece
      if (needsPromotion(orig, dest)) {
        moveUci += 'q'; // Default to queen promotion
        // Promotion detected
      }
      
      // Parse the move using chessops
      const move = parseUci(moveUci);
      if (!move) {
        console.error('Failed to parse UCI move:', moveUci);
        updateBoard();
        return;
      }
      
      // Parsed move
      
      // Validate and make the move
      if (chess.isLegal(move)) {
        // Move is legal, executing
        
        // Get SAN notation before making the move
        const san = makeSan(chess, move);
        
        // Make the move
        chess.play(move);
        
        // Update FEN
        const newFen = makeFen(chess.toSetup());
        
        // Create move object
        const moveObj = {
          from: orig,
          to: dest,
          san: san,
          uci: moveUci,
          after: newFen,
          promotion: move.promotion || null
        };
        
        // Legal move made
        onmove(moveObj);
      } else {
        // Illegal move attempted
        // Reset the board position
        updateBoard();
      }
    } catch (error) {
      console.error('Error handling move:', error);
      updateBoard();
    }
  }

  function needsPromotion(from, to) {
    try {
      const fromRank = parseInt(from[1]);
      const toRank = parseInt(to[1]);
      
      // Get the piece at the from square using parseSquare
      const fromSquareIndex = parseSquare(from);
      if (fromSquareIndex === undefined) return false;
      
      const piece = chess.board.get(fromSquareIndex);
      
      if (!piece || piece.role !== 'pawn') return false;
      
      // Check if pawn is moving to promotion rank
      return (piece.color === 'white' && fromRank === 7 && toRank === 8) ||
             (piece.color === 'black' && fromRank === 2 && toRank === 1);
    } catch (error) {
      console.error('Error in needsPromotion:', error);
      return false;
    }
  }

  function updateBoard() {
    if (!chessground || !chess) return;
    
    const setup = chess.toSetup();
    const newFen = makeFen(setup);
    
    chessground.set({
      fen: newFen,
      turnColor: setup.turn === 'white' ? 'white' : 'black',
      movable: {
        color: getMovableColor(),
        dests: chessgroundDests(chess)
      }
    });
  }

  function showTextBoard() {
    if (!boardElement) return;
    
    boardElement.innerHTML = `
      <div style="font-family: monospace; font-size: 14px; line-height: 1.2;">
        <p>Chess board (text representation):</p>
        <pre>${fen}</pre>
        <p>Turn: ${turn}</p>
        <p>Chessground failed to load. Please refresh the page.</p>
      </div>
    `;
  }

  // Reactive updates are now handled inside onMount
  
  
</script>

<div class="chess-board-container">
  <div class="board-wrapper" style="width: {boardWidth}px; height: {boardHeight}px; --board-size: {boardWidth}px;">
    <div bind:this={boardElement} class="chess-board"></div>
    {#if aiThinking}
      <div class="ai-thinking-overlay">
        <div class="thinking-indicator">
          <div class="spinner"></div>
          <span>AI thinking...</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .chess-board-container {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  .board-wrapper {
    position: relative;
    /* width & height will be set via inline style for flexibility */
    aspect-ratio: 1; /* Ensure square aspect ratio */
  }

  .chess-board {
    width: 100%;
    height: 100%;
  }

  .ai-thinking-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 4px;
  }

  .thinking-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: white;
    font-size: 16px;
    font-weight: 500;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12px;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Chessground must fill parent container */
  :global(.board-wrapper > .chess-board > .cg-wrap) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>