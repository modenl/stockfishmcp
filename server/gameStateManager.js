import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 共享状态文件路径
const STATE_DIR = path.join(__dirname, '..', '.state');
const GAMES_FILE = path.join(STATE_DIR, 'active_games.json');
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
    if (!fs.existsSync(GAMES_FILE)) {
      this.saveGames({});
    }
    if (!fs.existsSync(COMMANDS_FILE)) {
      this.saveCommands([]);
    }
  }

  // 游戏状态管理
  saveGameState(gameId, gameState) {
    const games = this.loadGames();
    games[gameId] = {
      ...gameState,
      lastUpdated: new Date().toISOString()
    };
    this.saveGames(games);
  }

  getGameState(gameId) {
    const games = this.loadGames();
    return games[gameId] || null;
  }

  getAllActiveGames() {
    const games = this.loadGames();
    return Object.entries(games)
      .filter(([_, game]) => game.active)
      .map(([gameId, game]) => ({ gameId, ...game }));
  }

  removeGame(gameId) {
    const games = this.loadGames();
    delete games[gameId];
    this.saveGames(games);
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
  loadGames() {
    try {
      const data = fs.readFileSync(GAMES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Failed to load games state:', error.message);
      return {};
    }
  }

  saveGames(games) {
    try {
      fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
    } catch (error) {
      console.error('Failed to save games state:', error.message);
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
      if (fs.existsSync(GAMES_FILE)) {
        fs.unlinkSync(GAMES_FILE);
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