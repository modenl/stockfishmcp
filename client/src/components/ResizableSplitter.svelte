<script>
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  
  export let orientation = 'vertical'; // 'vertical' or 'horizontal'
  export let minSize = 200;
  export let maxSize = 800;
  export let defaultPosition = 512;
  
  const dispatch = createEventDispatcher();
  
  let splitterElement;
  let isDragging = false;
  let dragOverlay;
  let startPos = 0;
  let startSize = 0;
  
  function handleMouseDown(e) {
    isDragging = true;
    startPos = orientation === 'vertical' ? e.clientX : e.clientY;
    startSize = defaultPosition;
    
    // Create overlay to prevent iframe/webview interference
    dragOverlay = document.createElement('div');
    dragOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 999999;
      cursor: ${orientation === 'vertical' ? 'col-resize' : 'row-resize'};
      user-select: none;
      -webkit-user-select: none;
    `;
    document.body.appendChild(dragOverlay);
    
    // Add dragging class to body
    document.body.classList.add('dragging-splitter');
    
    // Prevent text selection
    e.preventDefault();
  }
  
  function handleMouseMove(e) {
    if (!isDragging) return;
    
    const currentPos = orientation === 'vertical' ? e.clientX : e.clientY;
    const delta = currentPos - startPos;
    let newSize = startSize + delta;
    
    // Constrain to min/max
    newSize = Math.max(minSize, Math.min(maxSize, newSize));
    
    dispatch('resize', { size: newSize });
  }
  
  function handleMouseUp() {
    if (!isDragging) return;
    
    isDragging = false;
    
    // Remove overlay
    if (dragOverlay) {
      dragOverlay.remove();
      dragOverlay = null;
    }
    
    // Remove dragging class
    document.body.classList.remove('dragging-splitter');
  }
  
  onMount(() => {
    // Add global event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Handle touch events for mobile
    splitterElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  });
  
  onDestroy(() => {
    // Clean up event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    
    // Clean up any remaining overlay
    if (dragOverlay) {
      dragOverlay.remove();
    }
  });
  
  // Touch event handlers
  function handleTouchStart(e) {
    const touch = e.touches[0];
    handleMouseDown({ 
      clientX: touch.clientX, 
      clientY: touch.clientY,
      preventDefault: () => e.preventDefault()
    });
  }
  
  function handleTouchMove(e) {
    if (!isDragging) return;
    const touch = e.touches[0];
    handleMouseMove({ 
      clientX: touch.clientX, 
      clientY: touch.clientY 
    });
    e.preventDefault();
  }
  
  function handleTouchEnd() {
    handleMouseUp();
  }
</script>

<div 
  bind:this={splitterElement}
  class="splitter {orientation}"
  on:mousedown={handleMouseDown}
  role="separator"
  aria-orientation={orientation}
  aria-valuenow={defaultPosition}
  aria-valuemin={minSize}
  aria-valuemax={maxSize}
  tabindex="0"
>
  <div class="splitter-handle"></div>
</div>

<style>
  .splitter {
    position: relative;
    background: var(--border, #404040);
    transition: background-color 0.2s;
    flex-shrink: 0;
    z-index: 10;
  }
  
  .splitter.vertical {
    width: 8px;
    cursor: col-resize;
    height: 100%;
  }
  
  .splitter.horizontal {
    height: 8px;
    cursor: row-resize;
    width: 100%;
  }
  
  .splitter:hover {
    background: var(--accent-primary, #4f9eff);
  }
  
  .splitter-handle {
    position: absolute;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }
  
  .vertical .splitter-handle {
    width: 2px;
    height: 30px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  
  .horizontal .splitter-handle {
    width: 30px;
    height: 2px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
  
  /* When dragging, show active state */
  :global(.dragging-splitter) .splitter {
    background: var(--accent-primary, #4f9eff) !important;
  }
  
  /* Disable pointer events on iframes during drag */
  :global(.dragging-splitter) iframe,
  :global(.dragging-splitter) webview {
    pointer-events: none !important;
  }
  
  /* Prevent text selection during drag */
  :global(.dragging-splitter) {
    user-select: none !important;
    -webkit-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
  }
</style>