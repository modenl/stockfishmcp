<script>
  import { Wifi, WifiOff, Cpu, Clock, ShieldCheck, AlertTriangle, MessageCircle, Hourglass, Users } from 'lucide-svelte';
  import { languageStore } from '../stores/language.js';

  export let connectionStatus = 'disconnected';
  export let engineReady = false;
  export let engineStatus = 'loading';
  export let session = null;
  export let gameStatus = 'playing';
  export let turn = 'white';
  export let aiThinking = false;
  export let inCheck = false;
  export let sessionId = '...';
  export let clientName = 'Player';
  export let connectedClients = [];
  export let clientId = '...';
  
  $: currentLang = $languageStore;
  $: t = languageStore.translations[currentLang];

  const statusIcons = {
    connected: Wifi,
    disconnected: Wifi,
    reconnecting: Hourglass,
    failed: Wifi,
    error: Wifi,
  };

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

<div class="status-bar-compact">
  <div class="status-indicators">
    <!-- Connection Status -->
    <div class="status-indicator {getConnectionClass(connectionStatus)}" title="WebSocket Connection">
      <svelte:component this={getConnectionIcon(connectionStatus)} size="14" />
    </div>
    
    <!-- Engine Status -->
    <div class="status-indicator {engineReady ? 'status-connected' : 'status-analyzing'}" title="Chess Engine">
      <Cpu size="14" />
    </div>
    
    <!-- Connected Clients -->
    {#if connectedClients.length > 0}
      <div class="status-indicator status-connected" title="{connectedClients.length} clients connected">
        <Users size="14" />
        <span class="status-count">{connectedClients.length}</span>
      </div>
    {/if}
  </div>

  <div class="game-status">
    <!-- Current Turn -->
    <div class="turn-indicator {turn === 'white' ? 'turn-white' : 'turn-black'}" title="Current Turn">
      <span class="turn-text">{currentLang === 'zh' ? (turn === 'white' ? '白' : '黑') : (turn === 'white' ? 'W' : 'B')}</span>
      {#if inCheck}
        <AlertTriangle size="12" class="check-icon" />
      {/if}
    </div>
    
    <!-- Game Status -->
    <div class="game-state {gameStatus === 'playing' ? 'state-playing' : gameStatus === 'checkmate' ? 'state-checkmate' : 'state-draw'}">
      {#if gameStatus === 'checkmate'}
        {currentLang === 'zh' ? '将死' : 'Mate'}
      {:else if gameStatus === 'stalemate'}
        {currentLang === 'zh' ? '逼和' : 'Stale'}
      {:else if gameStatus === 'draw'}
        {currentLang === 'zh' ? '和局' : 'Draw'}
      {:else}
        {currentLang === 'zh' ? '进行中' : 'Playing'}
      {/if}
    </div>
    
    <!-- AI Thinking -->
    {#if aiThinking}
      <div class="ai-thinking">
        <div class="thinking-spinner"></div>
        <span class="thinking-text">{currentLang === 'zh' ? 'AI' : 'AI'}</span>
      </div>
    {/if}
  </div>

  <div class="client-info-compact">
    <div class="client-name-compact" title="{clientName} ({clientId.slice(-8)})">{clientName}</div>
  </div>
</div>

<style>
  .status-bar-compact {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .status-indicators {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .status-connected {
    color: var(--success);
  }

  .status-disconnected {
    color: var(--error);
  }

  .status-analyzing {
    color: var(--warning);
  }

  .status-count {
    font-size: 0.625rem;
    font-weight: 600;
  }

  .game-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .turn-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.75rem;
  }

  .turn-white {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .turn-black {
    background: rgba(0, 0, 0, 0.3);
    color: var(--text-primary);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .check-icon {
    color: var(--error);
  }

  .game-state {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
    font-size: 0.75rem;
  }

  .state-playing {
    color: var(--success);
  }

  .state-checkmate {
    color: var(--error);
    background: rgba(239, 68, 68, 0.1);
  }

  .state-draw {
    color: var(--warning);
  }

  .ai-thinking {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--accent-primary);
  }

  .thinking-spinner {
    width: 12px;
    height: 12px;
    border: 1px solid transparent;
    border-top: 1px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .thinking-text {
    font-size: 0.625rem;
    font-weight: 600;
  }

  .client-info-compact {
    display: flex;
    align-items: center;
  }

  .client-name-compact {
    font-weight: 500;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .status-bar-compact {
      gap: 0.5rem;
      font-size: 0.625rem;
    }

    .status-indicators {
      gap: 0.25rem;
    }

    .game-status {
      gap: 0.25rem;
    }

    .turn-indicator {
      padding: 0.125rem 0.375rem;
    }

    .client-name-compact {
      font-size: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .status-bar-compact {
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .client-info-compact {
      order: -1;
      width: 100%;
    }
  }

  .client-name {
    font-weight: 600;
    color: var(--primary);
    font-size: 0.95em;
  }

  .client-id {
    font-size: 0.8em;
    color: var(--text-secondary);
    font-family: monospace;
  }

  .session-id {
    font-size: 0.8em;
    color: var(--text-muted);
    font-family: monospace;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    position: relative;
  }

  .status-item:hover .clients-tooltip {
    display: block;
  }

  .clients-tooltip {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: var(--spacing-sm);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    min-width: 150px;
  }

  .client-item {
    padding: 2px 0;
    font-size: 0.9em;
    color: var(--text-primary);
  }

  .status-text {
    color: var(--text-secondary);
    font-family: 'Courier New', monospace;
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
 