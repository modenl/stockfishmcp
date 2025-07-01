import Ajv from 'ajv';

const ajv = new Ajv();

// WebSocket message schemas
const messageSchemas = {
  join_session: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'join_session' },
      clientId: { type: 'string', minLength: 1, maxLength: 100 },
      clientName: { type: 'string', minLength: 1, maxLength: 50 }
    },
    required: ['type', 'clientId', 'clientName'],
    additionalProperties: false
  },

  move: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'move' },
      sessionId: { type: 'string', minLength: 1, maxLength: 50 },
      move: {
        type: 'object',
        properties: {
          san: { type: 'string', minLength: 2, maxLength: 8 },
          uci: { type: 'string', minLength: 4, maxLength: 5 }
        },
        required: ['san', 'uci'],
        additionalProperties: false
      },
      fenBefore: { type: 'string', minLength: 10, maxLength: 100 },
      fenAfter: { type: 'string', minLength: 10, maxLength: 100 },
      evalCp: { type: 'number', minimum: -32000, maximum: 32000 },
      depth: { type: 'number', minimum: 1, maximum: 50 },
      timeMs: { type: 'number', minimum: 0, maximum: 300000 }
    },
    required: ['type', 'sessionId', 'move', 'fenBefore', 'fenAfter', 'evalCp', 'depth'],
    additionalProperties: false
  },

  request_analysis: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'request_analysis' },
      sessionId: { type: 'string', minLength: 1, maxLength: 50 },
      fen: { type: 'string', minLength: 10, maxLength: 100 },
      depth: { type: 'number', minimum: 1, maximum: 30 }
    },
    required: ['type', 'sessionId', 'fen'],
    additionalProperties: false
  },

  end_session: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'end_session' },
      result: {
        type: 'object',
        properties: {
          winner: { type: 'string', enum: ['white', 'black', 'draw'] },
          reason: { type: 'string', enum: ['checkmate', 'stalemate', 'resignation', 'time', 'agreement', 'repetition', 'insufficient_material'] }
        },
        required: ['winner', 'reason'],
        additionalProperties: false
      }
    },
    required: ['type', 'result'],
    additionalProperties: false
  },

  update_game_mode: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'update_game_mode' },
      sessionId: { type: 'string', minLength: 1, maxLength: 50 },
      gameMode: { type: 'string', enum: ['human_vs_human', 'human_vs_ai'] },
      playerColor: { type: 'string', enum: ['white', 'black'] },
      aiEloRating: { type: 'number', minimum: 800, maximum: 3200 },
      aiTimeLimit: { type: 'number', minimum: 100, maximum: 30000 }
    },
    required: ['type', 'sessionId', 'gameMode'],
    additionalProperties: false
  },

  sync_move: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'sync_move' },
      clientId: { type: 'string', minLength: 1, maxLength: 100 },
      clientName: { type: 'string', minLength: 1, maxLength: 50 },
      move: {
        type: 'object',
        properties: {
          san: { type: 'string', minLength: 2, maxLength: 8 },
          uci: { type: 'string', minLength: 4, maxLength: 5 }
        },
        required: ['san', 'uci'],
        additionalProperties: false
      },
      fen: { type: 'string', minLength: 10, maxLength: 100 },
      turn: { type: 'string', enum: ['white', 'black'] }
    },
    required: ['type', 'clientId', 'clientName', 'move', 'fen', 'turn'],
    additionalProperties: false
  },

  reset_game: {
    type: 'object',
    properties: {
      type: { type: 'string', const: 'reset_game' },
      clientId: { type: 'string', minLength: 1, maxLength: 100 },
      clientName: { type: 'string', minLength: 1, maxLength: 50 },
      gameSettings: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['human_vs_human', 'human_vs_ai'] },
          playerColor: { type: 'string', enum: ['white', 'black'] },
          aiEloRating: { type: 'number', minimum: 800, maximum: 3200 },
          aiTimeLimit: { type: 'number', minimum: 100, maximum: 30000 }
        },
        additionalProperties: false
      }
    },
    required: ['type'],
    additionalProperties: false
  }
};

