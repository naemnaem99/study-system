import { describe, it, expect, beforeEach } from 'vitest'
import { POST } from '@/app/api/cron/digest/route'

describe('POST /api/cron/digest', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = '테스트시크릿'
  })

  it('CRON_SECRET이 일치하지 않으면 401', async () => {
    const req = new Request('http://localhost/api/cron/digest', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-value' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('Authorization 헤더가 없으면 401', async () => {
    const req = new Request('http://localhost/api/cron/digest', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
