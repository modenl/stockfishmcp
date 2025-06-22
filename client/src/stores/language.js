import { writable } from 'svelte/store';

// 语言翻译对象
const translations = {
  zh: {
    // 游戏信息
    gameInfo: '游戏信息',
    mode: '模式',
    status: '状态',
    turn: '轮次',
    yourColor: '你的颜色',
    aiLevel: 'AI等级',
    thinkingTime: '思考时间',
    aiStatus: 'AI状态',
    moves: '移动数',
    
    // 游戏模式
    humanVsHuman: '人vs人',
    humanVsAi: '人vs电脑',
    
    // 游戏状态
    playing: '进行中',
    ended: '已结束',
    analysis: '分析中',
    
    // 颜色
    white: '白方',
    black: '黑方',
    whiteFirst: '白方 (先手)',
    blackSecond: '黑方 (后手)',
    
    // AI状态
    aiThinking: '思考中...',
    
    // 按钮
    newGame: '新游戏',
    resign: '认输',
    analyzePosition: '分析局面',
    cancel: '取消',
    startGame: '开始游戏',
    
    // 新游戏对话框
    selectGameMode: '选择游戏模式',
    twoPlayersAlternate: '两个玩家轮流下棋',
    playAgainstAi: '与AI对弈，可设置AI强度和思考时间',
    selectYourColor: '选择你的颜色',
    aiSettings: 'AI强度设置',
    eloRating: 'ELO等级',
    thinkingTimeLabel: '思考时间',
    seconds: '秒',
    beginner: '初学者',
    master: '大师级',
    fast: '快速',
    deepThinking: '深度思考',
    
    // 状态栏
    connectionStatus: '连接状态',
    engineReady: '引擎就绪',
    sessionActive: '会话活跃',
    
    // 设置
    settings: '设置',
    language: '语言',
    chinese: '中文',
    english: 'English',
    
    // 复盘功能
    gameReplay: '游戏复盘',
    replayCurrentGame: '复盘当前游戏',
    sampleGames: '示例游戏',
    scholarsMate: '学者将死',
    italianGame: '意大利开局',
    sicilianDefense: '西西里防御',
    loadPgnFile: '加载PGN文件',
    moveHistory: '移动历史',
    startingPosition: '起始位置',
    move: '移动',
    playSpeed: '播放速度',
    gameInformation: '游戏信息',
    result: '结果',
    date: '日期',
    event: '赛事',
    site: '地点',
    round: '轮次'
  },
  en: {
    // Game info
    gameInfo: 'Game Info',
    mode: 'Mode',
    status: 'Status',
    turn: 'Turn',
    yourColor: 'Your Color',
    aiLevel: 'AI Level',
    thinkingTime: 'Thinking Time',
    aiStatus: 'AI Status',
    moves: 'Moves',
    
    // Game modes
    humanVsHuman: 'Human vs Human',
    humanVsAi: 'Human vs AI',
    
    // Game status
    playing: 'Playing',
    ended: 'Ended',
    analysis: 'Analysis',
    
    // Colors
    white: 'White',
    black: 'Black',
    whiteFirst: 'White (First)',
    blackSecond: 'Black (Second)',
    
    // AI status
    aiThinking: 'AI Thinking...',
    
    // Buttons
    newGame: 'New Game',
    resign: 'Resign',
    analyzePosition: 'Analyze Position',
    cancel: 'Cancel',
    startGame: 'Start Game',
    
    // New game dialog
    selectGameMode: 'Select Game Mode',
    twoPlayersAlternate: 'Two players take turns',
    playAgainstAi: 'Play against AI with customizable strength and thinking time',
    selectYourColor: 'Select Your Color',
    aiSettings: 'AI Strength Settings',
    eloRating: 'ELO Rating',
    thinkingTimeLabel: 'Thinking Time',
    seconds: 'seconds',
    beginner: 'Beginner',
    master: 'Master',
    fast: 'Fast',
    deepThinking: 'Deep Thinking',
    
    // Status bar
    connectionStatus: 'Connection Status',
    engineReady: 'Engine Ready',
    sessionActive: 'Session Active',
    
    // Settings
    settings: 'Settings',
    language: 'Language',
    chinese: '中文',
    english: 'English',
    
    // Replay functionality
    gameReplay: 'Game Replay',
    replayCurrentGame: 'Replay Current Game',
    sampleGames: 'Sample Games',
    scholarsMate: "Scholar's Mate",
    italianGame: 'Italian Game',
    sicilianDefense: 'Sicilian Defense',
    loadPgnFile: 'Load PGN File',
    moveHistory: 'Move History',
    startingPosition: 'Starting Position',
    move: 'Move',
    playSpeed: 'Play Speed',
    gameInformation: 'Game Information',
    result: 'Result',
    date: 'Date',
    event: 'Event',
    site: 'Site',
    round: 'Round'
  }
};

function createLanguageStore() {
  // 默认语言设置
  const defaultLanguage = 'zh';
  
  // 从localStorage读取保存的语言设置
  let initialLanguage = defaultLanguage;
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('chess-trainer-language');
    if (saved && (saved === 'zh' || saved === 'en')) {
      initialLanguage = saved;
    }
  }
  
  const { subscribe, set, update } = writable(initialLanguage);
  
  function setLanguage(lang) {
    if (lang === 'zh' || lang === 'en') {
      set(lang);
      if (typeof window !== 'undefined') {
        localStorage.setItem('chess-trainer-language', lang);
      }
    }
  }
  
  function toggleLanguage() {
    update(current => {
      const newLang = current === 'zh' ? 'en' : 'zh';
      if (typeof window !== 'undefined') {
        localStorage.setItem('chess-trainer-language', newLang);
      }
      return newLang;
    });
  }
  
  function getTranslation(key, lang = null) {
    let currentLang = lang;
    if (!currentLang) {
      // 如果没有提供语言，需要从store获取当前语言
      const unsubscribe = subscribe(value => {
        currentLang = value;
      });
      unsubscribe();
    }
    
    return translations[currentLang]?.[key] || key;
  }
  
  return {
    subscribe,
    setLanguage,
    toggleLanguage,
    getTranslation,
    translations
  };
}

export const languageStore = createLanguageStore(); 