// Compile validators
const validators = {};
for (const [messageType, schema] of Object.entries(messageSchemas)) {
  validators[messageType] = ajv.compile(schema);
}

export function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const { type } = message;
  if (!type || typeof type !== 'string') {
    return false;
  }

  const validator = validators[type];
  if (!validator) {
    console.warn(`Unknown message type: ${type}`);
    return false;
  }

  const isValid = validator(message);
  if (!isValid) {
    console.warn(`Invalid message format for type ${type}:`, validator.errors);
  }

  return isValid;
}

// Additional validation functions
export function validateFEN(fen) {
  if (!fen || typeof fen !== 'string') {
    return false;
  }

  const parts = fen.split(' ');
  if (parts.length !== 6) {
    return false;
  }

  const [position, activeColor, castling, enPassant, halfmove, fullmove] = parts;

  // Basic position validation
  const ranks = position.split('/');
  if (ranks.length !== 8) {
    return false;
  }

  for (const rank of ranks) {
    let squares = 0;
    for (const char of rank) {
      if ('12345678'.includes(char)) {
        squares += parseInt(char);
      } else if ('pnbrqkPNBRQK'.includes(char)) {
        squares += 1;
      } else {
        return false;
      }
    }
    if (squares !== 8) {
      return false;
    }
  }

  // Active color validation
  if (!['w', 'b'].includes(activeColor)) {
    return false;
  }

  // Castling validation
  if (!/^(-|[KQkq]+)$/.test(castling)) {
    return false;
  }

  // En passant validation
  if (!/^(-|[a-h][36])$/.test(enPassant)) {
    return false;
  }

  // Move count validation
  if (!/^\d+$/.test(halfmove) || !/^\d+$/.test(fullmove)) {
    return false;
  }

  return true;
}

export function validateUCI(uci) {
  if (!uci || typeof uci !== 'string') {
    return false;
  }

  // Standard move: e2e4, g1f3, etc.
  if (/^[a-h][1-8][a-h][1-8]$/.test(uci)) {
    return true;
  }

  // Promotion: e7e8q, a2a1n, etc.
  if (/^[a-h][1-8][a-h][1-8][qrbn]$/.test(uci)) {
    return true;
  }

  return false;
}

export function validateSAN(san) {
  if (!san || typeof san !== 'string') {
    return false;
  }

  // Basic SAN patterns - this is simplified
  const sanPatterns = [
    /^[NBRQK][a-h]?[1-8]?x?[a-h][1-8](\+|#)?$/, // Piece moves
    /^[a-h][1-8](\+|#)?$/, // Pawn moves
    /^[a-h]x[a-h][1-8](\+|#)?$/, // Pawn captures
    /^[a-h][1-8]=[QRBN](\+|#)?$/, // Pawn promotion
    /^[a-h]x[a-h][1-8]=[QRBN](\+|#)?$/, // Pawn capture promotion
    /^O-O(\+|#)?$/, // Kingside castling
    /^O-O-O(\+|#)?$/ // Queenside castling
  ];

  return sanPatterns.some(pattern => pattern.test(san));
}

export function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }

  // Allow alphanumeric session IDs with underscores and hyphens
  return /^[a-zA-Z0-9_-]{1,50}$/.test(sessionId);
}

export function sanitizeString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') {
    return '';
  }

  return str.trim().slice(0, maxLength);
}

export function validateEvaluation(evalCp) {
  if (typeof evalCp !== 'number') {
    return false;
  }

  // Reasonable evaluation bounds (-32000 to +32000 centipawns)
  return evalCp >= -32000 && evalCp <= 32000;
}

export function validateDepth(depth) {
  if (typeof depth !== 'number' || !Number.isInteger(depth)) {
    return false;
  }

  return depth >= 1 && depth <= 50;
} 