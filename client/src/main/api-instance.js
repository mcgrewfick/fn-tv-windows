/**
 * 全局 API 实例（供 player.js 等模块共享）
 */
const { FnClient } = require('./api');

let api = new FnClient();

module.exports = {
  getApi: () => api,
  setApi: (a) => { api = a; },
  newApi: (baseUrl) => new FnClient(baseUrl),
};
