const config = require('./utils/config')

App({
  globalData: {
    userInfo: null,
    isAdmin: false,
    cloudReady: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请使用 2.2.3 及以上版本以使用云开发能力')
      return
    }
    const options = { traceUser: true }
    if (config.envId) {
      options.env = config.envId
    }
    wx.cloud.init(options)
    this.globalData.cloudReady = true
  }
})
