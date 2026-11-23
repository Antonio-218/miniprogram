const { courseApi, orderApi, toastError } = require('../../utils/cloud')
const { priceText, fenToYuan } = require('../../utils/util')
const { requestPayment, isCancel } = require('../../utils/pay')

Page({
  data: {
    id: '',
    course: null,
    loading: true,
    paying: false
  },

  onLoad(options) {
    const id = (options && options.id) || ''
    this.setData({ id: id })
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
    if (!id) {
      this.setData({ loading: false })
      return
    }
    this.load()
  },

  onShow() {
    if (this.loaded) this.load()
  },

  load() {
    return courseApi
      .detail(this.data.id)
      .then((course) => {
        this.loaded = true
        this.setData({
          course: Object.assign({}, course, {
            priceText: priceText(course.price),
            originalPriceText: course.originalPrice ? fenToYuan(course.originalPrice) : '',
            sales: course.sales || 0
          }),
          loading: false
        })
        wx.setNavigationBarTitle({ title: course.title || '课程详情' })
      })
      .catch((err) => {
        this.setData({ loading: false })
        toastError(err)
      })
  },

  onBuyTap() {
    const course = this.data.course
    if (!course || this.data.paying) return
    if (course.purchased) {
      this.goStudy()
      return
    }
    this.createOrder()
  },

  createOrder() {
    const course = this.data.course
    if (!course) return

    this.setData({ paying: true })
    orderApi
      .create(course._id)
      .then((res) => {
        if (res.paid) return this.afterPaid()
        return requestPayment(res.payment)
          .then(() => orderApi.confirm(res.orderId).catch(() => null))
          .then(() => this.afterPaid())
      })
      .catch((err) => {
        this.setData({ paying: false })
        if (isCancel(err)) {
          wx.showToast({ title: '已取消支付', icon: 'none' })
          return
        }
        toastError(err)
      })
  },

  afterPaid() {
    const course = this.data.course || {}
    return this.load().then(() => {
      const latest = this.data.course || {}
      this.setData({ paying: false })
      if (latest.purchased || latest.canStudy) {
        wx.showToast({ title: course.price === 0 ? '已加入我的课程' : '购买成功', icon: 'success' })
      } else {
        wx.showToast({ title: '支付结果处理中，请稍后刷新', icon: 'none' })
      }
    })
  },

  goStudy() {
    const course = this.data.course
    if (!course) return
    wx.navigateTo({ url: '/pages/study/study?id=' + course._id })
  },

  onChapterTap(e) {
    const index = e.currentTarget.dataset.index
    const course = this.data.course
    if (!course) return
    const chapter = (course.chapters || [])[index]
    if (!chapter) return
    if (chapter.locked) {
      wx.showToast({ title: '购买后即可学习', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/study/study?id=' + course._id + '&chapter=' + index })
  },

  onShareAppMessage() {
    const course = this.data.course || {}
    return {
      title: course.title || '云课 · 精选好课',
      path: '/pages/course-detail/course-detail?id=' + this.data.id,
      imageUrl: course.cover || ''
    }
  },

  onShareTimeline() {
    const course = this.data.course || {}
    return {
      title: course.title || '云课 · 精选好课',
      query: 'id=' + this.data.id,
      imageUrl: course.cover || ''
    }
  }
})
