const { userApi, toastError } = require('../../utils/cloud')
const { uploadFile } = require('../../utils/upload')

Page({
  data: {
    user: {},
    isAdmin: false,
    purchasedCount: 0,
    nickInitial: '学',
    loading: true,
    saving: false
  },

  onShow() {
    this.loadUser()
  },

  loadUser() {
    userApi
      .login()
      .then((res) => {
        this.applyUser(res.user || {}, res.isAdmin, res.purchasedCount)
      })
      .catch((err) => {
        this.setData({ loading: false })
        toastError(err)
      })
  },

  applyUser(user, isAdmin, purchasedCount) {
    this.setData({
      user: user,
      isAdmin: isAdmin === undefined ? this.data.isAdmin : !!isAdmin,
      purchasedCount:
        purchasedCount === undefined ? (user.purchased || []).length : purchasedCount,
      nickInitial: (user.nickName || '学').slice(0, 1),
      loading: false
    })
  },

  onChooseAvatar(e) {
    const filePath = e.detail.avatarUrl
    if (!filePath) return
    wx.showLoading({ title: '上传中', mask: true })
    uploadFile(filePath, 'avatars')
      .then((fileID) => userApi.updateProfile({ avatarUrl: fileID }))
      .then((user) => {
        wx.hideLoading()
        this.applyUser(user)
        wx.showToast({ title: '头像已更新', icon: 'success' })
      })
      .catch((err) => {
        wx.hideLoading()
        toastError(err)
      })
  },

  onNickBlur(e) {
    const nickName = String(e.detail.value || '').trim()
    if (!nickName || nickName === this.data.user.nickName) return
    userApi
      .updateProfile({ nickName: nickName })
      .then((user) => {
        this.applyUser(user)
        wx.showToast({ title: '昵称已更新', icon: 'success' })
      })
      .catch(toastError)
  },

  goMyCourses() {
    wx.navigateTo({ url: '/pages/my-courses/my-courses' })
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' })
  },

  goAdmin() {
    if (!this.data.isAdmin) return
    wx.navigateTo({ url: '/pages/admin/admin' })
  }
})
