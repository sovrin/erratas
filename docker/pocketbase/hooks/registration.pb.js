/// <reference path="../pb_data/types.d.ts" />
onRecordCreateRequest((e) => {
  const value = ($os.getenv('ALLOW_REGISTRATION') || 'true').toLowerCase()
  const allowRegistration = value !== 'false' && value !== '0'

  if (!allowRegistration && !e.hasSuperuserAuth()) {
    throw new BadRequestError('Registration is disabled.')
  }

  e.next()
}, 'users')
