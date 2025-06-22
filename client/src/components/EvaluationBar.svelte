<script>
  export let evaluation = { cp: 0, mate: null };
  export let turn = 'white';

  function getEvaluation() {
    if (!evaluation) return 0;
    
    if (evaluation.mate !== null && evaluation.mate !== undefined) {
      // Mate evaluation: +32000 for mate in favor, -32000 for mate against
      return evaluation.mate > 0 ? 32000 : -32000;
    }
    
    const cp = evaluation.cp;
    if (cp === null || cp === undefined || isNaN(cp)) {
      return 0;
    }
    
    return cp;
  }

  function getEvaluationText() {
    if (!evaluation) return '0.00';
    
    if (evaluation.mate !== null && evaluation.mate !== undefined) {
      return `#${Math.abs(evaluation.mate)}`;
    }
    
    const cp = evaluation.cp;
    if (cp === null || cp === undefined || isNaN(cp)) {
      return '0.00';
    }
    
    return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(2)}`;
  }

  function getEvaluationPercentage() {
    const cp = getEvaluation();
    
    // Convert centipawns to percentage (sigmoid-like function)
    // Range: -1000cp to +1000cp maps to roughly 0% to 100%
    const normalized = Math.max(-1000, Math.min(1000, cp));
    return 50 + (normalized / 1000) * 40; // Maps to 10% - 90%
  }

  $: evalPercentage = getEvaluationPercentage();
  $: evalText = getEvaluationText();
</script>

<div class="eval-bar-container">
  <div class="eval-bar" class:flipped={turn === 'black'}>
    <div 
      class="eval-indicator" 
      style="top: {100 - evalPercentage}%"
    ></div>
    <div class="eval-background"></div>
  </div>
  
  <div class="eval-text">
    <span class="eval-value" class:positive={getEvaluation() > 0} class:negative={getEvaluation() < 0}>
      {evalText}
    </span>
    {#if evaluation?.depth}
      <span class="eval-depth">d{evaluation.depth}</span>
    {/if}
  </div>
</div>

<style>
  .eval-bar-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    width: 40px;
  }

  .eval-bar {
    width: 20px;
    height: 400px;
    position: relative;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .eval-background {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      to top,
      var(--eval-negative) 0%,
      var(--eval-negative) 50%,
      var(--eval-positive) 50%,
      var(--eval-positive) 100%
    );
  }

  .eval-indicator {
    position: absolute;
    left: -2px;
    right: -2px;
    height: 4px;
    background: white;
    border: 1px solid #000;
    border-radius: 2px;
    transition: top 0.3s ease;
    z-index: 1;
  }

  .eval-bar.flipped .eval-background {
    background: linear-gradient(
      to top,
      var(--eval-positive) 0%,
      var(--eval-positive) 50%,
      var(--eval-negative) 50%,
      var(--eval-negative) 100%
    );
  }

  .eval-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .eval-value {
    font-family: 'Courier New', monospace;
    color: var(--text-primary);
    min-width: 40px;
    text-align: center;
  }

  .eval-value.positive {
    color: var(--eval-positive);
  }

  .eval-value.negative {
    color: var(--eval-negative);
  }

  .eval-depth {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .eval-bar {
      height: 300px;
    }
    
    .eval-bar-container {
      width: 30px;
    }
  }
</style> 