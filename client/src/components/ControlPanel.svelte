<script>
  import { languageStore } from '../stores/language.js';
  
  export let gameState;
  export let analysisResult = null;
  export let isAnalyzing = false;
  export let onNewGame = () => {};
  export let onEndGame = () => {};
  export let onRequestAnalysis = () => {};
  export let onLoadCurrentGame = () => {};
  export let onLoadSampleGame = () => {};
  export let onFileUpload = () => {};
  export let onResetAI = () => {};
  export let onShowNewGameModal = () => {};


  let showLanguageSettings = false;
  let showReplayMenu = false;
  let fileInput;
  
  $: currentLang = $languageStore;
  $: t = languageStore.translations[currentLang];

  function handleNewGameClick() {
    onShowNewGameModal();
  }



  function getModeDisplayName(mode) {
    switch (mode) {
      case 'human_vs_human': return t.humanVsHuman;
      case 'human_vs_ai': return t.humanVsAi;
      default: return mode;
    }
  }

  function getStatusDisplayName(status) {
    switch (status) {
      case 'playing': return t.playing;
      case 'ended': return t.ended;
      case 'analysis': return t.analysis;
      case 'checkmate': return t.checkmate || 'Checkmate';
      case 'stalemate': return t.stalemate || 'Stalemate';
      case 'draw': return t.draw || 'Draw';
      default: return status;
    }
  }
  
  function getColorDisplayName(color) {
    return color === 'white' ? t.white : t.black;
  }
  
  function toggleLanguageSettings() {
    showLanguageSettings = !showLanguageSettings;
  }
  
  function toggleReplayMenu() {
    showReplayMenu = !showReplayMenu;
  }
  
  function handleFileUpload() {
    fileInput.click();
  }
</script>

