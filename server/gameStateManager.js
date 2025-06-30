import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 共享状态文件路径
const STATE_DIR = path.join(__dirname, '..', '.state');
const GAME_FILE = path.join(STATE_DIR, 'game_state.json');
const COMMANDS_FILE = path.join(STATE_DIR, 'mcp_commands.json');

export class GameStateManager {
  constructor() {
    this.ensureStateDirectory();
    this.initializeFiles();
  }

  ensureStateDirectory() {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
  }

  initializeFiles() {
    if (!fs.existsSync(GAME_FILE)) {
      this.saveGame(this.createDefaultGameState());
    }
    if (!fs.existsSync(COMMANDS_FILE)) {
      this.saveCommands([]);
    }
  }

  createDefaultGameState() {
    return {
      active: true,
      startTime: new Date().toISOString(),
      mode: 'play',
      moves: [],
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'white',
      lastUpdated: new Date().toISOString(),
      gameMode: 'human_vs_human',
      playerColor: 'white',
      aiEloRating: 1500,
      aiTimeLimit: 500
    };
  }

  // 游戏状态管理 - 现在只有一个全局游戏
  saveGameState(gameState) {
    const updatedState = {
      ...gameState,
      lastUpdated: new Date().toISOString()
    };
    this.saveGame(updatedState);
  }

  getGameState() {
    return this.loadGame();
  }

  resetGame() {
    const newState = this.createDefaultGameState();
    this.saveGame(newState);
    return newState;
  }

  // MCP 命令队列管理
  addMCPCommand(command) {
    const commands = this.loadCommands();
    const mcpCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      processed: false,
      ...command
    };
    commands.push(mcpCommand);
    this.saveCommands(commands);
    return mcpCommand.id;
  }

  getUnprocessedCommands() {
    const commands = this.loadCommands();
    return commands.filter(cmd => !cmd.processed);
  }

  markCommandProcessed(commandId, result = null, error = null) {
    const commands = this.loadCommands();
    const command = commands.find(cmd => cmd.id === commandId);
    if (command) {
      command.processed = true;
      command.processedAt = new Date().toISOString();
      if (result) command.result = result;
      if (error) command.error = error;
      this.saveCommands(commands);
    }
  }

  clearOldCommands(maxAgeMinutes = 30) {
    const commands = this.loadCommands();
    const cutoff = Date.now() - (maxAgeMinutes * 60 * 1000);
    const filtered = commands.filter(cmd => {
      const cmdTime = new Date(cmd.timestamp).getTime();
      return cmdTime > cutoff;
    });
    this.saveCommands(filtered);
  }

  // 文件操作
  loadGame() {
    try {
      const data = fs.readFileSync(GAME_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to load game state:', error.message);
      return this.createDefaultGameState();
    }
  }

  saveGame(gameState) {
    try {
      fs.writeFileSync(GAME_FILE, JSON.stringify(gameState, null, 2));
    } catch (error) {
      console.error('Failed to save game state:', error.message);
    }
  }

  loadCommands() {
    try {
      const data = fs.readFileSync(COMMANDS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to load commands:', error.message);
      return [];
    }
  }

  saveCommands(commands) {
    try {
      fs.writeFileSync(COMMANDS_FILE, JSON.stringify(commands, null, 2));
    } catch (error) {
      console.error('Failed to save commands:', error.message);
    }
  }

  // 清理方法
  cleanup() {
    try {
      if (fs.existsSync(GAME_FILE)) {
        fs.unlinkSync(GAME_FILE);
      }
      if (fs.existsSync(COMMANDS_FILE)) {
        fs.unlinkSync(COMMANDS_FILE);
      }
    } catch (error) {
      console.error('Failed to cleanup state files:', error.message);
    }
  }
}

// 单例实例
export const gameStateManager = new GameStateManager(); 