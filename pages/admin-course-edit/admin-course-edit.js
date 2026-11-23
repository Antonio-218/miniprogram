const { adminApi, toastError } = require('../../utils/cloud')
const { fenToYuan } = require('../../utils/util')
const { uploadFile } = require('../../utils/upload')

function emptyForm() {
  return {
    title: '',
    cover: '',
    categoryId: '',
    categoryName: '',
    price: '',
    originalPrice: '',
    summary: '',
    detail: '',
    status: 'on',
    chapters: [{ title: '', videoFileID: '' }]
  }
}

Page({
  data: {
    id: '',
    form: emptyForm(),
    categories: [],
    categoryIndex: -1,
    saving: false
  },

  onLoad(options) {
    const id = (options && options.id) || ''
    this.setData({ id: id })
    wx.setNavigationBarTitle({ title: id ? '编辑课程' : '发布课程' })
    this.loadCategories().then(() => {
      if (id) this.loadCourse()
    })
  },

  onReady() {
    this.trySetContents()
  },

  loadCategories() {
    return adminApi
      .categoryList()
      .then((list) => {
        this.setData({ categories: list || [] })
      })
      .catch((err) => {
        toastError(err)
      })
  },

  loadCourse() {
    wx.showLoading({ title: '加载中', mask: true })
    adminApi
      .courseDetail(this.data.id)
      .then((course) => {
        const chapters = (course.chapters || []).map((item) => ({
          title: item.title || '',
          videoFileID: item.videoFileID || ''
        }))
        const categories = this.data.categories || []
        let categoryIndex = -1
        categories.forEach((item, index) => {
          if (item._id === course.categoryId) categoryIndex = index
        })

        this.setData({
          form: {
            title: course.title || '',
            cover: course.cover || '',
            categoryId: course.categoryId || '',
            categoryName: course.categoryName || '',
            price: course.price ? fenToYuan(course.price) : '',
            originalPrice: course.originalPrice ? fenToYuan(course.originalPrice) : '',
            summary: course.summary || '',
            detail: course.detail || '',
            status: course.status === 'off' ? 'off' : 'on',
            chapters: chapters.length ? chapters : [{ title: '', videoFileID: '' }]
          },
          categoryIndex: categoryIndex
        })

        this.pendingDetail = course.detail || ''
        this.trySetContents()
        wx.hideLoading()
      })
      .catch((err) => {
        wx.hideLoading()
        toastError(err)
      })
  },

  trySetContents() {
    if (!this.pendingDetail) return
    const html = this.pendingDetail
    wx.createSelectorQuery()
      .select('#editor')
      .context((res) => {
        if (!res || !res.context) return
        this.editorCtx = res.context
        this.editorCtx.setContents({ html: html })
        this.pendingDetail = ''
      })
      .exec()
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onEditorInput(e) {
    this.setData({ 'form.detail': (e.detail && e.detail.html) || '' })
  },

  onStatusChange(e) {
    this.setData({ 'form.status': e.detail.value ? 'on' : 'off' })
  },

  onCategoryChange(e) {
    const index = Number(e.detail.value)
    const category = (this.data.categories || [])[index]
    if (!category) return
    this.setData({
      categoryIndex: index,
      'form.categoryId': category._id,
      'form.categoryName': category.name
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
          .then(() => this.loadCategories())
          .then(() => {
            const list = this.data.categories || []
            let index = -1
            list.forEach((item, i) => {
              if (item.name === name) index = i
            })
            if (index > -1) {
              this.setData({
                categoryIndex: index,
                'form.categoryId': list[index]._id,
                'form.categoryName': list[index].name
              })
            }
            wx.showToast({ title: '分类已创建', icon: 'success' })
          })
          .catch(toastError)
      }
    })
  },

  chooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中', mask: true })
        uploadFile(filePath, 'covers')
          .then((fileID) => {
            wx.hideLoading()
            this.setData({ 'form.cover': fileID })
          })
          .catch((err) => {
            wx.hideLoading()
            toastError(err)
          })
      }
    })
  },

  addChapter() {
    this.setData({ 'form.chapters': this.data.form.chapters.concat([{ title: '', videoFileID: '' }]) })
  },

  removeChapter(e) {
    const index = Number(e.currentTarget.dataset.index)
    const chapters = this.data.form.chapters.slice()
    chapters.splice(index, 1)
    this.setData({ 'form.chapters': chapters })
  },

  onChapterTitleInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ ['form.chapters[' + index + '].title']: e.detail.value })
  },

  chooseVideo(e) {
    const index = Number(e.currentTarget.dataset.index)
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      maxDuration: 60,
      success: (res) => {
        const file = res.tempFiles[0]
        wx.showLoading({ title: '视频上传中', mask: true })
        uploadFile(file.tempFilePath, 'videos')
          .then((fileID) => {
            wx.hideLoading()
            this.setData({ ['form.chapters[' + index + '].videoFileID']: fileID })
            wx.showToast({ title: '视频已上传', icon: 'success' })
          })
          .catch((err) => {
            wx.hideLoading()
            toastError(err)
          })
      }
    })
  },

  removeChapterVideo(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({ ['form.chapters[' + index + '].videoFileID']: '' })
  },

  // 从相册批量上传录制好的课程视频，每个视频自动生成一节课
  addRecordedVideos() {
    if (this.data.saving) return
    wx.chooseMedia({
      count: 9,
      mediaType: ['video'],
      sourceType: ['album'],
      success: (res) => {
        const files = res.tempFiles || []
        if (!files.length) return
        const total = files.length
        const run = (i) => {
          if (i >= total) {
            wx.hideLoading()
            wx.showToast({ title: '已添加 ' + total + ' 节录制视频', icon: 'success' })
            return
          }
          wx.showLoading({ title: '上传 ' + (i + 1) + '/' + total, mask: true })
          uploadFile(files[i].tempFilePath, 'videos')
            .then((fileID) => {
              const chapters = this.data.form.chapters.concat([
                { title: '', videoFileID: fileID }
              ])
              this.setData({ 'form.chapters': chapters })
              run(i + 1)
            })
            .catch((err) => {
              wx.hideLoading()
              toastError(err)
            })
        }
        run(0)
      }
    })
  },

  onSave() {
    if (this.data.saving) return
    const form = this.data.form

    if (!String(form.title).trim()) {
      wx.showToast({ title: '请填写课程标题', icon: 'none' })
      return
    }
    if (!form.cover) {
      wx.showToast({ title: '请上传课程封面', icon: 'none' })
      return
    }
    if (!form.categoryId) {
      wx.showToast({ title: '请选择课程分类', icon: 'none' })
      return
    }
    const price = Number(form.price || 0)
    if (isNaN(price) || price < 0) {
      wx.showToast({ title: '课程价格填写有误', icon: 'none' })
      return
    }

    const chapters = form.chapters
      .filter((item) => String(item.title).trim() || item.videoFileID)
      .map((item) => ({
        title: String(item.title).trim() || '未命名章节',
        videoFileID: item.videoFileID || ''
      }))

    this.setData({ saving: true })
    adminApi
      .saveCourse({
        _id: this.data.id || undefined,
        title: String(form.title).trim(),
        cover: form.cover,
        categoryId: form.categoryId,
        categoryName: form.categoryName,
        price: Math.round(price * 100),
        originalPrice: Math.round(Number(form.originalPrice || 0) * 100),
        summary: form.summary,
        detail: form.detail,
        chapters: chapters,
        status: form.status
      })
      .then(() => {
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 600)
      })
      .catch((err) => {
        this.setData({ saving: false })
        toastError(err)
      })
  }
})
