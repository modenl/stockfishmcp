<script>
  import { onMount } from 'svelte';
  import { Chess } from 'chessops/chess';
  import { parseFen, makeFen } from 'chessops/fen';
  import { parseUci } from 'chessops/util';
  import { parseSan, makeSan } from 'chessops/san';
  import { chessgroundDests } from 'chessops/compat';
  import { languageStore } from '../stores/language.js';

  let {
    gameData = null,
    onClose = () => {}
  } = $props();

  let chess = $state();
  let currentMoveIndex = $state(-1);
  let moves = $state([]);
  let positions = $state([]);
  let isPlaying = $state(false);
  let playInterval = $state(null);
  let playSpeed = $state(gameData?.delayMs || 1000);
  let chessground = $state();
  let boardElement = $state();
  
  let showLastMove = $state(true);
  let showCheck = $state(true);
  let showMoveAnimation = $state(true);
  let showShapes = $state(true);
  let boardOrientation = $state('white');

  let currentLang = $derived($languageStore);
  let t = $derived(languageStore.translations[currentLang]);

  onMount(async () => {
    const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const setup = parseFen(startingFen).unwrap();
    chess = Chess.fromSetup(setup).unwrap();
    
    if (gameData && gameData.moves) {
      moves = gameData.moves;
      positions = [startingFen];
      
      const tempChess = Chess.fromSetup(setup).unwrap();
      
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        try {
          let parsedMove;
          
          if (move.uci) {
            parsedMove = parseUci(move.uci);
          } else if (move.from && move.to) {
            parsedMove = parseUci(move.from + move.to + (move.promotion || ''));
          } else if (move.san) {
            parsedMove = parseSan(tempChess, move.san);
          }
          
          if (parsedMove && tempChess.isLegal(parsedMove)) {
            tempChess.play(parsedMove);
            const newFen = makeFen(tempChess.toSetup());
            positions.push(newFen);
          } else {
            positions.push(makeFen(tempChess.toSetup()));
          }
        } catch (error) {
          console.error('Error replaying move:', move, error);
          positions.push(makeFen(tempChess.toSetup()));
        }
      }
    }
    
    try {
      const { Chessground } = await import('chessground');
      
      chessground = Chessground(boardElement, {
        fen: startingFen,
        orientation: boardOrientation,
        turnColor: 'white',
        movable: {
          free: false,
          color: undefined,
          dests: new Map()
        },
        viewOnly: true,
        coordinates: true,
        drawable: {
          enabled: true,
          visible: showShapes
        },
        animation: {
          enabled: showMoveAnimation,
          duration: 200
        },
        highlight: {
          lastMove: showLastMove,
          check: showCheck
        },
        check: false
      });
      
      if (gameData?.autoPlay && moves.length > 0) {
        setTimeout(() => {
          toggleAutoPlay();
        }, 100);
      }
    } catch (error) {
      console.error('Failed to load Chessground:', error);
    }

    // Cleanup
    return () => {
      if (playInterval) {
        clearInterval(playInterval);
      }
      if (chessground) {
        chessground.destroy();
      }
    };
  });

  // Cleanup will be handled in onMount return

  function goToMove(moveIndex) {
    if (moveIndex < -1 || moveIndex >= moves.length) {
      return;
    }
    
    currentMoveIndex = moveIndex;
    const targetFen = positions[moveIndex + 1] || positions[0];
    
    try {
      const setup = parseFen(targetFen).unwrap();
      chess = Chess.fromSetup(setup).unwrap();
      
      const isInCheck = chess.isCheck();
      
      if (chessground) {
        chessground.set({
          fen: targetFen,
          turnColor: setup.turn === 'white' ? 'white' : 'black',
          check: showCheck && isInCheck,
          movable: {
            free: false,
            color: undefined,
            dests: chessgroundDests(chess)
          }
        });
      }

      if (moveIndex >= 0 && showLastMove && moves[moveIndex]) {
        const move = moves[moveIndex];
        
        if (move.uci && typeof move.uci === 'string' && move.uci.length >= 4) {
          try {
            const from = move.uci.substring(0, 2);
            const to = move.uci.substring(2, 4);
            if (/^[a-h][1-8]$/.test(from) && /^[a-h][1-8]$/.test(to)) {
              if (chessground) {
                chessground.set({ lastMove: [from, to] });
              }
            }
          } catch (e) {
            console.error('Error parsing UCI for lastMove:', e);
          }
        } else if (move.from && move.to && 
                   typeof move.from === 'string' && 
                   typeof move.to === 'string') {
          if (/^[a-h][1-8]$/.test(move.from) && /^[a-h][1-8]$/.test(move.to)) {
            if (chessground) {
              chessground.set({ lastMove: [move.from, move.to] });
            }
          }
        }
      } else {
        if (chessground) {
          chessground.set({ lastMove: undefined });
        }
      }

      if (showShapes) {
        updateShapes(moveIndex);
      }

    } catch (error) {
      console.error('Error going to move:', error);
    }
  }

  function goToStart() {
    goToMove(-1);
  }

  function goToPrevious() {
    if (currentMoveIndex > -1) {
      goToMove(currentMoveIndex - 1);
    }
  }

  function goToNext() {
    if (currentMoveIndex < moves.length - 1) {
      goToMove(currentMoveIndex + 1);
    }
  }

  function goToEnd() {
    if (moves.length > 0) {
      goToMove(moves.length - 1);
    }
  }

  function toggleAutoPlay() {
    if (isPlaying) {
      clearInterval(playInterval);
      isPlaying = false;
    } else {
      isPlaying = true;
      playInterval = setInterval(() => {
        if (currentMoveIndex < moves.length - 1) {
          goToNext();
        } else {
          clearInterval(playInterval);
          isPlaying = false;
        }
      }, playSpeed);
    }
  }

  function setPlaySpeed(speed) {
    playSpeed = speed;
    if (isPlaying) {
      clearInterval(playInterval);
      toggleAutoPlay();
    }
  }

  function flipBoard() {
    boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
    if (chessground) {
      chessground.set({ orientation: boardOrientation });
    }
  }

  function toggleLastMove() {
    showLastMove = !showLastMove;
    if (chessground) {
      chessground.set({
        highlight: { 
          lastMove: showLastMove,
          check: showCheck 
        }
      });
    }
    goToMove(currentMoveIndex);
  }

  function toggleCheck() {
    showCheck = !showCheck;
    if (chessground) {
      chessground.set({
        highlight: { 
          lastMove: showLastMove,
          check: showCheck 
        }
      });
    }
    goToMove(currentMoveIndex);
  }

  function toggleAnimation() {
    showMoveAnimation = !showMoveAnimation;
    if (chessground) {
      chessground.set({
        animation: { 
          enabled: showMoveAnimation,
          duration: 200 
        }
      });
    }
  }

  function toggleShapes() {
    showShapes = !showShapes;
    if (chessground) {
      chessground.set({
        drawable: { 
          enabled: true,
          visible: showShapes 
        }
      });
      if (showShapes) {
        updateShapes(currentMoveIndex);
      } else {
        chessground.setShapes([]);
      }
    }
  }

  function updateShapes(moveIndex) {
    if (!showShapes || moveIndex < 0) return;
    
    const shapes = [];
    const move = moves[moveIndex];
    
    if (move) {
      let from, to;
      
      if (move.uci && typeof move.uci === 'string' && move.uci.length >= 4) {
        from = move.uci.substring(0, 2);
        to = move.uci.substring(2, 4);
      } else if (move.from && move.to) {
        from = move.from;
        to = move.to;
      }
      
      if (from && to && 
          typeof from === 'string' && 
          typeof to === 'string' &&
          /^[a-h][1-8]$/.test(from) && 
          /^[a-h][1-8]$/.test(to)) {
        shapes.push({
          orig: from,
          dest: to,
          brush: 'green'
        });
        
        if (move.captured) {
          shapes.push({
            orig: to,
            brush: 'red'
          });
        }
      }
    }
    
    if (chessground) {
      chessground.setShapes(shapes);
    }
  }

  function getMoveDisplayText(move, index) {
    const moveNumber = Math.floor(index / 2) + 1;
    const isWhite = index % 2 === 0;
    
    if (isWhite) {
      return `${moveNumber}.${move.san || move.uci}`;
    } else {
      return move.san || move.uci;
    }
  }

  function getGameResult() {
    if (!gameData || !gameData.result) return '';
    
    switch (gameData.result) {
      case '1-0': return t?.gameResult?.whiteWins || 'White wins';
      case '0-1': return t?.gameResult?.blackWins || 'Black wins'; 
      case '1/2-1/2': return t?.gameResult?.draw || 'Draw';
      default: return gameData.result;
    }
  }
