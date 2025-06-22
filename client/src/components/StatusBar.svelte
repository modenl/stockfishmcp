<script>
  import { Wifi, WifiOff, Cpu, Clock } from 'lucide-svelte';
  import { languageStore } from '../stores/language.js';

  export let connectionStatus = 'disconnected';
  export let engineReady = false;
  export let engineStatus = 'loading';
  export let session = null;
  export let gameStatus = 'playing';
  export let turn = 'white';
  export let aiThinking = false;
  export let inCheck = false;
  
  $: currentLang = $languageStore;
  $: t = languageStore.translations[currentLang];

  function getConnectionIcon(status) {
    switch (status) {
      case 'connected':
        return Wifi;
      case 'disconnected':
      case 'error':
      case 'failed':
        return WifiOff;
      default:
        return Wifi;
    }
  }

  function getConnectionClass(status) {
    switch (status) {
      case 'connected':
        return 'status-connected';
      case 'reconnecting':
        return 'status-analyzing';
      case 'disconnected':
      case 'error':
      case 'failed':
        return 'status-disconnected';
      default:
        return 'status-disconnected';
    }
  }

  function formatSessionTime(session) {
    if (!session?.startTime) return '--:--';
    
    const start = new Date(session.startTime);
    const now = new Date();
    const diff = Math.floor((now - start) / 1000);
    
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
</script>

<div class="status-bar">
  <div class="status-section">
    <div class="status-indicator {getConnectionClass(connectionStatus)}">
      <svelte:component this={getConnectionIcon(connectionStatus)} size={16} />
      <span class="status-text">
        {#if connectionStatus === 'connected'}
          {currentLang === 'zh' ? '服务器已连接' : 'Server Connected'}
        {:else if connectionStatus === 'reconnecting'}
          {currentLang === 'zh' ? '重新连接中...' : 'Reconnecting...'}
        {:else if connectionStatus === 'disconnected'}
          {currentLang === 'zh' ? '已断开连接' : 'Disconnected'}
        {:else if connectionStatus === 'error' || connectionStatus === 'failed'}
          {currentLang === 'zh' ? '连接失败' : 'Connection Failed'}
        {:else}
          {connectionStatus}
        {/if}
      </span>
    </div>

    <div class="status-indicator {engineReady ? 'status-connected' : 'status-disconnected'}">
      <Cpu size={16} />
      <span class="status-text">
        {#if engineReady}
          {currentLang === 'zh' ? '引擎就绪' : 'Engine Ready'}
        {:else if engineStatus === 'loading'}
          {currentLang === 'zh' ? '加载引擎模块...' : 'Loading Engine Module...'}
        {:else if engineStatus === 'initializing'}
          {currentLang === 'zh' ? '初始化引擎...' : 'Initializing Engine...'}
        {:else if engineStatus === 'starting'}
          {currentLang === 'zh' ? '启动UCI协议...' : 'Starting UCI Protocol...'}
        {:else if engineStatus === 'error'}
          {currentLang === 'zh' ? '引擎加载失败' : 'Engine Load Failed'}
        {:else}
          {currentLang === 'zh' ? '引擎加载中...' : 'Engine Loading...'}
        {/if}
      </span>
    </div>
  </div>

  <div class="session-info">
    {#if session}
      <div class="session-item">
        <span class="session-label">{currentLang === 'zh' ? '会话' : 'Session'}:</span>
        <span class="session-value">{session.id.slice(0, 8)}...</span>
      </div>
      
      <div class="session-item">
        <span class="session-label">{currentLang === 'zh' ? '模式' : 'Mode'}:</span>
        <span class="session-value">{session.mode}</span>
      </div>
      
      <div class="session-item">
        <Clock size={16} />
        <span class="session-value">{formatSessionTime(session)}</span>
      </div>
      
      <div class="session-item">
        <span class="session-label">{currentLang === 'zh' ? '状态' : 'Status'}:</span>
        <span class="session-value {gameStatus === 'playing' ? 'text-success' : gameStatus === 'checkmate' ? 'text-error' : 'text-warning'}">{gameStatus}</span>
      </div>
    {:else}
      <div class="session-item">
        <span class="session-label">{currentLang === 'zh' ? '轮到' : 'Turn'}:</span>
        <span class="session-value {inCheck ? 'text-error' : ''}">{currentLang === 'zh' ? (turn === 'white' ? '白方' : '黑方') : (turn === 'white' ? 'White' : 'Black')}{inCheck ? ' (将军!)' : ''}</span>
      </div>
      
      {#if aiThinking}
        <div class="session-item">
          <span class="session-value thinking">{currentLang === 'zh' ? 'AI思考中...' : 'AI thinking...'}</span>
        </div>
      {/if}
      
      <div class="session-item">
        <span class="session-label">{currentLang === 'zh' ? '状态' : 'Status'}:</span>
        <span class="session-value {gameStatus === 'playing' ? 'text-success' : gameStatus === 'checkmate' ? 'text-error' : 'text-warning'}">
          {#if gameStatus === 'checkmate'}
            {currentLang === 'zh' ? '将死' : 'Checkmate'}
          {:else if gameStatus === 'stalemate'}
            {currentLang === 'zh' ? '逼和' : 'Stalemate'}
          {:else if gameStatus === 'draw'}
            {currentLang === 'zh' ? '和局' : 'Draw'}
          {:else}
            {currentLang === 'zh' ? '进行中' : 'Playing'}
          {/if}
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md);
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
  }

  .status-section {
    display: flex;
    gap: var(--spacing-lg);
    align-items: center;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .session-info {
    display: flex;
    gap: var(--spacing-lg);
    align-items: center;
    font-size: var(--text-xs);
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .session-label {
    color: var(--text-muted);
    font-weight: 500;
  }

  .session-value {
    color: var(--text-secondary);
    font-family: 'Courier New', monospace;
  }

  .session-placeholder {
    color: var(--text-muted);
    font-style: italic;
  }

  .text-success {
    color: var(--success);
  }

  .text-error {
    color: #ff4444;
    font-weight: bold;
  }

  .text-warning {
    color: #ffaa44;
    font-weight: bold;
  }

  .thinking {
    color: var(--primary);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @media (max-width: 768px) {
    .status-bar {
      flex-direction: column;
      gap: var(--spacing-sm);
      align-items: flex-start;
    }

    .session-info {
      flex-wrap: wrap;
      gap: var(--spacing-md);
    }
  }
</style>
 