<div class="control-panel">
  <div class="panel-header">
    <h3>{t.gameInfo}</h3>
    <button class="language-btn" on:click={toggleLanguageSettings} title={t.language}>
      🌐
    </button>
  </div>
  
  {#if showLanguageSettings}
    <div class="language-settings">
      <div class="language-options">
        <button 
          class="lang-option {currentLang === 'zh' ? 'active' : ''}"
          on:click={() => languageStore.setLanguage('zh')}
        >
          {t.chinese}
        </button>
        <button 
          class="lang-option {currentLang === 'en' ? 'active' : ''}"
          on:click={() => languageStore.setLanguage('en')}
        >
          {t.english}
        </button>
      </div>
    </div>
  {/if}
  
  <div class="game-info">
    <div class="info-item">
      <span class="label">{t.mode}:</span>
      <span class="value">{getModeDisplayName(gameState.mode)}</span>
    </div>
    <div class="info-item">
      <span class="label">{t.status}:</span>
      <span class="value {gameState.status === 'checkmate' ? 'checkmate' : gameState.status === 'stalemate' || gameState.status === 'draw' ? 'draw' : ''}">{getStatusDisplayName(gameState.status)}</span>
    </div>
    
    {#if gameState.status === 'checkmate' && gameState.winner}
      <div class="info-item winner">
        <span class="label">{t.winner || 'Winner'}:</span>
        <span class="value winner-text">{getColorDisplayName(gameState.winner)}</span>
      </div>
    {/if}
    
    <div class="info-item">
      <span class="label">{t.turn}:</span>
      <span class="value {gameState.inCheck ? 'in-check' : ''}">{getColorDisplayName(gameState.turn)}{gameState.inCheck ? ' (Check!)' : ''}</span>
    </div>
    {#if gameState.mode === 'human_vs_ai'}
      <div class="info-item">
        <span class="label">{t.yourColor}:</span>
        <span class="value">{getColorDisplayName(gameState.playerColor)}</span>
      </div>
      <div class="info-item">
        <span class="label">{t.aiStrength || 'AI Strength'}:</span>
        <span class="value">{gameState.aiEloRating} ELO</span>
      </div>
      <div class="info-item">
        <span class="label">{t.responseTime || 'Response Time'}:</span>
        <span class="value">{gameState.aiTimeLimit/1000}{t.seconds}</span>
      </div>
    {/if}
    {#if gameState.aiThinking}
      <div class="info-item">
        <span class="label">{t.aiStatus}:</span>
        <span class="value thinking">{t.aiThinking}</span>
      </div>
    {/if}
    <div class="info-item">
      <span class="label">{t.moves}:</span>
      <span class="value">{gameState.moves.length}</span>
    </div>
  </div>

  <div class="controls">
    <button 
      class="btn btn-primary" 
      on:click={handleNewGameClick}
    >
      {t.newGame}
    </button>
    
    {#if gameState.status === 'playing'}
      <button 
        class="btn btn-secondary" 
        on:click={() => onEndGame('resign')}
      >
        {t.resign}
      </button>
    {:else if gameState.status === 'checkmate' || gameState.status === 'stalemate' || gameState.status === 'draw'}
      <div class="game-over-message">
        {#if gameState.status === 'checkmate'}
          🏆 {getColorDisplayName(gameState.winner)} {t.wins || 'wins'}!
        {:else if gameState.status === 'stalemate'}
          🤝 {t.stalemate || 'Stalemate'} - {t.draw || 'Draw'}!
        {:else}
          🤝 {t.draw || 'Draw'}!
        {/if}
      </div>
    {/if}
    
    <button 
      class="btn btn-secondary" 
      on:click={onRequestAnalysis}
      disabled={isAnalyzing}
    >
      {isAnalyzing ? (t.analyzing || 'Analyzing...') : t.analyzePosition}
    </button>
    
    {#if gameState.mode === 'human_vs_ai' && gameState.aiThinking}
      <button 
        class="btn btn-warning" 
        on:click={onResetAI}
        title="AI思考时间过长时使用"
      >
        🔄 重置AI
      </button>
    {/if}
    
    {#if analysisResult}
      <div class="analysis-result">
        <h4>{t.analysisResult || 'Analysis Result'}</h4>
        {#if analysisResult.error}
          <div class="analysis-error">
            ❌ {t.error || 'Error'}: {analysisResult.error}
          </div>
        {:else}
          <div class="analysis-content">
            <div class="best-move">
              <span class="label">{t.bestMove || 'Best Move'}:</span>
              <span class="move-notation">{analysisResult.bestMoveSan}</span>
              <span class="move-uci">({analysisResult.bestMove})</span>
            </div>
            <div class="analysis-meta">
              <span class="timestamp">{t.analyzedAt || 'Analyzed at'}: {analysisResult.timestamp}</span>
            </div>
          </div>
        {/if}
      </div>
    {/if}
    
    <button 
      class="btn btn-secondary" 
      on:click={toggleReplayMenu}
    >
      {t.gameReplay || 'Game Replay'} 📺
    </button>
    
    {#if showReplayMenu}
      <div class="replay-menu">
        <button 
          class="replay-btn" 
          on:click={onLoadCurrentGame}
          disabled={gameState.moves.length === 0}
        >
          {t.replayCurrentGame || 'Replay Current Game'}
        </button>
        
        <div class="sample-games">
          <p class="menu-label">{t.sampleGames || 'Sample Games'}:</p>
          <button class="replay-btn" on:click={() => onLoadSampleGame('scholarsMate')}>
            {t.scholarsMate || "Scholar's Mate"}
          </button>
          <button class="replay-btn" on:click={() => onLoadSampleGame('italianGame')}>
            {t.italianGame || 'Italian Game'}
          </button>
          <button class="replay-btn" on:click={() => onLoadSampleGame('sicilianDefense')}>
            {t.sicilianDefense || 'Sicilian Defense'}
          </button>
        </div>
        
        <button class="replay-btn file-upload-btn" on:click={handleFileUpload}>
          {t.loadPgnFile || 'Load PGN File'} 📁
        </button>
        
        <input 
          bind:this={fileInput}
          type="file" 
          accept=".pgn,.txt" 
          on:change={onFileUpload}
          style="display: none;"
        />
      </div>
    {/if}
  </div>
</div>



<style>
  .control-panel {
    background: var(--surface);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-md);
  }

  .panel-header h3 {
    margin: 0;
    color: var(--text);
    font-size: 1.1rem;
    font-weight: 600;
  }

  .language-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs);
    cursor: pointer;
    font-size: 1.2rem;
    transition: all 0.2s ease;
  }

  .language-btn:hover {
    background: var(--surface-hover);
    border-color: var(--primary);
  }

  .language-settings {
    background: var(--surface-variant);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
    border: 1px solid var(--border);
  }

  .language-options {
    display: flex;
    gap: var(--spacing-xs);
  }

  .lang-option {
    flex: 1;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
  }

  .lang-option:hover {
    background: var(--surface-hover);
  }

  .lang-option.active {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .game-info {
    margin-bottom: var(--spacing-md);
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-xs) 0;
    border-bottom: 1px solid var(--border);
  }

  .info-item:last-child {
    border-bottom: none;
  }

  .label {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .value {
    color: var(--text);
    font-weight: 500;
  }

  .value.thinking {
    color: var(--primary);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .value.checkmate {
    color: #ff4444;
    font-weight: bold;
  }

  .value.draw {
    color: #ffaa44;
    font-weight: bold;
  }

  .value.in-check {
    color: #ff6666;
    font-weight: bold;
  }

  .info-item.winner {
    background: rgba(68, 255, 68, 0.1);
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    border-left: 3px solid #44ff44;
  }

  .winner-text {
    color: #44ff44;
    font-weight: bold;
  }

  .game-over-message {
    background: rgba(255, 255, 255, 0.1);
    padding: var(--spacing-md);
    border-radius: var(--radius-sm);
    text-align: center;
    font-weight: bold;
    font-size: 1.1rem;
    border: 2px solid rgba(255, 255, 255, 0.2);
  }

  .quick-presets {
    display: flex;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
  }

  .preset-btn {
    flex: 1;
    padding: var(--spacing-xs);
    background: var(--surface-variant);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .preset-btn:hover {
    background: var(--surface-hover);
    border-color: var(--primary);
  }

  .setting-description {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: var(--spacing-xs);
    font-style: italic;
    line-height: 1.3;
  }

  .combo-presets {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-xs);
  }

  .combo-btn {
    padding: var(--spacing-sm);
    background: var(--surface-variant);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
    line-height: 1.2;
  }

  .combo-btn:hover {
    background: var(--surface-hover);
    border-color: var(--primary);
    transform: translateY(-1px);
  }

  .combo-btn small {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  h5 {
    margin: 0 0 var(--spacing-xs) 0;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .btn {
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    border-radius: var(--radius-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #007acc;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #005a9e;
  }

  .btn-secondary {
    background: #444;
    color: #ffffff;
    border: 1px solid #666;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #555;
  }

  .btn-warning {
    background: #ff9500;
    color: white;
    border: 1px solid #ff7300;
  }

  .btn-warning:hover:not(:disabled) {
    background: #ff7300;
  }



  .replay-menu {
    background: var(--surface-variant);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
    margin-top: var(--spacing-xs);
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .replay-btn {
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    margin-bottom: var(--spacing-xs);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.9rem;
    text-align: left;
  }

  .replay-btn:last-child {
    margin-bottom: 0;
  }

  .replay-btn:hover:not(:disabled) {
    background: var(--surface-hover);
    border-color: var(--primary);
  }

  .replay-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sample-games {
    margin: var(--spacing-sm) 0;
  }

  .menu-label {
    margin: 0 0 var(--spacing-xs) 0;
    font-size: 0.8rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .file-upload-btn {
    background: #2d5a2d;
    border-color: #4a7c59;
  }

  .file-upload-btn:hover:not(:disabled) {
    background: #3d6a3d;
  }

  .analysis-result {
    background: var(--surface-variant);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-md);
    margin-top: var(--spacing-md);
    animation: slideDown 0.3s ease-out;
  }

  .analysis-result h4 {
    margin: 0 0 var(--spacing-sm) 0;
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 600;
  }

  .analysis-error {
    color: #ff6b6b;
    font-size: 0.9rem;
    padding: var(--spacing-sm);
    background: rgba(255, 107, 107, 0.1);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255, 107, 107, 0.3);
  }

  .analysis-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .best-move {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm);
    background: rgba(0, 122, 204, 0.1);
    border-radius: var(--radius-sm);
    border: 1px solid rgba(0, 122, 204, 0.3);
  }

  .best-move .label {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.9rem;
  }

  .move-notation {
    font-family: 'Courier New', monospace;
    font-size: 1.1rem;
    font-weight: bold;
    color: #007acc;
  }

  .move-uci {
    font-family: 'Courier New', monospace;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .analysis-meta {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .timestamp {
    font-style: italic;
  }
</style> 