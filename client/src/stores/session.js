import { writable } from 'svelte/store';

function createSessionStore() {
  const { subscribe, set, update } = writable({
    session: null,
    sessions: [],
    isLoading: false,
    error: null
  });

  async function createSession(mode = 'play') {
    update(state => ({
      ...state,
      isLoading: true,
      error: null
    }));

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode })
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const session = await response.json();
      
      update(state => ({
        ...state,
        session,
        sessions: [...state.sessions, session],
        isLoading: false
      }));

      console.log('Created session:', session.id);
      return session;

    } catch (error) {
      console.error('Failed to create session:', error);
      update(state => ({
        ...state,
        isLoading: false,
        error: error.message
      }));
      return null;
    }
  }

  async function getSession(sessionId) {
    update(state => ({
      ...state,
      isLoading: true,
      error: null
    }));

    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get session: ${response.statusText}`);
      }

      const session = await response.json();
      
      update(state => ({
        ...state,
        session,
        isLoading: false
      }));

      return session;

    } catch (error) {
      console.error('Failed to get session:', error);
      update(state => ({
        ...state,
        isLoading: false,
        error: error.message
      }));
      return null;
    }
  }

  function setCurrentSession(session) {
    update(state => ({
      ...state,
      session
    }));
  }

  function getCurrentSession() {
    let currentSession = null;
    const unsubscribe = subscribe(state => {
      currentSession = state.session;
    });
    unsubscribe();
    return currentSession;
  }

  function updateSession(sessionData) {
    update(state => ({
      ...state,
      session: state.session ? {
        ...state.session,
        ...sessionData
      } : null
    }));
  }

  function addMove(move) {
    update(state => ({
      ...state,
      session: state.session ? {
        ...state.session,
        moves: [...state.session.moves, move]
      } : null
    }));
  }

  function endSession(sessionId, result) {
    update(state => ({
      ...state,
      session: state.session && state.session.id === sessionId ? {
        ...state.session,
        result,
        active: false,
        endTime: new Date().toISOString()
      } : state.session
    }));
  }

  function clearSession() {
    update(state => ({
      ...state,
      session: null
    }));
  }

  function clearError() {
    update(state => ({
      ...state,
      error: null
    }));
  }

  // Local storage persistence
  if (typeof window !== 'undefined') {
    // Load from localStorage on initialization
    const savedSession = localStorage.getItem('chess-trainer-session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        update(state => ({
          ...state,
          session
        }));
      } catch (error) {
        console.warn('Failed to load session from localStorage:', error);
        localStorage.removeItem('chess-trainer-session');
      }
    }

    // Save to localStorage on session changes
    subscribe(state => {
      if (state.session) {
        localStorage.setItem('chess-trainer-session', JSON.stringify(state.session));
      } else {
        localStorage.removeItem('chess-trainer-session');
      }
    });
  }

  return {
    subscribe,
    createSession,
    getSession,
    setCurrentSession,
    getCurrentSession,
    updateSession,
    addMove,
    endSession,
    clearSession,
    clearError
  };
}

export const sessionStore = createSessionStore(); 