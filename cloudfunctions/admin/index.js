const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate
const courses = db.collection('courses')
const orders = db.collection('orders')
const categories = db.collection('categories')
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

function requireAdmin(openid) {
  if (adminOpenids().indexOf(openid) === -1) {
    const err = new Error('无管理权限')
    err.code = 403
    throw err
  }
}

function toCourseItem(course) {
  return {
    _id: course._id,
    title: course.title || '',
    cover: course.cover || '',
    price: Number(course.price) || 0,
    originalPrice: Number(course.originalPrice) || 0,
    categoryId: course.categoryId || '',
    categoryName: course.categoryName || '',
    summary: course.summary || '',
    status: course.status || 'on',
    sales: Number(course.sales) || 0,
    chapterCount: (course.chapters || []).length,
    updatedAt: course.updatedAt || null
  }
}

async function listCourses(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20))
  const where = {}
  if (event.status) where.status = event.status
  const keyword = String(event.keyword || '').trim()
  if (keyword) {
    where.title = db.RegExp({
      regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      options: 'i'
    })
  }

  let query = courses
  if (Object.keys(where).length) query = query.where(where)

  const res = await query
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  const countRes = Object.keys(where).length ? await courses.where(where).count() : await courses.count()

  return ok({
    list: res.data.map(toCourseItem),
    total: countRes.total,
    page,
    pageSize,
    hasMore: res.data.length === pageSize
  })
}

async function courseDetail(event) {
  if (!event.id) throw new Error('缺少课程参数')
  const res = await courses.doc(event.id).get().catch(() => null)
  if (!res || !res.data) {
    const err = new Error('课程不存在')
    err.code = 404
    throw err
  }
  const course = res.data
  return ok(
    Object.assign({}, course, {
      chapters: (course.chapters || []).map((chapter) => ({
        title: chapter.title || '',
        videoFileID: chapter.videoFileID || ''
      }))
    })
  )
}

async function saveCourse(event) {
  const input = event.course || {}
  const title = String(input.title || '').trim()
  if (!title) throw new Error('请填写课程标题')
  if (!input.cover) throw new Error('请上传课程封面')

  const price = Math.round(Number(input.price) || 0)
  if (price < 0) throw new Error('课程价格不合法')

  let categoryName = String(input.categoryName || '')
  if (input.categoryId) {
    const categoryRes = await categories.doc(input.categoryId).get().catch(() => null)
    if (categoryRes && categoryRes.data) categoryName = categoryRes.data.name
  }

  const chapters = (input.chapters || [])
    .map((chapter, index) => ({
      title: String(chapter.title || '').trim(),
      videoFileID: chapter.videoFileID || '',
      sort: index
    }))
    .filter((chapter) => chapter.title || chapter.videoFileID)

  const data = {
    title: title,
    cover: input.cover,
    categoryId: input.categoryId || '',
    categoryName: categoryName,
    price: price,
    originalPrice: Math.round(Number(input.originalPrice) || 0),
    summary: String(input.summary || '').slice(0, 200),
    detail: input.detail || '',
    chapters: chapters,
    chapterCount: chapters.length,
    status: input.status === 'off' ? 'off' : 'on',
    updatedAt: db.serverDate()
  }

  if (input._id) {
    await courses.doc(input._id).update({ data: data })
    return ok({ _id: input._id })
  }

  data.sales = 0
  data.createdAt = db.serverDate()
  const added = await courses.add({ data: data })
  return ok({ _id: added._id })
}

async function setCourseStatus(event) {
  if (!event.id) throw new Error('缺少课程参数')
  const status = event.status === 'off' ? 'off' : 'on'
  await courses.doc(event.id).update({
    data: { status: status, updatedAt: db.serverDate() }
  })
  return ok({ success: true, status: status })
}

async function removeCourse(event) {
  if (!event.id) throw new Error('缺少课程参数')
  await courses.doc(event.id).remove()
  return ok({ success: true })
}

async function listCategories() {
  const res = await categories.orderBy('sort', 'asc').limit(100).get()
  return ok(res.data.map((item) => ({ _id: item._id, name: item.name || '', sort: item.sort || 0 })))
}

