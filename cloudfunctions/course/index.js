const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const courses = db.collection('courses')
const categories = db.collection('categories')
const orders = db.collection('orders')
const users = db.collection('users')

function ok(data) {
  return { code: 0, data: data === undefined ? null : data }
}

function fail(message, code) {
  return { code: code || 1, message: message || '请求失败' }
}

function adminOpenids() {
  return (process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toListItem(course) {
  return {
    _id: course._id,
    title: course.title || '',
    cover: course.cover || '',
    price: Number(course.price) || 0,
    originalPrice: Number(course.originalPrice) || 0,
    sales: Number(course.sales) || 0,
    categoryId: course.categoryId || '',
    categoryName: course.categoryName || '',
    summary: course.summary || '',
    chapterCount: (course.chapters || []).length
  }
}

/**
 * 已购课程 ID 列表：优先取 users.purchased，兜底取已支付订单
 */
async function getPurchases(openid) {
  const userRes = await users.where({ _openid: openid }).limit(1).get()
  const user = userRes.data[0]
  const purchased = (user && user.purchased) || []
  if (purchased.length) {
    return purchased.map((item) => ({ courseId: item.courseId, createdAt: item.createdAt }))
  }
  const orderRes = await orders
    .where({ _openid: openid, status: 'paid' })
    .field({ courseId: true, createdAt: true })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  return orderRes.data.map((item) => ({ courseId: item.courseId, createdAt: item.createdAt }))
}

async function listCourses(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(20, Math.max(1, Number(event.pageSize) || 10))
  const where = { status: 'on' }
  if (event.categoryId) where.categoryId = event.categoryId

  const keyword = String(event.keyword || '').trim()
  if (keyword) {
    where.title = db.RegExp({
      regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      options: 'i'
    })
  }

  const res = await courses
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return ok({
    list: res.data.map(toListItem),
    page,
    pageSize,
    hasMore: res.data.length === pageSize
  })
}

async function courseDetail(event, openid) {
  const id = event.id
  if (!id) return fail('缺少课程参数')

  const res = await courses.doc(id).get().catch(() => null)
  if (!res || !res.data) return fail('课程不存在或已删除', 404)

  const course = res.data
  const isAdmin = adminOpenids().indexOf(openid) > -1
  const purchases = await getPurchases(openid)
  const purchased = purchases.some((item) => item.courseId === id)

  if (course.status !== 'on' && !purchased && !isAdmin) {
    return fail('课程已下架', 404)
  }

  const canStudy = purchased || Number(course.price) === 0 || isAdmin
  const chapters = (course.chapters || []).map((chapter, index) => ({
    index,
    title: chapter.title || '未命名章节',
    duration: chapter.duration || '',
    videoFileID: canStudy ? chapter.videoFileID || '' : '',
    locked: !canStudy
  }))

  return ok({
    _id: course._id,
    title: course.title || '',
    cover: course.cover || '',
    price: Number(course.price) || 0,
    originalPrice: Number(course.originalPrice) || 0,
    sales: Number(course.sales) || 0,
    categoryId: course.categoryId || '',
    categoryName: course.categoryName || '',
    summary: course.summary || '',
    detail: canStudy ? course.detail || '' : '',
    chapters,
    chapterCount: chapters.length,
    purchased,
    canStudy,
    status: course.status || 'on'
  })
}

async function myCourses(openid) {
  const purchases = await getPurchases(openid)
  const ids = purchases.map((item) => item.courseId).filter(Boolean)
  if (!ids.length) return ok({ list: [] })

  const res = await courses.where({ _id: _.in(ids) }).limit(100).get()
  const map = {}
  res.data.forEach((course) => {
    map[course._id] = course
  })

  const list = []
  purchases.forEach((item) => {
    const course = map[item.courseId]
    if (!course) return
    list.push(
      Object.assign(toListItem(course), {
        purchasedAt: item.createdAt || null,
        status: course.status || 'on'
      })
    )
  })
  return ok({ list })
}

exports.main = async (event) => {
  const data = event || {}
  const { OPENID } = cloud.getWXContext()
  const action = data.action || 'list'

  try {
    if (!OPENID) return fail('无法获取用户身份，请重试', 401)
    if (action === 'list') return await listCourses(data)
    if (action === 'detail') return await courseDetail(data, OPENID)
    if (action === 'myCourses') return await myCourses(OPENID)
    if (action === 'categories') {
      const res = await categories.orderBy('sort', 'asc').limit(100).get()
      return ok(res.data.map((item) => ({ _id: item._id, name: item.name, sort: item.sort || 0 })))
    }
    return fail('未知操作', 404)
  } catch (err) {
    console.error('[course]', action, err)
    return fail(err.message || '服务异常', 500)
  }
}
