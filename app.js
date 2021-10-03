const scopes = [
    'ugc-image-upload',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'app-remote-control',
    'user-read-email',
    'user-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-read-private',
    'playlist-modify-private',
    'user-library-modify',
    'user-library-read',
    'user-top-read',
    'user-read-playback-position',
    'user-read-recently-played',
    'user-follow-read',
    'user-follow-modify'
]
const ESKA_URL = "https://www.eska.pl/goraca20/"

require("dotenv").config()

const app = require("express")()

const axios = require("axios").default

const cheerio = require("cheerio")

const SpotifyWebApi = require("spotify-web-api-node"),
    spotifyApi = new SpotifyWebApi({
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        redirectUri: process.env.REDIRECT,
    })

app.set('view engine', 'ejs')

app.get("/", async (req, res) => {
    let user
    try {
        user = await spotifyApi.getMe()
    } catch (error) {
        console.log("No user")
    }
    res.render("index", { user: user })
})

app.get("/login", (req, res) => {
    res.redirect(spotifyApi.createAuthorizeURL(scopes))
})

app.get("/callback", async (req, res) => {
    const error = req.query.error
    const code = req.query.code
    const state = req.query.state

    if (error) {
        console.error('Callback Error:', error)
        res.send(`Callback Error: ${error}`)
        return
    }

    spotifyApi
        .authorizationCodeGrant(code)
        .then(data => {
            const access_token = data.body['access_token']
            const refresh_token = data.body['refresh_token']
            const expires_in = data.body['expires_in']

            spotifyApi.setAccessToken(access_token)
            spotifyApi.setRefreshToken(refresh_token)

            /* console.log('access_token:', access_token)
            console.log('refresh_token:', refresh_token) */

            console.log(
                `Sucessfully retreived access token. Expires in ${expires_in} s.`
            )
            res.redirect("/")

            setInterval(async () => {
                const data = await spotifyApi.refreshAccessToken()
                const access_token = data.body['access_token']

                console.log('The access token has been refreshed!')
                /* console.log('access_token:', access_token) */
                spotifyApi.setAccessToken(access_token)
            }, expires_in / 2 * 1000)
        }).catch(error => {
            console.error('Error getting Tokens:', error)
            res.send(`Error getting Tokens: ${error}`)
        })
})

app.get("/logout", (req, res) => {
    spotifyApi.resetAccessToken()
    spotifyApi.resetRefreshToken()
    res.redirect("/")
})

const port = process.env.PORT || 88
app.listen(port, () => {
    console.log("Server running on http://localhost:" + port)
})

function scrapeEska(html) {
    const $ = cheerio.load(html)
    let songElements = $(".single-hit")
    let songs = []
    songElements.each((i, element) => {
        element = $(element)
        if (element.hasClass("radio--hook")) return

        let info = $(element.children(".single-hit__info"))
        let artists = ""
        info.children("ul").children().each((i, e) => {
            artists += $(e).text().trim() + " "
        })
        songs.push({
            title: info.children(".single-hit__title").text(),
            artist: artists.trim()
        })

        let position = element.find(".single-hit__position")
        if ($(position).text() === "20") return false
    })
    return songs
}

async function mainLoop() {
    let html = (await axios.get(ESKA_URL)).data
    let songs = scrapeEska(html)
}

mainLoop()
//setInterval(mainLoop, 5000)
