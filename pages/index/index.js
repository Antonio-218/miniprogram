const { courseApi, toastError, pageSize } = require('../../utils/cloud')
const { priceText } = require('../../utils/util')

Page({
  data: {
    keyword: '',
    categories: [],
    activeCategory: '',
    courses: [],
    page: 1,
    loading: false,
    noMore: false
  },

  onLoad() {
    this.loadCategories()
    this.fetch(true)
  },

  onPullDownRefresh() {
    this.loadCategories()
    this.fetch(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.fetch(false)
  },

  loadCategories() {
    courseApi
      .categories()
      .then((list) => {
        this.setData({ categories: list || [] })
      })
      .catch(() => {})
  },

  fetch(reset) {
    if (this.data.loading) return Promise.resolve()
    if (!reset && this.data.noMore) return Promise.resolve()

    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })

    return courseApi
      .list({
        keyword: this.data.keyword,
        categoryId: this.data.activeCategory,
        page: page,
        pageSize: pageSize
      })
      .then((res) => {
        const list = (res.list || []).map((item) =>
          Object.assign({}, item, {
            priceText: priceText(item.price),
            sales: item.sales || 0
          })
        )
        this.setData({
          courses: reset ? list : this.data.courses.concat(list),
          page: page,
          noMore: list.length < pageSize
        })
      })
      .catch((err) => {
        toastError(err)
      })
      .then(() => {
        this.setData({ loading: false })
      })
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ keyword: this.data.keyword.trim() })
    this.fetch(true)
  },

  onClearKeyword() {
    this.setData({ keyword: '' })
    this.fetch(true)
  },

  onCategoryTap(e) {
    const id = e.currentTarget.dataset.id || ''
    if (id === this.data.activeCategory) return
    this.setData({ activeCategory: id })
    this.fetch(true)
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/course-detail/course-detail?id=' + id })
  },

  goMyCourses() {
    wx.navigateTo({ url: '/pages/my-courses/my-courses' })
  },

  goMine() {
    wx.navigateTo({ url: '/pages/mine/mine' })
  },

  onShareAppMessage() {
    return { title: '云课 · 精选好课', path: '/pages/index/index' }
  }
})
