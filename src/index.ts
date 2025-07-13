import { Elysia, t, status } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { opentelemetry, setAttributes, record } from '@elysiajs/opentelemetry'

import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

import { RateLimiterMemory } from 'rate-limiter-flexible'

const rate = 0.001 / 100
const pub = 0.1 / 100
const pchan = 0.5 / 100
const koyuki = 3 / 100

const pool = process.env.POOL?.split(',') || []
const pull = () =>
    record('Pull', () => {
        const ticket = pool[~~(Math.random() * pool.length)]

        setAttributes({
            ticket
        })

        return ticket
    })

const ipLimiter = new RateLimiterMemory({
    points: 25,
    duration: 10
})

const uidLimiter = new RateLimiterMemory({
    points: 10,
    duration: 5
})

const botFight = new RateLimiterMemory({
    points: 4,
    duration: 6
})

const app = new Elysia()
    .env(
        t.Object({
            POOL: t.String(),
            TURNSTILE_SECRET: t.String()
        })
    )
    .use(
        staticPlugin({
            prefix: ''
        })
    )
    .use(
        opentelemetry({
            spanProcessors: [
                new BatchSpanProcessor(
                    new OTLPTraceExporter({
                        url: 'https://api.axiom.co/v1/traces',
                        headers: {
                            Authorization: `Bearer ${Bun.env.AXIOM_TOKEN}`,
                            'X-Axiom-Dataset': Bun.env.AXIOM_DATASET!
                        }
                    })
                )
            ]
        })
    )
    .model({
        uid: t.Object({
            uid: t.String()
        }),
        turnstile: t.Object(
            {
                'x-turnstile-token': t.String()
            },
            {
                additionalProperties: true
            }
        )
    })
    .macro({
        turnstile: {
            beforeHandle: async function turnstile({
                headers,
                status,
                request,
                server,
                query: { uid },
                cookie: { __cf_bm }
            }) {
                if (!headers['x-turnstile-token'])
                    return status(400, {
                        message: 'Missing Turnstile token'
                    })

                const formData = new FormData()
                formData.append('secret', process.env.TURNSTILE_SECRET!)
                formData.append('response', headers['x-turnstile-token'])

                const ip =
                    headers['x-real-ip'] ||
                    headers['cf-connecting-ip'] ||
                    server?.requestIP(request)?.address

                if (ip) {
                    formData.append('ip', ip)

                    setAttributes({
                        'client.ip': ip
                    })
                }

                try {
                    await Promise.all([
                        ip && ipLimiter.consume(ip),
                        uidLimiter.consume(uid),
                        __cf_bm.value && botFight.consume(__cf_bm.value)
                    ])
                } catch {
                    return status(429, {
                        message:
                            'บัตรกำลังจัดลำดับใหม่ กรุณาลองใหม่ในอีกสักครู่'
                    })
                }

                const data = await fetch(
                    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                    {
                        method: 'POST',
                        body: formData
                    }
                ).then((response) => response.json())

                if (!data.success)
                    return status(400, {
                        message:
                            'ยืนยันตัวตนไม่สำเร็จ กรุณาลองโหลดหน้าเว็บใหม่อีกครั้ง'
                    })
            }
        }
    })
    .post(
        '/pull/1',
        ({ query: { uid } }) =>
            record(`uid: ${uid}`, () => {
                const probability = Math.random()
                if (probability < rate) return pull()
                if (probability < pub) return record('pub', () => 'c')
                if (probability < pchan) return record('p chan', () => 'p')
                if (probability < koyuki) return record('koyuki', () => 'k')
                return null
            }),
        {
            turnstile: true,
            headers: 'turnstile',
            query: 'uid'
        }
    )
    .post(
        '/pull/10',
        ({ query: { uid } }) =>
            record(`uid: ${uid}`, () => {
                const result = []

                let i = 10
                while (i-- > 0) {
                    const probability = Math.random()
                    if (probability < rate) result.push(pull())
                    else if (probability < pub)
                        record('pub', () => result.push('c'))
                    else if (probability < pchan)
                        record('p chan', () => result.push('p'))
                    else if (probability < koyuki)
                        record('koyuki', () => result.push('k'))
                    else result.push(null)
                }

                return result
            }),
        {
            turnstile: true,
            headers: 'turnstile',
            query: 'uid'
        }
    )
    .listen(3000)

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)
