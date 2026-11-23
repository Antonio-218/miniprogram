const config = require('./config')

/**
 * 统一的云函数调用封装：云函数统一返回 { code, data, message }
 * code === 0 表示成功，其余为业务/系统错误
 */
function call(name, action, data) {
  return wx.cloud
    .callFunction({
      name,
      data: Object.assign({ action }, data || {})
    })
    .then((res) => {
      const result = (res && res.result) || {}
      if (result.code !== 0) {
        const err = new Error(result.message || '请求失败')
        err.code = result.code
        throw err
      }
      return result.data
    })
    .catch((err) => {
      // 网络层/云函数未部署等异常，统一转成可读信息
      if (err && err.code === undefined && !err.message) {
        throw new Error('网络异常，请稍后再试')
      }
      throw err
    })
}

function toastError(err) {
  const message = (err && err.message) || '网络异常，请稍后再试'
  wx.showToast({ title: message, icon: 'none' })
}

const userApi = {
  login: () => call('user', 'login'),
  updateProfile: (data) => call('user', 'updateProfile', data)
}

const courseApi = {
  list: (params) => call('course', 'list', params),
  detail: (id) => call('course', 'detail', { id }),
  categories: () => call('course', 'categories'),
  myCourses: () => call('course', 'myCourses')
}

const orderApi = {
  create: (courseId) => call('order', 'create', { courseId }),
  pay: (orderId) => call('order', 'pay', { orderId }),
  confirm: (orderId) => call('order', 'confirm', { orderId }),
  list: (params) => call('order', 'list', params),
  cancel: (orderId) => call('order', 'cancel', { orderId })
}

const adminApi = {
  check: () => call('admin', 'check'),
  courseList: (params) => call('admin', 'course.list', params),
  courseDetail: (id) => call('admin', 'course.detail', { id }),
  saveCourse: (course) => call('admin', 'course.save', { course }),
  setCourseStatus: (id, status) => call('admin', 'course.setStatus', { id, status }),
  removeCourse: (id) => call('admin', 'course.remove', { id }),
  categoryList: () => call('admin', 'category.list'),
  saveCategory: (data) => call('admin', 'category.save', data),
  removeCategory: (id) => call('admin', 'category.remove', { id }),
  orderList: (params) => call('admin', 'order.list', params),
  stats: () => call('admin', 'order.stats')
}

module.exports = {
  call,
  toastError,
  userApi,
  courseApi,
  orderApi,
  adminApi,
  pageSize: config.pageSize
}
