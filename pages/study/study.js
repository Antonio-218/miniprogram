const { courseApi, toastError } = require('../../utils/cloud')

Page({
  data: {
    id: '',
    course: null,
    chapters: [],
    activeIndex: 0,
    current: {},
    locked: false,
    loading: true
  },

  onLoad(options) {
    const id = (options && options.id) || ''
    const chapter = options && options.chapter !== undefined ? Number(options.chapter) : null
    this.setData({ id: id })
    if (!id) {
      this.setData({ loading: false, locked: true })
      return
    }
    this.load(isNaN(chapter) ? null : chapter)
  },

  onShow() {
    if (this.needReload) {
      this.needReload = false
      this.load(this.data.activeIndex)
    }
  },

  load(chapterIndex) {
    return courseApi
      .detail(this.data.id)
      .then((course) => {
        const chapters = course.chapters || []
        const locked = !course.canStudy

        let index = chapterIndex
        if (index === null || index === undefined || !chapters[index]) {
          const stored = wx.getStorageSync('study_chapter_' + this.data.id)
          index = typeof stored === 'number' && chapters[stored] ? stored : 0
        }

        this.setData({
          course: course,
          chapters: chapters,
          locked: locked,
          loading: false,
          activeIndex: index,
          current: chapters[index] || {}
        })
        wx.setNavigationBarTitle({ title: course.title || '学习' })
        if (locked) {
          wx.showToast({ title: '购买后即可学习', icon: 'none' })
        }
      })
      .catch((err) => {
        this.setData({ loading: false, locked: true })
        toastError(err)
      })
  },

  onSwitch(e) {
    const index = Number(e.currentTarget.dataset.index)
    const chapter = this.data.chapters[index]
    if (!chapter) return
    if (chapter.locked) {
      wx.showToast({ title: '购买后即可学习', icon: 'none' })
      return
    }
    this.setData({ activeIndex: index, current: chapter })
    wx.setStorageSync('study_chapter_' + this.data.id, index)
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  goBuy() {
    wx.redirectTo({ url: '/pages/course-detail/course-detail?id=' + this.data.id })
  }
})
