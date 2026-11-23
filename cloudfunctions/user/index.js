const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
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

/**
 * 获取或创建用户记录（云函数写入需手动设置 _openid）
 */
async function ensureUser(openid) {
  const res = await users.where({ _openid: openid }).limit(1).get()
  if (res.data.length) return res.data[0]

  const doc = {
    _openid: openid,
    nickName: '',
    avatarUrl: '',
    purchased: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const added = await users.add({ data: doc })
  return Object.assign({ _id: added._id }, doc)
}

exports.main = async (event) => {
  const data = event || {}
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail('无法获取用户身份，请重试', 401)

  const action = data.action || 'login'

  try {
    if (action === 'login') {
      const user = await ensureUser(OPENID)
      return ok({
        user,
        openid: OPENID,
        isAdmin: adminOpenids().indexOf(OPENID) > -1,
        purchasedCount: (user.purchased || []).length
      })
    }

    if (action === 'updateProfile') {
      const user = await ensureUser(OPENID)
      const patch = { updatedAt: db.serverDate() }
      if (typeof data.nickName === 'string') {
        patch.nickName = data.nickName.trim().slice(0, 30)
      }
      if (typeof data.avatarUrl === 'string' && data.avatarUrl) {
        patch.avatarUrl = data.avatarUrl
      }
      await users.doc(user._id).update({ data: patch })
      return ok(
        Object.assign({}, user, {
          nickName: patch.nickName !== undefined ? patch.nickName : user.nickName,
          avatarUrl: patch.avatarUrl !== undefined ? patch.avatarUrl : user.avatarUrl
        })
      )
    }

    return fail('未知操作', 404)
  } catch (err) {
    console.error('[user]', action, err)
    return fail(err.message || '服务异常', 500)
  }
}
