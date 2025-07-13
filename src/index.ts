import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { opentelemetry, setAttributes } from '@elysiajs/opentelemetry'

import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

const rate = 0.00001 // 0.001% chance to pull

const pool = process.env.POOL?.split(',') || []
const pull = () => {
    const ticket = pool[~~(Math.random() * pool.length)]

    setAttributes({
        'ticket': ticket
    })

    return ticket
}

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
        turnstile: t.Object({
            'x-turnstile-token': t.String()
        })
    })
    .macro({
        turnstile: {
            async beforeHandle({ headers, status }) {
                if (!headers['x-turnstile-token'])
                    return status(400, {
                        message: 'Missing Turnstile token'
                    })

                let formData = new FormData()
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
    .post('/pull/1', () => (Math.random() < rate ? pull() : null), {
        turnstile: true,
        headers: 'turnstile'
    })
    .post(
        '/pull/10',
        () => {
            const result = []

            let i = 10
            while (i-- > 0) result.push(Math.random() < rate ? pull() : null)

            return result
        },
        {
            turnstile: true,
            headers: 'turnstile'
        }
    )
    .listen(3000)

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)