</script>

<div class="game-replay">
  <div class="replay-header">
    <h3>{t?.gameReplay || 'Game Replay'}</h3>
    <div class="header-controls">
      <div class="visual-controls">
        <button class="control-btn small" onclick={flipBoard} title="翻转棋盘 / Flip Board">
          🔄
        </button>
        <button class="control-btn small" class:active={showShapes} onclick={toggleShapes} title="显示/隐藏箭头 / Show/Hide Arrows">
          🎯
        </button>
        <button class="control-btn small" class:active={showMoveAnimation} onclick={toggleAnimation} title="开启/关闭动画 / Toggle Animation">
          ✨
        </button>
        <button class="control-btn small" class:active={showLastMove} onclick={toggleLastMove} title="显示/隐藏最后一步 / Show/Hide Last Move">
          📍
        </button>
        <button class="control-btn small" class:active={showCheck} onclick={toggleCheck} title="显示/隐藏将军 / Show/Hide Check">
          👑
        </button>
      </div>
      <button class="close-btn" onclick={onClose}>
        ✕
      </button>
    </div>
  </div>

  <div class="replay-content">
    <div class="board-section">
      <div class="board-container">
        <div bind:this={boardElement} class="chess-board"></div>
      </div>
      
      <div class="playback-controls">
        <button class="control-btn" onclick={goToStart} disabled={currentMoveIndex === -1}>
          ⏮
        </button>
        <button class="control-btn" onclick={goToPrevious} disabled={currentMoveIndex === -1}>
          ⏪
        </button>
        <button class="control-btn play-btn" onclick={toggleAutoPlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button class="control-btn" onclick={goToNext} disabled={currentMoveIndex >= moves.length - 1}>
          ⏩
        </button>
        <button class="control-btn" onclick={goToEnd} disabled={currentMoveIndex >= moves.length - 1}>
          ⏭
        </button>
      </div>

      <div class="speed-controls">
        <label for="speed-select">{t?.playSpeed || 'Speed'}:</label>
        <select id="speed-select" bind:value={playSpeed} onchange={() => setPlaySpeed(playSpeed)}>
          <option value={2000}>0.5x</option>
          <option value={1000}>1x</option>
          <option value={500}>2x</option>
          <option value={250}>4x</option>
        </select>
      </div>

      <div class="position-info">
        <div class="move-counter">
          {t?.move || 'Move'}: {currentMoveIndex + 1} / {moves.length}
        </div>
        {#if currentMoveIndex >= 0}
          <div class="current-move">
            {getMoveDisplayText(moves[currentMoveIndex], currentMoveIndex)}
          </div>
        {:else}
          <div class="current-move">
            {t?.startingPosition || 'Starting Position'}
          </div>
        {/if}
        <div class="board-orientation">
          {t?.viewing || 'Viewing'}: {boardOrientation === 'white' ? (t?.white || 'White') : (t?.black || 'Black')}
        </div>
      </div>
    </div>

    <div class="moves-section">
      <h4>{t?.moveHistory || 'Move History'}</h4>
      <div class="moves-list">
        <div class="move-item starting-position" 
             class:active={currentMoveIndex === -1}
             onclick={() => goToMove(-1)}>
          <span class="move-number">0.</span>
          <span class="move-notation">{t?.startingPosition || 'Starting Position'}</span>
        </div>
        
        {#each moves as move, index}
          <div class="move-item"
               class:active={currentMoveIndex === index}
               class:white={index % 2 === 0}
               class:black={index % 2 === 1}
               onclick={() => goToMove(index)}>
            <span class="move-number">
              {#if index % 2 === 0}
                {Math.floor(index / 2) + 1}.
              {/if}
            </span>
            <span class="move-notation">
              {getMoveDisplayText(move, index)}
            </span>
            {#if move.comments && move.comments.length > 0}
              <span class="move-comment">{move.comments[0]}</span>
            {/if}
            {#if move.san}
              {#if move.san.includes('+')}
                <span class="move-symbol check">+</span>
              {/if}
              {#if move.san.includes('#')}
                <span class="move-symbol mate">#</span>
              {/if}
              {#if move.san.includes('O-O')}
                <span class="move-symbol castle">♜</span>
              {/if}
              {#if move.san.includes('=')}
                <span class="move-symbol promotion">♕</span>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </div>

  {#if gameData}
    <div class="game-info">
      <div class="game-header">
        <h4>{t?.gameInformation || 'Game Information'}</h4>
      </div>
      <div class="info-grid">
        {#if gameData.white}
          <div class="info-item">
            <span class="info-label">{t?.white || 'White'}:</span>
            <span class="info-value">{gameData.white}</span>
          </div>
        {/if}
        {#if gameData.black}
          <div class="info-item">
            <span class="info-label">{t?.black || 'Black'}:</span>
            <span class="info-value">{gameData.black}</span>
          </div>
        {/if}
        {#if gameData.result}
          <div class="info-item">
            <span class="info-label">{t?.result || 'Result'}:</span>
            <span class="info-value">{getGameResult()}</span>
          </div>
        {/if}
        {#if gameData.date}
          <div class="info-item">
            <span class="info-label">{t?.date || 'Date'}:</span>
            <span class="info-value">{gameData.date}</span>
          </div>
        {/if}
        {#if gameData.event}
          <div class="info-item">
            <span class="info-label">{t?.event || 'Event'}:</span>
            <span class="info-value">{gameData.event}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .game-replay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    flex-direction: column;
    z-index: 999999;
    color: white;
  }

  .replay-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(255, 255, 255, 0.1);
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  }

  .replay-header h3 {
    margin: 0;
    font-size: 1.5rem;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .visual-controls {
    display: flex;
    gap: 0.5rem;
  }

  .control-btn.small {
    padding: 0.5rem;
    font-size: 1rem;
    min-width: 36px;
    height: 36px;
  }

  .control-btn.small.active {
    background: #4CAF50;
    color: white;
  }

  .close-btn {
    background: none;
    border: none;
    color: white;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .replay-content {
    display: flex;
    flex: 1;
    gap: 2rem;
    padding: 2rem;
    overflow: hidden;
  }

  .board-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .board-container {
    width: 512px;
    height: 512px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    overflow: hidden;
  }

  .chess-board {
    width: 100%;
    height: 100%;
  }
  
  :global(.board-container .cg-wrap) {
    width: 100% !important;
    height: 100% !important;
    position: relative;
  }

  .playback-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .control-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1.2rem;
    transition: all 0.2s;
    min-width: 50px;
  }

  .control-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-1px);
  }

  .control-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .play-btn {
    background: #4CAF50;
    font-size: 1.4rem;
  }

  .play-btn:hover:not(:disabled) {
    background: #45a049;
  }

  .speed-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .speed-controls select {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
  }

  .position-info {
    text-align: center;
    font-size: 0.9rem;
  }

  .move-counter {
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  .current-move {
    font-family: monospace;
    font-size: 1.1rem;
  }

  .board-orientation {
    font-size: 0.8rem;
    opacity: 0.7;
    margin-top: 0.25rem;
  }

  .moves-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: 300px;
  }

  .moves-section h4 {
    margin: 0 0 1rem 0;
    font-size: 1.2rem;
  }

  .moves-list {
    flex: 1;
    overflow-y: auto;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
  }

  .move-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    margin: 0.1rem 0;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    font-family: monospace;
    font-size: 0.9rem;
  }

  .move-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .move-item.active {
    background: #4CAF50;
    color: white;
  }

  .move-item.starting-position {
    font-style: italic;
    color: #ccc;
  }

  .move-number {
    min-width: 2rem;
    font-weight: bold;
  }

  .move-notation {
    font-weight: 500;
  }

  .move-comment {
    font-size: 0.8rem;
    font-style: italic;
    color: rgba(255, 255, 255, 0.6);
    margin-left: 0.5rem;
  }

  .move-symbol {
    font-size: 0.8rem;
    padding: 0.2rem 0.4rem;
    border-radius: 3px;
    margin-left: 0.25rem;
  }

  .move-symbol.check {
    background: #ff9800;
    color: white;
  }

  .move-symbol.mate {
    background: #f44336;
    color: white;
  }

  .move-symbol.castle {
    background: #2196f3;
    color: white;
  }

  .move-symbol.promotion {
    background: #9c27b0;
    color: white;
  }

  .game-info {
    padding: 1rem 2rem;
    background: rgba(255, 255, 255, 0.05);
    border-top: 1px solid rgba(255, 255, 255, 0.2);
  }

  .game-header h4 {
    margin: 0 0 1rem 0;
    font-size: 1.1rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.5rem;
  }

  .info-item {
    display: flex;
    gap: 0.5rem;
  }

  .info-label {
    font-weight: bold;
    min-width: 4rem;
  }

  .info-value {
    color: #ccc;
  }

  @media (max-width: 768px) {
    .replay-content {
      flex-direction: column;
      padding: 1rem;
    }

    .board-container {
      width: 100%;
      max-width: 400px;
      height: auto;
      aspect-ratio: 1;
    }

    .moves-section {
      max-width: none;
      max-height: 200px;
    }
  }
</style>