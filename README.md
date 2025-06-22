# Chess Trainer MCP Server

A comprehensive chess training application with AI-powered analysis using Stockfish NNUE engine and MCP (Model Context Protocol) integration for advanced coaching capabilities.

![Chess Trainer Screenshot](https://via.placeholder.com/800x600/2c2f33/ffffff?text=Chess+Trainer+Interface)

## ✨ Features

### 🎯 Core Chess Features
- **Interactive Chess Board**: Drag-and-drop interface powered by Chessground
- **Real-time Engine Analysis**: Stockfish NNUE WASM integration for local analysis
- **Evaluation Bar**: Visual representation of position evaluation with depth info
- **Human vs AI**: Play against AI with adjustable ELO (800-2800) and thinking time
- **Position Analysis**: Get best moves and evaluations for any position

### 🎬 Replay & Learning
- **Game Replay**: Full replay system with controls (play, pause, step, speed)
- **Sample Games**: Built-in famous games (Scholar's Mate, Italian Game, Sicilian Defense)
- **Move Navigation**: Browse through game history with analysis
- **Board Flipping**: View games from both perspectives

### 🤖 MCP Integration
- **Session Management**: Track games, moves, and performance metrics
- **AI Coaching**: Send training data and receive coaching via MCP protocol
- **Adaptive Cards**: Contextual tips and analysis from AI coaches
- **Performance Analytics**: Track improvement over time

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/stockfishmcp.git
cd stockfishmcp

# Install dependencies
npm install

# Install client dependencies
npm run client:install

# Build the frontend
npm run build

# Start the server
npm start
```

The application will be available at `http://localhost:3456`

### Development Mode

```bash
# Start development server with hot reload
npm run dev
```

This starts both the server (with nodemon) and the client (with Vite) concurrently.

## 🎮 Usage

### Playing Chess
1. Click "New Game" to start
2. Choose game mode:
   - **Human vs Human**: Local two-player game
   - **Human vs AI**: Play against Stockfish engine
3. For AI games, configure:
   - **Your Color**: White or Black
   - **AI Strength**: 800-2800 ELO
   - **Thinking Time**: 0.2-5 seconds per move

### Analysis
1. Make moves on the board
2. Click "Analyze Position" for engine evaluation
3. View evaluation in the sidebar and evaluation bar
4. Best moves are highlighted on the board

### Replay
1. Click "Game Replay 📺" to open replay menu
2. Choose what to replay:
   - Current game (if moves exist)
   - Scholar's Mate (4-move checkmate)
   - Italian Game (classic opening)
   - Sicilian Defense (popular defense)
3. Use replay controls to navigate through the game

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                MCP Host (LLM Coach)                     │
│  • Receives training data via MCP protocol             │
│  • Provides AI coaching and analysis                   │
│  • Sends adaptive cards with tips                      │
└─────────────▲───────────────────────────────────────────┘
              │ HTTP/WebSocket (JSON-MCP)
              │
┌─────────────┴───────────────────────────────────────────┐
│              Chess Trainer MCP Server                  │
│  • Express + WebSocket API                             │
│  • Session management                                  │
│  • Serves frontend SPA                                 │
│  • Aggregates chess data → MCP actions                 │
└─────────────▲───────────────────────────────────────────┘
              │ WebSocket events
              │
┌─────────────┴───────────────────────────────────────────┐
│              Frontend (Svelte + Vite)                  │
│  • Chessground board interface                         │
│  • Stockfish NNUE engine (WebAssembly)                 │
│  • Real-time evaluation and analysis                   │
│  • Game replay and learning tools                      │
└─────────────────────────────────────────────────────────┘
```

## 🔧 Configuration

Configure via environment variables:

```bash
# Server port (default: 3456)
PORT=3456

# MCP Host URL for sending coaching data
MCP_HOST_URL=http://localhost:3000/mcp/inbound

# Enable/disable MCP integration (default: true)
MCP_ENABLED=true

# Log level (default: info)
LOG_LEVEL=info
```

## 📡 MCP Protocol

### Outbound Actions (To Coach)

**Move Evaluation**
```json
{
  "type": "action",
  "server": "chessCoach",
  "action": "evaluateMove",
  "parameters": {
    "sessionId": "uuid",
    "move": "e2e4",
    "fenBefore": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "fenAfter": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    "evalCp": 34,
    "depth": 15
  }
}
```

**Game Summary**
```json
{
  "type": "action", 
  "server": "chessCoach",
  "action": "gameSummary",
  "parameters": {
    "sessionId": "uuid",
    "result": "1-0",
    "moves": ["e2e4", "e7e5", "..."],
    "finalPosition": "...",
    "gameLength": 25
  }
}
```

### Inbound Actions (From Coach)

**Coaching Tips**
```json
{
  "type": "adaptive_card",
  "sessionId": "uuid",
  "card": {
    "title": "Opening Principle",
    "body": "Control the center with your pawns!",
    "priority": "high"
  }
}
```

## 🛠️ Development

### Project Structure
```
stockfishmcp/
├── client/                 # Frontend Svelte app
│   ├── src/
│   │   ├── components/     # Svelte components
│   │   ├── lib/           # Chess engine and utilities  
│   │   └── stores/        # State management
│   └── public/            # Static assets and WASM files
├── server/                # Backend Node.js server
├── src/lib/              # Shared utilities
└── bin/                  # CLI executable
```

### Key Technologies
- **Frontend**: Svelte, Vite, Chessground, Chessops
- **Chess Engine**: Stockfish NNUE (WebAssembly)
- **Backend**: Node.js, Express, WebSocket
- **Protocol**: MCP (Model Context Protocol)

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📋 API Reference

### REST Endpoints
- `GET /api/health` - Health check
- `GET /api/sessions/:id` - Get session details  
- `POST /api/sessions` - Create new session
- `POST /api/mcp/inbound` - Receive MCP messages

### WebSocket Events
- `game:move` - Player made a move
- `game:analysis` - Request position analysis
- `session:update` - Session state changed
- `mcp:card` - Receive coaching card

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📧 Issues: [GitHub Issues](https://github.com/yourusername/stockfishmcp/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/yourusername/stockfishmcp/discussions)
- 📚 Documentation: [Wiki](https://github.com/yourusername/stockfishmcp/wiki)

---

**Note**: This is an MCP server implementation. To use the full coaching features, you'll need an MCP-compatible host application that can process the chess training data and provide AI coaching responses. 