<script>
  import { onMount, onDestroy } from 'svelte';
  import { Chess } from 'chessops/chess';
  import { parseFen, makeFen } from 'chessops/fen';
  import { parseUci, makeUci } from 'chessops/util';
  import { parseSquare } from 'chessops/util';
  import { makeSan } from 'chessops/san';
  import { chessgroundDests, chessgroundMove } from 'chessops/compat';

  export let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  export let turn = 'white';
  export let highlightedSquares = [];
  export let disabled = false;
  export let gameMode = 'human_vs_human';
  export let playerColor = 'white';
  export let aiThinking = false;
  export let gameStatus = 'playing';
  export let replayMode = false;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  let boardElement;
  let chessground;
  let chess;

  function getMovableColor() {
    if (disabled || aiThinking || gameStatus !== 'playing' || replayMode) return undefined;
    
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
        }
      });

      console.log('Chessground initialized with chessops');
    } catch (error) {
      console.error('Failed to load Chessground:', error);
      showTextBoard();
    }
  });

  onDestroy(() => {
    if (chessground) {
      chessground.destroy();
    }
  });

  function handleMove(orig, dest, metadata) {
    console.log('Move attempted:', orig, 'to', dest, 'metadata:', metadata);
    
    try {
      // Create basic move object
      let moveUci = orig + dest;
      
      // Check if this is a promotion move and add promotion piece
      if (needsPromotion(orig, dest)) {
        moveUci += 'q'; // Default to queen promotion
        console.log('Promotion detected, move UCI:', moveUci);
      }
      
      // Parse the move using chessops
      const move = parseUci(moveUci);
      if (!move) {
        console.error('Failed to parse UCI move:', moveUci);
        updateBoard();
        return;
      }
      
      console.log('Parsed move:', move);
      
      // Validate and make the move
      if (chess.isLegal(move)) {
        console.log('Move is legal, executing...');
        
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
        
        console.log('Legal move made:', moveObj);
        dispatch('move', moveObj);
      } else {
        console.log('Illegal move attempted:', moveUci);
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

  // Reactive updates - combined to avoid conflicts
  $: if (chessground) {
    try {
      // Update chess position from FEN if it changed
      const setup = parseFen(fen).unwrap();
      chess = Chess.fromSetup(setup).unwrap();
      
      // Update the board with new position and movable state
      chessground.set({
        fen: fen,
        turnColor: setup.turn === 'white' ? 'white' : 'black',
        movable: {
          color: getMovableColor(),
          dests: chessgroundDests(chess)
        }
      });
    } catch (error) {
      console.error('Error updating board:', error);
    }
  }
</script>

<div class="chess-board-container">
  <div class="board-wrapper">
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
    width: 512px;
    height: 512px;
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

  /* Import Chessground styles */
  :global(.cg-wrap) {
    width: 100% !important;
    height: 100% !important;
    position: relative;
  }
  
  :global(.cg-container) {
    width: 100% !important;
    height: 100% !important;
  }
  
  :global(.cg-board) {
    width: 100% !important;
    height: 100% !important;
  }
</style> 