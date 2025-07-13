import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { opentelemetry, setAttributes, record } from '@elysiajs/opentelemetry'

import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

const rate = 0.001 / 100
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
        turnstile: t.Object({
            'x-turnstile-token': t.String()
        })
    })
    .macro({
        turnstile: {
            beforeHandle: async function turnstile({ headers, status }) {
                if (!headers['x-turnstile-token'])
                    return status(400, {
                        message: 'Missing Turnstile token'
                    })

                const formData = new FormData()
                formData.append('secret', process.env.TURNSTILE_SECRET!)
                formData.append('response', headers['x-turnstile-token'])

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
