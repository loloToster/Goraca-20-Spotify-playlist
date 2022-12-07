const { request } = require("http")

const port = process.env.PORT || 88

const req = request(
    `http://localhost:${port}/health`,
    res => process.exit(res.statusCode == 200 ? 0 : 1)
)

req.on("error", () => process.exit(1))

req.end()
