const { orderApi, toastError, pageSize } = require('../../utils/cloud')
const { priceText, statusText, formatTime } = require('../../utils/util')
const { requestPayment, isCancel } = require('../../utils/pay')

const TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待支付' },
  { key: 'paid', label: '已支付' },
  { key: 'cancelled', label: '已取消' }
]

Page({
  data: {
    tabs: TABS,
    status: '',
    list: [],
    page: 1,
    loading: false,
    noMore: false,
    paying: false
  },

  onLoad() {
    this.fetch(true)
  },

  onPullDownRefresh() {
    this.fetch(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.fetch(false)
  },

  switchTab(e) {
    const status = e.currentTarget.dataset.status || ''
    if (status === this.data.status) return
    this.setData({ status: status })
    this.fetch(true)
  },

  fetch(reset) {
    if (this.data.loading) return Promise.resolve()
    if (!reset && this.data.noMore) return Promise.resolve()

    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })

    return orderApi
      .list({ status: this.data.status, page: page, pageSize: pageSize })
      .then((res) => {
        const list = (res.list || []).map((item) =>
          Object.assign({}, item, {
            amountText: priceText(item.amount),
            statusText: statusText(item.status),
            timeText: formatTime(item.createdAt)
          })
        )
        this.setData({
          list: reset ? list : this.data.list.concat(list),
          page: page,
          noMore: list.length < pageSize
        })
      })
      .catch(toastError)
      .then(() => {
        this.setData({ loading: false })
      })
  },

  onPay(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.paying) return

    this.setData({ paying: true })
    orderApi
      .pay(id)
      .then((res) => {
        if (res.paid) {
          wx.showToast({ title: '支付成功', icon: 'success' })
          return this.fetch(true)
        }
        return requestPayment(res.payment)
          .then(() => orderApi.confirm(id))
          .then(() => {
            wx.showToast({ title: '支付成功', icon: 'success' })
            return this.fetch(true)
          })
      })
      .catch((err) => {
        if (isCancel(err)) {
          wx.showToast({ title: '已取消支付', icon: 'none' })
          return
        }
        toastError(err)
      })
      .then(() => {
        this.setData({ paying: false })
      })
  },

  onCancel(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '取消订单',
      content: '确定要取消该订单吗？',
      success: (res) => {
        if (!res.confirm) return
        orderApi
          .cancel(id)
          .then(() => {
            wx.showToast({ title: '订单已取消', icon: 'success' })
            this.fetch(true)
          })
          .catch(toastError)
      }
    })
  },

  goCourse(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/course-detail/course-detail?id=' + id })
  }
})
