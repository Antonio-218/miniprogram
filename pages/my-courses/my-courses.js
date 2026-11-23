const { courseApi, toastError } = require('../../utils/cloud')
const { priceText } = require('../../utils/util')

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  load() {
    return courseApi
      .myCourses()
      .then((res) => {
        const list = (res.list || []).map((item) =>
          Object.assign({}, item, {
            priceText: priceText(item.price)
          })
        )
        this.setData({ list: list, loading: false })
      })
      .catch((err) => {
        this.setData({ loading: false })
        toastError(err)
      })
  },

  goStudy(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/study/study?id=' + id })
  },

  goHome() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
})
