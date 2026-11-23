const { adminApi, toastError } = require('../../utils/cloud')
const { priceText, statusText, formatTime, fenToYuan } = require('../../utils/util')

const ORDER_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待支付' },
  { key: 'paid', label: '已支付' },
  { key: 'cancelled', label: '已取消' }
]

const ORDER_PAGE_SIZE = 20

Page({
  data: {
    authorized: null,
    tab: 'course',
    courses: [],
    courseLoading: false,
    categories: [],
    orderTabs: ORDER_TABS,
    orders: [],
    orderStatus: '',
    orderPage: 1,
    orderNoMore: false,
    orderLoading: false,
    stats: null,
    statsLoading: false
  },

  onLoad() {
    adminApi
      .check()
      .then((res) => {
        const authorized = !!res.isAdmin
        this.setData({ authorized: authorized })
        if (authorized) {
          this.loadCourses()
          this.loadCategories()
        }
      })
      .catch((err) => {
        this.setData({ authorized: false })
        toastError(err)
      })
  },

  onShow() {
    if (this.needRefresh) {
      this.needRefresh = false
      this.loadCourses()
      this.loadCategories()
      this.loadStats()
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.tab) return
    this.setData({ tab: tab })
    if (tab === 'order' && !this.data.orders.length) this.fetchOrders(true)
    if (tab === 'stats' && !this.data.stats) this.loadStats()
  },

  loadCourses() {
    this.setData({ courseLoading: true })
    adminApi
      .courseList({ page: 1, pageSize: 50 })
      .then((res) => {
        const courses = (res.list || []).map((item) =>
          Object.assign({}, item, { priceText: priceText(item.price) })
        )
        this.setData({ courses: courses, courseLoading: false })
      })
      .catch((err) => {
        this.setData({ courseLoading: false })
        toastError(err)
      })
  },

  loadCategories() {
    adminApi
      .categoryList()
      .then((list) => this.setData({ categories: list || [] }))
      .catch(() => {})
  },

  onCourseStatusChange(e) {
    const id = e.currentTarget.dataset.id
    const status = e.detail.value ? 'on' : 'off'
    adminApi
      .setCourseStatus(id, status)
      .then(() => {
        const courses = this.data.courses.map((item) =>
          item._id === id ? Object.assign({}, item, { status: status }) : item
        )
        this.setData({ courses: courses })
        wx.showToast({ title: status === 'on' ? '已上架' : '已下架', icon: 'success' })
      })
      .catch((err) => {
        toastError(err)
        this.loadCourses()
      })
  },

  addCourse() {
    this.needRefresh = true
    wx.navigateTo({ url: '/pages/admin-course-edit/admin-course-edit' })
  },

  editCourse(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.needRefresh = true
    wx.navigateTo({ url: '/pages/admin-course-edit/admin-course-edit?id=' + id })
  },

  removeCourse(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除课程',
      content: '删除后课程将无法恢复，已购用户也将无法继续学习，确定删除？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (!res.confirm) return
        adminApi
          .removeCourse(id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadCourses()
          })
          .catch(toastError)
      }
    })
  },

  onAddCategory() {
    wx.showModal({
      title: '新建分类',
      editable: true,
      placeholderText: '请输入分类名称',
      success: (res) => {
        if (!res.confirm) return
        const name = (res.content || '').trim()
        if (!name) {
          wx.showToast({ title: '分类名称不能为空', icon: 'none' })
          return
        }
        adminApi
          .saveCategory({ name: name })
          .then(() => {
            wx.showToast({ title: '已创建', icon: 'success' })
            this.loadCategories()
          })
          .catch(toastError)
      }
    })
  },

  onRemoveCategory(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除分类',
      content: '删除后该分类下的课程将显示为未分类，确定删除？',
      success: (res) => {
        if (!res.confirm) return
        adminApi
          .removeCategory(id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadCategories()
          })
          .catch(toastError)
      }
    })
  },

  onOrderTab(e) {
    const status = e.currentTarget.dataset.status || ''
    if (status === this.data.orderStatus) return
    this.setData({ orderStatus: status })
    this.fetchOrders(true)
  },

  fetchOrders(reset) {
    if (this.data.orderLoading) return Promise.resolve()
    if (!reset && this.data.orderNoMore) return Promise.resolve()

    const page = reset ? 1 : this.data.orderPage + 1
    this.setData({ orderLoading: true })

    return adminApi
      .orderList({
        status: this.data.orderStatus,
        page: page,
        pageSize: ORDER_PAGE_SIZE
      })
      .then((res) => {
        const list = (res.list || []).map((item) =>
          Object.assign({}, item, {
            amountText: priceText(item.amount),
            statusText: statusText(item.status),
            timeText: formatTime(item.createdAt)
          })
        )
        this.setData({
          orders: reset ? list : this.data.orders.concat(list),
          orderPage: page,
          orderNoMore: list.length < ORDER_PAGE_SIZE
        })
      })
      .catch(toastError)
      .then(() => {
        this.setData({ orderLoading: false })
      })
  },

  loadMoreOrders() {
    this.fetchOrders(false)
  },

  loadStats() {
    this.setData({ statsLoading: true })
    adminApi
      .stats()
      .then((stats) => {
        this.setData({
          stats: Object.assign({}, stats, {
            totalSalesText: fenToYuan(stats.totalSales),
            todaySalesText: fenToYuan(stats.todaySales),
            topCourses: (stats.topCourses || []).map((item) =>
              Object.assign({}, item, { amountText: fenToYuan(item.amount) })
            )
          }),
          statsLoading: false
        })
      })
      .catch((err) => {
        this.setData({ statsLoading: false })
        toastError(err)
      })
  }
})
