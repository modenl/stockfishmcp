import App from './App.svelte'
import './index.css'

let app = null;

try {
  console.log('Starting Chess Trainer app...');
  
  app = new App({
    target: document.getElementById('root')
  });
  
  console.log('Chess Trainer app started successfully');
  
  // Hide loading indicator
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.display = 'none';
  }
} catch (error) {
  console.error('Failed to start Chess Trainer:', error);
  
  // Show error message
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #ff6b6b;">
        <h2>Failed to load Chess Trainer</h2>
        <p>Error: ${error.message}</p>
        <p>Check the browser console for more details.</p>
      </div>
    `;
  }
  
  // Hide loading indicator
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.display = 'none';
  }
}

export default app; 