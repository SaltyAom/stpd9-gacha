import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

const rate = 0.0001

const pool = process.env.POOL?.split(',') || []
const pull = () => pool[~~(Math.random() * pool.length)]

const app = new Elysia()
    .use(
        staticPlugin({
            prefix: ''
        })
    )
    .post('/pull/1', () => (Math.random() < rate ? pull() : null))
    .post('/pull/10', () => {
        const result = []

        let i = 10
        while (i-- > 0) result.push(Math.random() < rate ? pull() : null)

        return result
    })
    .listen(3000)

console.log(
    `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)
