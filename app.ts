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

import dotenv from "dotenv"
import express from "express"
import axios from "axios"
import cheerio from "cheerio"
import SpotifyWebApi from "spotify-web-api-node"
import fs from "fs"

function readJSON(file: string) {
    return JSON.parse(fs.readFileSync(file).toString())
}

function writeJSON(file: string, data: object) {
    fs.writeFileSync(file, JSON.stringify(data))
}

if (!fs.existsSync("data.json"))
    writeJSON("data.json", {})

dotenv.config()
const app = express()

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT,
})

app.set("view engine", "ejs")
app.use(express.static("public"))

app.get("/", async (req: express.Request, res: express.Response) => {
    let user: any = false
    let playlists: any[] = []
    try {
        user = await spotifyApi.getMe()
        playlists = (await spotifyApi.getUserPlaylists()).body.items
        // playlists = playlists.filter(pl => pl.owner.id == user.body.id)
        playlists = playlists.concat(playlists) // ! for testing
    } catch (error) {
        // console.log("No user")
    }
    res.render("index", { user: user, playlists: playlists })
})

app.get("/login", (req: express.Request, res: express.Response) => {
    res.redirect(spotifyApi.createAuthorizeURL(scopes, "jakis status"))
})

app.get("/callback", async (req: express.Request, res: express.Response) => {
    const error = req.query.error
    const code = req.query.code

    if (error) {
        console.error('Callback Error:', error)
        res.send(`Callback Error: ${error}`)
        return
    }

    if (!code) return console.log("No code in callback")

    let data = await spotifyApi.authorizationCodeGrant(code.toString())

    const accessToken = data.body.access_token
    const refreshToken = data.body.refresh_token
    const expiresIn = data.body.expires_in

    spotifyApi.setAccessToken(accessToken)
    spotifyApi.setRefreshToken(refreshToken)

    /* console.log('access_token:', access_token)
    console.log('refresh_token:', refresh_token) */

    console.log(`Sucessfully retreived access token. Expires in ${expiresIn} s.`)
    res.redirect("/")

    setInterval(async () => {
        const data = await spotifyApi.refreshAccessToken()
        const access_token = data.body['access_token']

        console.log('The access token has been refreshed!')
        /* console.log('access_token:', access_token) */
        spotifyApi.setAccessToken(access_token)
    }, expiresIn / 2 * 1000)

})

app.get("/logout", (req: express.Request, res: express.Response) => {
    spotifyApi.resetAccessToken()
    spotifyApi.resetRefreshToken()
    res.redirect("/")
})

const port = process.env.PORT || 88
app.listen(port, () => {
    console.log("Server running on http://localhost:" + port)
})

interface song {
    title: string,
    artists: string
}

type listOfSongs = song[]

function scrapeEska(html: string): listOfSongs {
    const $ = cheerio.load(html)
    let songElements = $(".single-hit")
    let songs: listOfSongs = []
    songElements.each((i: number, element: any) => {
        element = $(element)
        if (element.hasClass("radio--hook")) return

        let info = $(element.children(".single-hit__info"))
        let artists = ""
        info.children("ul").children().each((i: number, e: any) => {
            artists += $(e).text().trim() + " "
        })
        songs.push({
            title: info.children(".single-hit__title").text(),
            artists: artists.trim()
        })

        let position = element.find(".single-hit__position")
        if ($(position).text() === "20") return false
    })
    return songs
}

let lastSongs: listOfSongs = []

async function mainLoop() {
    let html = (await axios.get(ESKA_URL)).data
    let currentSongs = scrapeEska(html)
    if (JSON.stringify(lastSongs) == JSON.stringify(currentSongs)) {
        console.log("The same songs")
    } else {
        console.log("Different songs")
        lastSongs = currentSongs
    }
}

mainLoop()
//setInterval(mainLoop, 5000)