async function saveCategory(event) {
  const name = String(event.name || '').trim()
  if (!name) throw new Error('请填写分类名称')

  const duplicated = await categories.where({ name: name }).limit(1).get()
  if (duplicated.data.length && duplicated.data[0]._id !== event.id) {
    throw new Error('分类名称已存在')
  }

  const data = { name: name, sort: Number(event.sort) || 0 }
  if (event.id) {
    await categories.doc(event.id).update({ data: data })
    return ok({ _id: event.id })
  }
  data.createdAt = db.serverDate()
  const added = await categories.add({ data: data })
  return ok({ _id: added._id })
}

async function removeCategory(event) {
  if (!event.id) throw new Error('缺少分类参数')
  await categories.doc(event.id).remove()
  return ok({ success: true })
}

async function listOrders(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20))
  const where = {}
  if (event.status) where.status = event.status

  let query = orders
  if (Object.keys(where).length) query = query.where(where)

  const res = await query
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  const openids = []
  res.data.forEach((order) => {
    if (order._openid && openids.indexOf(order._openid) === -1) openids.push(order._openid)
  })

  const userMap = {}
  if (openids.length) {
    const userRes = await users
      .where({ _openid: _.in(openids) })
      .field({ _openid: true, nickName: true, avatarUrl: true })
      .limit(100)
      .get()
    userRes.data.forEach((user) => {
      userMap[user._openid] = user
    })
  }

  const countRes = Object.keys(where).length ? await orders.where(where).count() : await orders.count()

  return ok({
    list: res.data.map((order) => {
      const user = userMap[order._openid] || {}
      return Object.assign({}, order, {
        nickName: user.nickName || '微信用户',
        avatarUrl: user.avatarUrl || ''
      })
    }),
    total: countRes.total,
    page,
    pageSize,
    hasMore: res.data.length === pageSize
  })
}

async function orderStats() {
  const paidAgg = await orders
    .aggregate()
    .match({ status: 'paid' })
    .group({ _id: null, amount: $.sum('$amount'), count: $.sum(1) })
    .end()
  const paid = paidAgg.list[0] || { amount: 0, count: 0 }

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const todayAgg = await orders
    .aggregate()
    .match({ status: 'paid', paidAt: _.gte(start) })
    .group({ _id: null, amount: $.sum('$amount'), count: $.sum(1) })
    .end()
  const today = todayAgg.list[0] || { amount: 0, count: 0 }

  const pendingRes = await orders.where({ status: 'pending' }).count()
  const orderCountRes = await orders.count()
  const courseCountRes = await courses.count()
  const userCountRes = await users.count()

  const topAgg = await orders
    .aggregate()
    .match({ status: 'paid' })
    .group({ _id: '$courseId', amount: $.sum('$amount'), count: $.sum(1) })
    .sort({ amount: -1 })
    .limit(5)
    .end()

  const topIds = topAgg.list.map((item) => item._id).filter(Boolean)
  const courseMap = {}
  if (topIds.length) {
    const courseRes = await courses
      .where({ _id: _.in(topIds) })
      .field({ title: true })
      .limit(10)
      .get()
    courseRes.data.forEach((course) => {
      courseMap[course._id] = course.title
    })
  }

  return ok({
    totalSales: paid.amount || 0,
    paidCount: paid.count || 0,
    todaySales: today.amount || 0,
    todayCount: today.count || 0,
    pendingCount: pendingRes.total,
    orderCount: orderCountRes.total,
    courseCount: courseCountRes.total,
    userCount: userCountRes.total,
    topCourses: topAgg.list.map((item) => ({
      courseId: item._id,
      title: courseMap[item._id] || '已删除课程',
      amount: item.amount || 0,
      count: item.count || 0
    }))
  })
}

exports.main = async (event) => {
  const data = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail('无法获取用户身份，请重试', 401)

  const action = data.action || 'check'
  try {
    if (action === 'check') return ok({ isAdmin: adminOpenids().indexOf(OPENID) > -1 })

    requireAdmin(OPENID)

    if (action === 'course.list') return await listCourses(data)
    if (action === 'course.detail') return await courseDetail(data)
    if (action === 'course.save') return await saveCourse(data)
    if (action === 'course.setStatus') return await setCourseStatus(data)
    if (action === 'course.remove') return await removeCourse(data)
    if (action === 'category.list') return await listCategories()
    if (action === 'category.save') return await saveCategory(data)
    if (action === 'category.remove') return await removeCategory(data)
    if (action === 'order.list') return await listOrders(data)
    if (action === 'order.stats') return await orderStats()

    return fail('未知操作', 404)
  } catch (err) {
    console.error('[admin]', action, err)
    return fail(err.message || '服务异常', err.code || 500)
  }
}
